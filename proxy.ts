import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Depuis Next 16, middleware.ts s'appelle proxy.ts.
//
// Deux roles ici :
//  1. rafraichir le jeton Supabase a chaque requete, sans quoi les sessions
//     expirent et les vendeuses sont deconnectees en pleine vente ;
//  2. rediriger, de facon optimiste, pour eviter d'afficher une page vide.
//
// Ce fichier ne SECURISE rien. La doc Next est explicite : « it should not be
// your only line of defense (...) security checks should be performed as close
// as possible to your data source ». La vraie barriere, ce sont les policies
// RLS — phase 6.

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY as string,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() fait valider le jeton par le serveur Supabase et declenche le
  // rafraichissement si besoin. getSession() se contenterait de lire le cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // Le role est depose dans app_metadata a la creation du compte : il voyage
  // dans le jeton signe, donc pas de requete base ici.
  const role = user?.app_metadata?.role as string | undefined;

  // Toute redirection doit reporter les cookies rafraichis, sinon le jeton
  // renouvele est perdu et l'utilisateur reboucle sur le login.
  const rediriger = (vers: string) => {
    const r = NextResponse.redirect(new URL(vers, request.url));
    response.cookies.getAll().forEach((c) => r.cookies.set(c));
    return r;
  };

  if (pathname.startsWith('/admin') && role !== 'admin') return rediriger('/');
  if (pathname.startsWith('/vendeuse') && !user) return rediriger('/');
  if (pathname === '/' && user) return rediriger(role === 'admin' ? '/admin' : '/vendeuse');

  return response;
}

export const config = {
  matcher: ['/', '/admin/:path*', '/vendeuse/:path*'],
};
