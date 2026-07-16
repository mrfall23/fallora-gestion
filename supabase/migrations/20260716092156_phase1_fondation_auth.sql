-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 1 — Fondation pour l'authentification reelle et RLS
--
-- Contexte : l'app authentifiait cote navigateur contre utilisateurs.mot_de_passe
-- en clair, ce qui rendait auth.uid() toujours nul et donc RLS inapplicable.
-- Cette migration prepare le terrain. RLS sera activee en phase 6, une fois
-- que Supabase Auth sera reellement en place.
--
-- Verifie avant ecriture (16/07/2026) :
--   clients          : 0 ligne  -> suppression sans risque
--   ventes_produits  : 0 ligne  -> suppression sans risque
--   clientes         : 5 lignes, 4 telephones, 0 doublon
--   utilisateurs     : 4 lignes, 4 emails, 0 doublon, 0 nul (1 admin + 3 vendeuses)
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Tables fantomes ────────────────────────────────────────────────
-- Vestiges d'un renommage (clients -> clientes, ventes_produits -> vente_produits).
-- Aucune reference dans le code, aucune ligne, mais exposees comme les autres.
drop table if exists public.clients;
drop table if exists public.ventes_produits;

-- ─── 2. Integrite des utilisateurs ─────────────────────────────────────
-- Le login fait .single() sur l'email : deux doublons le cassent.
-- Index sur lower(email) car le code insere en minuscules mais le login
-- cherche la casse brute (app/page.tsx:20 vs parametres/page.tsx:55).
alter table public.utilisateurs alter column email set not null;

create unique index if not exists utilisateurs_email_unique
  on public.utilisateurs (lower(email));

-- ─── 3. Integrite des clientes ─────────────────────────────────────────
-- La dedup fait .maybeSingle() sur telephone : deux clientes partageant
-- un numero feraient echouer l'enregistrement d'une vente.
-- Index partiel : le telephone reste facultatif (vendeuse/page.tsx:76).
create unique index if not exists clientes_telephone_unique
  on public.clientes (telephone)
  where telephone is not null;

-- ─── 4. Cles etrangeres ────────────────────────────────────────────────
-- Aucune n'existait. Elles portent le modele de propriete sur lequel
-- reposeront les policies RLS : une vente appartient a une vendeuse, et
-- les lignes/paiements suivent leur vente.
alter table public.ventes
  add constraint ventes_vendeuse_fk
    foreign key (vendeuse_id) references public.utilisateurs (id),
  add constraint ventes_cliente_fk
    foreign key (cliente_id) references public.clientes (id);

alter table public.vente_produits
  add constraint vente_produits_vente_fk
    foreign key (vente_id) references public.ventes (id) on delete cascade,
  add constraint vente_produits_produit_fk
    foreign key (produit_id) references public.produits (id);

alter table public.paiements
  add constraint paiements_vente_fk
    foreign key (vente_id) references public.ventes (id) on delete cascade;

-- ─── 5. Le pont vers Supabase Auth ─────────────────────────────────────
-- Les mots de passe vivront dans auth.users, haches par Supabase.
-- utilisateurs.mot_de_passe sera supprimee en phase 5, une fois le
-- nouveau login valide : on ne brule pas le pont avant d'avoir traverse.
alter table public.utilisateurs
  add column if not exists auth_id uuid unique
    references auth.users (id) on delete cascade;

comment on column public.utilisateurs.auth_id is
  'Lien vers auth.users. Sert de base aux policies RLS via auth.uid().';
