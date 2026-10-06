import { supabase } from '@/lib/supabase';

// Supabase (PostgREST) renvoie au plus 1000 lignes par requete, SANS erreur :
// au-dela, les lignes en trop sont simplement ignorees et les totaux deviennent
// faux. Ces helpers lisent tout, page par page.

const TAILLE_PAGE = 1000;
// Un .in() avec des milliers d'ids depasse la longueur max d'URL : on decoupe.
const TAILLE_LOT_IDS = 200;

// `construire` doit renvoyer une requete NEUVE a chaque appel (un builder
// Supabase ne se reutilise pas). Mettre un .order() stable (ex. sur 'id') pour
// que la pagination ne saute ni ne double aucune ligne.
export async function toutLire<T = any>(construire: () => any): Promise<T[]> {
  const lignes: T[] = [];
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    const { data, error } = await construire().range(debut, debut + TAILLE_PAGE - 1);
    if (error) throw error;
    lignes.push(...(data || []));
    if (!data || data.length < TAILLE_PAGE) return lignes;
  }
}

// Equivalent de supabase.from(table).select(colonnes).in(colonne, ids), sans
// limite de taille sur `ids` ni sur le nombre de lignes renvoyees.
export async function lireParIds<T = any>(table: string, colonnes: string, colonne: string, ids: (number | string)[]): Promise<T[]> {
  const uniques = [...new Set(ids.filter(id => id !== null && id !== undefined))];
  const lots: (number | string)[][] = [];
  for (let i = 0; i < uniques.length; i += TAILLE_LOT_IDS) lots.push(uniques.slice(i, i + TAILLE_LOT_IDS));
  const resultats = await Promise.all(lots.map(lot =>
    toutLire<T>(() => supabase.from(table).select(colonnes).in(colonne, lot).order('id'))
  ));
  return resultats.flat();
}
