// ========================================
// Core Type Definitions
// ========================================

export type UserRole = 'admin' | 'committee' | 'member';

export interface AppUser {
  email: string;
  name: string;
  image?: string;
  role: UserRole;
}

// --- Sponsor ---
export type SponsorshipType = 'Annual' | 'Event';
export type SponsorshipStatus = 'Paid' | 'Pending';
export type SponsorTier = 'Platinum' | 'Gold' | 'Silver' | 'Bronze' | '';

export interface Sponsor {
  id: string;
  name: string;
  email: string;
  phone: string;
  type: SponsorshipType;
  amount: number;
  eventName: string;
  eventId: string;
  year: string;
  paymentMethod: string;
  paymentDate: string;
  status: SponsorshipStatus;
  notes: string;
  tier: SponsorTier;
  website: string;
  address: string;
  contactName: string;
  logoUrl: string;
  createdAt: string;
  updatedAt: string;
}

// Curated, public-safe shape rendered on the event home page and in emails —
// deliberately excludes email/phone/amount/notes/paymentMethod/status/address.
export interface PublicSponsor {
  id: string;
  name: string;
  tier: SponsorTier;
  logoUrl: string;
  website: string;
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
  isRefund?: boolean;
}

// --- Dynamic Form Field Configuration ---
export type FormFieldType = 'text' | 'email' | 'phone' | 'number' | 'select' | 'checkbox' | 'textarea' | 'label';
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
  price?: number; // used when activityPricingMode='per_activity' — price for first participant
  additionalParticipantPrice?: number; // price for 2nd, 3rd, etc. participant in same performance
}

export interface ActivityRegistration {
  activityId: string;
  participantName: string;
  slotId: string;        // unique per performance slot; co-performers share the same slotId
  chestNumber?: number;  // assigned server-side at registration time
}

export type ActivityPricingMode = 'flat' | 'per_activity';

// 'performance' = today's behavior (named performers, chest numbers, multiple co-performers per slot).
// 'ticketed_event' = one ticket per already-collected attendee name, priced by tier, no chest numbers.
export type ActivityMode = 'performance' | 'ticketed_event';

// --- Generic Item catalog (registrationModel = 'items') ---
// Items are catalog entries (like e-commerce products) an admin names freely —
// a room, an activity ticket, an add-on. pricingMode controls how the price is
// computed: 'flat' once per registration, 'per_participant' multiplied by the
// number of named participants selecting it, 'per_unit' multiplied by a plain
// quantity (e.g. T-shirts) with no participant binding required.
export type ItemPricingMode = 'flat' | 'per_participant' | 'per_unit';

export interface ItemConfig {
  id: string;
  name: string;
  description?: string;
  pricingMode: ItemPricingMode;
  memberPrice: number;
  guestPrice: number;
  capacity?: number; // blank/0 = unlimited
  required: boolean;
  enabled: boolean;
  customFields: FormFieldConfig[];
  // Marks this item as plain event attendance rather than a distinct
  // activity/add-on — e.g. a $0 or flat entry fee every registrant needs.
  // Excluded from the multi-event/multi-activity discount's item count,
  // since attending isn't itself "an event" to stack a discount on.
  isGeneralAttendance?: boolean;
}

// Which kinds of registrant this event accepts. 'family' is mutually
// exclusive with 'adult'/'kids' (a family registration already covers
// members of any age); 'adult' and 'kids' can both be enabled together
// (independent age-gated registrations) or alone (an adults-only mixer, a
// kids-only academic event, etc).
export type RegistrantType = 'family' | 'adult' | 'kids';

// Event.items JSON wrapper — the Item catalog plus the handful of
// registration-level (not item-level) settings this model needs: which
// registrant types this event accepts and an optional headcount cap per
// registration. General attendance (the old flat "base registration fee")
// is modeled as a regular ItemConfig with isGeneralAttendance: true instead
// of a separate top-level fee — it's just another catalog SKU added to the
// cart, so it gets member/guest pricing and custom fields for free. Also
// carries the same three discount rules as the legacy model's PricingRules
// (see DiscountRules below) — "multi-event" here means "multiple priced
// Items (excluding general attendance) in one registration", matching how
// calculateActivityPrice already treats multiple activities in the legacy model.
export interface ItemCatalog extends DiscountRules {
  registrantTypes: RegistrantType[];
  maxAttendeesPerRegistration?: number;
  allowGuests: boolean;
  items: ItemConfig[];
  // Customizable heading/subheading for the registration-level "Additional
  // Information" questions section (formConfig) on the register page.
  additionalInfoHeading?: string;
  additionalInfoSubheading?: string;
}

