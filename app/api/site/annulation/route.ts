import { clientService, jetonSiteValide, nonAutorise } from '@/lib/site';

// POST /api/site/annulation { reference } : commande en ligne annulee,
// le stock reserve est rendu (une seule fois).
export async function POST(request: Request) {
  if (!jetonSiteValide(request)) return nonAutorise();
  const body = await request.json().catch(() => ({}));
  const reference = String(body?.reference || '').slice(0, 40);
  if (!reference) return Response.json({ message: 'Reference manquante.' }, { status: 400 });
  const { data, error } = await clientService().rpc('site_liberer_stock', { p_reference: reference });
  if (error) return Response.json({ message: error.message }, { status: 500 });
  return Response.json({ ok: true, rendu: !!data?.rendu });
}
