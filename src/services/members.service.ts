import { generateId } from '@/lib/utils';
import { logActivity } from '@/lib/audit-log';
import { NotFoundError } from './crud.service';
import { createCrudService } from './crud.service';
import {
  memberRepository,
  memberAddressRepository,
  memberSpouseRepository,
  memberChildRepository,
  memberMembershipRepository,
  memberPaymentRepository,
  memberSponsorRepository,
  guestRepository,
} from '@/repositories';

// ========================================
// Member Composite Service
// ========================================

export const memberService = {
  async list(filters?: Record<string, string | null | undefined>): Promise<Record<string, string>[]> {
    return memberRepository.findAll(filters);
  },

  async getById(id: string): Promise<Record<string, string>> {
    const result = await memberRepository.findById(id);
    if (!result) throw new NotFoundError('Member');
    return result;
  },

  async create(data: Record<string, unknown>, audit?: { userEmail: string }): Promise<Record<string, string>> {
    const now = new Date().toISOString();
    const memberId = generateId();

    // Build member record from flat fields
    const memberData: Record<string, unknown> = {
      id: memberId,
      firstName: String(data.firstName || ''),
      middleName: String(data.middleName || ''),
      lastName: String(data.lastName || ''),
      email: String(data.email || ''),
      phone: String(data.phone || ''),
      homePhone: String(data.homePhone || ''),
      cellPhone: String(data.cellPhone || ''),
      qualifyingDegree: String(data.qualifyingDegree || ''),
      nativePlace: String(data.nativePlace || ''),
      college: String(data.college || ''),
      jobTitle: String(data.jobTitle || ''),
      employer: String(data.employer || ''),
      specialInterests: String(data.specialInterests || ''),
      membershipType: String(data.membershipType || 'Yearly'),
      membershipLevel: String(data.membershipLevel || ''),
      registrationDate: String(data.registrationDate || now.split('T')[0]),
      renewalDate: String(data.renewalDate || ''),
      status: String(data.status || 'Active'),
      notes: String(data.notes || ''),
      createdAt: now,
      updatedAt: now,
    };

    const created = await memberRepository.create(memberData);

    // Create address if provided
    const address = data.address as Record<string, unknown> | undefined;
    if (address && Object.values(address).some(v => String(v || '').trim())) {
      await memberAddressRepository.create({
        memberId,
        street: String(address.street || ''),
        street2: String(address.street2 || ''),
        city: String(address.city || ''),
        state: String(address.state || ''),
        zipCode: String(address.zipCode || ''),
        country: String(address.country || ''),
        createdAt: now,
        updatedAt: now,
      });
    }

    // Create spouse if provided
    const spouse = data.spouse as Record<string, unknown> | undefined;
    if (spouse && Object.values(spouse).some(v => String(v || '').trim())) {
      await memberSpouseRepository.create({
        memberId,
        firstName: String(spouse.firstName || ''),
        middleName: String(spouse.middleName || ''),
        lastName: String(spouse.lastName || ''),
        email: String(spouse.email || ''),
        phone: String(spouse.phone || ''),
        nativePlace: String(spouse.nativePlace || ''),
        company: String(spouse.company || ''),
        college: String(spouse.college || ''),
        qualifyingDegree: String(spouse.qualifyingDegree || ''),
        createdAt: now,
        updatedAt: now,
      });
    }

    // Create children
    const children = (data.children || []) as Array<Record<string, unknown>>;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (!String(child.name || '').trim()) continue;
      await memberChildRepository.create({
        memberId,
        name: String(child.name || ''),
        age: String(child.age || ''),
        sex: String(child.sex || ''),
        grade: String(child.grade || ''),
        dateOfBirth: String(child.dateOfBirth || ''),
        sortOrder: i + 1,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Create membership years
    const membershipYears = (data.membershipYears || []) as Array<Record<string, unknown>>;
    for (const my of membershipYears) {
      if (!String(my.year || '').trim()) continue;
      await memberMembershipRepository.create({
        memberId,
        year: String(my.year),
        status: String(my.status || 'Active'),
        createdAt: now,
        updatedAt: now,
      });
    }

    // Create payments
    const payments = (data.payments || []) as Array<Record<string, unknown>>;
    for (const payment of payments) {
      if (!String(payment.product || '').trim() && !String(payment.amount || '').trim()) continue;
      await memberPaymentRepository.create({
        memberId,
        product: String(payment.product || ''),
        amount: String(payment.amount || ''),
        payerName: String(payment.payerName || ''),
        payerEmail: String(payment.payerEmail || ''),
        transactionId: String(payment.transactionId || ''),
        createdAt: now,
        updatedAt: now,
      });
    }

    // Create sponsor if provided
    const sponsor = data.sponsor as Record<string, unknown> | undefined;
    if (sponsor && Object.values(sponsor).some(v => String(v || '').trim())) {
      await memberSponsorRepository.create({
        memberId,
        name: String(sponsor.name || ''),
        email: String(sponsor.email || ''),
        phone: String(sponsor.phone || ''),
        createdAt: now,
        updatedAt: now,
      });
    }

    // Re-fetch with all relations for the return value
    const result = await memberRepository.findById(memberId);

    if (audit) {
      const label = `${data.firstName} ${data.lastName}`.trim() || String(data.email || memberId);
      logActivity({
        userEmail: audit.userEmail,
        action: 'create',
        entityType: 'Member',
        entityId: memberId,
        entityLabel: label,
        newRecord: result || created,
      });
    }

    return result || created;
  },

  async update(id: string, data: Record<string, unknown>, audit?: { userEmail: string }): Promise<Record<string, string>> {
    const existing = await memberRepository.findById(id);
    if (!existing) throw new NotFoundError('Member');

    const now = new Date().toISOString();

    // Update member flat fields
    const memberData: Record<string, unknown> = {};
    const memberFields = [
      'firstName', 'middleName', 'lastName', 'email', 'phone',
      'homePhone', 'cellPhone', 'qualifyingDegree', 'nativePlace',
      'college', 'jobTitle', 'employer', 'specialInterests',
      'membershipType', 'membershipLevel', 'registrationDate', 'renewalDate', 'status', 'notes',
    ];
    for (const field of memberFields) {
      if (data[field] !== undefined) {
        memberData[field] = data[field];
      }
    }
    memberData.updatedAt = now;
    await memberRepository.update(id, memberData);

    // Upsert address
    const address = data.address as Record<string, unknown> | undefined;
    if (address !== undefined) {
      await memberAddressRepository.deleteByMemberId(id);
      if (Object.values(address).some(v => String(v || '').trim())) {
        await memberAddressRepository.create({
          memberId: id,
          street: String(address.street || ''),
          street2: String(address.street2 || ''),
          city: String(address.city || ''),
          state: String(address.state || ''),
          zipCode: String(address.zipCode || ''),
          country: String(address.country || ''),
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Upsert spouse
    const spouse = data.spouse as Record<string, unknown> | undefined;
    if (spouse !== undefined) {
      await memberSpouseRepository.deleteByMemberId(id);
      if (Object.values(spouse).some(v => String(v || '').trim())) {
        await memberSpouseRepository.create({
          memberId: id,
          firstName: String(spouse.firstName || ''),
          middleName: String(spouse.middleName || ''),
          lastName: String(spouse.lastName || ''),
          email: String(spouse.email || ''),
          phone: String(spouse.phone || ''),
          nativePlace: String(spouse.nativePlace || ''),
          company: String(spouse.company || ''),
          college: String(spouse.college || ''),
          qualifyingDegree: String(spouse.qualifyingDegree || ''),
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Replace children
    const children = data.children as Array<Record<string, unknown>> | undefined;
    if (children !== undefined) {
      await memberChildRepository.deleteByMemberId(id);
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (!String(child.name || '').trim()) continue;
        await memberChildRepository.create({
          memberId: id,
          name: String(child.name || ''),
          age: String(child.age || ''),
          sex: String(child.sex || ''),
          grade: String(child.grade || ''),
          dateOfBirth: String(child.dateOfBirth || ''),
          sortOrder: i + 1,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Replace membership years
    const membershipYears = data.membershipYears as Array<Record<string, unknown>> | undefined;
    if (membershipYears !== undefined) {
      await memberMembershipRepository.deleteByMemberId(id);
      for (const my of membershipYears) {
        if (!String(my.year || '').trim()) continue;
        await memberMembershipRepository.create({
          memberId: id,
          year: String(my.year),
          status: String(my.status || 'Active'),
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Replace payments
    const payments = data.payments as Array<Record<string, unknown>> | undefined;
    if (payments !== undefined) {
      await memberPaymentRepository.deleteByMemberId(id);
      for (const payment of payments) {
        if (!String(payment.product || '').trim() && !String(payment.amount || '').trim()) continue;
        await memberPaymentRepository.create({
          memberId: id,
          product: String(payment.product || ''),
          amount: String(payment.amount || ''),
          payerName: String(payment.payerName || ''),
          payerEmail: String(payment.payerEmail || ''),
          transactionId: String(payment.transactionId || ''),
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Replace sponsor
    const sponsor = data.sponsor as Record<string, unknown> | undefined;
    if (sponsor !== undefined) {
      await memberSponsorRepository.deleteByMemberId(id);
      if (Object.values(sponsor).some(v => String(v || '').trim())) {
        await memberSponsorRepository.create({
          memberId: id,
          name: String(sponsor.name || ''),
          email: String(sponsor.email || ''),
          phone: String(sponsor.phone || ''),
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const result = await memberRepository.findById(id);
    if (!result) throw new NotFoundError('Member');

    if (audit) {
      logActivity({
        userEmail: audit.userEmail,
        action: 'update',
        entityType: 'Member',
        entityId: id,
        entityLabel: result.name || result.email || id,
        oldRecord: existing,
        newRecord: result,
      });
    }

    return result;
  },

  async remove(id: string, audit?: { userEmail: string }): Promise<void> {
    const existing = await memberRepository.findById(id);
    if (!existing) throw new NotFoundError('Member');

    // Cascade delete handles related tables
    await memberRepository.delete(id);

    if (audit) {
      logActivity({
        userEmail: audit.userEmail,
        action: 'delete',
        entityType: 'Member',
        entityId: id,
        entityLabel: existing.name || existing.email || id,
        oldRecord: existing,
      });
    }
  },
};

// ========================================
// Guest Service (unchanged)
// ========================================

export const guestService = createCrudService({
  repository: guestRepository,
  entityName: 'Guest',
  getEntityLabel: (r) => String(r.name || r.email || r.id),
  buildCreateRecord: (data) => ({
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
 * Search members with text filter on firstName, lastName, email, phone, spouse email.
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
        r.firstName?.toLowerCase().includes(q) ||
        r.lastName?.toLowerCase().includes(q) ||
        r.name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.phone?.toLowerCase().includes(q) ||
        r.spouseEmail?.toLowerCase().includes(q) ||
        r.spousePhone?.toLowerCase().includes(q),
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
