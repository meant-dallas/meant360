import { z } from 'zod';

// ========================================
// Zod Validation Schemas
// ========================================

// --- Reusable Primitives ---

export const nonEmptyString = z.string().min(1, 'Required');
export const optionalString = z.string().optional().default('');
export const email = z.string().email('Invalid email').toLowerCase().trim();
export const optionalEmail = z.string().email('Invalid email').toLowerCase().trim().optional().or(z.literal(''));
export const phone = z.string().optional().default('');
export const amount = z.coerce.number().min(0, 'Amount must be non-negative');
export const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD format').optional().default('');
export const id = z.string().min(1, 'ID is required');

// --- Income ---

export const incomeCreateSchema = z.object({
  incomeType: z.enum(['Membership', 'Guest Fee', 'Event Entry', 'Donation', 'Sponsorship', 'Previous Committee', 'Other']).default('Other'),
  eventName: z.string().default(''),
  amount: amount,
  date: z.string().default(''),
  paymentMethod: z.string().default(''),
  payerName: z.string().default(''),
  notes: z.string().default(''),
});

export const incomeUpdateSchema = z.object({
  id: id,
}).passthrough();

// --- Expense ---

export const expenseCreateSchema = z.object({
  expenseType: z.enum(['General', 'Event']).default('General'),
  eventName: z.string().default(''),
  category: z.enum([
    'Admin', 'Venue', 'Catering', 'Decorations', 'Sound & Lighting',
    'Transportation', 'Marketing', 'Insurance', 'Supplies', 'Miscellaneous',
  ]).default('Miscellaneous'),
  description: z.string().default(''),
  amount: amount,
  date: z.string().default(''),
  paidBy: z.string().default('Organization'),
  receiptUrl: z.string().default(''),
  receiptFileId: z.string().default(''),
  notes: z.string().default(''),
  needsReimbursement: z.string().default(''),
});

export const expenseUpdateSchema = z.object({
  id: id,
  reimbStatus: z.enum(['Pending', 'Approved', 'Reimbursed', 'Rejected']).optional(),
  reimbMethod: z.string().optional(),
  reimbAmount: z.coerce.number().optional(),
  approvedBy: z.string().optional(),
  reimbursedDate: z.string().optional(),
}).passthrough();

// --- Member ---

export const memberCreateSchema = z.object({
  name: nonEmptyString,
  address: z.string().default(''),
  email: z.string().default(''),
  phone: z.string().default(''),
  spouseName: z.string().default(''),
  spouseEmail: z.string().default(''),
  spousePhone: z.string().default(''),
  children: z.string().default('[]'),
  membershipType: z.enum(['Life Member', 'Yearly']).default('Yearly'),
  membershipYears: z.string().default(''),
  registrationDate: z.string().default(''),
  renewalDate: z.string().default(''),
  status: z.enum(['Active', 'Not Renewed', 'Expired']).default('Active'),
  notes: z.string().default(''),
});

export const memberUpdateSchema = z.object({
  id: id,
}).passthrough();

// --- Guest ---

export const guestCreateSchema = z.object({
  name: nonEmptyString,
  email: z.string().default(''),
  phone: z.string().default(''),
  city: z.string().default(''),
  referredBy: z.string().default(''),
  eventsAttended: z.coerce.number().default(0),
  lastEventDate: z.string().default(''),
});

export const guestUpdateSchema = z.object({
  id: id,
}).passthrough();

// --- Sponsor ---

export const sponsorCreateSchema = z.object({
  name: nonEmptyString,
  email: z.string().default(''),
  phone: z.string().default(''),
  type: z.enum(['Annual', 'Event']).default('Annual'),
  amount: amount,
  eventName: z.string().default(''),
  year: z.string().default(''),
  paymentMethod: z.string().default(''),
  paymentDate: z.string().default(''),
  status: z.enum(['Paid', 'Pending']).default('Pending'),
  notes: z.string().default(''),
});

export const sponsorUpdateSchema = z.object({
  id: id,
}).passthrough();

// --- Event ---

export const formFieldConfigSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'email', 'phone', 'number', 'select', 'checkbox', 'textarea']),
  required: z.boolean().default(false),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
});

