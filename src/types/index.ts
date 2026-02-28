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

// --- Sponsorship ---
export type SponsorshipType = 'Annual' | 'Event';
export type SponsorshipStatus = 'Paid' | 'Pending';

export interface Sponsorship {
  id: string;
  sponsorName: string;
  year: string;
  sponsorEmail: string;
  sponsorPhone: string;
  type: SponsorshipType;
  amount: number;
  eventName: string; // empty if Annual
  paymentMethod: string;
  paymentDate: string; // ISO date string
  status: SponsorshipStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// --- Sponsor ---
export interface Sponsor {
  id: string;
  name: string;
  email: string;
  phone: string;
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
  createdAt: string;
  updatedAt: string;
}

// --- Reimbursement ---
export type ReimbursementStatus = 'Pending' | 'Approved' | 'Reimbursed' | 'Rejected';

export interface Reimbursement {
  id: string;
  expenseId: string;
  requestedBy: string;
  amount: number;
  description: string;
  eventName: string;
  category: ExpenseCategory;
  receiptUrl: string;
  receiptFileId: string;
  status: ReimbursementStatus;
  approvedBy: string;
  approvedDate: string;
  reimbursedDate: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

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

// --- Event Registration ---
export interface EventRegistration {
  id: string;
  eventId: string;
  type: 'Member' | 'Guest';
  memberId: string;
  guestId: string;
  name: string;
  email: string;
  phone: string;
  adults: number;
  kids: number;
  registeredAt: string;
  totalPrice: string;
  priceBreakdown: string; // JSON string of PriceBreakdown
  paymentStatus: string; // '' | 'paid' | 'failed'
  paymentMethod: string; // '' | 'square' | 'paypal'
  transactionId: string; // external ID from Square/PayPal
}

// --- Event Check-in ---
export interface EventCheckin {
  id: string;
  eventId: string;
  type: 'Member' | 'Guest';
  memberId: string;
  guestId: string;
  name: string;
  email: string;
  phone: string;
  adults: number;
  kids: number;
  checkedInAt: string;
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

// --- Sheet Tab Names ---
export const SHEET_TABS = {
  INCOME: 'Income',
  SPONSORSHIP: 'Sponsorship',
  SPONSORS: 'Sponsors',
  EXPENSES: 'Expenses',
  REIMBURSEMENTS: 'Reimbursements',
  TRANSACTIONS: 'Transactions',
  EVENTS: 'Events',
  MEMBERS: 'Members',
  GUESTS: 'Guests',
  EVENT_REGISTRATIONS: 'EventRegistrations',
  EVENT_CHECKINS: 'EventCheckins',
  COMMITTEE_MEMBERS: 'Committee Members',
  SETTINGS: 'Settings',
} as const;
