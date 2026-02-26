import { type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { type UserRole, SHEET_TABS } from '@/types';
import { getRows } from './google-sheets';

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
    const rows = await getRows(SHEET_TABS.COMMITTEE_MEMBERS);
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
    // If sheet doesn't exist yet, return empty map
    return new Map();
  }
}

async function getUserRole(email: string): Promise<UserRole | null> {
  const lowerEmail = email.toLowerCase();

  // 1. Check Committee Members sheet
  const committeeMembers = await getCommitteeMembers();
  const sheetRole = committeeMembers.get(lowerEmail);
  if (sheetRole) return sheetRole;

  // 2. Fallback: check ADMIN_EMAILS env var (bootstrap)
  const envAdmins = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (envAdmins.includes(lowerEmail)) return 'admin';

  // 3. Unknown user — no access
  return null;
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
    async jwt({ token, user }) {
      if (user?.email) {
        token.role = await getUserRole(user.email);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as Record<string, unknown>).role = token.role;
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
