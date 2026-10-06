// File d'attente locale des ventes effectuees sans reseau. Stockee dans
// localStorage (cle unique), elle survit a un rechargement / a la fermeture de
// l'app. Chaque entree contient le PAYLOAD exact a renvoyer a /api/ventes plus
// un apercu pour l'affichage. La synchronisation (dans l'espace vendeuse)
// depile au retour du reseau : la base reste la seule source de verite (stock
// verrouille, prix recalcules) — une vente peut donc etre refusee a l'envoi.

export type PayloadVente = {
  cliente_nom: string;
  cliente_telephone: string | null;
  produits: { produit_id: number; quantite: number }[];
  statut_paiement: 'paye' | 'partiel';
  montant_paye: number | null;
  mode_paiement: string;
};

export type VenteEnAttente = {
  id: string;                // identifiant local
  payload: PayloadVente;
  apercu: { cliente: string; total: number; date: string };
};

const CLE = 'fallora_ventes_hors_ligne';

export function lireFile(): VenteEnAttente[] {
  try {
    const brut = localStorage.getItem(CLE);
    const arr = brut ? JSON.parse(brut) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function ecrireFile(file: VenteEnAttente[]): void {
  try {
    localStorage.setItem(CLE, JSON.stringify(file));
  } catch {
    // quota plein ou storage indisponible : on ne peut rien faire de mieux ici.
  }
}

export function ajouterAFile(vente: VenteEnAttente): VenteEnAttente[] {
  const file = lireFile();
  file.push(vente);
  ecrireFile(file);
  return file;
}

export function nouvelId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
