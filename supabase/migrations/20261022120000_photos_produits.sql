-- ═══════════════════════════════════════════════════════════════════════
-- Photos produits : bucket Supabase Storage « produits »
--
-- Avant, la photo d'un produit etait une URL a coller. L'admin peut
-- desormais prendre / choisir une photo depuis son telephone : elle est
-- reduite dans le navigateur (JPEG ~1200 px) puis envoyee ici.
--
--   - bucket PUBLIC en lecture : produits.image contient l'URL publique,
--     affichee telle quelle dans l'espace vendeuse et sur les recus ;
--   - ecriture / remplacement / suppression : admin uniquement
--     (prive.est_admin(), meme barriere que les policies des tables) ;
--   - images seulement, 5 Mo maximum (garde-fou cote serveur).
-- ═══════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produits', 'produits', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "produits photos: admin lit"      on storage.objects;
drop policy if exists "produits photos: admin ajoute"   on storage.objects;
drop policy if exists "produits photos: admin modifie"  on storage.objects;
drop policy if exists "produits photos: admin supprime" on storage.objects;

-- Lecture par l'API (necessaire a la suppression) : admin. L'affichage
-- passe par l'URL publique et n'a pas besoin de cette policy.
create policy "produits photos: admin lit"
  on storage.objects for select to authenticated
  using (bucket_id = 'produits' and prive.est_admin());

create policy "produits photos: admin ajoute"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'produits' and prive.est_admin());

create policy "produits photos: admin modifie"
  on storage.objects for update to authenticated
  using (bucket_id = 'produits' and prive.est_admin())
  with check (bucket_id = 'produits' and prive.est_admin());

create policy "produits photos: admin supprime"
  on storage.objects for delete to authenticated
  using (bucket_id = 'produits' and prive.est_admin());
