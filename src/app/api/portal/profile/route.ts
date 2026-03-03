import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireMember, validateBody } from '@/lib/api-helpers';
import { memberRepository } from '@/repositories';
import { memberProfileUpdateSchema } from '@/types/schemas';

export async function GET() {
  const auth = await requireMember();
  if (auth instanceof NextResponse) return auth;

  try {
    const record = await memberRepository.findById(auth.memberId);
    if (!record) {
      return errorResponse('Member record not found', 404);
    }

    return jsonResponse({
      id: record.id,
      name: record.name,
      email: record.email,
      phone: record.phone,
      address: record.address,
      spouseName: record.spouseName,
      spouseEmail: record.spouseEmail,
      spousePhone: record.spousePhone,
      children: record.children,
      membershipType: record.membershipType,
      membershipYears: record.membershipYears,
      registrationDate: record.registrationDate,
      renewalDate: record.renewalDate,
      status: record.status,
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

    // Only allow updating editable fields
    const updatedRecord = { ...record };
    if (parsed.phone !== undefined) updatedRecord.phone = parsed.phone;
    if (parsed.address !== undefined) updatedRecord.address = parsed.address;
    if (parsed.spouseName !== undefined) updatedRecord.spouseName = parsed.spouseName;
    if (parsed.spouseEmail !== undefined) updatedRecord.spouseEmail = parsed.spouseEmail;
    if (parsed.spousePhone !== undefined) updatedRecord.spousePhone = parsed.spousePhone;
    if (parsed.children !== undefined) updatedRecord.children = parsed.children;
    updatedRecord.updatedAt = new Date().toISOString();

    await memberRepository.update(auth.memberId, updatedRecord);

    return jsonResponse({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Portal profile PUT error:', error);
    return errorResponse('Failed to update profile', 500, error);
  }
}
