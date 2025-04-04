/*
<ai_context>
  This file is now our only NextAuth config, using Azure AD for SSO.
  We implement user provisioning via getOrCreateUserByAzureSub().
  We remove references to credentials or old signIn pages.
</ai_context>
*/

import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import { getOrCreateUserByAzureSub } from "@/lib/db/queries";

const authOptions: NextAuthConfig = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID || '',
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET || '',
      issuer: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/v2.0`,
      authorization: {
        params: {
          scope: "openid profile email User.Read"
        }
      },
      profilePhotoSize: 48 // Request 48x48 avatar
    })
  ],
  session: {
    strategy: "jwt"
  },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      if (profile) {
        token.name = profile.name || profile.preferred_username;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub && token.email) {
        const userRecord = await getOrCreateUserByAzureSub(token.sub, token.email as string);
        session.user.id = userRecord.id;
        session.user.name = token.name as string;
        
        // Don't set the image URL directly here, as it requires the access token
        // The component will handle fetching the image with the token
      }
      if (token.accessToken) {
        session.accessToken = token.accessToken as string;
      }
      return session;
    }
  }
};

export const { handlers: { GET, POST }, auth, signIn, signOut } = NextAuth(authOptions);