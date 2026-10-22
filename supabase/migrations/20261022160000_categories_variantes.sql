-- ═══════════════════════════════════════════════════════════════════════
-- Categories et variantes (taille / couleur)
--
-- Chaque variante reste une ligne de produits, avec SON stock, son prix et
-- son historique : ventes, stock, marges, recus et rapports fonctionnent
-- sans changement. Les variantes d'un meme article partagent un « modele »
-- (nom de base) ; produits.nom reste le nom complet affiche partout
-- (ex. « Robe wax — M · Rouge »).
--
--   - categorie : regroupement libre (Robes, Sacs, Chaussures...) ;
--   - modele    : nom de base commun aux variantes (null = article simple) ;
--   - taille, couleur : facultatifs.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.produits add column if not exists categorie text;
alter table public.produits add column if not exists modele    text;
alter table public.produits add column if not exists taille    text;
alter table public.produits add column if not exists couleur   text;

create index if not exists produits_modele    on public.produits (modele);
create index if not exists produits_categorie on public.produits (categorie);
