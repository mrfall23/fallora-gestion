-- ═══════════════════════════════════════════════════════════════════════
-- Tableau de bord decisionnel — enrichissement de tableau_de_bord_admin()
--
-- Ajoute, sans rien retirer de l'existant (stats / ventes_recentes /
-- top_vendeuses), trois blocs d'aide a la decision :
--   - comparatif : CA et nb de ventes du mois courant vs mois precedent
--     (bornes calculees en heure locale Africa/Douala, UTC+1) ;
--   - ca_par_mode : repartition des encaissements par mode de paiement ;
--   - produits_ca : top 5 produits par CHIFFRE D'AFFAIRES genere (distinct du
--     top par quantite : un produit cher vendu peu peut rapporter davantage).
--
-- Conventions inchangees : stable + security definer + search_path = '' +
-- garde prive.est_admin(), execute reserve a authenticated.
-- ═══════════════════════════════════════════════════════════════════════

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
begin
  -- security definer contourne RLS : ce controle est la seule barriere.
  if not prive.est_admin() then
    raise exception 'Acces reserve a l''administratrice';
  end if;

  select jsonb_build_object(

    'stats', jsonb_build_object(
      'total_ventes', coalesce(
        (select sum(total) from public.ventes where annulee = false), 0),
      'produits_vendus', coalesce(
        (select sum(vp.quantite)
           from public.vente_produits vp
           join public.ventes v on v.id = vp.vente_id
          where v.annulee = false), 0),
      'stock_restant', coalesce(
        (select sum(stock_restant) from public.produits), 0),
      'paiements_en_attente', coalesce(
        (select sum(reste_a_payer) from public.ventes where annulee = false), 0)
    ),

    -- Comparatif mois courant vs mois precedent (heure locale).
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

    -- Repartition des encaissements par mode de paiement.
    'ca_par_mode', coalesce((
      select jsonb_agg(m order by m.total desc)
      from (
        select coalesce(nullif(btrim(p.mode), ''), 'cash') as mode,
               sum(p.montant) as total
          from public.paiements p
          join public.ventes v on v.id = p.vente_id
         where v.annulee = false
         group by 1
      ) m
    ), '[]'::jsonb),

    -- Top 5 produits par chiffre d'affaires genere.
    'produits_ca', coalesce((
      select jsonb_agg(pc order by pc.ca desc)
      from (
        select pr.nom,
               sum(vp.quantite) as quantite,
               sum(vp.prix_unitaire * vp.quantite) as ca
          from public.vente_produits vp
          join public.ventes v   on v.id = vp.vente_id
          join public.produits pr on pr.id = vp.produit_id
         where v.annulee = false
         group by pr.id, pr.nom
         order by ca desc
         limit 5
      ) pc
    ), '[]'::jsonb),

    -- 5 ventes les plus recentes, avec les noms deja resolus.
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

    -- Top 3 vendeuses par chiffre realise.
    'top_vendeuses', coalesce((
      select jsonb_agg(t order by t.total desc)
      from (
        select u.id,
               u.nom,
               count(v.id)          as nb,
               coalesce(sum(v.total), 0) as total
          from public.ventes v
          join public.utilisateurs u on u.id = v.vendeuse_id
         where v.annulee = false
         group by u.id, u.nom
         order by total desc
         limit 3
      ) t
    ), '[]'::jsonb)

  ) into v_result;

  return v_result;
end;
$$;

revoke execute on function public.tableau_de_bord_admin() from public, anon;
grant execute on function public.tableau_de_bord_admin() to authenticated;
