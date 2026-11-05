import { clientService, jetonSiteValide, nonAutorise } from '@/lib/site';

// GET /api/site/stock -> { stock: { [web_id]: stock_restant } }
// Seuls les produits relies au site (web_id) et actifs sont renvoyes ; un
// produit inactif en boutique apparait a 0 (epuise) sur le site.
export async function GET(request: Request) {
  if (!jetonSiteValide(request)) return nonAutorise();
  const { data, error } = await clientService()
    .from('produits')
    .select('web_id, stock_restant, actif')
    .not('web_id', 'is', null);
  if (error) return Response.json({ message: error.message }, { status: 500 });
  const stock: Record<string, number> = {};
  for (const p of data || []) stock[String(p.web_id)] = p.actif ? Math.max(0, p.stock_restant || 0) : 0;
  return Response.json({ stock }, { headers: { 'Cache-Control': 'no-store' } });
}
