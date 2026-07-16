-- ═══════════════════════════════════════════════════════════════════════
-- PHASE 6 — Row Level Security
--
-- Jusqu'ici RLS etait desactivee sur les 6 tables, faute d'authentification
-- reelle : sans Supabase Auth, auth.uid() etait toujours nul, donc aucune
-- policy ne pouvait identifier qui que ce soit. Les phases 1 a 5 ont corrige
-- la cause. On peut enfin poser la barriere.
--
-- Modele de propriete :
--   - une vente appartient a une vendeuse (ventes.vendeuse_id)
--   - ses lignes et paiements suivent leur vente
--   - les clientes sont un pot commun (dedup par telephone, cf. le metier)
--   - l'admin voit et modifie tout
--
-- Toutes les fonctions sont en security definer avec search_path = '' :
--   - definer pour interroger utilisateurs sans declencher sa propre policy
--     (sinon recursion infinie) ;
--   - search_path vide + noms qualifies pour fermer les attaques par
--     detournement de search_path.
--
-- Chaque fonction exige actif = true : desactiver un compte coupe l'acces
-- immediatement, sans attendre l'expiration du jeton.
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Fonctions d'identite ───────────────────────────────────────────

create or replace function public.mon_profil_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.utilisateurs
  where auth_id = (select auth.uid()) and actif = true
$$;

create or replace function public.est_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.utilisateurs
    where auth_id = (select auth.uid()) and actif = true and role = 'admin'
  )
$$;

create or replace function public.est_connecte()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.utilisateurs
    where auth_id = (select auth.uid()) and actif = true
  )
$$;

-- ─── 2. Enregistrement d'une vente, en une transaction ─────────────────
--
-- Remplace les 5 inserts separes du navigateur. Corrige quatre problemes :
--   1. atomicite : tout reussit ou rien n'est ecrit (avant, un echec en
--      cours de route laissait une vente sans produits) ;
--   2. les prix sont lus en base, plus envoyes par le client ;
--   3. le stock est verrouille (for update) : deux ventes simultanees ne
--      peuvent plus vendre le meme dernier article ;
--   4. la vendeuse n'a plus besoin du droit UPDATE sur produits, donc elle
--      ne peut plus toucher aux prix.

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
  -- security definer contourne RLS : ce controle est la seule barriere ici.
  v_vendeuse_id := public.mon_profil_id();
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

  -- Cliente : dedup par telephone quand il est fourni.
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

    -- for update verrouille la ligne jusqu'a la fin de la transaction.
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

    -- Le prix vient de la base, jamais du navigateur.
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

-- ─── 3. Droits d'execution ─────────────────────────────────────────────
-- Par defaut Postgres accorde EXECUTE a tout le monde : on reprend la main.

revoke execute on function public.mon_profil_id() from public, anon;
revoke execute on function public.est_admin() from public, anon;
revoke execute on function public.est_connecte() from public, anon;
revoke execute on function
  public.enregistrer_vente(text, text, jsonb, text, numeric, text) from public, anon;

grant execute on function public.mon_profil_id() to authenticated;
grant execute on function public.est_admin() to authenticated;
grant execute on function public.est_connecte() to authenticated;
grant execute on function
  public.enregistrer_vente(text, text, jsonb, text, numeric, text) to authenticated;

-- ─── 4. anon n'a plus rien a faire ici ─────────────────────────────────
-- anon = visiteur non authentifie. Depuis le passage a Supabase Auth, la
-- connexion se joue dans le schema auth : plus aucune table de public ne lui
-- est necessaire. Seconde barriere derriere RLS — meme une policy mal ecrite
-- ne lui ouvrira rien.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ─── 5. RLS ────────────────────────────────────────────────────────────

alter table public.utilisateurs   enable row level security;
alter table public.produits       enable row level security;
alter table public.clientes       enable row level security;
alter table public.ventes         enable row level security;
alter table public.vente_produits enable row level security;
alter table public.paiements      enable row level security;

