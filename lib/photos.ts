import { supabase } from '@/lib/supabase';

// Photos produits, stockees dans le bucket public « produits » (Supabase
// Storage, ecriture reservee a l'admin). La photo est reduite dans le
// navigateur avant l'envoi : une photo de telephone (4 a 8 Mo) devient un
// JPEG d'environ 150 a 300 Ko, rapide a charger sur l'espace vendeuse.

const BUCKET = 'produits';
const COTE_MAX = 1200;
const QUALITE = 0.82;

async function chargerImage(fichier: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(fichier);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Redimensionne (cote le plus long <= COTE_MAX) et convertit en JPEG.
export async function compresserPhoto(fichier: File): Promise<Blob> {
  const img = await chargerImage(fichier).catch(() => {
    throw new Error('Format de photo non reconnu. Essayez une photo JPEG ou PNG.');
  });
  const echelle = Math.min(1, COTE_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * echelle);
  canvas.height = Math.round(img.naturalHeight * echelle);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Votre navigateur ne permet pas de préparer la photo.');
  ctx.fillStyle = '#fff'; // fond blanc pour les PNG transparents
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', QUALITE));
  if (!blob) throw new Error('Impossible de préparer la photo.');
  return blob;
}

// Envoie la photo et renvoie son URL publique (a enregistrer dans produits.image).
export async function envoyerPhoto(fichier: File): Promise<string> {
  const blob = await compresserPhoto(fichier);
  const chemin = `${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(chemin, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw new Error(`Envoi de la photo impossible : ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(chemin).data.publicUrl;
}

// Chemin dans le bucket si l'URL est une photo envoyee ici, sinon null
// (lien externe colle a la main : on n'y touche pas).
function cheminDepuisUrl(url: string | null | undefined): string | null {
  const marqueur = `/storage/v1/object/public/${BUCKET}/`;
  const i = url ? url.indexOf(marqueur) : -1;
  return i >= 0 ? decodeURIComponent(url!.slice(i + marqueur.length).split('?')[0]) : null;
}

// Supprime une photo devenue inutile. Best-effort : un echec laisse juste un
// fichier orphelin, sans consequence pour les ventes.
export async function supprimerPhoto(url: string | null | undefined): Promise<void> {
  const chemin = cheminDepuisUrl(url);
  if (!chemin) return;
  await supabase.storage.from(BUCKET).remove([chemin]).catch(() => {});
}
