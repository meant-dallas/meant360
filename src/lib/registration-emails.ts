import { emailLayout, detailsTable, highlightBox, sectionCard } from './email-templates';

// ========================================
// Treasurer alerts — automated refund needs manual follow-up
// ========================================

export function buildTreasurerAlertEmail(opts: {
  reason: 'refund_failed' | 'price_discrepancy' | 'manual_refund_needed';
  eventName: string;
  participantName: string;
  participantEmail: string;
  amount: string;
  paymentMethod: string;
  transactionId?: string;
  errorMessage?: string;
  recomputedAmount?: string;
  participantId: string;
}): string {
  const headline = {
    refund_failed: 'An automated refund could not be completed and needs to be processed manually.',
    price_discrepancy: "A cancellation was blocked because the stored price didn't match what our pricing rules compute today. It needs manual review before the registration is cancelled or refunded.",
    manual_refund_needed: 'A registration was cancelled with a paid balance that was not auto-refunded — please process this refund manually.',
  }[opts.reason];

  const headerTitle = {
    refund_failed: 'Refund Needs Manual Follow-up',
    price_discrepancy: 'Cancellation Blocked — Review Needed',
    manual_refund_needed: 'Manual Refund Needed',
  }[opts.reason];

  const rows: ([string, string] | null)[] = [
    ['Event', opts.eventName],
    ['Participant', opts.participantName],
    ['Email', opts.participantEmail],
    ['Participant ID', opts.participantId],
    ['Payment Method', opts.paymentMethod],
    opts.transactionId ? ['Transaction ID', opts.transactionId] : null,
    ['Stored Amount', `$${opts.amount}`],
    opts.reason !== 'price_discrepancy' && opts.errorMessage ? ['Note', opts.errorMessage] : null,
    opts.reason === 'price_discrepancy' && opts.recomputedAmount ? ['Recomputed Amount', `$${opts.recomputedAmount}`] : null,
  ];

  return emailLayout({
    headerTitle,
    headerSubtitle: opts.eventName,
    headerColor: 'linear-gradient(135deg,#b45309,#d97706)',
    body: `
      ${highlightBox(`<p style="margin:0;font-size:14px;color:#92400e;">${headline}</p>`, 'amber')}
      ${detailsTable(rows)}
    `,
  });
}

// ========================================
// Participant-facing: registration created / updated / cancelled
// ========================================

export interface EmailActivityRegistration {
  activityId: string;
  participantName: string;
  slotId: string;
  chestNumber?: number;
}

export interface EmailActivityConfig {
  id: string;
  name: string;
}

export interface EmailPriceLineItem {
  label: string;
  amount: number;
}

export interface EmailPriceBreakdown {
  lineItems: EmailPriceLineItem[];
  discounts: EmailPriceLineItem[];
  total: number;
}

export interface EmailLedgerEntry {
  type: string; // 'registered' | 'edited' | 'charge' | 'refund' | 'cancelled'
  amount?: string;
  method?: string;
  note?: string;
  createdAt: string;
  /** JSON string — {adults,kids,totalPrice,registrationStatus,selectedActivitiesBefore?,selectedActivitiesAfter?} for registered/edited entries. */
  snapshot?: string;
}

interface EditSnapshot {
  adults?: number;
  kids?: number;
  totalPrice?: string;
  selectedActivitiesBefore?: string;
  selectedActivitiesAfter?: string;
}

function refundNoteBox(opts: {
  refundStatus?: 'refunded' | 'partial' | 'manual' | 'failed' | 'none';
  refundNote?: string;
  refundedAmount?: number;
}): string {
  if (!opts.refundStatus || opts.refundStatus === 'none') return '';
  if (opts.refundStatus === 'refunded') {
    return highlightBox(
      `<p style="margin:0;font-size:14px;color:#166534;">$${(opts.refundedAmount ?? 0).toFixed(2)} has been refunded to your original payment method.</p>`,
      'green',
    );
  }
  if (opts.refundStatus === 'failed') {
    return highlightBox(
      '<p style="margin:0;font-size:14px;color:#92400e;">We couldn&apos;t process your refund automatically — our team has been notified and will follow up.</p>',
      'amber',
    );
  }
  // 'partial' or 'manual'
  return highlightBox(`<p style="margin:0;font-size:14px;color:#92400e;">${opts.refundNote || 'Part of your refund will be handled manually by the committee.'}</p>`, 'amber');
}

