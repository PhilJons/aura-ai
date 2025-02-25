import { auth } from '@/app/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth?.user;
  const userId = req.auth?.user?.id;

  // Always allow these paths
  const publicPaths = [
    '/_next',
    '/api/auth/',
    '/auth/',
    '/images/',
    '/favicon.ico',
    '/login',
  ];

  // Check if the path is public
  const isPublicPath = publicPaths.some(path => nextUrl.pathname.startsWith(path));
  
  if (isPublicPath) {
    return NextResponse.next();
  }

  // Protect all other routes
  if (!isLoggedIn) {
    console.log(`[Middleware] Redirecting unauthenticated user to login from ${nextUrl.pathname}`);
    const loginUrl = new URL('/login', nextUrl);
    return Response.redirect(loginUrl);
  }

  // Add debugging logs
  if (process.env.NODE_ENV === 'development') {
    console.log(`[Middleware] Authenticated user ${userId} accessing ${nextUrl.pathname}`);
  }

  // Add the user ID to request headers for server components
  const requestHeaders = new Headers(req.headers);
  if (userId) {
    requestHeaders.set('x-user-id', userId);
  }

  return NextResponse.next({
    headers: requestHeaders,
  });
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
