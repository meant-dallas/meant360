// ========================================
// Core Type Definitions
// ========================================

export type UserRole = 'admin' | 'committee';

export interface AppUser {
  email: string;
  name: string;
  image?: string;
  role: UserRole;
}

// --- Sponsor ---
export type SponsorshipType = 'Annual' | 'Event';
export type SponsorshipStatus = 'Paid' | 'Pending';

export interface Sponsor {
  id: string;
  name: string;
  email: string;
  phone: string;
  type: SponsorshipType;
  amount: number;
  eventName: string;
  year: string;
  paymentMethod: string;
  paymentDate: string;
  status: SponsorshipStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// --- Income ---
export type IncomeType = 'Membership' | 'Guest Fee' | 'Event Entry' | 'Donation' | 'Other';

export interface Income {
  id: string;
  incomeType: IncomeType;
  eventName: string;
  amount: number;
  date: string;
  paymentMethod: string;
  payerName: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// --- Expense ---
export type ExpenseType = 'General' | 'Event';
export type ExpenseCategory =
  | 'Admin'
  | 'Venue'
  | 'Catering'
  | 'Decorations'
  | 'Sound & Lighting'
  | 'Transportation'
  | 'Marketing'
  | 'Insurance'
  | 'Supplies'
  | 'Miscellaneous';

export interface Expense {
  id: string;
  expenseType: ExpenseType;
  eventName: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  date: string;
  paidBy: string; // 'Organization' or board member name
  receiptUrl: string; // Google Drive link
  receiptFileId: string;
  notes: string;
  needsReimbursement: string; // 'true' or ''
  reimbStatus: ReimbursementStatus | '';
  reimbMethod: string; // 'Check' | 'Zelle' | 'Venmo' | 'Cash' | 'Bank Transfer' | ''
  reimbAmount: number; // may differ from expense amount (partial reimbursement)
  approvedBy: string;
  approvedDate: string;
  reimbursedDate: string;
  createdAt: string;
  updatedAt: string;
}

// --- Reimbursement Status (used inline on Expense) ---
export type ReimbursementStatus = 'Pending' | 'Approved' | 'Reimbursed' | 'Rejected';

// --- Transaction (Square / PayPal) ---
export type TransactionSource = 'Square' | 'PayPal' | 'Manual';
export type TransactionTag = 'Membership' | 'Guest Fee' | 'Sponsorship' | 'Event Entry' | 'Donation' | 'Other' | 'Untagged';

export interface Transaction {
  id: string;
  externalId: string; // ID from Square/PayPal
  source: TransactionSource;
  amount: number;
  fee: number;
  netAmount: number;
  description: string;
  payerName: string;
  payerEmail: string;
  date: string;
  tag: TransactionTag;
  eventName: string;
  syncedAt: string;
  notes: string;
}

// --- Dynamic Form Field Configuration ---
export type FormFieldType = 'text' | 'email' | 'phone' | 'number' | 'select' | 'checkbox' | 'textarea';
export interface FormFieldConfig {
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[]; // for 'select' type
}

// --- Activity Configuration ---
export interface ActivityConfig {
  id: string;
  name: string;
  description?: string;
  maxParticipants?: number;
  maxPerPerson?: number;
  price?: number; // used when activityPricingMode='per_activity'
}

export interface ActivityRegistration {
  activityId: string;
  participantName: string;
}

export type ActivityPricingMode = 'flat' | 'per_activity';

// --- Guest Policy ---
export type GuestAction = 'pay_fee' | 'become_member' | 'blocked';
export interface GuestPolicy {
  allowGuests: boolean;
  guestAction: GuestAction;
  guestMessage?: string;
}

// --- Event Pricing ---
export type MemberPricingModel = 'family' | 'individual';

export interface PricingRules {
  enabled: boolean;
  memberPricingModel: MemberPricingModel;
  memberFamilyPrice: number;
  memberAdultPrice: number;
  memberKidPrice: number;
  memberKidFreeUnderAge: number;
  memberKidMaxAge: number;
  guestAdultPrice: number;
  guestKidPrice: number;
  guestKidFreeUnderAge: number;
  guestKidMaxAge: number;
  siblingDiscount: { enabled: boolean; type: 'flat' | 'percent'; value: number };
  multiEventDiscount: { enabled: boolean; minEvents: number; type: 'flat' | 'percent'; value: number };
}

export interface PriceLineItem { label: string; amount: number; }
export interface PriceBreakdown { lineItems: PriceLineItem[]; subtotal: number; discounts: PriceLineItem[]; total: number; }

// --- Event ---
export interface EventRecord {
  id: string;
  name: string;
  date: string;
  description: string;
  status: 'Upcoming' | 'Completed' | 'Cancelled';
  createdAt: string;
  parentEventId: string;
  pricingRules: string; // JSON string of PricingRules
  formConfig: string; // JSON string of FormFieldConfig[]
  activities: string; // JSON string of ActivityConfig[]
  activityPricingMode: string; // 'flat' | 'per_activity' | ''
  guestPolicy: string; // JSON string of GuestPolicy
}

// --- Member ---
export type MembershipType = 'Life Member' | 'Yearly';
export type MemberStatus = 'Active' | 'Not Renewed' | 'Expired';

export interface Child {
  name: string;
  age: string;
}

export interface Member {
  id: string;
  name: string;
  address: string;
  email: string;
  phone: string;
  spouseName: string;
  spouseEmail: string;
  spousePhone: string;
  children: string; // JSON string of Child[]
  membershipType: MembershipType;
  membershipYears: string; // comma-separated years
  registrationDate: string;
  renewalDate: string;
  status: MemberStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  loginEmail: string;
}

// --- Guest ---
export interface Guest {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  referredBy: string;
  eventsAttended: number;
  lastEventDate: string;
  createdAt: string;
  updatedAt: string;
}

// --- Event Participant (unified registration + check-in) ---
export interface EventParticipant {
  id: string;
  eventId: string;
  type: 'Member' | 'Guest';
  memberId: string;
  guestId: string;
  name: string;
  email: string;
  phone: string;
  // Registration data
  registeredAdults: number;
  registeredKids: number;
  registeredAt: string;
  // Check-in data (filled when person checks in)
  actualAdults: number;
  actualKids: number;
  checkedInAt: string;
  // Activities & custom form data
  selectedActivities: string; // JSON of string[] (activity IDs)
  customFields: string; // JSON of Record<string, string>
  // Pricing & payment
  totalPrice: string;
  priceBreakdown: string; // JSON string of PriceBreakdown
  paymentStatus: string; // '' | 'paid' | 'failed'
  paymentMethod: string; // '' | 'square' | 'paypal'
  transactionId: string; // external ID from Square/PayPal
}

// --- Dashboard ---
export interface DashboardSummary {
  totalIncome: number;
  totalSponsorship: number;
  totalExpenses: number;
  netSurplus: number;
  outstandingReimbursements: number;
  totalReimbursed: number;
  eventSummaries: EventSummary[];
  monthlySummary: MonthlySummary[];
}

export interface EventSummary {
  eventName: string;
  income: number;
  sponsorship: number;
  expenses: number;
  reimbursements: number;
  net: number;
}

export interface MonthlySummary {
  month: string;
  income: number;
  sponsorship: number;
  expenses: number;
  reimbursements: number;
  net: number;
}

// --- API ---
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// --- Settings ---
export interface FeeSettings {
  squareFeePercent: number;
  squareFeeFixed: number;
  paypalFeePercent: number;
  paypalFeeFixed: number;
}

export interface SocialLinks {
  instagram: string;
  facebook: string;
  linkedin: string;
  youtube: string;
}

export interface PublicSettings {
  socialLinks: SocialLinks;
  feeSettings: FeeSettings;
}

// --- Activity Log ---
export type AuditAction = 'create' | 'update' | 'delete';

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  userEmail: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityLabel: string;
  description: string;
  changedFields: string; // JSON string[]
  oldValues: string; // JSON Record<string, string>
  newValues: string; // JSON Record<string, string>
}

// --- Sheet Tab Names ---
export const SHEET_TABS = {
  INCOME: 'Income',
  SPONSORS: 'Sponsors',
  EXPENSES: 'Expenses',
  TRANSACTIONS: 'Transactions',
  EVENTS: 'Events',
  MEMBERS: 'Members',
  GUESTS: 'Guests',
  EVENT_PARTICIPANTS: 'EventParticipants',
  COMMITTEE_MEMBERS: 'Committee Members',
  SETTINGS: 'Settings',
  ACTIVITY_LOG: 'ActivityLog',
} as const;
