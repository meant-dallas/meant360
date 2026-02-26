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
  incomeType: z.enum(['Membership', 'Guest Fee', 'Event Entry', 'Donation', 'Other']).default('Other'),
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
});

export const expenseUpdateSchema = z.object({
  id: id,
}).passthrough();

// --- Reimbursement ---

export const reimbursementCreateSchema = z.object({
  expenseId: z.string().default(''),
  requestedBy: z.string().min(1, 'Requested by is required'),
  amount: amount,
  description: z.string().default(''),
  eventName: z.string().default(''),
  category: z.string().default(''),
  receiptUrl: z.string().default(''),
  receiptFileId: z.string().default(''),
  notes: z.string().default(''),
});

export const reimbursementUpdateSchema = z.object({
  id: id,
  status: z.enum(['Pending', 'Approved', 'Reimbursed', 'Rejected']).optional(),
  approvedBy: z.string().optional(),
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
  notes: z.string().default(''),
});

export const sponsorUpdateSchema = z.object({
  id: id,
}).passthrough();

// --- Sponsorship ---

export const sponsorshipCreateSchema = z.object({
  sponsorName: nonEmptyString,
  year: z.string().default(''),
  sponsorEmail: z.string().default(''),
  sponsorPhone: z.string().default(''),
  type: z.enum(['Annual', 'Event']).default('Annual'),
  amount: amount,
  eventName: z.string().default(''),
  paymentMethod: z.string().default(''),
  paymentDate: z.string().default(''),
  status: z.enum(['Paid', 'Pending']).default('Pending'),
  notes: z.string().default(''),
});

export const sponsorshipUpdateSchema = z.object({
  id: id,
}).passthrough();

// --- Event ---

export const eventCreateSchema = z.object({
  name: nonEmptyString,
  date: z.string().default(''),
  description: z.string().default(''),
  status: z.enum(['Upcoming', 'Completed', 'Cancelled']).default('Upcoming'),
  parentEventId: z.string().default(''),
  pricingRules: z.string().default(''),
});

export const eventUpdateSchema = z.object({
  id: id,
}).passthrough();

// --- Event Registration ---

export const registrationCreateSchema = z.object({
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
  city: z.string().optional(),
  referredBy: z.string().optional(),
});

// --- Event Checkin ---

export const checkinCreateSchema = z.object({
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
  city: z.string().optional(),
  referredBy: z.string().optional(),
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