interface PerformanceSlot { activityId: string; performers: string[]; chestNumber?: number }

/** Groups flat activity registrations by slotId — one entry per performance, co-performers combined. */
function groupActivitySlots(selectedActivitiesJson: string | undefined): Map<string, PerformanceSlot> {
  const slots = new Map<string, PerformanceSlot>();
  if (!selectedActivitiesJson) return slots;
  let regs: EmailActivityRegistration[];
  try {
    regs = JSON.parse(selectedActivitiesJson);
  } catch {
    return slots;
  }
  if (!Array.isArray(regs)) return slots;
  for (const r of regs) {
    if (!r.activityId) continue;
    const key = r.slotId || r.activityId;
    if (!slots.has(key)) slots.set(key, { activityId: r.activityId, performers: [], chestNumber: r.chestNumber });
    if (r.participantName) slots.get(key)!.performers.push(r.participantName);
  }
  return slots;
}

function slotLabel(slot: PerformanceSlot, activities: EmailActivityConfig[]): string {
  const name = activities.find((a) => a.id === slot.activityId)?.name || slot.activityId;
  const withPerformers = slot.performers.length > 0 ? `${name} (${slot.performers.join(', ')})` : name;
  return slot.chestNumber !== undefined ? `${withPerformers} — Chest #${slot.chestNumber}` : withPerformers;
}

/** One row per performance, co-performers combined. */
function activitiesSection(selectedActivitiesJson: string | undefined, activities: EmailActivityConfig[]): string {
  const slots = groupActivitySlots(selectedActivitiesJson);
  if (slots.size === 0) return '';
  const rows = Array.from(slots.entries()).map(([, slot]) => {
    const name = activities.find((a) => a.id === slot.activityId)?.name || slot.activityId;
    const label = slot.chestNumber !== undefined ? `${name} (Chest #${slot.chestNumber})` : name;
    return [label, slot.performers.join(', ') || '—'] as [string, string];
  });
  return sectionCard('🎭 Performance Registrations', detailsTable(rows));
}

/**
 * Describes what changed between two selectedActivities snapshots —
 * performances added or removed outright, and performers added to or
 * removed from a performance that already existed in both (e.g. a second
 * dancer joining an existing slot), which a same-slot-key check alone would
 * otherwise miss entirely.
 */
function diffActivities(beforeJson: string | undefined, afterJson: string | undefined, activities: EmailActivityConfig[]): string[] {
  const before = groupActivitySlots(beforeJson);
  const after = groupActivitySlots(afterJson);
  const notes: string[] = [];

  Array.from(after.entries()).forEach(([key, slot]) => {
    const beforeSlot = before.get(key);
    if (!beforeSlot) {
      notes.push(`Added performance: ${slotLabel(slot, activities)}`);
      return;
    }
    const name = activities.find((a) => a.id === slot.activityId)?.name || slot.activityId;
    const addedPerformers = slot.performers.filter((p) => !beforeSlot.performers.includes(p));
    const removedPerformers = beforeSlot.performers.filter((p) => !slot.performers.includes(p));
    if (addedPerformers.length > 0) notes.push(`Added performer to ${name}: ${addedPerformers.join(', ')}`);
    if (removedPerformers.length > 0) notes.push(`Removed performer from ${name}: ${removedPerformers.join(', ')}`);
  });
  Array.from(before.entries()).forEach(([key, slot]) => {
    if (!after.has(key)) notes.push(`Removed performance: ${slotLabel(slot, activities)}`);
  });
  return notes;
}

