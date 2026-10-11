-- ═══════════════════════════════════════════════════════════════════════
-- Historique des mouvements de stock (admin)
--
-- Avant : le stock etait un simple chiffre ecrase a chaque modification.
-- Impossible de savoir qui avait reapprovisionne quoi, ni de reperer un ecart.
--
-- Principe : un TRIGGER sur produits.stock_restant journalise CHAQUE
-- changement, quel qu'en soit le chemin (vente, annulation, reappro,
-- correction, edition directe dans Supabase). Rien n'y echappe.
-- Le TYPE du mouvement est fourni par la fonction appelante via une variable
-- de transaction (set_config 'fallora.mvt_*', locale a la transaction) ;
-- sans contexte, le mouvement est classe 'correction' (modification manuelle).
--
-- Types : ouverture (stock existant au demarrage du journal), creation,
--         vente, annulation, reappro, correction.
--
-- Nouvelles RPC admin : reapprovisionner() et corriger_stock() (inventaire,
-- motif obligatoire). enregistrer_vente() et annuler_vente() sont reprises A
-- L'IDENTIQUE + pose du contexte.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.mouvements_stock (
  id             bigint generated always as identity primary key,
  produit_id     bigint not null references public.produits (id) on delete cascade,
  type           text   not null check (type in ('ouverture', 'creation', 'vente', 'annulation', 'reappro', 'correction')),
  quantite       integer not null,          -- variation signee (+ entree / - sortie)
  stock_apres    integer not null,
  vente_id       bigint references public.ventes (id),
  utilisateur_id bigint references public.utilisateurs (id),
  motif          text,
  cree_le        timestamptz not null default now()
);

create index if not exists mouvements_stock_produit_idx on public.mouvements_stock (produit_id, cree_le desc);

alter table public.mouvements_stock enable row level security;

-- Lecture admin ; ecriture uniquement par le trigger (security definer).
create policy "mouvements_stock: admin lit" on public.mouvements_stock
  for select to authenticated using (prive.est_admin());

grant select on public.mouvements_stock to authenticated;
grant all on public.mouvements_stock to service_role;

-- ── Journalisation automatique ─────────────────────────────────────────
create or replace function prive.journaliser_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type  text;
  v_delta integer;
begin
  if tg_op = 'INSERT' then
    v_type  := 'creation';
    v_delta := coalesce(new.stock_restant, 0);
  else
    v_type  := coalesce(nullif(current_setting('fallora.mvt_type', true), ''), 'correction');
    v_delta := coalesce(new.stock_restant, 0) - coalesce(old.stock_restant, 0);
  end if;

  if v_delta = 0 and tg_op = 'UPDATE' then
    return new;
  end if;

  insert into public.mouvements_stock (produit_id, type, quantite, stock_apres, vente_id, utilisateur_id, motif)
  values (
    new.id,
    v_type,
    v_delta,
    coalesce(new.stock_restant, 0),
    nullif(current_setting('fallora.mvt_vente', true), '')::bigint,
    prive.mon_profil_id(),
    nullif(current_setting('fallora.mvt_motif', true), '')
  );
  return new;
end;
$$;

revoke execute on function prive.journaliser_stock() from public, anon;

drop trigger if exists produits_journaliser_stock on public.produits;
create trigger produits_journaliser_stock
  after insert or update of stock_restant on public.produits
  for each row execute function prive.journaliser_stock();

-- Point de depart du journal : le stock actuel de chaque produit.
insert into public.mouvements_stock (produit_id, type, quantite, stock_apres, motif)
select p.id, 'ouverture', coalesce(p.stock_restant, 0), coalesce(p.stock_restant, 0), 'Stock au démarrage du journal'
  from public.produits p
 where not exists (select 1 from public.mouvements_stock m where m.produit_id = p.id);

