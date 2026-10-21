-- ═══════════════════════════════════════════════════════════════════════
-- Clientes sans doublons + encaissement des restes dus par la vendeuse
--
-- 1. Telephone normalise : « 677 12 34 56 », « +237677123456 » et
--    « 677123456 » designent desormais la meme cliente. La recherche se fait
--    sur la forme normalisee ; les nouvelles fiches sont enregistrees
--    normalisees. Les fiches existantes ne sont pas reecrites (l'index unique
--    sur telephone brut pourrait sinon entrer en conflit).
--
-- 2. enregistrer_vente() accepte p_cliente_id (facultatif) : la vendeuse
--    choisit une cliente existante dans les suggestions au lieu d'en creer
--    une nouvelle — indispensable pour les clientes sans telephone.
--    Ancienne signature a 6 arguments supprimee ; l'appel sans p_cliente_id
--    reste valide (valeur par defaut), donc les ventes hors ligne deja en file
--    passent toujours.
--
-- 3. enregistrer_paiement() : la vendeuse peut encaisser un versement sur SES
--    propres ventes (l'admin, sur toutes). Meme verrou, memes controles.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Normalisation du telephone ───────────────────────────────────────
-- Chiffres seuls ; prefixe international 00 retire ; indicatif 237
-- (Cameroun) retire devant un numero local a 9 chiffres.
create or replace function prive.normaliser_tel(p_tel text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    case
      when d like '237%' and length(d) = 12 then substr(d, 4)
      else d
    end, '')
  from (
    select regexp_replace(
             regexp_replace(coalesce(p_tel, ''), '[^0-9]', '', 'g'),
             '^00', '') as d
  ) s;
$$;

revoke execute on function prive.normaliser_tel(text) from public, anon;
grant  execute on function prive.normaliser_tel(text) to authenticated, service_role;

create index if not exists clientes_telephone_normalise
  on public.clientes (prive.normaliser_tel(telephone));

-- ── 2. enregistrer_vente : identique (20261011120000) + p_cliente_id ────
drop function if exists public.enregistrer_vente(text, text, jsonb, text, numeric, text);

create or replace function public.enregistrer_vente(
  p_cliente_nom text,
  p_cliente_telephone text,
  p_produits jsonb,
  p_statut_paiement text,
  p_montant_paye numeric,
  p_mode_paiement text,
  p_cliente_id bigint default null
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

revoke execute on function
  public.enregistrer_vente(text, text, jsonb, text, numeric, text, bigint) from public, anon;
grant execute on function
  public.enregistrer_vente(text, text, jsonb, text, numeric, text, bigint) to authenticated;

-- ── 3. enregistrer_paiement : admin, ou vendeuse sur ses propres ventes ──
create or replace function public.enregistrer_paiement(
  p_vente_id bigint,
  p_montant  numeric,
  p_mode     text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total         numeric;
  v_annulee       boolean;
  v_deja_paye     numeric;
  v_vendeuse_id   bigint;
  v_reste         numeric;
  v_nouveau_paye  numeric;
  v_nouveau_reste numeric;
  v_statut        text;
begin
  if prive.mon_profil_id() is null then
    raise exception 'Non authentifie';
  end if;

  if p_montant is null or p_montant <= 0 then
    raise exception 'Le montant doit etre positif';
  end if;

  -- Verrou sur la vente : serialise les encaissements concurrents.
  select total, annulee, coalesce(montant_paye, 0), vendeuse_id
    into v_total, v_annulee, v_deja_paye, v_vendeuse_id
    from public.ventes
   where id = p_vente_id
   for update;

  if not found then
    raise exception 'Vente introuvable';
  end if;

  if not prive.est_admin() and v_vendeuse_id is distinct from prive.mon_profil_id() then
    raise exception 'Vous ne pouvez encaisser que vos propres ventes';
  end if;

  if v_annulee then
    raise exception 'Cette vente est annulee';
  end if;

  v_reste := greatest(0, v_total - v_deja_paye);

  if v_reste <= 0 then
    raise exception 'Cette vente est deja soldee';
  end if;

  if p_montant > v_reste then
    raise exception 'Montant superieur au reste du (% FCFA)', v_reste;
  end if;

  insert into public.paiements (vente_id, montant, mode)
  values (p_vente_id, p_montant, coalesce(nullif(btrim(p_mode), ''), 'cash'));

  -- Recalcul depuis la table paiements : source de verite unique.
  select coalesce(sum(montant), 0) into v_nouveau_paye
    from public.paiements where vente_id = p_vente_id;

  v_nouveau_reste := greatest(0, v_total - v_nouveau_paye);
  v_statut        := case when v_nouveau_reste <= 0 then 'paye' else 'partiel' end;

  update public.ventes
     set montant_paye    = v_nouveau_paye,
         reste_a_payer   = v_nouveau_reste,
         statut_paiement = v_statut
   where id = p_vente_id;

  return jsonb_build_object(
    'vente_id',        p_vente_id,
    'montant_paye',    v_nouveau_paye,
    'reste_a_payer',   v_nouveau_reste,
    'statut_paiement', v_statut
  );
end;
$$;

revoke execute on function
  public.enregistrer_paiement(bigint, numeric, text) from public, anon;
grant execute on function
  public.enregistrer_paiement(bigint, numeric, text) to authenticated;