/** Itemized price breakdown when available, otherwise a flat total/method row. */
function paymentSection(opts: { priceBreakdownJson?: string; totalPrice: string; paymentMethod?: string }): string {
  let breakdown: EmailPriceBreakdown | null = null;
  if (opts.priceBreakdownJson) {
    try {
      breakdown = JSON.parse(opts.priceBreakdownJson);
    } catch { /* fall through to flat total */ }
  }

  if (!breakdown || (breakdown.lineItems.length === 0 && breakdown.discounts.length === 0)) {
    const rows: ([string, string] | null)[] = [
      ['Total', `$${opts.totalPrice}`],
      opts.paymentMethod ? ['Payment Method', opts.paymentMethod] : null,
    ];
    return opts.totalPrice !== '0' ? sectionCard('💳 Payment', detailsTable(rows)) : '';
  }

  const rows: [string, string][] = [
    ...breakdown.lineItems.map((li) => [li.label, `$${li.amount.toFixed(2)}`] as [string, string]),
    ...breakdown.discounts.map((d) => [d.label, `-$${Math.abs(d.amount).toFixed(2)}`] as [string, string]),
  ];
  if (opts.paymentMethod) rows.push(['Payment Method', opts.paymentMethod]);
  rows.push(['Total', `$${breakdown.total.toFixed(2)}`]);

  return sectionCard('💳 Payment', detailsTable(rows));
}

const HISTORY_LABELS: Record<string, string> = {
  registered: 'Registered',
  edited: 'Registration edited',
  charge: 'Payment charged',
  refund: 'Refund issued',
  cancelled: 'Registration cancelled',
};

function parseSnapshot(json: string | undefined): EditSnapshot | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export interface HistoryRow {
  date: string;
  /**
   * Plain-text lines (never pre-rendered HTML) — a performer/participant name
   * embedded in one of these can contain arbitrary text, so callers must
   * render each line as escaped text (React text content, not
   * dangerouslySetInnerHTML) rather than trust it as markup. The email
   * builder is the one place that's safe to `<br/>`-join these into HTML,
   * since nodemailer output isn't executed in a DOM/session the way an
   * admin dashboard page would be.
   */
  lines: string[];
  type: string;
}

/**
 * Chronological, human-readable description of everything that's happened on
 * a registration — not just the event type. Shared by the lifecycle email's
 * historySection() and the in-app payment/registration history views (admin
 * and member portal) so the wording only has to be right in one place.
 */
export function buildHistoryRows(entries: EmailLedgerEntry[], activities: EmailActivityConfig[]): HistoryRow[] {
  return entries.map((e) => {
    const date = new Date(e.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });

    if (e.type === 'charge' || e.type === 'refund') {
      const label = HISTORY_LABELS[e.type] || e.type;
      const line = e.amount ? `${label} — $${e.amount}${e.method ? ` (${e.method})` : ''}` : label;
      return { date, lines: [line], type: e.type };
    }

    if (e.type === 'edited') {
      const snap = parseSnapshot(e.snapshot);
      const activityNotes = snap ? diffActivities(snap.selectedActivitiesBefore, snap.selectedActivitiesAfter, activities) : [];
      const summary = snap ? `Adults: ${snap.adults ?? 0}, Kids: ${snap.kids ?? 0}, Total: $${snap.totalPrice ?? '0'}` : '';
      const lines = [...activityNotes, summary].filter(Boolean);
      return { date, lines: lines.length > 0 ? lines : ['Registration edited'], type: e.type };
    }

    if (e.type === 'registered') {
      const snap = parseSnapshot(e.snapshot);
      const line = snap ? `Registered — Adults: ${snap.adults ?? 0}, Kids: ${snap.kids ?? 0}, Total: $${snap.totalPrice ?? '0'}` : 'Registered';
      return { date, lines: [line], type: e.type };
    }

    return { date, lines: [HISTORY_LABELS[e.type] || e.type], type: e.type };
  });
}

/** Chronological list of everything that's happened on this registration, with specifics — not just the event type. */
function historySection(entries: EmailLedgerEntry[], activities: EmailActivityConfig[]): string {
  if (entries.length === 0) return '';
  const rows: [string, string][] = buildHistoryRows(entries, activities).map((r) => [r.date, r.lines.join('<br/>')]);
  return sectionCard('📜 Registration History', detailsTable(rows));
}

