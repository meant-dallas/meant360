import { createCrudService } from './crud.service';
import { sponsorRepository } from '@/repositories';
import type { PublicSponsor } from '@/types';

// ========================================
// Sponsor Service (merged Sponsors + Sponsorships)
// ========================================

export const sponsorService = createCrudService({
  repository: sponsorRepository,
  entityName: 'Sponsor',
  getEntityLabel: (r) => String(r.name || r.id),
  buildCreateRecord: (data, now) => ({
    name: String(data.name || ''),
    email: String(data.email || ''),
    phone: String(data.phone || ''),
    type: String(data.type || 'Annual'),
    amount: Number(data.amount || 0),
    eventName: String(data.eventName || ''),
    eventId: String(data.eventId || ''),
    year: String(data.year || String(new Date().getFullYear())),
    paymentMethod: String(data.paymentMethod || ''),
    paymentDate: String(data.paymentDate || now.split('T')[0]),
    status: String(data.status || 'Pending'),
    notes: String(data.notes || ''),
    tier: String(data.tier || ''),
    website: String(data.website || ''),
    address: String(data.address || ''),
    contactName: String(data.contactName || ''),
    logoUrl: String(data.logoUrl || ''),
  }),
});

export interface SponsorWithActive extends Record<string, string | boolean> {
  active: boolean;
}

/** Add a computed `active` flag: paid for the given (or current) year. */
export function withActive(rows: Record<string, string>[], activeYear?: string): SponsorWithActive[] {
  const yr = activeYear || String(new Date().getFullYear());
  return rows.map((r) => ({
    ...r,
    active: r.status === 'Paid' && r.year === yr,
  }));
}

/** Search sponsors with optional filters. */
export async function searchSponsors(opts: {
  search?: string;
  active?: string;
  year?: string;
  status?: string;
  type?: string;
}): Promise<SponsorWithActive[]> {
  const rows = await sponsorService.list();
  let result = withActive(rows, opts.year);

  if (opts.search) {
    const q = opts.search.toLowerCase();
    result = result.filter(
      (r) =>
        String(r.name || '').toLowerCase().includes(q) ||
        String(r.email || '').toLowerCase().includes(q) ||
        String(r.phone || '').toLowerCase().includes(q),
    );
  }
  if (opts.year) result = result.filter((r) => r.year === opts.year);
  if (opts.status) result = result.filter((r) => r.status === opts.status);
  if (opts.type) result = result.filter((r) => r.type === opts.type);
  if (opts.active === 'true') result = result.filter((r) => r.active);
  if (opts.active === 'false') result = result.filter((r) => !r.active);

  return result;
}

// ========================================
// Public Sponsor Display (event home page + emails)
// ========================================

const TIER_ORDER: Record<string, number> = { Platinum: 0, Gold: 1, Silver: 2, Bronze: 3 };

/** Untiered sponsors sort last within their group (event-specific or general). */
function tierRank(tier: string): number {
  return TIER_ORDER[tier] ?? 4;
}

/** Tier first (for visual grouping/prominence), then by sponsored amount — highest first. */
function sortByTier(rows: Record<string, string>[]): Record<string, string>[] {
  return [...rows].sort(
    (a, b) =>
      tierRank(a.tier || '') - tierRank(b.tier || '') ||
      parseFloat(b.amount || '0') - parseFloat(a.amount || '0'),
  );
}

function toPublicSponsor(r: Record<string, string>): PublicSponsor {
  return {
    id: r.id,
    name: r.name,
    tier: (r.tier || '') as PublicSponsor['tier'],
    logoUrl: r.logoUrl || '',
    website: r.website || '',
  };
}

/**
 * Sponsors safe to render publicly (event home page, registration/check-in
 * emails, general communication emails): all active sponsors, tier-ordered,
 * regardless of payment status ('Paid' or 'Pending') — a sponsor is
 * announced once committed, not only once their payment clears.
 * Event-specific sponsors are scoped by eventId with no year filter (the
 * event itself pins the date); general/Annual sponsors are scoped to the
 * given year, matching the existing "active sponsor" definition.
 */
export async function getPublicSponsors(opts: {
  eventId?: string;
  year?: string;
} = {}): Promise<{ eventSponsors: PublicSponsor[]; generalSponsors: PublicSponsor[] }> {
  const yr = opts.year || String(new Date().getFullYear());
  const rows = await sponsorService.list();

  const eventSponsors = opts.eventId
    ? sortByTier(
        rows.filter((r) => r.type === 'Event' && r.eventId === opts.eventId),
      ).map(toPublicSponsor)
    : [];

  const generalSponsors = sortByTier(
    rows.filter((r) => r.type === 'Annual' && r.year === yr),
  ).map(toPublicSponsor);

  return { eventSponsors, generalSponsors };
}
