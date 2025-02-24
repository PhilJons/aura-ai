import { auth } from '@/app/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth?.user;

  // Always allow these paths
  if (
    nextUrl.pathname.startsWith('/_next') ||
    nextUrl.pathname.startsWith('/api/auth/') ||
    nextUrl.pathname.startsWith('/auth/')
  ) {
    return NextResponse.next();
  }

  // Protect all other routes
  if (!isLoggedIn) {
    const signInUrl = new URL('/api/auth/signin', nextUrl);
    signInUrl.searchParams.set('callbackUrl', nextUrl.pathname);
    return Response.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
