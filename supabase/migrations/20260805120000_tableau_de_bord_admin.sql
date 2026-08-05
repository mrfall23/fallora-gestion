-- ═══════════════════════════════════════════════════════════════════════
-- Tableau de bord admin — agregation cote base
--
-- Avant, le dashboard (app/admin/page.tsx) rapatriait TOUTES les ventes et
-- TOUTES les lignes de vente dans le navigateur pour en faire les totaux.
-- Ca marche a 50 ventes, ça devient lourd a 5 000. Cette fonction fait les
-- agregats en SQL et ne renvoie qu'un seul objet JSON.
--
-- Conventions reprises de enregistrer_vente() :
--   - security definer + search_path = '' + noms qualifies (anti-detournement) ;
--   - reservee a l'admin via prive.est_admin() — meme barriere que les policies ;
--   - execute retire a public/anon, accorde a authenticated.
--
-- La fonction ne fait que LIRE : aucun risque d'ecriture malgre le definer.
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

-- Droits : reprend la main sur le EXECUTE par defaut de Postgres.
revoke execute on function public.tableau_de_bord_admin() from public, anon;
grant execute on function public.tableau_de_bord_admin() to authenticated;
