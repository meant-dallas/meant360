import { prisma } from '@/lib/db';
import { toStringRecord } from './base.repository';

const MEMBER_INCLUDE = {
  addresses: true,
  spouses: true,
  children: { orderBy: { sortOrder: 'asc' as const } },
  memberships: { orderBy: { year: 'desc' as const } },
  payments: true,
  sponsors: true,
} as const;

/**
 * Convert a Prisma member with relations to a flat Record<string, string>.
 * Computes backward-compatible fields: name, address, spouseName, spouseEmail,
 * spousePhone, children (JSON), membershipYears (CSV).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRecord(row: any): Record<string, string> {
  const addr = row.addresses?.[0];
  const spouse = row.spouses?.[0];
  const childrenArr = (row.children || []).map((c: Record<string, unknown>) => ({
    name: c.name || '',
    age: c.age || '',
    sex: c.sex || '',
    grade: c.grade || '',
    dateOfBirth: c.dateOfBirth || '',
  }));
  const membershipYears = (row.memberships || [])
    .map((m: Record<string, unknown>) => m.year)
    .filter(Boolean)
    .sort()
    .join(',');

  // Build a flat name from parts
  const nameParts = [row.firstName, row.middleName, row.lastName].filter(Boolean);
  const name = nameParts.join(' ');

  // Build flat address string
  const addressParts = addr
    ? [addr.street, addr.street2, addr.city, addr.state, addr.zipCode, addr.country].filter(Boolean)
    : [];
  const address = addressParts.join(', ');

  // Build flat spouse name
  const spouseNameParts = spouse ? [spouse.firstName, spouse.middleName, spouse.lastName].filter(Boolean) : [];
  const spouseName = spouseNameParts.join(' ');

  // Base record from member fields
  const base = toStringRecord({
    id: row.id,
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    homePhone: row.homePhone,
    cellPhone: row.cellPhone,
    qualifyingDegree: row.qualifyingDegree,
    nativePlace: row.nativePlace,
    college: row.college,
    jobTitle: row.jobTitle,
    employer: row.employer,
    specialInterests: row.specialInterests,
    submissionId: row.submissionId,
    membershipType: row.membershipType,
    membershipLevel: row.membershipLevel,
    registrationDate: row.registrationDate,
    renewalDate: row.renewalDate,
    status: row.status,
    notes: row.notes,
    loginEmail: row.loginEmail,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

  // Backward-compatible computed fields
  base.name = name;
  base.address = address;
  base.spouseName = spouseName;
  base.spouseFirstName = spouse?.firstName || '';
  base.spouseMiddleName = spouse?.middleName || '';
  base.spouseLastName = spouse?.lastName || '';
  base.spouseEmail = spouse?.email || '';
  base.spousePhone = spouse?.phone || '';
  base.spouseNativePlace = spouse?.nativePlace || '';
  base.spouseCompany = spouse?.company || '';
  base.spouseCollege = spouse?.college || '';
  base.spouseQualifyingDegree = spouse?.qualifyingDegree || '';
  base.children = JSON.stringify(childrenArr);
  base.membershipYears = membershipYears;

  // Serialize payments
  const paymentsArr = (row.payments || []).map((p: Record<string, unknown>) => ({
    product: p.product || '',
    amount: p.amount || '',
    payerName: p.payerName || '',
    payerEmail: p.payerEmail || '',
    transactionId: p.transactionId || '',
  }));
  base.payments = JSON.stringify(paymentsArr);

  // Serialize sponsors (member sponsors, not event sponsors)
  const sponsorsArr = (row.sponsors || []).map((s: Record<string, unknown>) => ({
    name: s.name || '',
    email: s.email || '',
    phone: s.phone || '',
  }));
  base.sponsors = JSON.stringify(sponsorsArr);

  return base;
}

function fromRecord(data: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    // Skip computed/relation fields that don't exist on the Member model
    if (['name', 'address', 'spouseName', 'spouseFirstName', 'spouseMiddleName', 'spouseLastName', 'spouseEmail', 'spousePhone', 'spouseNativePlace', 'spouseCompany', 'spouseCollege', 'spouseQualifyingDegree', 'children', 'membershipYears', 'payments', 'sponsors'].includes(key)) {
      continue;
    }
    result[key] = value;
  }
  return result;
}

export const memberRepository = {
  async findAll(filters?: Record<string, string | null | undefined>): Promise<Record<string, string>[]> {
    const where: Record<string, unknown> = {};
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value != null) where[key] = value;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await prisma.member.findMany({
      where: where as any,
      include: MEMBER_INCLUDE,
    });
    return rows.map(toRecord);
  },

  async findById(id: string): Promise<Record<string, string> | null> {
    const row = await prisma.member.findUnique({
      where: { id },
      include: MEMBER_INCLUDE,
    });
    return row ? toRecord(row) : null;
  },

  async create(data: Record<string, unknown>): Promise<Record<string, string>> {
    const input = fromRecord(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.member.create({ data: input as any });
    // Fetch separately with relations (avoid implicit transaction from create+include)
    const row = await prisma.member.findUnique({
      where: { id: String(input.id) },
      include: MEMBER_INCLUDE,
    });
    return toRecord(row);
  },

  async update(id: string, data: Record<string, unknown>): Promise<Record<string, string>> {
    const input = fromRecord(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await prisma.member.update({ where: { id }, data: input as any });
    // Fetch separately with relations (avoid implicit transaction from update+include)
    const row = await prisma.member.findUnique({
      where: { id },
      include: MEMBER_INCLUDE,
    });
    return toRecord(row);
  },

  async delete(id: string): Promise<void> {
    await prisma.member.delete({ where: { id } });
  },
};
