import { compare } from 'bcrypt-ts';
import NextAuth, { type User, type Session } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { getUser } from '@/lib/db/queries';

import { authConfig } from './auth.config';

interface ExtendedSession extends Session {
  user: User;
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {},
      async authorize({ email, password }: any) {
        console.log('Authorizing login for email:', email);
        const user = await getUser(email);
        console.log('User found:', user ? 'yes' : 'no');
        
        if (!user) return null;
        
        try {
          // biome-ignore lint: Forbidden non-null assertion.
          const passwordsMatch = await compare(password, user.password!);
          console.log('Password match:', passwordsMatch ? 'yes' : 'no');
          if (!passwordsMatch) return null;
          return user as any;
        } catch (error) {
          console.error('Password comparison error:', error);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }

      return token;
    },
    async session({
      session,
      token,
    }: {
      session: ExtendedSession;
      token: any;
    }) {
      if (session.user) {
        session.user.id = token.id as string;
      }

      return session;
    },
  },
});
