import { createBrowserClient } from '@supabase/ssr';

// Client navigateur. createBrowserClient stocke la session dans un COOKIE,
// la ou l'ancien createClient utilisait le localStorage — invisible cote
// serveur, ce qui empechait proxy.ts de voir la session.
//
// Toutes les pages 'use client' importent ce singleton : l'API reste la
// meme, seul le stockage de session change.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string
);
