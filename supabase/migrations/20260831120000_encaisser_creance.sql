-- ═══════════════════════════════════════════════════════════════════════
-- Encaissement d'un acompte sur une vente en attente (creances)
--
-- Contexte : les ventes partielles laissent un reste_a_payer. Il manquait
-- un moyen d'encaisser cet acompte plus tard. La table paiements accepte
-- deja plusieurs lignes par vente (vente_id, montant, mode, date_paiement) ;
-- il ne manquait que la fonction pour en ajouter une et resolder la vente.
--
-- Conventions reprises de enregistrer_vente() / tableau_de_bord_admin() :
--   - security definer + search_path = '' + noms qualifies (anti-detournement) ;
--   - reservee a l'admin via prive.est_admin() — meme barriere que les policies
--     (choix du proprietaire : encaissement centralise cote admin) ;
--   - execute retire a public/anon, accorde a authenticated.
--
-- La fonction ECRIT : insere un paiement, puis recalcule montant_paye comme
-- la SOMME reelle des paiements (source de verite, evite toute derive),
-- ainsi que reste_a_payer et statut_paiement. Verrou FOR UPDATE sur la vente
-- pour eviter deux encaissements concurrents qui depasseraient le total.
-- ═══════════════════════════════════════════════════════════════════════

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
  v_reste         numeric;
  v_nouveau_paye  numeric;
  v_nouveau_reste numeric;
  v_statut        text;
begin
  if not prive.est_admin() then
    raise exception 'Reserve a l''administrateur';
  end if;

  if p_montant is null or p_montant <= 0 then
    raise exception 'Le montant doit etre positif';
  end if;

  -- Verrou sur la vente : serialise les encaissements concurrents.
  select total, annulee, coalesce(montant_paye, 0)
    into v_total, v_annulee, v_deja_paye
    from public.ventes
   where id = p_vente_id
   for update;

  if not found then
    raise exception 'Vente introuvable';
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
