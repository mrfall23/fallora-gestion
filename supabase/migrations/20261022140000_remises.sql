-- ═══════════════════════════════════════════════════════════════════════
-- Remises sur une vente
--
-- - ventes.remise (FCFA) + ventes.remise_motif. ventes.total reste le
--   montant NET du (sous-total - remise) : CA, encaissements, creances,
--   classements vendeuses restent justes sans autre changement.
-- - vente_produits.prix_unitaire garde le prix catalogue ; le sous-total
--   d'une vente vaut donc total + remise.
-- - Plafond pour les vendeuses : reglages.remise_max_pct (20 % par defaut,
--   modifiable par l'admin). L'admin n'est pas plafonnee.
-- - enregistrer_vente() : + p_remise, p_remise_motif (facultatifs ; l'appel
--   sans eux reste valide, ventes hors ligne en file comprises).
-- - tableau_de_bord_admin() : CA par produit et benefice repartissent la
--   remise au prorata des lignes (coefficient total / (total + remise)).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.ventes add column if not exists remise numeric not null default 0;
alter table public.ventes add column if not exists remise_motif text;

-- ── Reglages (une seule ligne) ──────────────────────────────────────────
create table if not exists public.reglages (
  id             smallint primary key default 1 check (id = 1),
  remise_max_pct numeric  not null default 20 check (remise_max_pct between 0 and 100)
);
insert into public.reglages (id) values (1) on conflict (id) do nothing;

alter table public.reglages enable row level security;
grant select, update on public.reglages to authenticated;
grant all on public.reglages to service_role;

drop policy if exists "reglages: lecture pour les connectes" on public.reglages;
drop policy if exists "reglages: admin modifie"              on public.reglages;
create policy "reglages: lecture pour les connectes"
  on public.reglages for select to authenticated using (prive.est_connecte());
create policy "reglages: admin modifie"
  on public.reglages for update to authenticated
  using (prive.est_admin()) with check (prive.est_admin());

-- ── enregistrer_vente : identique (20261021120000) + remise ─────────────
drop function if exists public.enregistrer_vente(text, text, jsonb, text, numeric, text, bigint);

create or replace function public.enregistrer_vente(
  p_cliente_nom text,
  p_cliente_telephone text,
  p_produits jsonb,
  p_statut_paiement text,
  p_montant_paye numeric,
  p_mode_paiement text,
  p_cliente_id bigint default null,
  p_remise numeric default 0,
  p_remise_motif text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vendeuse_id bigint;
  v_cliente_id  bigint;
  v_cliente_tel text;
  v_vente_id    bigint;
  v_vp_id       bigint;
  v_total       numeric := 0;
  v_item        jsonb;
  v_produit     record;
  v_quantite    integer;
  v_tel         text;
  v_final       numeric;
  v_remise      numeric;
  v_max_pct     numeric;
begin
  v_vendeuse_id := prive.mon_profil_id();
  if v_vendeuse_id is null then
    raise exception 'Non authentifie';
  end if;

  if p_cliente_nom is null or btrim(p_cliente_nom) = '' then
    raise exception 'Le nom de la cliente est obligatoire';
  end if;

  if p_produits is null or jsonb_array_length(p_produits) = 0 then
    raise exception 'Le panier est vide';
  end if;

  if p_statut_paiement not in ('paye', 'partiel') then
    raise exception 'Statut de paiement invalide';
  end if;

  v_tel := prive.normaliser_tel(p_cliente_telephone);

  if p_cliente_id is not null then
    -- Cliente choisie dans les suggestions.
    select id, telephone into v_cliente_id, v_cliente_tel
      from public.clientes where id = p_cliente_id;
    if v_cliente_id is null then
      raise exception 'Cliente introuvable';
    end if;
    -- Fiche sans numero : on complete si le numero saisi n'appartient a personne.
    if v_cliente_tel is null and v_tel is not null
       and not exists (select 1 from public.clientes
                        where prive.normaliser_tel(telephone) = v_tel) then
      update public.clientes set telephone = v_tel where id = v_cliente_id;
    end if;
  elsif v_tel is not null then
    select id into v_cliente_id
      from public.clientes
     where prive.normaliser_tel(telephone) = v_tel
     order by id
     limit 1;
    if v_cliente_id is null then
      insert into public.clientes (nom, telephone)
      values (btrim(p_cliente_nom), v_tel)
      returning id into v_cliente_id;
    end if;
  else
    insert into public.clientes (nom, telephone)
    values (btrim(p_cliente_nom), null)
    returning id into v_cliente_id;
  end if;

  insert into public.ventes
    (vendeuse_id, cliente_id, total, montant_paye, reste_a_payer, statut_paiement, annulee)
  values
    (v_vendeuse_id, v_cliente_id, 0, 0, 0, p_statut_paiement, false)
  returning id into v_vente_id;

  -- Contexte du journal de stock : les decomptes ci-dessous sont des ventes.
  perform set_config('fallora.mvt_type', 'vente', true);
  perform set_config('fallora.mvt_vente', v_vente_id::text, true);

  for v_item in select * from jsonb_array_elements(p_produits)
  loop
    v_quantite := (v_item->>'quantite')::integer;

    if v_quantite is null or v_quantite <= 0 then
      raise exception 'Quantite invalide';
    end if;

    select id, nom, prix, stock_restant
      into v_produit
      from public.produits
     where id = (v_item->>'produit_id')::bigint
       and actif = true
     for update;

    if not found then
      raise exception 'Produit introuvable ou inactif';
    end if;

    if v_produit.stock_restant < v_quantite then
      raise exception 'Stock insuffisant pour %', v_produit.nom;
    end if;

    insert into public.vente_produits (vente_id, produit_id, quantite, prix_unitaire)
    values (v_vente_id, v_produit.id, v_quantite, v_produit.prix)
    returning id into v_vp_id;

    -- Cout fige (si le produit a un prix d'achat renseigne).
    insert into public.vente_produits_couts (vente_produit_id, prix_achat_unitaire)
    select v_vp_id, pc.prix_achat
      from public.produits_couts pc
     where pc.produit_id = v_produit.id;

    update public.produits
       set stock_restant = stock_restant - v_quantite
     where id = v_produit.id;

    v_total := v_total + (v_produit.prix * v_quantite);
  end loop;

  perform set_config('fallora.mvt_type', '', true);
  perform set_config('fallora.mvt_vente', '', true);

  -- Remise sur l'ensemble de la vente (FCFA entiers). Plafonnee pour les
  -- vendeuses par reglages.remise_max_pct ; l'admin n'a pas de plafond.
  v_remise := round(coalesce(p_remise, 0));
  if v_remise < 0 or v_remise > v_total then
    raise exception 'Remise invalide';
  end if;
  if v_remise > 0 and not prive.est_admin() then
    select remise_max_pct into v_max_pct from public.reglages where id = 1;
    v_max_pct := coalesce(v_max_pct, 0);
    if v_remise > floor(v_total * v_max_pct / 100) then
      raise exception 'Remise superieure au maximum autorise (% %%)', v_max_pct;
    end if;
  end if;
  v_total := v_total - v_remise;

  v_final := case
    when p_statut_paiement = 'paye' then v_total
    else coalesce(p_montant_paye, 0)
  end;

  if v_final < 0 or v_final > v_total then
    raise exception 'Montant paye invalide';
  end if;

  update public.ventes
     set total         = v_total,
         remise        = v_remise,
         remise_motif  = case when v_remise > 0 then nullif(btrim(coalesce(p_remise_motif, '')), '') end,
         montant_paye  = v_final,
         reste_a_payer = greatest(0, v_total - v_final)
   where id = v_vente_id;

  insert into public.paiements (vente_id, montant, mode)
  values (v_vente_id, v_final, coalesce(nullif(btrim(p_mode_paiement), ''), 'cash'));

  return v_vente_id;
end;
$$;

revoke execute on function
  public.enregistrer_vente(text, text, jsonb, text, numeric, text, bigint, numeric, text) from public, anon;
grant execute on function
  public.enregistrer_vente(text, text, jsonb, text, numeric, text, bigint, numeric, text) to authenticated;

-- ── Tableau de bord : identique (20261009120000), remise au prorata ─────
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
