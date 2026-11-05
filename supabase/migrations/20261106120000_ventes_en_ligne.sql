-- ═══════════════════════════════════════════════════════════════════════
-- Ventes en ligne (commandes du site fallora-web)
--
-- Une commande du site devient une VRAIE vente ici quand elle est livree :
-- elle compte dans le chiffre d'affaires, les marges (prix d'achat figes),
-- la fiche de la cliente (retrouvee par son telephone) et les rapports.
--
--   - ventes.canal          : 'boutique' (par defaut) ou 'en_ligne' ;
--   - ventes.reference_site : numero de commande du site (FA-1001…), unique ;
--   - ventes.vendeuse_id    : vide pour une vente en ligne (pas de vendeuse).
--
-- Le stock n'est PAS retire ici : il l'a deja ete a la commande
-- (site_reserver_stock). Si la commande est annulee apres livraison,
-- site_liberer_stock annule aussi la vente et remet le stock.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.ventes alter column vendeuse_id drop not null;
alter table public.ventes add column if not exists canal text not null default 'boutique';
alter table public.ventes add column if not exists reference_site text;
do $$ begin
  alter table public.ventes add constraint ventes_canal_check check (canal in ('boutique', 'en_ligne'));
exception when duplicate_object then null; end $$;
create unique index if not exists ventes_reference_site_unique on public.ventes (reference_site) where reference_site is not null;

alter table public.reservations_site drop constraint if exists reservations_site_statut_check;
alter table public.reservations_site add constraint reservations_site_statut_check check (statut in ('reservee', 'liberee', 'vendue'));

-- ── Commande livree -> vente en ligne (une seule fois par reference) ──
create or replace function public.site_enregistrer_vente(
  p_reference text,
  p_nom       text,
  p_telephone text,
  p_mode      text,      -- cash | orange_money | mobile_money
  p_lignes    jsonb      -- [{ web_id, quantite, prix_unitaire }]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vente_id   bigint;
  v_cliente_id bigint;
  v_tel        text;
  v_item       jsonb;
  v_prod       record;
  v_qte        integer;
  v_prix       numeric;
  v_vp_id      bigint;
  v_total      numeric := 0;
begin
  if nullif(btrim(coalesce(p_reference, '')), '') is null then
    raise exception 'Reference manquante';
  end if;
  select id into v_vente_id from public.ventes where reference_site = p_reference;
  if found then
    return jsonb_build_object('vente_id', v_vente_id, 'deja', true);
  end if;

  -- Cliente : retrouvee par son telephone, sinon creee (meme regle qu'en boutique).
  v_tel := prive.normaliser_tel(p_telephone);
  if v_tel is not null then
    select id into v_cliente_id from public.clientes where prive.normaliser_tel(telephone) = v_tel order by id limit 1;
  end if;
  if v_cliente_id is null then
    insert into public.clientes (nom, telephone)
    values (coalesce(nullif(btrim(p_nom), ''), 'Cliente en ligne'), v_tel)
    returning id into v_cliente_id;
  end if;

  insert into public.ventes (vendeuse_id, cliente_id, total, montant_paye, reste_a_payer, statut_paiement, annulee, canal, reference_site)
  values (null, v_cliente_id, 0, 0, 0, 'paye', false, 'en_ligne', p_reference)
  returning id into v_vente_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb))
  loop
    v_qte := greatest(coalesce((v_item->>'quantite')::integer, 0), 0);
    continue when v_qte = 0;
    select id, prix into v_prod from public.produits where web_id = (v_item->>'web_id')::bigint;
    continue when not found;  -- produit non relie : pas de ligne
    v_prix := coalesce((v_item->>'prix_unitaire')::numeric, v_prod.prix);
    insert into public.vente_produits (vente_id, produit_id, quantite, prix_unitaire)
    values (v_vente_id, v_prod.id, v_qte, v_prix)
    returning id into v_vp_id;
    -- Cout fige pour la marge (si un prix d'achat est renseigne).
    insert into public.vente_produits_couts (vente_produit_id, prix_achat_unitaire)
    select v_vp_id, pc.prix_achat from public.produits_couts pc where pc.produit_id = v_prod.id;
    v_total := v_total + v_prix * v_qte;
  end loop;

  update public.ventes set total = v_total, montant_paye = v_total, reste_a_payer = 0 where id = v_vente_id;
  insert into public.paiements (vente_id, montant, mode)
  values (v_vente_id, v_total, coalesce(nullif(btrim(p_mode), ''), 'cash'));

  update public.reservations_site set statut = 'vendue', maj_le = now() where reference = p_reference and statut = 'reservee';
  return jsonb_build_object('vente_id', v_vente_id, 'deja', false, 'total', v_total);
end;
$$;

-- ── Annulation : rend le stock, et annule la vente si elle existait ──
create or replace function public.site_liberer_stock(p_reference text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res   record;
  v_item  jsonb;
  v_vente bigint;
  v_rendu boolean := false;
  v_reservee boolean;
begin
  select * into v_res from public.reservations_site where reference = p_reference for update;
  v_reservee := found and v_res.statut <> 'liberee';
  select id into v_vente from public.ventes where reference_site = p_reference and annulee = false for update;

  perform set_config('fallora.mvt_type', 'annulation', true);
  perform set_config('fallora.mvt_motif', 'Commande en ligne annulee ' || p_reference, true);
  if v_vente is not null then
    perform set_config('fallora.mvt_vente', v_vente::text, true);
  end if;

  if v_reservee then
    for v_item in select * from jsonb_array_elements(v_res.lignes)
    loop
      update public.produits
         set stock_restant = stock_restant + (v_item->>'quantite')::integer
       where id = (v_item->>'produit_id')::bigint;
    end loop;
    update public.reservations_site set statut = 'liberee', maj_le = now() where reference = p_reference;
    v_rendu := true;
  end if;

  perform set_config('fallora.mvt_type', '', true);
  perform set_config('fallora.mvt_motif', '', true);
  perform set_config('fallora.mvt_vente', '', true);

  if v_vente is not null then
    update public.ventes
       set annulee = true, annulee_le = now(), motif_annulation = 'Commande en ligne annulée sur le site'
     where id = v_vente;
  end if;
  return jsonb_build_object('rendu', v_rendu, 'vente_annulee', v_vente is not null);
end;
$$;

revoke execute on function public.site_enregistrer_vente(text, text, text, text, jsonb) from public, anon, authenticated;
grant  execute on function public.site_enregistrer_vente(text, text, text, text, jsonb) to service_role;
revoke execute on function public.site_liberer_stock(text) from public, anon, authenticated;
grant  execute on function public.site_liberer_stock(text) to service_role;
