import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireMember, validateBody } from '@/lib/api-helpers';
import {
  memberRepository,
  memberAddressRepository,
  memberSpouseRepository,
  memberChildRepository,
  memberMembershipRepository,
  memberPaymentRepository,
  memberSponsorRepository,
} from '@/repositories';
import { memberProfileUpdateSchema } from '@/types/schemas';
import { sendEmail } from '@/services/email.service';

export const dynamic = 'force-dynamic';
export async function GET() {
  const auth = await requireMember();
  if (auth instanceof NextResponse) return auth;

  try {
    const record = await memberRepository.findById(auth.memberId);
    if (!record) {
      return errorResponse('Member record not found', 404);
    }

    // Fetch related data
    const [addresses, spouses, children, memberships, payments, sponsors] = await Promise.all([
      memberAddressRepository.findByMemberId(auth.memberId),
      memberSpouseRepository.findByMemberId(auth.memberId),
      memberChildRepository.findByMemberId(auth.memberId),
      memberMembershipRepository.findByMemberId(auth.memberId),
      memberPaymentRepository.findByMemberId(auth.memberId),
      memberSponsorRepository.findByMemberId(auth.memberId),
    ]);

    const address = addresses[0] || null;
    const spouse = spouses[0] || null;
    const sponsor = sponsors[0] || null;

    return jsonResponse({
      id: record.id,
      firstName: record.firstName,
      middleName: record.middleName,
      lastName: record.lastName,
      name: record.name,
      email: record.email,
      phone: record.phone,
      homePhone: record.homePhone,
      cellPhone: record.cellPhone,
      qualifyingDegree: record.qualifyingDegree,
      nativePlace: record.nativePlace,
      college: record.college,
      jobTitle: record.jobTitle,
      employer: record.employer,
      specialInterests: record.specialInterests,
      address: address ? {
        street: address.street,
        street2: address.street2,
        city: address.city,
        state: address.state,
        zipCode: address.zipCode,
        country: address.country,
      } : null,
      spouse: spouse ? {
        firstName: spouse.firstName,
        middleName: spouse.middleName,
        lastName: spouse.lastName,
        email: spouse.email,
        phone: spouse.phone,
        nativePlace: spouse.nativePlace,
        company: spouse.company,
        college: spouse.college,
        qualifyingDegree: spouse.qualifyingDegree,
      } : null,
      children: children.map(c => ({
        name: c.name,
        age: c.age,
        sex: c.sex,
        grade: c.grade,
        dateOfBirth: c.dateOfBirth,
      })),
      membershipType: record.membershipType,
      membershipLevel: record.membershipLevel,
      membershipYears: memberships.map(m => ({ year: m.year, status: m.status })),
      registrationDate: record.registrationDate,
      renewalDate: record.renewalDate,
      status: record.status,
      payments: payments.map(p => ({
        product: p.product,
        amount: p.amount,
        payerName: p.payerName,
        payerEmail: p.payerEmail,
        transactionId: p.transactionId,
      })),
      sponsor: sponsor ? {
        name: sponsor.name,
        email: sponsor.email,
        phone: sponsor.phone,
      } : null,
    });
  } catch (error) {
    console.error('Portal profile GET error:', error);
    return errorResponse('Failed to load profile', 500, error);
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireMember();
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const parsed = await validateBody(memberProfileUpdateSchema, body);
    if (parsed instanceof NextResponse) return parsed;

    const record = await memberRepository.findById(auth.memberId);
    if (!record) {
      return errorResponse('Member record not found', 404);
    }

    const now = new Date().toISOString();

    // Update flat member fields if provided
    const memberUpdates: Record<string, unknown> = {};
    const editableFields = ['phone', 'homePhone', 'cellPhone', 'qualifyingDegree', 'nativePlace', 'college', 'jobTitle', 'employer', 'specialInterests', 'firstName', 'middleName', 'lastName'] as const;
    for (const field of editableFields) {
      if (parsed[field] !== undefined) {
        memberUpdates[field] = parsed[field];
      }
    }
    if (Object.keys(memberUpdates).length > 0) {
      memberUpdates.updatedAt = now;
      await memberRepository.update(auth.memberId, memberUpdates);
    }

    // Upsert address
    if (parsed.address !== undefined) {
      await memberAddressRepository.deleteByMemberId(auth.memberId);
      const addr = parsed.address;
      if (Object.values(addr).some(v => String(v || '').trim())) {
        await memberAddressRepository.create({
          memberId: auth.memberId,
          street: addr.street || '',
          street2: addr.street2 || '',
          city: addr.city || '',
          state: addr.state || '',
          zipCode: addr.zipCode || '',
          country: addr.country || '',
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Upsert spouse
    if (parsed.spouse !== undefined) {
      await memberSpouseRepository.deleteByMemberId(auth.memberId);
      const sp = parsed.spouse;
      if (Object.values(sp).some(v => String(v || '').trim())) {
        await memberSpouseRepository.create({
          memberId: auth.memberId,
          firstName: sp.firstName || '',
          middleName: sp.middleName || '',
          lastName: sp.lastName || '',
          email: sp.email || '',
          phone: sp.phone || '',
          nativePlace: sp.nativePlace || '',
          company: sp.company || '',
          college: sp.college || '',
          qualifyingDegree: sp.qualifyingDegree || '',
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Replace children
    if (parsed.children !== undefined) {
      await memberChildRepository.deleteByMemberId(auth.memberId);
      const kids = parsed.children.filter((c: { name: string }) => c.name?.trim());
      for (let i = 0; i < kids.length; i++) {
        const child = kids[i];
        await memberChildRepository.create({
          memberId: auth.memberId,
          name: child.name || '',
          age: child.age || '',
          sex: child.sex || '',
          grade: child.grade || '',
          dateOfBirth: child.dateOfBirth || '',
          sortOrder: i + 1,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // Send confirmation email (fire-and-forget)
    const memberName = record.name || `${record.firstName || ''} ${record.lastName || ''}`.trim() || 'Member';
    sendEmail(
      [record.email],
      'Profile Updated Successfully',
      `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Profile Updated</h2>
        <p>Hi ${memberName},</p>
        <p>Your MEANT member profile has been updated successfully.</p>
        <p>If you did not make this change, please contact us immediately.</p>
        <br/>
        <p style="color: #666; font-size: 13px;">— MEANT (Malayalee Engineers' Association of North Texas)</p>
      </div>`,
      'system',
    ).catch((err) => console.error('Profile update confirmation email failed:', err));

    return jsonResponse({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Portal profile PUT error:', error);
    return errorResponse('Failed to update profile', 500, error);
  }
}
