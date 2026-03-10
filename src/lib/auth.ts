import { type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { type UserRole } from '@/types';
import { orgOfficerRepository, memberRepository, memberSpouseRepository } from '@/repositories';
import { prisma } from '@/lib/db';

// ========================================
// NextAuth Configuration
// ========================================

// --- Officer portal access cache (5-minute TTL) ---
let portalAccessCache: { members: Map<string, UserRole>; fetchedAt: number } | null = null;
const PORTAL_ACCESS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getPortalAccessMembers(): Promise<Map<string, UserRole>> {
  const now = Date.now();
  if (portalAccessCache && now - portalAccessCache.fetchedAt < PORTAL_ACCESS_CACHE_TTL) {
    return portalAccessCache.members;
  }

  try {
    const rows = await orgOfficerRepository.findAll({ status: 'Active' });
    const members = new Map<string, UserRole>();
    for (const r of rows) {
      const email = (r.email || '').trim().toLowerCase();
      const portalRole = (r.portalRole || '').trim().toLowerCase();
      if (!email || !portalRole) continue;
      const role: UserRole = portalRole === 'admin' ? 'admin' : 'committee';
      members.set(email, role);
    }
    portalAccessCache = { members, fetchedAt: now };
    return members;
  } catch {
    // If table doesn't exist yet, return empty map
    return new Map();
  }
}

// --- Member email → memberId cache (5-minute TTL) ---
let memberEmailCache: { map: Map<string, string>; fetchedAt: number } | null = null;
const MEMBER_CACHE_TTL = 5 * 60 * 1000;

async function getMemberEmailMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (memberEmailCache && now - memberEmailCache.fetchedAt < MEMBER_CACHE_TTL) {
    return memberEmailCache.map;
  }

  try {
    const [members, spouses] = await Promise.all([
      memberRepository.findAll(),
      memberSpouseRepository.findAll(),
    ]);
    const map = new Map<string, string>();
    for (const r of members) {
      const id = r.id;
      if (!id) continue;
      const email = (r.email || '').trim().toLowerCase();
      const loginEmail = (r.loginEmail || '').trim().toLowerCase();
      if (email) map.set(email, id);
      if (loginEmail) map.set(loginEmail, id);
    }
    // Map spouse emails to their associated member IDs
    for (const s of spouses) {
      const memberId = s.memberId;
      if (!memberId) continue;
      const spouseEmail = (s.email || '').trim().toLowerCase();
      if (spouseEmail) map.set(spouseEmail, memberId);
    }
    memberEmailCache = { map, fetchedAt: now };
    return map;
  } catch {
    return new Map();
  }
}

async function getUserRole(email: string): Promise<{ role: UserRole | null; memberId: string | null }> {
  const lowerEmail = email.toLowerCase();

  // Look up memberId for all users (admin/committee may also be members)
  const memberMap = await getMemberEmailMap();
  const memberId = memberMap.get(lowerEmail) || null;

  // 1. Check OrgOfficer table for portal access (admin/committee roles)
  const portalMembers = await getPortalAccessMembers();
  const portalRole = portalMembers.get(lowerEmail);
  if (portalRole) return { role: portalRole, memberId };

  // 2. Check Members table
  if (memberId) return { role: 'member', memberId };

  // 4. Unknown user — no access
  return { role: null, memberId: null };
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

        // Verify user has a role
        const { role } = await getUserRole(email);
        if (!role) return null;

        // Look up name from member table
        const member = await prisma.member.findFirst({
          where: {
            OR: [
              { email: { equals: email, mode: 'insensitive' } },
              { loginEmail: { equals: email, mode: 'insensitive' } },
            ],
          },
        });
        const name = member
          ? `${member.firstName || ''} ${member.lastName || ''}`.trim()
          : email;

        return { id: email, email, name };
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
