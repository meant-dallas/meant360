import { type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { type UserRole } from '@/types';
import { prisma } from '@/lib/db';
import { resolveIdentity } from '@/lib/identity';

// ========================================
// NextAuth Configuration
// ========================================

async function getUserRole(email: string): Promise<{ role: UserRole | null; memberId: string | null }> {
  const identity = await resolveIdentity(email);
  if (identity.kind === 'guest') return { role: null, memberId: null };
  return { role: identity.kind, memberId: identity.memberId };
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile',
          prompt: 'consent',
          access_type: 'offline',
        },
      },
    }),
    CredentialsProvider({
      id: 'email-otp',
      name: 'Email',
      credentials: {
        email: { label: 'Email', type: 'email' },
        token: { label: 'Code', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.token) return null;

        const email = credentials.email.trim().toLowerCase();
        const loginToken = await prisma.loginToken.findFirst({
          where: {
            email,
            token: credentials.token,
            used: false,
            expiresAt: { gt: new Date() },
          },
        });

        if (!loginToken) return null;

        // Mark token as used
        await prisma.loginToken.update({
          where: { id: loginToken.id },
          data: { used: true },
        });

        const identity = await resolveIdentity(email);
        if (identity.kind === 'guest') return null;

        return { id: email, email, name: identity.memberName || email };
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user?.email) return false;
      const { role } = await getUserRole(user.email);
      if (!role) return '/auth/signin?error=AccessDenied';
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const { role, memberId } = await getUserRole(user.email);
        token.role = role;
        token.memberId = memberId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as Record<string, unknown>).role = token.role;
        (session.user as Record<string, unknown>).memberId = token.memberId;
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/auth/signin',
  },
  secret: process.env.NEXTAUTH_SECRET,
};

export function isAdmin(role: UserRole | null | undefined): boolean {
  return role === 'admin';
}

export function isCommittee(role: UserRole | null | undefined): boolean {
  return role === 'committee';
}

export function isAuthorized(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'committee';
}

export function isMember(role: UserRole | null | undefined): boolean {
  return role === 'member';
}

export function hasAnyRole(role: UserRole | null | undefined): boolean {
  return role === 'admin' || role === 'committee' || role === 'member';
}
