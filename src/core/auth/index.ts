import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { requireConfig } from "@/core/config";
import { getDb } from "@/core/db";
import { ensureTenantUser } from "@/core/tenancy/provision";

declare module "next-auth" {
  interface Session {
    userId: string;
    tenantId: string;
  }
}

// Config is built per request so importing this file never needs env at build time.
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  secret: requireConfig("NEXTAUTH_SECRET"),
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Google({
      clientId: requireConfig("GOOGLE_CLIENT_ID"),
      clientSecret: requireConfig("GOOGLE_CLIENT_SECRET"),
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      // Only verified Google emails may create or enter a tenant.
      return Boolean(profile?.email && profile.email_verified);
    },
    async jwt({ token, profile }) {
      // `profile` is only present on the sign-in request; map to our tenant once.
      if (profile?.email) {
        const { userId, tenantId } = await ensureTenantUser(getDb(), {
          email: profile.email,
          name: profile.name,
          image: typeof profile.picture === "string" ? profile.picture : null,
        });
        token.userId = userId;
        token.tenantId = tenantId;
      }
      return token;
    },
    session({ session, token }) {
      // tenantId always comes from the signed token, never from the client.
      session.userId = typeof token.userId === "string" ? token.userId : "";
      session.tenantId = typeof token.tenantId === "string" ? token.tenantId : "";
      return session;
    },
  },
}));
