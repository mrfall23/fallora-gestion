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

function ouvrirWa(num: string, texte: string) {
  const t = encodeURIComponent(texte);
  window.open(num ? `https://wa.me/${num}?text=${t}` : `https://wa.me/?text=${t}`, '_blank');
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

/** Envoie WhatsApp en TEXTE (secours). */
export function whatsappTexte(d: RecuData) {
  ouvrirWa(numeroWa(d.telephone), texteRecu(d));
}

/**
 * Chemin principal : genere l'image du reçu, l'heberge, et envoie un LIEN par
 * WhatsApp (marche avec tous les numeros, meme non enregistres, logo compris).
 * Si l'hebergement echoue (pas d'internet, etc.), repli automatique sur le texte.
 */
export async function envoyerLienWhatsApp(node: HTMLElement, d: RecuData): Promise<'lien' | 'texte'> {
  let dataUrl = '';
  try {
    dataUrl = await toPng(node, { pixelRatio: 2, backgroundColor: '#FBF7EF', cacheBust: true });
  } catch {
    dataUrl = '';
  }
  if (!dataUrl) { whatsappTexte(d); return 'texte'; }

  try {
    const r = await fetch('/api/recu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl, numero: d.numero }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) { whatsappTexte(d); return 'texte'; }
    ouvrirWa(numeroWa(d.telephone), messageLien(d, j.url));
    return 'lien';
  } catch {
    whatsappTexte(d);
    return 'texte';
  }
}
