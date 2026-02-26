import { SHEET_TABS } from '@/types';
import { createCrudService } from './crud.service';

// ========================================
// Sponsor & Sponsorship Services
// ========================================

export const sponsorService = createCrudService({
  sheetName: SHEET_TABS.SPONSORS,
  entityName: 'Sponsor',
  buildCreateRecord: (data) => ({
    name: String(data.name || ''),
    email: String(data.email || ''),
    phone: String(data.phone || ''),
    notes: String(data.notes || ''),
  }),
});

export const sponsorshipService = createCrudService({
  sheetName: SHEET_TABS.SPONSORSHIP,
  entityName: 'Sponsorship',
  buildCreateRecord: (data, now) => ({
    sponsorName: String(data.sponsorName || ''),
    year: String(data.year || String(new Date().getFullYear())),
    sponsorEmail: String(data.sponsorEmail || ''),
    sponsorPhone: String(data.sponsorPhone || ''),
    type: String(data.type || 'Annual'),
    amount: Number(data.amount || 0),
    eventName: String(data.eventName || ''),
    paymentMethod: String(data.paymentMethod || ''),
    paymentDate: String(data.paymentDate || now.split('T')[0]),
    status: String(data.status || 'Pending'),
    notes: String(data.notes || ''),
  }),
});

/**
 * Search sponsors by name, email, or phone.
 */
export async function searchSponsors(query: string): Promise<Record<string, string>[]> {
  let rows = await sponsorService.list();
  if (query) {
    const q = query.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.phone?.toLowerCase().includes(q),
    );
  }
  return rows;
}
