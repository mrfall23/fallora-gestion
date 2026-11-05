import { timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { creerClientServeur } from '@/lib/supabase-server';

export * from '@/lib/siteCommun';

// Liaison avec le site fallora-web (voir la migration 20261105120000_liaison_site).
//
// Les routes /api/site/* sont appelees PAR LE SITE, pas par un navigateur :
// elles exigent le jeton partage SITE_SYNC_TOKEN (en-tete x-site-token) et
// utilisent la cle secrete, qui contourne RLS. Sans jeton valide : 401.

export function jetonSiteValide(request: Request): boolean {
  const attendu = process.env.SITE_SYNC_TOKEN || '';
  const recu = request.headers.get('x-site-token') || '';
  if (!attendu || !recu) return false;
  const a = Buffer.from(recu);
  const b = Buffer.from(attendu);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function clientService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SECRET_KEY as string,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export const nonAutorise = () => Response.json({ message: 'Jeton du site invalide.' }, { status: 401 });

/** Route appelee par l'admin connectee (cookie de session) : renvoie une erreur, ou null si admin active. */
export async function refuserSiPasAdmin() {
  const supabase = await creerClientServeur();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ message: 'Non authentifie.' }, { status: 401 });
  const { data: profil } = await supabase.from('utilisateurs').select('role, actif').eq('auth_id', user.id).single();
  if (!profil || !profil.actif || profil.role !== 'admin') return Response.json({ message: 'Acces refuse.' }, { status: 403 });
  return null;
}
