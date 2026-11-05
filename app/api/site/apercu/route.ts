import { refuserSiPasAdmin, SITE_URL } from '@/lib/site';

// GET /api/site/apercu : catalogue publie par le site (admin connectee).
// Lu cote serveur : le navigateur ne peut pas interroger le site directement.
export async function GET() {
  const refus = await refuserSiPasAdmin();
  if (refus) return refus;
  try {
    const r = await fetch(`${SITE_URL}/api/produits`, { cache: 'no-store' });
    const d = await r.json();
    return Response.json({ produits: Array.isArray(d?.produits) ? d.produits : [], site: SITE_URL });
  } catch {
    return Response.json({ message: `Le site ${SITE_URL} ne répond pas.` }, { status: 502 });
  }
}
