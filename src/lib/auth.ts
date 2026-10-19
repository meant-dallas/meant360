import { type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import { cookies } from 'next/headers';
import * as Sentry from '@sentry/nextjs';
import { type UserRole } from '@/types';
import { prisma } from '@/lib/db';
import { resolveIdentity } from '@/lib/identity';
import { sendItemsOtpCode } from '@/lib/items-otp';

// ========================================
// NextAuth Configuration
// ========================================

async function getUserRole(email: string): Promise<{ role: UserRole | null; memberId: string | null }> {
  const identity = await resolveIdentity(email);
  if (identity.kind === 'guest') return { role: null, memberId: null };
  return { role: identity.kind, memberId: identity.memberId };
}

// The event ID and page recovered here is a routing hint ONLY — which
// event's OTP-send to trigger — never an authorization input. It comes
// from NextAuth's own `next-auth.callback-url` cookie (the `__Secure-`
// prefix is used instead whenever `NEXTAUTH_URL` is https), which it
// already sets itself right before redirecting to Google in order to know
// where to send the user back afterward; this just reads that same value
// a request earlier than NextAuth otherwise would. Not signed, not
// server-issued — it is never trusted as proof of anything about identity
// or authorization (see docs/unified-registration-checkin-flow.html's
// security boundary section).
function recoverItemsEventFromCallbackCookie(): { eventId: string; mode: 'register' | 'checkin' } | null {
  try {
    const store = cookies();
    const raw = store.get('__Secure-next-auth.callback-url')?.value || store.get('next-auth.callback-url')?.value;
    if (!raw) return null;
    const decoded = decodeURIComponent(raw);
    const match = decoded.match(/\/events\/([^/?]+)\/(register|checkin)/);
    if (!match) return null;
    return { eventId: match[1], mode: match[2] as 'register' | 'checkin' };
  } catch (error) {
    // cookies() throwing here (outside a request context, or an
    // unsupported NextAuth/Next.js combination) means the Google-fallback
    // simply can't recover an eventId — fall through to the plain
    // AccessDenied redirect below rather than crash the sign-in attempt.
    Sentry.captureException(error, { extra: { context: 'recoverItemsEventFromCallbackCookie' } });
    return null;
  }
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
      if (role) return true;

      // Unknown Google account — may be a guest using the chooser's Google
      // button on an items-model event's register/check-in page rather than
      // a portal member. Recover which event (and page) they came from and,
      // if that event's own guest policy allows it, auto-send that event's
      // OTP for this same email and land them on the code-entry step
      // instead of a generic "Access Denied" (see
      // docs/unified-registration-checkin-flow.html).
      const recovered = recoverItemsEventFromCallbackCookie();
      if (!recovered) return '/auth/signin?error=AccessDenied';

      try {
        const result = await sendItemsOtpCode(user.email, recovered.eventId, { bypassResendCooldown: true });
        if (!result.sent) return '/auth/signin?error=AccessDenied';
      } catch (error) {
        Sentry.captureException(error, { extra: { context: 'Google-fallback OTP auto-send', eventId: recovered.eventId } });
        return '/auth/signin?error=AccessDenied';
      }

      return `/events/${recovered.eventId}/${recovered.mode}?verifyEmail=${encodeURIComponent(user.email)}`;
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