-- utilisateurs ----------------------------------------------------------
-- Creation et modification de compte passent par /api/vendeuses (cle
-- secrete) : aucune policy d'insert ici, volontairement.

create policy "utilisateurs: son profil, ou tout si admin"
  on public.utilisateurs for select to authenticated
  using (auth_id = (select auth.uid()) or public.est_admin());

create policy "utilisateurs: admin modifie"
  on public.utilisateurs for update to authenticated
  using (public.est_admin()) with check (public.est_admin());

create policy "utilisateurs: admin supprime"
  on public.utilisateurs for delete to authenticated
  using (public.est_admin());

-- produits --------------------------------------------------------------
-- Pas d'update pour les vendeuses : le stock se decremente via
-- enregistrer_vente(). C'est ce qui les empeche de modifier les prix.

create policy "produits: lecture pour les connectes"
  on public.produits for select to authenticated
  using (public.est_connecte());

create policy "produits: admin ecrit"
  on public.produits for insert to authenticated
  with check (public.est_admin());

create policy "produits: admin modifie"
  on public.produits for update to authenticated
  using (public.est_admin()) with check (public.est_admin());

create policy "produits: admin supprime"
  on public.produits for delete to authenticated
  using (public.est_admin());

-- clientes --------------------------------------------------------------
-- Pot commun assume : la dedup par telephone suppose qu'une vendeuse
-- retrouve une cliente creee par une autre. L'insert passe par
-- enregistrer_vente().

create policy "clientes: lecture pour les connectes"
  on public.clientes for select to authenticated
  using (public.est_connecte());

create policy "clientes: admin ajoute"
  on public.clientes for insert to authenticated
  with check (public.est_admin());

create policy "clientes: admin modifie"
  on public.clientes for update to authenticated
  using (public.est_admin()) with check (public.est_admin());

create policy "clientes: admin supprime"
  on public.clientes for delete to authenticated
  using (public.est_admin());

-- ventes ----------------------------------------------------------------

create policy "ventes: les siennes, ou toutes si admin"
  on public.ventes for select to authenticated
  using (vendeuse_id = public.mon_profil_id() or public.est_admin());

create policy "ventes: admin modifie"
  on public.ventes for update to authenticated
  using (public.est_admin()) with check (public.est_admin());

create policy "ventes: admin supprime"
  on public.ventes for delete to authenticated
  using (public.est_admin());

-- vente_produits --------------------------------------------------------
-- La visibilite suit celle de la vente parente.

create policy "vente_produits: suit la vente"
  on public.vente_produits for select to authenticated
  using (exists (
    select 1 from public.ventes v
    where v.id = vente_id
      and (v.vendeuse_id = public.mon_profil_id() or public.est_admin())
  ));

create policy "vente_produits: admin modifie"
  on public.vente_produits for update to authenticated
  using (public.est_admin()) with check (public.est_admin());

create policy "vente_produits: admin supprime"
  on public.vente_produits for delete to authenticated
  using (public.est_admin());

-- paiements -------------------------------------------------------------

create policy "paiements: suit la vente"
  on public.paiements for select to authenticated
  using (exists (
    select 1 from public.ventes v
    where v.id = vente_id
      and (v.vendeuse_id = public.mon_profil_id() or public.est_admin())
  ));

create policy "paiements: admin modifie"
  on public.paiements for update to authenticated
  using (public.est_admin()) with check (public.est_admin());

create policy "paiements: admin supprime"
  on public.paiements for delete to authenticated
  using (public.est_admin());

-- ─── 6. Adieu les mots de passe en clair ───────────────────────────────
-- Le nouveau login est valide (scripts/verifier-login.mjs). Les mots de
-- passe vivent desormais dans auth.users, haches. Cette colonne n'a plus
-- de raison d'exister — et tant qu'elle existe, elle est une cible.

alter table public.utilisateurs drop column if exists mot_de_passe;
