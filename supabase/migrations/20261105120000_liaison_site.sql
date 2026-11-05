-- ═══════════════════════════════════════════════════════════════════════
-- Liaison avec le site fallora-web
--
-- Repartition des roles :
--   - le SITE fait reference pour les fiches produits (nom, prix, photo,
--     description, categorie) : chaque modification y est recopiee ici ;
--   - fallora-gestion fait reference pour le STOCK et les ventes : le site
--     lit le stock ici, et chaque commande en ligne le reserve ici.
--
--   - produits.web_id  : identifiant du produit sur le site (null = produit
--                        non relie, vendu seulement en boutique) ;
--   - reservations_site : stock reserve par chaque commande en ligne, pour
--                        le rendre exactement une fois si elle est annulee,
--                        et ne jamais le retirer deux fois (re-essai reseau).
--
-- Les deux fonctions ne sont appelables qu'avec la cle secrete (routes
-- /api/site/*, protegees par le jeton partage avec le site).
-- ═══════════════════════════════════════════════════════════════════════

alter table public.produits add column if not exists web_id bigint;
create unique index if not exists produits_web_id_unique on public.produits (web_id) where web_id is not null;

create table if not exists public.reservations_site (
  reference text primary key,               -- numero de commande du site (FA-1001…)
  lignes    jsonb not null,                 -- [{ produit_id, web_id, quantite }] reellement retires
  statut    text  not null default 'reservee' check (statut in ('reservee', 'liberee')),
  cree_le   timestamptz not null default now(),
  maj_le    timestamptz not null default now()
);

alter table public.reservations_site enable row level security;
drop policy if exists "reservations_site: admin lit" on public.reservations_site;
create policy "reservations_site: admin lit" on public.reservations_site
  for select to authenticated using (prive.est_admin());
grant select on public.reservations_site to authenticated;
grant all on public.reservations_site to service_role;

-- ── Commande en ligne : retire le stock (jamais en dessous de 0) ──────
create or replace function public.site_reserver_stock(p_reference text, p_lignes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item    jsonb;
  v_prod    record;
  v_qte     integer;
  v_retire  integer;
  v_lignes  jsonb := '[]'::jsonb;
  v_manques jsonb := '[]'::jsonb;
begin
  if nullif(btrim(coalesce(p_reference, '')), '') is null then
    raise exception 'Reference manquante';
  end if;
  -- Deja traitee (re-essai) : on ne retire rien une seconde fois.
  if exists (select 1 from public.reservations_site where reference = p_reference) then
    return jsonb_build_object('deja', true, 'manques', '[]'::jsonb);
  end if;

  perform set_config('fallora.mvt_type', 'vente', true);
  perform set_config('fallora.mvt_motif', 'Commande en ligne ' || p_reference, true);

  for v_item in select * from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb))
  loop
    v_qte := greatest(coalesce((v_item->>'quantite')::integer, 0), 0);
    continue when v_qte = 0;
    select id, nom, stock_restant into v_prod
      from public.produits
     where web_id = (v_item->>'web_id')::bigint
     for update;
    continue when not found;   -- produit non relie : stock non suivi
    v_retire := least(v_qte, greatest(coalesce(v_prod.stock_restant, 0), 0));
    if v_retire > 0 then
      update public.produits set stock_restant = stock_restant - v_retire where id = v_prod.id;
      v_lignes := v_lignes || jsonb_build_object('produit_id', v_prod.id, 'web_id', (v_item->>'web_id')::bigint, 'quantite', v_retire);
    end if;
    if v_retire < v_qte then
      v_manques := v_manques || jsonb_build_object('nom', v_prod.nom, 'demande', v_qte, 'disponible', v_retire);
    end if;
  end loop;

  perform set_config('fallora.mvt_type', '', true);
  perform set_config('fallora.mvt_motif', '', true);

  insert into public.reservations_site (reference, lignes) values (p_reference, v_lignes);
  return jsonb_build_object('deja', false, 'manques', v_manques);
end;
$$;

-- ── Commande en ligne annulee : rend le stock (une seule fois) ────────
create or replace function public.site_liberer_stock(p_reference text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res  record;
  v_item jsonb;
begin
  select * into v_res from public.reservations_site where reference = p_reference for update;
  if not found or v_res.statut = 'liberee' then
    return jsonb_build_object('rendu', false);
  end if;

  perform set_config('fallora.mvt_type', 'annulation', true);
  perform set_config('fallora.mvt_motif', 'Commande en ligne annulee ' || p_reference, true);
  for v_item in select * from jsonb_array_elements(v_res.lignes)
  loop
    update public.produits
       set stock_restant = stock_restant + (v_item->>'quantite')::integer
     where id = (v_item->>'produit_id')::bigint;
  end loop;
  perform set_config('fallora.mvt_type', '', true);
  perform set_config('fallora.mvt_motif', '', true);

  update public.reservations_site set statut = 'liberee', maj_le = now() where reference = p_reference;
  return jsonb_build_object('rendu', true);
end;
$$;

revoke execute on function public.site_reserver_stock(text, jsonb) from public, anon, authenticated;
revoke execute on function public.site_liberer_stock(text) from public, anon, authenticated;
grant  execute on function public.site_reserver_stock(text, jsonb) to service_role;
grant  execute on function public.site_liberer_stock(text) to service_role;
