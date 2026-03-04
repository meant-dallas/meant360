import { type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { type UserRole } from '@/types';
import { committeeRepository, memberRepository, memberSpouseRepository } from '@/repositories';

// ========================================
// NextAuth Configuration
// ========================================

// --- Committee members cache (5-minute TTL) ---
let committeeMemberCache: { members: Map<string, UserRole>; fetchedAt: number } | null = null;
const COMMITTEE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCommitteeMembers(): Promise<Map<string, UserRole>> {
  const now = Date.now();
  if (committeeMemberCache && now - committeeMemberCache.fetchedAt < COMMITTEE_CACHE_TTL) {
    return committeeMemberCache.members;
  }

  try {
    const rows = await committeeRepository.findAll();
    const members = new Map<string, UserRole>();
    for (const r of rows) {
      const email = (r['Email Address'] || r.email || '').trim().toLowerCase();
      if (!email) continue;
      const role: UserRole = (r['Role'] || r.role || '').trim().toLowerCase() === 'admin' ? 'admin' : 'committee';
      members.set(email, role);
    }
    committeeMemberCache = { members, fetchedAt: now };
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

  // 1. Check Committee Members table (admin/committee roles)
  const committeeMembers = await getCommitteeMembers();
  const committeeRole = committeeMembers.get(lowerEmail);
  if (committeeRole) return { role: committeeRole, memberId };

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