-- ── Reapprovisionnement (admin) ────────────────────────────────────────
create or replace function public.reapprovisionner(
  p_produit_id bigint,
  p_quantite   integer,
  p_note       text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stock integer;
begin
  if not prive.est_admin() then
    raise exception 'Reserve a l''administrateur';
  end if;
  if p_quantite is null or p_quantite <= 0 then
    raise exception 'La quantite doit etre positive';
  end if;

  perform set_config('fallora.mvt_type', 'reappro', true);
  perform set_config('fallora.mvt_motif', coalesce(btrim(p_note), ''), true);

  update public.produits
     set stock_restant = stock_restant + p_quantite,
         stock_initial = coalesce(stock_initial, 0) + p_quantite
   where id = p_produit_id
  returning stock_restant into v_stock;

  -- Teste AVANT les perform suivants (perform reecrit FOUND).
  if v_stock is null then
    raise exception 'Produit introuvable';
  end if;

  perform set_config('fallora.mvt_type', '', true);
  perform set_config('fallora.mvt_motif', '', true);

  return jsonb_build_object('produit_id', p_produit_id, 'stock_restant', v_stock);
end;
$$;

revoke execute on function public.reapprovisionner(bigint, integer, text) from public, anon;
grant  execute on function public.reapprovisionner(bigint, integer, text) to authenticated;

-- ── Correction apres inventaire (admin, motif obligatoire) ─────────────
create or replace function public.corriger_stock(
  p_produit_id bigint,
  p_stock_reel integer,
  p_motif      text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ancien integer;
begin
  if not prive.est_admin() then
    raise exception 'Reserve a l''administrateur';
  end if;
  if p_stock_reel is null or p_stock_reel < 0 then
    raise exception 'Le stock reel doit etre positif ou nul';
  end if;
  if nullif(btrim(coalesce(p_motif, '')), '') is null then
    raise exception 'Indiquez le motif de la correction';
  end if;

  select stock_restant into v_ancien from public.produits where id = p_produit_id for update;
  if not found then
    raise exception 'Produit introuvable';
  end if;

  perform set_config('fallora.mvt_type', 'correction', true);
  perform set_config('fallora.mvt_motif', btrim(p_motif), true);

  update public.produits
     set stock_restant = p_stock_reel,
         stock_initial = coalesce(stock_initial, 0) + (p_stock_reel - coalesce(v_ancien, 0))
   where id = p_produit_id;

  perform set_config('fallora.mvt_type', '', true);
  perform set_config('fallora.mvt_motif', '', true);

  return jsonb_build_object('produit_id', p_produit_id, 'ecart', p_stock_reel - coalesce(v_ancien, 0), 'stock_restant', p_stock_reel);
end;
$$;

revoke execute on function public.corriger_stock(bigint, integer, text) from public, anon;
grant  execute on function public.corriger_stock(bigint, integer, text) to authenticated;

-- ── enregistrer_vente : identique (20261009120000) + contexte 'vente' ───
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

-- ── annuler_vente : identique (20261007120000) + contexte 'annulation' ──
create or replace function public.annuler_vente(
  p_vente_id bigint,
  p_motif    text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_annulee boolean;
  v_motif   text;
  v_ligne   record;
  v_remis   integer := 0;
begin
  if not prive.est_admin() then
    raise exception 'Reserve a l''administrateur';
  end if;

  v_motif := nullif(btrim(coalesce(p_motif, '')), '');
  if v_motif is null then
    raise exception 'Indiquez le motif de l''annulation';
  end if;

  -- Verrou sur la vente : deux annulations concurrentes ne remettent pas
  -- deux fois le stock.
  select annulee into v_annulee
    from public.ventes
   where id = p_vente_id
   for update;

  if not found then
    raise exception 'Vente introuvable';
  end if;

  if v_annulee then
    raise exception 'Cette vente est deja annulee';
  end if;

  perform set_config('fallora.mvt_type', 'annulation', true);
  perform set_config('fallora.mvt_vente', p_vente_id::text, true);
  perform set_config('fallora.mvt_motif', v_motif, true);

  -- Remise en stock, produit par produit (verrou ligne par ligne via update).
  for v_ligne in
    select produit_id, sum(quantite)::integer as quantite
      from public.vente_produits
     where vente_id = p_vente_id
     group by produit_id
  loop
    update public.produits
       set stock_restant = stock_restant + v_ligne.quantite
     where id = v_ligne.produit_id;
    v_remis := v_remis + v_ligne.quantite;
  end loop;

  perform set_config('fallora.mvt_type', '', true);
  perform set_config('fallora.mvt_vente', '', true);
  perform set_config('fallora.mvt_motif', '', true);

  update public.ventes
     set annulee          = true,
         annulee_le       = now(),
         annulee_par      = prive.mon_profil_id(),
         motif_annulation = v_motif
   where id = p_vente_id;

  return jsonb_build_object(
    'vente_id',       p_vente_id,
    'articles_remis', v_remis
  );
end;
$$;
