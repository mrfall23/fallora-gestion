import { toBlob } from 'html-to-image';
import type { RecuData } from './Recu';

const MODE: Record<string, string> = { cash: 'Espèces', mobile_money: 'Mobile Money', orange_money: 'Orange Money' };
const fmt = (n: number) => n.toLocaleString('fr-FR');

/** Version texte du reçu (marche avec n'importe quel numero, meme non enregistre). */
export function texteRecu(d: RecuData): string {
  const lignes = d.items.map(it => `• ${it.quantite}× ${it.nom} : ${fmt(it.prix * it.quantite)}`).join('\n');
  const reste = d.reste > 0 ? `\nReste à payer : ${fmt(d.reste)} FCFA` : '';
  return `*${d.boutique}* — Reçu ${d.numero}\n${d.date}\nClient : ${d.client}\n\n${lignes}\n\n*TOTAL : ${fmt(d.total)} FCFA*\nPayé (${MODE[d.mode] || d.mode}) : ${fmt(d.paye)} FCFA${reste}\n\nMerci de votre achat 💛`;
}

/**
 * Partage l'IMAGE du reçu via la feuille de partage du téléphone (WhatsApp,
 * etc.). Note : WhatsApp exige alors un contact enregistre. Repli :
 * telechargement de l'image.
 */
export async function partagerImageRecu(node: HTMLElement, d: RecuData): Promise<'partage' | 'telecharge' | 'echec'> {
  let blob: Blob | null = null;
  try {
    blob = await toBlob(node, { pixelRatio: 2, backgroundColor: '#FBF7EF', cacheBust: true });
  } catch {
    blob = null;
  }
  if (!blob) return 'echec';

  const fichier = new File([blob], `recu-${d.numero}.png`, { type: 'image/png' });
  const nav = navigator as any;

  if (nav.canShare && nav.canShare({ files: [fichier] })) {
    try {
      await nav.share({ files: [fichier], text: `Reçu ${d.boutique} — ${d.numero}` });
      return 'partage';
    } catch (e: any) {
      if (e?.name === 'AbortError') return 'partage'; // annule par l'utilisateur
    }
  }

  // Repli : telechargement de l'image
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `recu-${d.numero}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'telecharge';
}

/** Envoie WhatsApp en TEXTE, pre-rempli au numero du client si dispo. */
export function whatsappTexte(d: RecuData) {
  let num = (d.telephone || '').replace(/[^0-9]/g, '');
  if (num && num.length === 9) num = '237' + num; // numero camerounais local
  const texte = encodeURIComponent(texteRecu(d));
  const url = num ? `https://wa.me/${num}?text=${texte}` : `https://wa.me/?text=${texte}`;
  window.open(url, '_blank');
}
