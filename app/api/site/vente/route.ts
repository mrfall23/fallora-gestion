import { clientService, jetonSiteValide, nonAutorise } from '@/lib/site';

// POST /api/site/vente { reference, client: { nom, tel }, paiement, lignes: [{ web_id, quantite, prix_unitaire }] }
// Commande du site LIVREE : elle devient une vente « en ligne » (chiffre
// d'affaires, marges, fiche cliente, rapports). Une seule fois par reference ;
// le stock n'est pas retire une seconde fois (il l'a ete a la commande).
const MODES: Record<string, string> = { 'À la livraison': 'cash', 'Orange Money': 'orange_money', 'MTN Mobile Money': 'mobile_money' };

export async function POST(request: Request) {
  if (!jetonSiteValide(request)) return nonAutorise();
  const body = await request.json().catch(() => ({}));
  const reference = String(body?.reference || '').slice(0, 40);
  const lignes = (Array.isArray(body?.lignes) ? body.lignes : []).slice(0, 50).map((l: { web_id: unknown; quantite: unknown; prix_unitaire: unknown }) => ({
    web_id: Number(l?.web_id),
    quantite: Math.max(0, Math.round(Number(l?.quantite) || 0)),
    prix_unitaire: Math.max(0, Math.round(Number(l?.prix_unitaire) || 0)),
  })).filter((l: { web_id: number }) => Number.isFinite(l.web_id));
  if (!reference || !lignes.length) return Response.json({ message: 'Vente invalide.' }, { status: 400 });

  const { data, error } = await clientService().rpc('site_enregistrer_vente', {
    p_reference: reference,
    p_nom: String(body?.client?.nom || '').slice(0, 120),
    p_telephone: String(body?.client?.tel || '').slice(0, 40),
    p_mode: MODES[String(body?.paiement)] || 'cash',
    p_lignes: lignes,
  });
  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ ok: true, ...data });
}
