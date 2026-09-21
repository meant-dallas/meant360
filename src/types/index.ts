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

// --- Refunds ---
// Outcome of an attempted payment refund (see src/services/refunds.service.ts
// for the logic that produces this) — defined here, not in that service file,
// so client components can describe it (e.g. an accurate cancellation toast)
// without importing server-only code (prisma, PayPal/Square SDKs, crypto).
export type RefundOutcome =
  | { status: 'none' }
  | { status: 'refunded'; refundedAmount: number; note?: string }
  | { status: 'partial'; refundedAmount: number; remainingAmount: number; note: string }
  | { status: 'manual'; note: string }
  | { status: 'failed'; error: string; refundedAmount: number };

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
// 'name' renders as a dropdown of the registrant's family members (from
// their profile) instead of a free-text box — picking a name rather than
// typing it. Falls back to a plain text input when no family members are
// on file (e.g. a guest, or a member with none saved).
export type FormFieldType = 'text' | 'email' | 'phone' | 'number' | 'select' | 'checkbox' | 'textarea' | 'label' | 'name';
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

// A named variant of an Activity item that a registrant chooses each time
// they add an entry — e.g. "Solo" vs "Group" for a Music Performance, each
// with its own price and participant-count bounds. pricingMode 'flat'
// charges memberPrice/guestPrice once per entry regardless of participant
// count; 'per_participant' multiplies by however many names are on the entry.
export interface EntryTypeConfig {
  key: string;
  label: string;
  pricingMode: 'flat' | 'per_participant';
  memberPrice: number;
  guestPrice: number;
  minParticipants?: number; // default 1
  maxParticipants?: number; // blank = unlimited
  capacity?: number; // max entries of this type across the event; blank/0 = unlimited
  // Questions asked once per named participant on an entry of this type (e.g.
  // "T-shirt size" for each Group Dance member) — distinct from the parent
  // item's customFields, which are asked once per entry regardless of
  // headcount. Every participant always has a Name field regardless of this
  // list; this only configures what ELSE is asked about each of them.
  participantFields?: FormFieldConfig[];
}

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
  // Marks this item as an Activity: registrants add it multiple times as
  // separate "entries" (e.g. two Music Performance entries, one Solo one
  // Group), each with its own entryType, participant names, and custom-field
  // answers. When true, this item's own pricingMode/memberPrice/guestPrice
  // are unused — pricing comes from the chosen EntryTypeConfig instead.
  // Mutually exclusive with isGeneralAttendance.
  isActivity?: boolean;
  entryTypes?: EntryTypeConfig[];
  // Restricts which registrant identity can see/select this item — e.g. a
  // Dinner Gala that's members-only vs. a Math Olympiad open to both.
  // Undefined/absent means visible to both, so events configured before
  // this feature existed render identically to today.
  visibleToMembers?: boolean;
  visibleToGuests?: boolean;
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
  // Restricts WHICH guest emails may register/check in, e.g. ["utd.edu"] for
  // a university-partnered event — subdomains match too (student@cs.utd.edu
  // matches an allowed domain of "utd.edu"). Members are never restricted by
  // this; it only narrows the allowGuests path further. Empty/absent = no
  // restriction (any guest email is fine, same as today).
  allowedGuestEmailDomains?: string[];
  items: ItemConfig[];
  // Ceiling on total Activity slots across EVERY Activity item in this
  // event combined — independent of each item's own entry-type capacity.
  // E.g. Dance (5 slots) + Music (10 slots) can still be jointly capped at
  // 40 total slots event-wide. Blank/0 = unlimited.
  maxTotalActivitySlots?: number;
  // Customizable heading/subheading for the registration-level "Additional
  // Information" questions section (formConfig) on the register page.
  additionalInfoHeading?: string;
  additionalInfoSubheading?: string;
  // Admin-configurable end-user-facing nouns (see ItemsTerminology) — blank
  // fields fall back to the English defaults, so unconfigured events render
  // unchanged.
  terminology?: Partial<ItemsTerminology>;
}

// End-user-facing nouns for the items registration model, admin-configurable
// per event so a Taylor-Swift-style ticketed show can say "Ticket" where a
// cultural showcase says "Performance" — same underlying data model, just
// different words shown to registrants. Defaults match today's hardcoded
// English so an event with no overrides looks identical to before.
export interface ItemsTerminology {
  eventTypeNoun: string; // "Event" — e.g. "Register for this {noun}"
  registrationNoun: string; // "Registration"
  itemNoun: string; // "Item" — generic catalog-entry word (settable to "Ticket", "Room", ...)
  itemNounPlural: string; // "Items"
  activityNoun: string; // "Activity" — word for isActivity items specifically (settable to "Performance")
  activityNounPlural: string; // "Activities"
  entryNoun: string; // "Entry" — one instance within an activity (settable to "Performance", "Ticket")
  entryNounPlural: string; // "Entries"
  participantNoun: string; // "Participant" — a named person on an entry/GA roster (settable to "Performer", "Attendee")
  participantNounPlural: string; // "Participants"
  // The verb on the final action button that completes registration when no
  // payment step follows (settable to "Submit", "Book", "Purchase", ...) —
  // not used for mid-flow "Continue" steps, only the terminal action.
  actionVerb: string; // "Register"
  // Bottom-nav "Register" tab label. Always has a real default ("Register")
  // — every event type has something to register for.
  registerCta: string; // "Register"
  // Bottom-nav tab label AND the event-home "Check in" card's button text.
  // Unlike every other field here, this has NO default — blank means the
  // Check-in tab/card are hidden entirely, not just relabeled. Not every
  // event type has a check-in step (e.g. a Survey with no items), so
  // check-in is opt-in: an admin who wants it must type a label.
  checkinCta: string; // no default — blank hides Check-in entirely
  // Full, standalone link text on the event home page — NOT composed from
  // registrationNoun (that field is free text an admin might set to a whole
  // sentence, e.g. "Your booking is confirmed", which reads badly when
  // spliced into another sentence like "Need to cancel your {noun}?").
  // Shown when self-service edit is OFF (registrant can only cancel, not edit).
  // Same "no default, blank hides it" rule as checkinCta — not every event
  // type has a cancellable registration (e.g. a Survey).
  cancelLinkText: string; // no default — blank hides the cancel link entirely
  // Same as cancelLinkText but shown when self-service edit is ON (registrant
  // can edit or cancel). Same "no default, blank hides it" rule.
  manageLinkText: string; // no default — blank hides the manage link entirely
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