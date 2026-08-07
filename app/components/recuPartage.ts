import { toPng } from 'html-to-image';
import type { RecuData } from './Recu';

const MODE: Record<string, string> = { cash: 'Espèces', mobile_money: 'Mobile Money', orange_money: 'Orange Money' };
const fmt = (n: number) => n.toLocaleString('fr-FR');

/** Normalise un numero camerounais pour wa.me (ajoute 237 si local a 9 chiffres). */
function numeroWa(tel?: string | null): string {
  let num = (tel || '').replace(/[^0-9]/g, '');
  if (num && num.length === 9) num = '237' + num;
  return num;
}

function urlWa(num: string, texte: string): string {
  const t = encodeURIComponent(texte);
  return num ? `https://wa.me/${num}?text=${t}` : `https://wa.me/?text=${t}`;
}

/** Reçu en texte complet (secours : marche avec n'importe quel numero, meme non enregistre). */
export function texteRecu(d: RecuData): string {
  const lignes = d.items.map(it => `• ${it.quantite}× ${it.nom} : ${fmt(it.prix * it.quantite)}`).join('\n');
  const reste = d.reste > 0 ? `\nReste à payer : ${fmt(d.reste)} FCFA` : '';
  return `*${d.boutique}* — Reçu ${d.numero}\n${d.date}\nClient : ${d.client}\n\n${lignes}\n\n*TOTAL : ${fmt(d.total)} FCFA*\nPayé (${MODE[d.mode] || d.mode}) : ${fmt(d.paye)} FCFA${reste}\n\nMerci de votre achat 💛`;
}

/** Message court accompagnant le lien vers l'image du reçu. */
function messageLien(d: RecuData, url: string): string {
  const statut = d.reste > 0 ? `payé ${fmt(d.paye)}, reste ${fmt(d.reste)}` : 'payé intégralement';
  return `*${d.boutique}* — Reçu ${d.numero}\nTotal : ${fmt(d.total)} FCFA (${statut})\n\n🧾 Votre reçu : ${url}\n\nMerci de votre achat 💛`;
}

/** Envoie WhatsApp en TEXTE (secours). Synchrone -> jamais bloque. */
export function whatsappTexte(d: RecuData) {
  window.open(urlWa(numeroWa(d.telephone), texteRecu(d)), '_blank');
}

/**
 * Chemin principal : genere l'image du reçu, l'heberge, envoie un LIEN par WhatsApp.
 *
 * Point cle : on ouvre l'onglet WhatsApp DES LE CLIC (dans le geste utilisateur),
 * sinon les mobiles bloquent l'ouverture apres le delai de preparation de l'image.
 * On y injecte ensuite le message une fois le lien pret. Repli automatique en
 * texte si l'hebergement echoue (pas d'internet, etc.).
 */
export async function envoyerLienWhatsApp(node: HTMLElement, d: RecuData): Promise<'lien' | 'texte'> {
  // 1) Onglet ouvert immediatement (autorise car dans le clic).
  const win = window.open('', '_blank');
  try {
    win?.document.write('<p style="font-family:sans-serif;padding:24px;color:#3E2C20">Préparation du reçu…</p>');
  } catch { /* about:blank non accessible : on ignore */ }

  // 2) Generation + hebergement de l'image (asynchrone).
  let message = texteRecu(d);
  let type: 'lien' | 'texte' = 'texte';
  try {
    const dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: '#FBF7EF', cacheBust: true });
    const r = await fetch('/api/recu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl, numero: d.numero }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.url) { message = messageLien(d, j.url); type = 'lien'; }
  } catch { /* on garde le repli texte */ }

  // 3) On dirige l'onglet deja ouvert vers WhatsApp (ou l'onglet courant en secours).
  const url = urlWa(numeroWa(d.telephone), message);
  if (win && !win.closed) win.location.href = url;
  else window.location.href = url;
  return type;
}