// --- Guest Policy ---
export type GuestAction = 'pay_fee' | 'become_member' | 'blocked';
export interface GuestPolicy {
  allowGuests: boolean;
  guestAction: GuestAction;
  guestMessage?: string;
  allowGuestActivities?: boolean;
}

// --- Event Payment Options ---
export interface EventPaymentConfig {
  paypalEnabled: boolean;
  zelleEnabled: boolean;
  paypalFeePercent?: number;
  paypalFeeFixed?: number;
}

// --- Event Pricing ---
export type MemberPricingModel = 'family' | 'individual';

// The three discount rules shared by both event models (legacy PricingRules
// and the Item catalog's DiscountRules) — pulled out so DiscountsForm and the
// pricing calculators for each model can share one shape instead of two.
export interface DiscountRules {
  siblingDiscount: { enabled: boolean; type: 'flat' | 'percent'; value: number };
  multiEventDiscount: { enabled: boolean; minEvents: number; type: 'flat' | 'percent'; value: number };
  earlyBirdDiscount: { enabled: boolean; type: 'flat' | 'percent'; value: number; endDate: string };
}

export interface PricingRules extends DiscountRules {
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
  pricingRules: string; // JSON string of PricingRules
  formConfig: string; // JSON string of FormFieldConfig[]
  activities: string; // JSON string of ActivityConfig[]
  activityPricingMode: string; // 'flat' | 'per_activity' | ''
  guestPolicy: string; // JSON string of GuestPolicy
  registrationOpen: string; // 'true' or ''
  registrationModel: string; // 'legacy' | 'items'
  items: string; // JSON string of ItemConfig[]
}

// --- Member ---
export type MembershipType = 'Life Member' | 'Yearly';
export type MemberStatus = 'Active' | 'Not Renewed' | 'Expired';

export interface Child {
  name: string;
  age: string;
  sex?: string;
  grade?: string;
  dateOfBirth?: string;
}

export interface MemberAddress {
  id: string;
  memberId: string;
  street: string;
  street2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

export interface MemberSpouse {
  id: string;
  memberId: string;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phone: string;
  nativePlace: string;
  company: string;
  college: string;
  qualifyingDegree: string;
}

export interface MemberChildRecord {
  id: string;
  memberId: string;
  name: string;
  sex: string;
  grade: string;
  age: string;
  dateOfBirth: string;
  sortOrder: number;
}

export interface MemberMembershipRecord {
  id: string;
  memberId: string;
  year: string;
  status: string;
}

export interface MemberPaymentRecord {
  id: string;
  memberId: string;
  product: string;
  amount: string;
  currency: string;
  payerName: string;
  payerEmail: string;
  transactionId: string;
}

export interface MemberSponsorRecord {
  id: string;
  memberId: string;
  name: string;
  email: string;
  phone: string;
}

export interface Member {
  id: string;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phone: string;
  homePhone: string;
  cellPhone: string;
  qualifyingDegree: string;
  nativePlace: string;
  college: string;
  jobTitle: string;
  employer: string;
  specialInterests: string;
  submissionId: string;
  membershipType: MembershipType;
  membershipLevel: string;
  registrationDate: string;
  renewalDate: string;
  status: MemberStatus;
  notes: string;
  loginEmail: string;
  createdAt: string;
  updatedAt: string;
  // Backward-compatible computed fields (from repository layer)
  name: string;
  address: string;
  spouseName: string;
  spouseEmail: string;
  spousePhone: string;
  children: string; // JSON string of Child[]
  membershipYears: string; // comma-separated years
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
  zelleEmail: string;
  zellePhone: string;
}

export interface MembershipTypeConfig {
  name: string;
  price: number;
}

export interface MembershipSettings {
  membershipTypes: MembershipTypeConfig[];
  requiredApprovals: number;
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
  membershipSettings: MembershipSettings;
}

// --- Organization ---
export type OrgDocumentCategory = 'Tax' | 'Legal' | 'Compliance' | 'Insurance' | 'Financial' | 'Governance' | 'Other';
export type OrgDocumentStatus = 'Active' | 'Archived' | 'Expired';

export interface OrgDocument {
  id: string;
  name: string;
  category: OrgDocumentCategory;
  description: string;
  currentVersion: string;
  currentFileUrl: string;
  currentFileId: string;
  expiryDate: string;
  status: OrgDocumentStatus;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrgDocumentVersion {
  id: string;
  documentId: string;
  version: string;
  fileUrl: string;
  fileId: string;
  fileName: string;
  fileSize: string;
  uploadedBy: string;
  uploadedAt: string;
  notes: string;
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