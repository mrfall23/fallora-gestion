-- ═══════════════════════════════════════════════════════════════════════
-- Depenses et charges (transport, loyer, commissions...)
--
-- - Table depenses : une ligne par depense (date, categorie, libelle,
--   montant). Lecture et ecriture reservees a l'admin.
-- - tableau_de_bord_admin() : identique (20261022140000) + bloc 'depenses'
--   (periode en cours, mois, mois precedent) pour afficher le benefice net
--   = benefice des ventes - depenses. Dates en heure du Cameroun.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.depenses (
  id           bigserial   primary key,
  date_depense date        not null default ((now() at time zone 'Africa/Douala')::date),
  categorie    text        not null check (btrim(categorie) <> ''),
  libelle      text,
  montant      numeric     not null check (montant > 0),
  cree_par     bigint      default prive.mon_profil_id(),
  cree_le      timestamptz not null default now()
);

create index if not exists depenses_date on public.depenses (date_depense);

alter table public.depenses enable row level security;
grant select, insert, update, delete on public.depenses to authenticated;
grant usage, select on sequence public.depenses_id_seq to authenticated;
grant all on public.depenses to service_role;

drop policy if exists "depenses: admin lit"      on public.depenses;
drop policy if exists "depenses: admin ajoute"   on public.depenses;
drop policy if exists "depenses: admin modifie"  on public.depenses;
drop policy if exists "depenses: admin supprime" on public.depenses;
create policy "depenses: admin lit"      on public.depenses for select to authenticated using (prive.est_admin());
create policy "depenses: admin ajoute"   on public.depenses for insert to authenticated with check (prive.est_admin());
create policy "depenses: admin modifie"  on public.depenses for update to authenticated using (prive.est_admin()) with check (prive.est_admin());
create policy "depenses: admin supprime" on public.depenses for delete to authenticated using (prive.est_admin());

-- ── Tableau de bord : identique (20261022140000) + depenses ─────────────
create or replace function public.tableau_de_bord_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_tz constant text := 'Africa/Douala';
  v_debut_mois      timestamp := date_trunc('month', (now() at time zone v_tz));
  v_debut_mois_prec timestamp := date_trunc('month', (now() at time zone v_tz)) - interval '1 month';
  v_periode record;
  v_depuis  timestamptz;
