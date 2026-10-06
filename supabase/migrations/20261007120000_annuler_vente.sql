-- ═══════════════════════════════════════════════════════════════════════
-- Annulation d'une vente (admin)
--
-- Contexte : la colonne ventes.annulee existe depuis le debut et TOUTES les
-- lectures (pages, tableau_de_bord_admin, ca_par_mode...) filtrent deja
-- annulee = false. Il ne manquait que le moyen d'annuler : une erreur de
-- saisie ne se corrigeait qu'en SQL, et le stock restait faux.
--
-- Choix : on ARCHIVE (annulee = true), on ne supprime rien. Les lignes
-- vente_produits et paiements sont conservees pour l'historique ; elles sont
-- exclues des stats via la jointure sur ventes.annulee. Le stock vendu est
-- REMIS en rayon. On trace qui a annule, quand, et pourquoi (anti-fraude).
--
-- Conventions reprises de enregistrer_paiement() :
--   security definer + search_path = '' + noms qualifies ; reservee a
--   l'admin via prive.est_admin() ; execute retire a public/anon.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.ventes
  add column if not exists annulee_le       timestamptz,
  add column if not exists annulee_par      bigint references public.utilisateurs (id),
  add column if not exists motif_annulation text;

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

revoke execute on function public.annuler_vente(bigint, text) from public, anon;
grant  execute on function public.annuler_vente(bigint, text) to authenticated;
