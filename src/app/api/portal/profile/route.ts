import { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, errorResponse, requireMember, validateBody } from '@/lib/api-helpers';
import { getRowById, updateRow } from '@/lib/google-sheets';
import { SHEET_TABS } from '@/types';
import { memberProfileUpdateSchema } from '@/types/schemas';

export async function GET() {
  const auth = await requireMember();
  if (auth instanceof NextResponse) return auth;

  try {
    const result = await getRowById(SHEET_TABS.MEMBERS, auth.memberId);
    if (!result) {
      return errorResponse('Member record not found', 404);
    }

    return jsonResponse({
      id: result.record.id,
      name: result.record.name,
      email: result.record.email,
      phone: result.record.phone,
      address: result.record.address,
      spouseName: result.record.spouseName,
      spouseEmail: result.record.spouseEmail,
      spousePhone: result.record.spousePhone,
      children: result.record.children,
      membershipType: result.record.membershipType,
      membershipYears: result.record.membershipYears,
      registrationDate: result.record.registrationDate,
      renewalDate: result.record.renewalDate,
      status: result.record.status,
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

    const result = await getRowById(SHEET_TABS.MEMBERS, auth.memberId);
    if (!result) {
      return errorResponse('Member record not found', 404);
    }

    // Only allow updating editable fields
    const updatedRecord = { ...result.record };
    if (parsed.phone !== undefined) updatedRecord.phone = parsed.phone;
    if (parsed.address !== undefined) updatedRecord.address = parsed.address;
    if (parsed.spouseName !== undefined) updatedRecord.spouseName = parsed.spouseName;
    if (parsed.spouseEmail !== undefined) updatedRecord.spouseEmail = parsed.spouseEmail;
    if (parsed.spousePhone !== undefined) updatedRecord.spousePhone = parsed.spousePhone;
    if (parsed.children !== undefined) updatedRecord.children = parsed.children;
    updatedRecord.updatedAt = new Date().toISOString();

    await updateRow(SHEET_TABS.MEMBERS, result.rowIndex, updatedRecord);

    return jsonResponse({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Portal profile PUT error:', error);
    return errorResponse('Failed to update profile', 500, error);
  }
}
