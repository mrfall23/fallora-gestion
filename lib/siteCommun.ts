// Partie de la liaison avec le site utilisable cote navigateur ET serveur
// (aucun secret ici). Le site fait reference pour les fiches produits.

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_WEB_URL || 'https://fallora-web.vercel.app').replace(/\/$/, '');

// Produit tel que le site le publie (/api/produits du site).
export type ProduitSite = {
  id: number;
  nom: string;
  prixNum: number;
  categorie?: string;
  description?: string;
  image?: string;
  images?: string[];
};

// Les photos du site peuvent etre relatives (/api/image?p=…) : on les rend absolues.
export const photoAbsolue = (url?: string | null) =>
  !url ? null : url.startsWith('http') ? url : `${SITE_URL}${url.startsWith('/') ? '' : '/'}${url}`;

// Champs de la fiche gestion recopies depuis le site (le site fait reference).
export function champsDepuisSite(p: ProduitSite) {
  return {
    nom: String(p.nom || '').slice(0, 140) || 'Produit',
    prix: Math.max(0, Math.round(Number(p.prixNum) || 0)),
    description: p.description ? String(p.description).slice(0, 400) : null,
    image: photoAbsolue((p.images && p.images[0]) || p.image),
    categorie: p.categorie || null,
  };
}

// Comparaison tolerante des noms (accents, casse, ponctuation).
export const normaliserNom = (v: string) =>
  String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

