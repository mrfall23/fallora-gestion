// Variantes d'un article : chaque taille / couleur est une ligne de produits
// (son propre stock), reliee aux autres par « modele » (nom de base).
// produits.nom garde le nom complet, affiche tel quel sur les recus, les
// rapports et les alertes.

export type ProduitVariante = { nom: string; modele?: string | null; taille?: string | null; couleur?: string | null; categorie?: string | null };

// « M · Rouge », « M », « Rouge » ou '' pour un article simple.
export function libelleVariante(p: { taille?: string | null; couleur?: string | null }): string {
  return [p.taille, p.couleur].map(x => (x || '').trim()).filter(Boolean).join(' · ');
}

// « Robe wax — M · Rouge »
export function nomComplet(base: string, taille?: string | null, couleur?: string | null): string {
  const v = libelleVariante({ taille, couleur });
  return v ? `${base.trim()} — ${v}` : base.trim();
}

// Nom de base d'un produit (modele s'il existe, sinon son nom).
export function nomDeBase(p: ProduitVariante): string {
  return (p.modele || '').trim() || p.nom;
}

// Regroupe les produits par modele, en gardant l'ordre d'arrivee.
export function grouperParModele<T extends ProduitVariante>(produits: T[]): { base: string; variantes: T[] }[] {
  const groupes = new Map<string, T[]>();
  for (const p of produits) {
    const cle = (p.modele || '').trim() ? `m:${p.modele!.trim().toLowerCase()}` : `p:${p.nom}`;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle)!.push(p);
  }
  return [...groupes.values()].map(v => ({ base: nomDeBase(v[0]), variantes: v }));
}

// Categories distinctes, triees.
export function categoriesDe(produits: { categorie?: string | null }[]): string[] {
  return [...new Set(produits.map(p => (p.categorie || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
}
