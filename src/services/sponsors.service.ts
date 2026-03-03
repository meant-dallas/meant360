import { createCrudService } from './crud.service';
import { sponsorRepository } from '@/repositories';

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
    year: String(data.year || String(new Date().getFullYear())),
    paymentMethod: String(data.paymentMethod || ''),
    paymentDate: String(data.paymentDate || now.split('T')[0]),
    status: String(data.status || 'Pending'),
    notes: String(data.notes || ''),
  }),
});

export interface SponsorWithActive extends Record<string, string | boolean> {
  active: boolean;
}

/** Add a computed `active` flag: paid for the current year. */
export function withActive(rows: Record<string, string>[]): SponsorWithActive[] {
  const currentYear = String(new Date().getFullYear());
  return rows.map((r) => ({
    ...r,
    active: r.status === 'Paid' && r.year === currentYear,
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
  let result = withActive(rows);

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