begin
  if not prive.est_admin() then
    raise exception 'Acces reserve a l''administratrice';
  end if;

  select id, nom, debut into v_periode
    from public.periodes where fin is null order by debut desc limit 1;
  v_depuis := coalesce(v_periode.debut, '-infinity'::timestamptz);

  select jsonb_build_object(

    'depenses', jsonb_build_object(
      'periode', coalesce((
        select sum(montant) from public.depenses
         where v_periode.debut is null
            or date_depense >= (v_periode.debut at time zone v_tz)::date), 0),
      'mois', coalesce((
        select sum(montant) from public.depenses
         where date_depense >= v_debut_mois::date), 0),
      'mois_prec', coalesce((
        select sum(montant) from public.depenses
         where date_depense >= v_debut_mois_prec::date
           and date_depense <  v_debut_mois::date), 0)
    ),

    'periode', jsonb_build_object(
      'id', v_periode.id,
      'nom', coalesce(v_periode.nom, 'Période en cours'),
      'debut', v_periode.debut
    ),

    'stats', jsonb_build_object(
      'total_ventes', coalesce(
        (select sum(total) from public.ventes
          where annulee = false and date_vente >= v_depuis), 0),
      'produits_vendus', coalesce(
        (select sum(vp.quantite)
           from public.vente_produits vp
           join public.ventes v on v.id = vp.vente_id
          where v.annulee = false and v.date_vente >= v_depuis), 0),
      'stock_restant', coalesce(
        (select sum(stock_restant) from public.produits), 0),
      'paiements_en_attente', coalesce(
        (select sum(reste_a_payer) from public.ventes where annulee = false), 0)
    ),

    'comparatif', jsonb_build_object(
      'ca_mois', coalesce((
        select sum(total) from public.ventes
         where annulee = false
           and (date_vente at time zone v_tz) >= v_debut_mois), 0),
      'nb_mois', (
        select count(*) from public.ventes
         where annulee = false
           and (date_vente at time zone v_tz) >= v_debut_mois),
      'ca_mois_prec', coalesce((
        select sum(total) from public.ventes
         where annulee = false
           and (date_vente at time zone v_tz) >= v_debut_mois_prec
           and (date_vente at time zone v_tz) <  v_debut_mois), 0),
      'nb_mois_prec', (
        select count(*) from public.ventes
         where annulee = false
           and (date_vente at time zone v_tz) >= v_debut_mois_prec
           and (date_vente at time zone v_tz) <  v_debut_mois)
    ),

    'marge', (
      select jsonb_build_object(
        'benefice_periode', coalesce(sum(l.benefice) filter (where l.date_vente >= v_depuis), 0),
        'ca_couvert_periode', coalesce(sum(l.ca) filter (where l.date_vente >= v_depuis and l.benefice is not null), 0),
        'ca_periode', coalesce(sum(l.ca) filter (where l.date_vente >= v_depuis), 0),
        'benefice_mois', coalesce(sum(l.benefice) filter (where l.date_local >= v_debut_mois), 0),
        'ca_couvert_mois', coalesce(sum(l.ca) filter (where l.date_local >= v_debut_mois and l.benefice is not null), 0),
        'benefice_mois_prec', coalesce(sum(l.benefice) filter (where l.date_local >= v_debut_mois_prec and l.date_local < v_debut_mois), 0)
      )
      from (
        select v.date_vente,
               (v.date_vente at time zone v_tz) as date_local,
               round(vp.prix_unitaire * vp.quantite * coalesce(v.total / nullif(v.total + v.remise, 0), 1)) as ca,
               round((vp.prix_unitaire * coalesce(v.total / nullif(v.total + v.remise, 0), 1) - vpc.prix_achat_unitaire) * vp.quantite) as benefice
          from public.vente_produits vp
          join public.ventes v on v.id = vp.vente_id
          left join public.vente_produits_couts vpc on vpc.vente_produit_id = vp.id
         where v.annulee = false
      ) l
    ),

    'produits_marge', coalesce((
      select jsonb_agg(pm order by pm.benefice desc)
      from (
        select pr.nom,
               sum(vp.quantite) as quantite,
               round(sum(vp.prix_unitaire * vp.quantite * coalesce(v.total / nullif(v.total + v.remise, 0), 1))) as ca,
               round(sum((vp.prix_unitaire * coalesce(v.total / nullif(v.total + v.remise, 0), 1) - vpc.prix_achat_unitaire) * vp.quantite)) as benefice
          from public.vente_produits vp
          join public.ventes v                 on v.id = vp.vente_id
          join public.produits pr              on pr.id = vp.produit_id
          join public.vente_produits_couts vpc on vpc.vente_produit_id = vp.id
         where v.annulee = false and v.date_vente >= v_depuis
         group by pr.id, pr.nom
         order by benefice desc
         limit 5
      ) pm
    ), '[]'::jsonb),

    'ca_par_mode', coalesce((
      select jsonb_agg(m order by m.total desc)
      from (
        select coalesce(nullif(btrim(p.mode), ''), 'cash') as mode,
               sum(p.montant) as total
          from public.paiements p
          join public.ventes v on v.id = p.vente_id
         where v.annulee = false and v.date_vente >= v_depuis
         group by 1
      ) m
    ), '[]'::jsonb),

    'produits_ca', coalesce((
      select jsonb_agg(pc order by pc.ca desc)
      from (
        select pr.nom,
               sum(vp.quantite) as quantite,
               round(sum(vp.prix_unitaire * vp.quantite * coalesce(v.total / nullif(v.total + v.remise, 0), 1))) as ca
          from public.vente_produits vp
          join public.ventes v    on v.id = vp.vente_id
          join public.produits pr on pr.id = vp.produit_id
         where v.annulee = false and v.date_vente >= v_depuis
         group by pr.id, pr.nom
         order by ca desc
         limit 5
      ) pc
    ), '[]'::jsonb),

    'ventes_recentes', coalesce((
      select jsonb_agg(r order by r.date_vente desc)
      from (
        select v.id,
               v.date_vente,
               coalesce(c.nom, 'Inconnue') as cliente_nom,
               coalesce(u.nom, 'Inconnue') as vendeuse_nom,
               v.total,
               v.statut_paiement
          from public.ventes v
          left join public.clientes c    on c.id = v.cliente_id
          left join public.utilisateurs u on u.id = v.vendeuse_id
         where v.annulee = false
         order by v.date_vente desc
         limit 5
      ) r
    ), '[]'::jsonb),

    'top_vendeuses', coalesce((
      select jsonb_agg(t order by t.total desc)
      from (
        select u.id,
               u.nom,
               count(v.id)               as nb,
               coalesce(sum(v.total), 0) as total
          from public.ventes v
          join public.utilisateurs u on u.id = v.vendeuse_id
         where v.annulee = false and v.date_vente >= v_depuis
         group by u.id, u.nom
         order by total desc
         limit 3
      ) t
    ), '[]'::jsonb)

  ) into v_result;

  return v_result;
end;
$$;
