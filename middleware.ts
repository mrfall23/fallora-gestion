import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const role = request.cookies.get('fallora_role')?.value;
  const { pathname } = request.nextUrl;

  const estConnecte = Boolean(role);
  const estAdmin = role === 'admin';

  if (pathname.startsWith('/admin') && !estAdmin) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (pathname.startsWith('/vendeuse') && !estConnecte) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (pathname === '/' && estConnecte) {
    if (estAdmin) return NextResponse.redirect(new URL('/admin', request.url));
    return NextResponse.redirect(new URL('/vendeuse', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/admin/:path*', '/vendeuse/:path*'],
};
