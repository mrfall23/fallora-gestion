import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Client serveur (Server Components, Route Handlers).
// cookies() est asynchrone depuis Next 15 — d'ou le await.
export async function creerClientServeur() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Appele depuis un Server Component : l'ecriture de cookie y est
            // interdite. Sans effet tant que proxy.ts rafraichit la session.
          }
        },
      },
    }
  );
}
