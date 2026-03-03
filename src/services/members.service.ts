import { createCrudService } from './crud.service';
import { memberRepository, guestRepository } from '@/repositories';

// ========================================
// Member & Guest Services
// ========================================

export const memberService = createCrudService({
  repository: memberRepository,
  entityName: 'Member',
  getEntityLabel: (r) => String(r.name || r.email || r.id),
  buildCreateRecord: (data, now) => ({
    name: String(data.name || ''),
    address: String(data.address || ''),
    email: String(data.email || ''),
    phone: String(data.phone || ''),
    spouseName: String(data.spouseName || ''),
    spouseEmail: String(data.spouseEmail || ''),
    spousePhone: String(data.spousePhone || ''),
    children: String(data.children || '[]'),
    membershipType: String(data.membershipType || 'Yearly'),
    membershipYears: String(data.membershipYears || ''),
    registrationDate: String(data.registrationDate || now.split('T')[0]),
    renewalDate: String(data.renewalDate || ''),
    status: String(data.status || 'Active'),
    notes: String(data.notes || ''),
  }),
});

export const guestService = createCrudService({
  repository: guestRepository,
  entityName: 'Guest',
  getEntityLabel: (r) => String(r.name || r.email || r.id),
  buildCreateRecord: (data, now) => ({
    name: String(data.name || ''),
    email: String(data.email || ''),
    phone: String(data.phone || ''),
    city: String(data.city || ''),
    referredBy: String(data.referredBy || ''),
    eventsAttended: Number(data.eventsAttended || 0),
    lastEventDate: String(data.lastEventDate || ''),
  }),
});

/**
 * Search members with text filter on name, email, phone.
 */
export async function searchMembers(
  query: string,
  filters?: { membershipType?: string | null; status?: string | null },
): Promise<Record<string, string>[]> {
  let rows = await memberService.list(filters || {});
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

/**
 * Search guests with text filter on name, email.
 */
export async function searchGuests(query: string): Promise<Record<string, string>[]> {
  let rows = await guestService.list();
  if (query) {
    const q = query.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q),
    );
  }
  return rows;
}
