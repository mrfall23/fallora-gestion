import { clientService, jetonSiteValide, nonAutorise } from '@/lib/site';
import { telegramConfigure, envoyerTelegram } from '@/lib/telegram';

// POST /api/site/commande { reference, lignes: [{ web_id, quantite }] }
// Commande WhatsApp passee sur le site : le stock est reserve ici (une seule
// fois par reference). Si un produit manque, l'admin est prevenue sur Telegram.
export async function POST(request: Request) {
  if (!jetonSiteValide(request)) return nonAutorise();
  const body = await request.json().catch(() => ({}));
  const reference = String(body?.reference || '').slice(0, 40);
  const lignes = (Array.isArray(body?.lignes) ? body.lignes : []).slice(0, 50).map((l: { web_id: unknown; quantite: unknown }) => ({
    web_id: Number(l?.web_id),
    quantite: Math.max(0, Math.round(Number(l?.quantite) || 0)),
  })).filter((l: { web_id: number }) => Number.isFinite(l.web_id));
  if (!reference || !lignes.length) return Response.json({ message: 'Commande invalide.' }, { status: 400 });

  const { data, error } = await clientService().rpc('site_reserver_stock', { p_reference: reference, p_lignes: lignes });
  if (error) return Response.json({ message: error.message }, { status: 500 });

  const manques = (data?.manques || []) as { nom: string; demande: number; disponible: number }[];
  if (manques.length && telegramConfigure()) {
    await envoyerTelegram(
      `⚠️ Commande en ligne ${reference} : stock insuffisant\n` +
      manques.map((m) => `• ${m.nom} : ${m.demande} demandé(s), ${m.disponible} en stock`).join('\n'),
    ).catch(() => {});
  }
  return Response.json({ ok: true, deja: !!data?.deja, manques });
}