export function buildRegistrationLifecycleEmail(opts: {
  type: 'created' | 'updated' | 'cancelled' | 'event_cancelled';
  eventName: string;
  eventDate: string;
  participantName: string;
  adults: number;
  kids: number;
  registrationStatus?: string;
  totalPrice: string;
  priceBreakdownJson?: string;
  paymentMethod?: string;
  selectedActivitiesJson?: string;
  activities?: EmailActivityConfig[];
  additionalAmountCharged?: string;
  refundStatus?: 'refunded' | 'partial' | 'manual' | 'failed' | 'none';
  refundNote?: string;
  refundedAmount?: number;
  history?: EmailLedgerEntry[];
  eventHomeUrl?: string;
  eventDescription?: string;
  customEmailMessage?: string;
}): string {
  const isWaitlist = opts.registrationStatus === 'waitlist';
  const headerTitle = {
    created: isWaitlist ? 'Added to Waitlist' : 'Registration Confirmed!',
    updated: 'Registration Updated',
    cancelled: 'Registration Cancelled',
    event_cancelled: 'Event Cancelled',
  }[opts.type];
  const headerColor = {
    created: 'linear-gradient(135deg,#1e40af,#2563eb)',
    updated: 'linear-gradient(135deg,#1e40af,#2563eb)',
    cancelled: 'linear-gradient(135deg,#475569,#64748b)',
    event_cancelled: 'linear-gradient(135deg,#b91c1c,#dc2626)',
  }[opts.type];
  const accentColor = opts.type === 'cancelled' || opts.type === 'event_cancelled' ? '#475569' : '#2563eb';
  const subtitle = {
    created: isWaitlist
      ? `You've been added to the waitlist for <strong>${opts.eventName}</strong>. We'll notify you if a spot opens up.`
      : `You're registered for <strong>${opts.eventName}</strong>.`,
    updated: `Your registration for <strong>${opts.eventName}</strong> has been updated. Here's your current registration:`,
    cancelled: `Your registration for <strong>${opts.eventName}</strong> has been cancelled.`,
    event_cancelled: `<strong>${opts.eventName}</strong> has been cancelled by the organizers. Your registration below is no longer active.`,
  }[opts.type];

  const detailRows: ([string, string] | null)[] = [
    ['Event', opts.eventName],
    opts.adults > 0 ? ['Adults', String(opts.adults)] : null,
    opts.kids > 0 ? ['Kids', String(opts.kids)] : null,
    isWaitlist ? ['Status', 'On Waitlist'] : null,
  ];

  const additionalChargeBox = opts.additionalAmountCharged && parseFloat(opts.additionalAmountCharged) > 0
    ? highlightBox(`<p style="margin:0;font-size:14px;color:#1e40af;">An additional $${opts.additionalAmountCharged} was charged to your ${opts.paymentMethod || 'payment method'}.</p>`, 'blue')
    : '';

  return emailLayout({
    headerTitle,
    headerSubtitle: opts.eventName,
    headerColor,
    body: `
      <p style="font-size:15px;color:#1e293b;margin:0 0 6px;font-weight:600;">Hi ${opts.participantName},</p>
      <p style="font-size:14px;color:#475569;line-height:1.65;margin:0 0 20px;">${subtitle}</p>
      ${opts.eventDescription ? `
      <div style="background:#f8fafc;border-radius:10px;padding:14px 18px;margin-bottom:20px;border:1px solid #e2e8f0;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:${accentColor};text-transform:uppercase;letter-spacing:0.6px;">About this Event</p>
        <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">${opts.eventDescription}</p>
      </div>` : ''}
      ${detailsTable(detailRows)}
      ${opts.type !== 'cancelled' ? activitiesSection(opts.selectedActivitiesJson, opts.activities || []) : ''}
      ${paymentSection({ priceBreakdownJson: opts.priceBreakdownJson, totalPrice: opts.totalPrice, paymentMethod: opts.paymentMethod })}
      ${additionalChargeBox}
      ${refundNoteBox(opts)}
      ${historySection(opts.history || [], opts.activities || [])}
      ${opts.customEmailMessage ? `
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;margin-top:20px;">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.6px;">📌 Important Information</p>
        <div style="font-size:13px;color:#78350f;line-height:1.65;">${opts.customEmailMessage}</div>
      </div>` : ''}
      ${opts.eventHomeUrl ? `
      <div style="text-align:center;margin-top:24px;">
        <a href="${opts.eventHomeUrl}" style="display:inline-block;background:${accentColor};color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;padding:10px 28px;border-radius:8px;">View Event Page</a>
      </div>` : ''}
    `,
  });
}
