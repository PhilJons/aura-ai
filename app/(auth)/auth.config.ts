import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  providers: [], // providers are configured in auth.ts
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAuthPage = nextUrl.pathname.startsWith('/auth/');
      const isApiAuthRoute = nextUrl.pathname.startsWith('/api/auth/');
      
      // Allow access to auth-related routes
      if (isAuthPage || isApiAuthRoute) {
        return true;
      }

      // Require authentication for all other routes
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
