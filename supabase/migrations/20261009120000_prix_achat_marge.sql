-- ═══════════════════════════════════════════════════════════════════════
-- Prix d'achat, marge et benefice (admin) + colonne description manquante
--
-- 1) produits.description : le formulaire admin l'envoie depuis toujours mais
--    la colonne n'existait pas -> toute creation/modification de produit
--    echouait (silencieusement avant l'affichage des erreurs).
--
-- 2) Prix d'achat CONFIDENTIEL : les vendeuses lisent produits et les lignes
--    de leurs ventes (vente_produits). Le cout ne va donc PAS dans ces tables
--    mais dans deux tables reservees a l'admin :
--      - produits_couts       : prix d'achat courant de chaque produit ;
--      - vente_produits_couts : prix d'achat FIGE au moment de la vente
--        (changer un prix d'achat plus tard ne reecrit pas l'historique).
--    enregistrer_vente() (security definer) ecrit le cout fige.
--    Retro-remplissage : quand un produit recoit un prix d'achat, les ventes
--    passees de ce produit SANS cout connu prennent ce prix (trigger) — sinon
--    tout l'historique existant resterait sans marge.
--
-- 3) tableau_de_bord_admin() : identique, + bloc 'marge' (benefice periode,
--    mois, mois precedent, CA couvert par un cout) et 'produits_marge'
--    (top 5 par benefice sur la periode active).
--
-- Benefice = somme (prix_unitaire - prix_achat_unitaire) * quantite, sur les
-- seules lignes dont le cout est connu. 'ca_couvert' permet a l'UI de dire
-- quelle part du CA est prise en compte.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.produits add column if not exists description text;

-- ── Couts courants ─────────────────────────────────────────────────────
create table if not exists public.produits_couts (
  produit_id bigint primary key references public.produits (id) on delete cascade,
  prix_achat numeric not null check (prix_achat >= 0),
  maj_le     timestamptz not null default now()
);

alter table public.produits_couts enable row level security;

create policy "produits_couts: admin lit"      on public.produits_couts for select to authenticated using (prive.est_admin());
create policy "produits_couts: admin ecrit"    on public.produits_couts for insert to authenticated with check (prive.est_admin());
create policy "produits_couts: admin modifie"  on public.produits_couts for update to authenticated using (prive.est_admin()) with check (prive.est_admin());
create policy "produits_couts: admin supprime" on public.produits_couts for delete to authenticated using (prive.est_admin());

grant select, insert, update, delete on public.produits_couts to authenticated;
grant all on public.produits_couts to service_role;

-- ── Couts figes par ligne de vente ─────────────────────────────────────
create table if not exists public.vente_produits_couts (
  vente_produit_id    bigint primary key references public.vente_produits (id) on delete cascade,
  prix_achat_unitaire numeric not null check (prix_achat_unitaire >= 0)
);

alter table public.vente_produits_couts enable row level security;

-- Lecture admin seulement ; ecriture uniquement via fonctions security definer.
create policy "vente_produits_couts: admin lit" on public.vente_produits_couts for select to authenticated using (prive.est_admin());

grant select on public.vente_produits_couts to authenticated;
grant all on public.vente_produits_couts to service_role;

-- ── Retro-remplissage des ventes passees sans cout ─────────────────────
create or replace function prive.remplir_couts_passes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.vente_produits_couts (vente_produit_id, prix_achat_unitaire)
  select vp.id, new.prix_achat
    from public.vente_produits vp
   where vp.produit_id = new.produit_id
  on conflict (vente_produit_id) do nothing;
  return new;
end;
$$;

revoke execute on function prive.remplir_couts_passes() from public, anon;

drop trigger if exists produits_couts_remplir_passes on public.produits_couts;
create trigger produits_couts_remplir_passes
  after insert or update of prix_achat on public.produits_couts
  for each row execute function prive.remplir_couts_passes();

-- ── enregistrer_vente : identique + cout fige ──────────────────────────
create or replace function public.enregistrer_vente(
  p_cliente_nom text,
  p_cliente_telephone text,
  p_produits jsonb,
  p_statut_paiement text,
  p_montant_paye numeric,
  p_mode_paiement text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vendeuse_id bigint;
  v_cliente_id  bigint;
  v_vente_id    bigint;
  v_vp_id       bigint;
  v_total       numeric := 0;
  v_item        jsonb;
  v_produit     record;
  v_quantite    integer;
  v_tel         text;
  v_final       numeric;
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

  v_tel := nullif(btrim(coalesce(p_cliente_telephone, '')), '');

  if v_tel is not null then
    select id into v_cliente_id from public.clientes where telephone = v_tel;
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

  v_final := case
    when p_statut_paiement = 'paye' then v_total
    else coalesce(p_montant_paye, 0)
  end;

  if v_final < 0 or v_final > v_total then
    raise exception 'Montant paye invalide';
  end if;

  update public.ventes
     set total         = v_total,
         montant_paye  = v_final,
         reste_a_payer = greatest(0, v_total - v_final)
   where id = v_vente_id;

  insert into public.paiements (vente_id, montant, mode)
  values (v_vente_id, v_final, coalesce(nullif(btrim(p_mode_paiement), ''), 'cash'));

  return v_vente_id;
end;
$$;

-- ── Tableau de bord : identique + marge ────────────────────────────────
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
               vp.prix_unitaire * vp.quantite as ca,
               (vp.prix_unitaire - vpc.prix_achat_unitaire) * vp.quantite as benefice
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
               sum(vp.prix_unitaire * vp.quantite) as ca,
               sum((vp.prix_unitaire - vpc.prix_achat_unitaire) * vp.quantite) as benefice
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
               sum(vp.prix_unitaire * vp.quantite) as ca
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
