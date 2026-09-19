import { emailLayout, detailsTable, sectionCard, highlightBox, actionButton, sponsorsSection } from './email-templates';
import type { PublicSponsor } from '@/types';

// Confirmation/update email for the generic Items registration model —
// distinct from buildRegistrationLifecycleEmail (legacy adults/kids/single
// "activities" shape) since items-model registrations carry a flat cart of
// items/entries with their own participants and per-entry-type questions.

export interface ItemsEmailLineItem {
  label: string; // e.g. "Room 101" or "Participation Details (Singing)"
  amount: number;
  participants?: string[]; // pre-formatted "Name (Field: value, ...)" strings — Activity entries only
}

export interface ItemsEmailPriceBreakdown {
  lineItems: { label: string; amount: number }[];
  discounts: { label: string; amount: number }[];
  total: number;
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

// Table-based layout throughout (not flexbox) — many email clients,
// notably Outlook desktop, don't support flexbox at all.
function itemsSection(heading: string, items: ItemsEmailLineItem[]): string {
  if (items.length === 0) return '';
  const rows = items.map((it) => `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;font-weight:600;vertical-align:top;">
        ${it.label}
        ${(it.participants && it.participants.length > 0) ? `
          <ul style="margin:6px 0 0;padding-left:18px;font-weight:400;">
            ${it.participants.map((p) => `<li style="font-size:12px;color:#64748b;">${p}</li>`).join('')}
          </ul>
        ` : ''}
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;font-family:monospace;text-align:right;vertical-align:top;white-space:nowrap;">${money(it.amount)}</td>
    </tr>
  `).join('');
  return sectionCard(heading, `<table style="width:100%;border-collapse:collapse;">${rows}</table>`);
}

function priceBreakdownSection(pb: ItemsEmailPriceBreakdown): string {
  const discountRows = pb.discounts.map((d) => `
    <tr>
      <td style="padding:4px 0;font-size:13px;color:#059669;">${d.label}</td>
      <td style="padding:4px 0;font-size:13px;color:#059669;font-family:monospace;text-align:right;">-${money(Math.abs(d.amount))}</td>
    </tr>
  `).join('');
  return sectionCard('Total', `
    <table style="width:100%;border-collapse:collapse;">
      ${discountRows}
      <tr>
        <td style="padding-top:8px;${pb.discounts.length > 0 ? 'border-top:1px solid #e2e8f0;' : ''}font-size:16px;font-weight:700;color:#1e293b;">Total</td>
        <td style="padding-top:8px;${pb.discounts.length > 0 ? 'border-top:1px solid #e2e8f0;' : ''}font-size:16px;font-weight:700;color:#1e293b;font-family:monospace;text-align:right;">${money(pb.total)}</td>
      </tr>
    </table>
  `);
}

export function buildItemsRegistrationEmail(opts: {
  type: 'created' | 'updated' | 'cancelled' | 'item_cancelled';
  eventName: string;
  eventDate: string;
  contactName: string;
  registrationStatus: string; // confirmed | waitlist | cancelled
  attendeeCount: number;
  generalAttendanceRoster?: string[]; // pre-formatted "Name (Age)" strings
  items: ItemsEmailLineItem[];
  priceBreakdown: ItemsEmailPriceBreakdown;
  paymentStatus: string;
  paymentMethod?: string;
  // Accurate refund status for a cancellation — never overstates a refund
  // that didn't actually happen (see src/lib/refund-outcome.ts). Rendered
  // as its own callout with a tone-matched color.
  refundMessage?: { message: string; tone: 'success' | 'warning' | 'error' };
  additionalInfo?: { label: string; value: string }[];
  eventHomeUrl?: string;
  eventDescription?: string;
  eventSponsors?: PublicSponsor[];
  generalSponsors?: PublicSponsor[];
}): string {
  const isWaitlist = opts.registrationStatus === 'waitlist';
  const isCancelled = opts.type === 'cancelled';
  const isItemCancelled = opts.type === 'item_cancelled';

  const headerTitle = isCancelled
    ? 'Registration Cancelled'
    : isItemCancelled
      ? 'Item Cancelled'
      : isWaitlist
        ? "You're on the Waitlist"
        : opts.type === 'updated'
          ? 'Registration Updated'
          : 'Registration Confirmed';

  const headerColor = isCancelled || isItemCancelled
    ? 'linear-gradient(135deg,#64748b,#475569)'
    : isWaitlist
      ? 'linear-gradient(135deg,#b45309,#d97706)'
      : 'linear-gradient(135deg,#1e40af,#2563eb)';

  const greeting = isCancelled
    ? `<p style="margin:0;font-size:14px;color:#334155;">Hi ${opts.contactName}, your registration for <strong>${opts.eventName}</strong> has been cancelled.</p>`
    : isItemCancelled
      ? `<p style="margin:0;font-size:14px;color:#334155;">Hi ${opts.contactName}, an item on your registration for <strong>${opts.eventName}</strong> has been cancelled. The rest of your registration is unchanged.</p>`
      : isWaitlist
        ? `<p style="margin:0;font-size:14px;color:#92400e;">Hi ${opts.contactName}, ${opts.eventName} is currently full. You've been added to the waitlist and we'll reach out if a spot opens up.</p>`
        : `<p style="margin:0;font-size:14px;color:#1e40af;">Hi ${opts.contactName}, ${opts.type === 'updated' ? 'your registration has been updated' : "you're all set"} for <strong>${opts.eventName}</strong>.</p>`;

  const paymentLabel = opts.paymentStatus === 'paid'
    ? `Paid${opts.paymentMethod ? ` via ${opts.paymentMethod}` : ''}`
    : opts.paymentStatus === 'pending_zelle'
      ? 'Pending — Zelle payment being confirmed'
      : opts.priceBreakdown.total > 0 ? 'Unpaid' : 'Free';

  const detailRows = detailsTable([
    ['Event', opts.eventName],
    ['Date', opts.eventDate],
    !isItemCancelled ? ['Status', isCancelled ? 'Cancelled' : isWaitlist ? 'Waitlisted' : 'Confirmed'] : null,
    !isItemCancelled ? ['Attendees', String(opts.attendeeCount)] : null,
    (!isCancelled && !isItemCancelled && (opts.priceBreakdown.total > 0 || opts.paymentStatus)) ? ['Payment', paymentLabel] : null,
  ]);

  const gaSection = opts.generalAttendanceRoster && opts.generalAttendanceRoster.length > 0
    ? sectionCard('Attendees', `<ul style="margin:0;padding-left:18px;">${opts.generalAttendanceRoster.map((n) => `<li style="font-size:13px;color:#1e293b;">${n}</li>`).join('')}</ul>`)
    : '';

  const additionalInfoSection = opts.additionalInfo && opts.additionalInfo.length > 0
    ? sectionCard('Additional Information', detailsTable(opts.additionalInfo.map((a) => [a.label, a.value] as [string, string])))
    : '';

  const refundBox = opts.refundMessage
    ? highlightBox(`<p style="margin:0;font-size:14px;">${opts.refundMessage.message}</p>`, opts.refundMessage.tone === 'success' ? 'green' : opts.refundMessage.tone === 'error' ? 'amber' : 'amber')
    : '';

  const body = `
    ${highlightBox(greeting, isCancelled || isItemCancelled ? 'blue' : isWaitlist ? 'amber' : 'blue')}
    ${detailRows ? sectionCard('Details', detailRows) : ''}
    ${gaSection}
    ${itemsSection(isItemCancelled ? 'Cancelled Item' : 'Items', opts.items)}
    ${refundBox}
    ${(!isCancelled && !isItemCancelled && opts.priceBreakdown.lineItems.length > 0) ? priceBreakdownSection(opts.priceBreakdown) : ''}
    ${additionalInfoSection}
    ${opts.eventHomeUrl ? actionButton('View Event Page', opts.eventHomeUrl) : ''}
    ${sponsorsSection(opts.eventSponsors || [], opts.generalSponsors || [])}
  `;

  return emailLayout({ headerTitle, headerSubtitle: opts.eventName, headerColor, body });
}

// ========================================
// Admin/committee alert — sent to the event category's contact email
// whenever a registration is created, edited, or cancelled (same recipient
// resolution as the legacy model's "new registration" alert). Distinct from
// the registrant-facing email above: framed in the third person, includes
// contact info for follow-up, and (for cancellations) states the refund
// outcome plainly so the committee knows whether money still needs handling.
// ========================================

export function buildItemsRegistrationAdminAlertEmail(opts: {
  action: 'created' | 'updated' | 'cancelled' | 'item_cancelled';
  eventName: string;
  eventDate: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  registrationStatus: string;
  attendeeCount: number;
  items: ItemsEmailLineItem[];
  totalPrice: number;
  paymentStatus: string;
  paymentMethod?: string;
  refundMessage?: { message: string; tone: 'success' | 'warning' | 'error' };
}): string {
  const actionLabel = {
    created: 'New Registration',
    updated: 'Registration Updated',
    cancelled: 'Registration Cancelled',
    item_cancelled: 'Item Cancelled',
  }[opts.action];

  const headerColor = opts.action === 'cancelled' || opts.action === 'item_cancelled'
    ? 'linear-gradient(135deg,#64748b,#475569)'
    : opts.action === 'updated'
      ? 'linear-gradient(135deg,#b45309,#d97706)'
      : 'linear-gradient(135deg,#1e40af,#2563eb)';

  const contactRows = detailsTable([
    ['Name', opts.contactName],
    ['Email', opts.contactEmail],
    opts.contactPhone ? ['Phone', opts.contactPhone] : null,
    ['Event', opts.eventName],
    ['Date', opts.eventDate],
    ['Status', opts.registrationStatus],
    ['Attendees', String(opts.attendeeCount)],
    opts.totalPrice > 0 || opts.paymentStatus ? ['Total', `${money(opts.totalPrice)}${opts.paymentStatus === 'paid' ? ` (Paid${opts.paymentMethod ? ` via ${opts.paymentMethod}` : ''})` : opts.paymentStatus ? ` (${opts.paymentStatus})` : ''}`] : null,
  ]);

  const refundBox = opts.refundMessage
    ? highlightBox(`<p style="margin:0;font-size:14px;">${opts.refundMessage.message}</p>`, opts.refundMessage.tone === 'success' ? 'green' : 'amber')
    : '';

  const body = `
    ${sectionCard('Registrant', contactRows)}
    ${itemsSection(opts.action === 'item_cancelled' ? 'Cancelled Item' : 'Items', opts.items)}
    ${refundBox}
  `;

  return emailLayout({ headerTitle: actionLabel, headerSubtitle: opts.eventName, headerColor, body });
}
