// Alertes Telegram (meme principe que Maison Fal). Cote serveur uniquement :
// le jeton du bot ne doit jamais atteindre le navigateur. N'importer ce
// fichier que depuis des routes API (app/api/**).
//
// Configuration (variables d'environnement, Vercel + .env.local) :
//   TELEGRAM_BOT_TOKEN : jeton donne par @BotFather (secret) ;
//   TELEGRAM_CHAT_ID   : conversation qui recoit les alertes (toi, ou un
//                        groupe ou le bot a ete ajoute — id negatif).
// Sans ces deux variables, rien n'est envoye (et rien ne casse).
//
// Le bot ne fait qu'ENVOYER vers ce chat : il ne lit ni ne repond a personne.

export function telegramConfigure(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

/** Envoie un message. Ne leve jamais d'erreur : renvoie le resultat. */
export async function envoyerTelegram(texte: string): Promise<{ ok: boolean; detail?: string }> {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return { ok: false, detail: 'Telegram non configuré (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID).' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: texte.slice(0, 4000), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      // Ne jamais journaliser l'URL (elle contient le jeton).
      const detail = `${res.status} ${(await res.text()).slice(0, 200)}`;
      console.error('[telegram] envoi en echec :', detail);
      return { ok: false, detail };
    }
    return { ok: true };
  } catch (e: any) {
    console.error('[telegram] envoi en echec :', e?.message);
    return { ok: false, detail: e?.message || 'Erreur réseau' };
  }
}

const fcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR').replace(/[  ]/g, ' ')} FCFA`;
const MODES: Record<string, string> = { cash: 'Espèces', mobile_money: 'Mobile Money', orange_money: 'Orange Money' };

export type VenteAlerte = {
  id: number;
  vendeuse: string;
  cliente: string;
  telephone: string | null;
  articles: { nom: string; quantite: number; prix: number }[];
  total: number;
  paye: number;
  reste: number;
  mode: string;
};

/** Message detaille d'une nouvelle vente. */
export function texteVente(v: VenteAlerte, siteUrl: string): string {
  let num = (v.telephone || '').replace(/\D/g, '');
  if (num.length === 9) num = '237' + num; // numero camerounais local
  return [
    `🛍️ Fallora — Nouvelle vente n°${v.id}`,
    '',
    `👩 Vendeuse : ${v.vendeuse}`,
    `👤 Cliente : ${v.cliente}${v.telephone ? ` · ${v.telephone}` : ''}`,
    '',
    ...v.articles.map(a => `• ${a.quantite} × ${a.nom} — ${fcfa(a.prix * a.quantite)}`),
    '',
    `💰 Total : ${fcfa(v.total)}`,
    v.reste > 0
      ? `⚠️ Payé ${fcfa(v.paye)} (${MODES[v.mode] || v.mode}) · Reste dû ${fcfa(v.reste)}`
      : `✅ Payé · ${MODES[v.mode] || v.mode}`,
    '',
    `→ Admin : ${siteUrl}/admin/ventes`,
    ...(num ? [`→ WhatsApp cliente : https://wa.me/${num}`] : []),
  ].join('\n');
}

export function texteStockBas(produits: { nom: string; stock: number }[], siteUrl: string): string {
  return [
    '⚠️ Fallora — Stock bas',
    '',
    ...produits.map(p => `• ${p.nom} : ${p.stock <= 0 ? 'ÉPUISÉ' : `${p.stock} restant${p.stock > 1 ? 's' : ''}`}`),
    '',
    `→ Réapprovisionner : ${siteUrl}/admin/produits`,
  ].join('\n');
}
