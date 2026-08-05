'use client';
import { useEffect, useState } from 'react';

/**
 * Renvoie true quand la media-query correspond. Rend `false` au premier rendu
 * (côté serveur + hydratation) puis se met à jour au montage — évite tout
 * décalage d'hydratation. Suffisant pour un outil interne : au pire un bref
 * rendu « desktop » corrigé aussitôt sur mobile.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Raccourci : vrai en dessous de 860px (téléphones + petites tablettes). */
export const useIsMobile = () => useMediaQuery('(max-width: 860px)');
