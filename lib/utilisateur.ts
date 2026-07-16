'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from './supabase';

export type Utilisateur = {
  id: number;
  nom: string;
  email: string;
  role: string;
  actif: boolean;
};

/**
 * Recupere l'utilisateur connecte a partir de la session Supabase.
 *
 * Remplace l'ancien localStorage.getItem('fallora_user'), qui etait
 * modifiable depuis la console du navigateur.
 *
 * Ce hook sert le confort d'affichage (rediriger, saluer par son nom).
 * Il ne protege RIEN : la vraie barriere, ce sont les policies RLS. Un
 * utilisateur peut toujours contourner du JavaScript ; il ne contourne
 * pas Postgres.
 */
export function useUtilisateur(roleRequis?: 'admin' | 'vendeuse') {
  const [utilisateur, setUtilisateur] = useState<Utilisateur | null>(null);
  const [chargement, setChargement] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let annule = false;

    (async () => {
      // getUser() fait revalider le jeton par le serveur Supabase.
      // getSession() se contenterait de lire le stockage local sans controle.
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        router.replace('/');
        return;
      }

      const { data: profil } = await supabase
        .from('utilisateurs')
        .select('id, nom, email, role, actif')
        .eq('auth_id', authUser.id)
        .single();

      if (annule) return;

      // Compte supprime cote metier, ou desactive entre-temps : on coupe.
      if (!profil || !profil.actif) {
        await supabase.auth.signOut();
        router.replace('/');
        return;
      }

      if (roleRequis && profil.role !== roleRequis) {
        router.replace(profil.role === 'admin' ? '/admin' : '/vendeuse');
        return;
      }

      setUtilisateur(profil);
      setChargement(false);
    })();

    return () => {
      annule = true;
    };
  }, [roleRequis, router]);

  return { utilisateur, chargement };
}

/** Termine la session Supabase et renvoie au login. */
export async function seDeconnecter() {
  await supabase.auth.signOut();
  window.location.href = '/';
}