export const activityConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  maxParticipants: z.coerce.number().optional(),
  maxPerPerson: z.coerce.number().optional(),
  price: z.coerce.number().optional(),
});

export const activityRegistrationSchema = z.object({
  activityId: z.string().min(1),
  participantName: z.string().min(1),
});

export const guestPolicySchema = z.object({
  allowGuests: z.boolean().default(true),
  guestAction: z.enum(['pay_fee', 'become_member', 'blocked']).default('pay_fee'),
  guestMessage: z.string().optional(),
});

export const eventCreateSchema = z.object({
  name: nonEmptyString,
  date: z.string().default(''),
  description: z.string().default(''),
  status: z.enum(['Upcoming', 'Completed', 'Cancelled']).default('Upcoming'),
  parentEventId: z.string().default(''),
  pricingRules: z.string().default(''),
  formConfig: z.string().default(''),
  activities: z.string().default(''),
  activityPricingMode: z.string().default(''),
  guestPolicy: z.string().default(''),
});

export const eventUpdateSchema = z.object({
  id: id,
}).passthrough();

// --- Event Participant (unified registration + check-in) ---

export const participantCreateSchema = z.object({
  type: z.enum(['Member', 'Guest']),
  memberId: z.string().default(''),
  guestId: z.string().default(''),
  name: nonEmptyString,
  email: z.string().min(1, 'Email is required').toLowerCase().trim(),
  phone: z.string().default(''),
  adults: z.coerce.number().min(0).default(0),
  kids: z.coerce.number().min(0).default(0),
  totalPrice: z.string().default('0'),
  priceBreakdown: z.string().default(''),
  paymentStatus: z.string().default(''),
  paymentMethod: z.string().default(''),
  transactionId: z.string().default(''),
  selectedActivities: z.string().default(''),
  customFields: z.string().default(''),
  city: z.string().optional(),
  referredBy: z.string().optional(),
  // Check-in specific fields
  isCheckin: z.boolean().optional().default(false),
  actualAdults: z.coerce.number().min(0).optional(),
  actualKids: z.coerce.number().min(0).optional(),
});

// --- Lookup ---

export const lookupSchema = z.object({
  email: z.string().optional().default(''),
  phone: z.string().optional().default(''),
}).refine((data) => data.email || data.phone, {
  message: 'Email or phone is required',
});

// --- Search ---

export const searchSchema = z.object({
  query: z.string().min(2, 'Query must be at least 2 characters'),
});

// --- Transaction ---

export const transactionSyncSchema = z.object({
  source: z.enum(['Square', 'PayPal']),
  startDate: nonEmptyString,
  endDate: nonEmptyString,
});

export const transactionUpdateSchema = z.object({
  id: id,
  tag: z.enum(['Membership', 'Guest Fee', 'Sponsorship', 'Event Entry', 'Donation', 'Other', 'Untagged']).optional(),
  eventName: z.string().optional(),
  notes: z.string().optional(),
}).passthrough();

// --- Payment ---

const squarePaySchema = z.object({
  action: z.literal('square-pay'),
  sourceId: nonEmptyString,
  amount: amount,
  currency: z.string().default('USD'),
  eventId: nonEmptyString,
  eventName: z.string().default(''),
  payerName: z.string().default(''),
  payerEmail: z.string().default(''),
});

const paypalCreateSchema = z.object({
  action: z.literal('paypal-create'),
  amount: amount,
  currency: z.string().default('USD'),
  description: z.string().default('Event Payment'),
  eventId: nonEmptyString,
});

const paypalCaptureSchema = z.object({
  action: z.literal('paypal-capture'),
  orderId: nonEmptyString,
  eventId: nonEmptyString,
  eventName: z.string().default(''),
  payerName: z.string().default(''),
  payerEmail: z.string().default(''),
  amount: z.coerce.number().default(0),
});

export const paymentSchema = z.discriminatedUnion('action', [
  squarePaySchema,
  paypalCreateSchema,
  paypalCaptureSchema,
]);

// --- Settings ---

export const settingsUpdateSchema = z.object({
  settings: z.record(z.string(), z.string()),
});
