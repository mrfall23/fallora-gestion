-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 6b — Sortir les helpers de l'API REST
--
-- Signale par `supabase db advisors --type security` :
-- mon_profil_id(), est_admin() et est_connecte() etant dans public, PostgREST
-- les expose en /rest/v1/rpc/<nom>. Elles ne renseignent que sur l'appelant
-- lui-meme, donc rien ne fuit — mais elles n'ont aucune raison d'etre dans
-- l'API. Moins de surface exposee, moins de choses a surveiller.
--
-- PostgREST n'expose que les schemas declares (public, graphql_public) : un
-- schema `prive` est hors de portee, meme avec EXECUTE accorde.
--
-- Les policies referencent les fonctions par OID, que le changement de schema
-- ne modifie pas : elles suivent sans etre reecrites.
--
-- enregistrer_vente() reste dans public : les vendeuses doivent l'appeler.
-- L'avertissement la concernant est assume — c'est le principe meme d'une
-- operation privilegiee exposee de facon controlee.
-- ═══════════════════════════════════════════════════════════════════════

create schema if not exists prive;

revoke all on schema prive from public, anon;
grant usage on schema prive to authenticated, service_role;

alter function public.mon_profil_id() set schema prive;
alter function public.est_admin()     set schema prive;
alter function public.est_connecte()  set schema prive;

-- enregistrer_vente appelle mon_profil_id en nom qualifie (search_path = '') :
-- il faut la recreer pour pointer vers le nouveau schema, sinon elle casse.
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
    values (v_vente_id, v_produit.id, v_quantite, v_produit.prix);

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

revoke execute on function
  public.enregistrer_vente(text, text, jsonb, text, numeric, text) from public, anon;
grant execute on function
  public.enregistrer_vente(text, text, jsonb, text, numeric, text) to authenticated;

-- Les policies evaluent ces fonctions avec les droits de l'appelant :
-- sans EXECUTE, toute requete d'un utilisateur connecte echouerait.
revoke execute on function prive.mon_profil_id() from public, anon;
revoke execute on function prive.est_admin()     from public, anon;
revoke execute on function prive.est_connecte()  from public, anon;

grant execute on function prive.mon_profil_id() to authenticated;
grant execute on function prive.est_admin()     to authenticated;
grant execute on function prive.est_connecte()  to authenticated;
