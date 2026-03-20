import { getAppUrl } from '@/lib/app-url';

const WHATSAPP_GROUPS = [
  { name: 'MEANT Community Group 1', url: 'https://chat.whatsapp.com/BsetghMXame7JgBwPoOX9j' },
  { name: 'MEANT Community Group 2', url: 'https://chat.whatsapp.com/EV6WDukWhB3CGU4aq7OtcM' },
];

// ========================================
// Shared Styles
// ========================================

const styles = {
  sectionTitle: 'font-size:14px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.5px;padding-bottom:8px;border-bottom:2px solid #2563eb;margin-bottom:12px;',
  table: 'width:100%;border-collapse:collapse;',
  th: 'text-align:left;padding:8px 12px;color:#64748b;font-size:13px;font-weight:600;width:40%;vertical-align:top;',
  td: 'padding:8px 12px;color:#1e293b;font-size:13px;vertical-align:top;',
  rowEven: 'background-color:#f8fafc;',
  card: 'background:#ffffff;border-radius:12px;padding:24px;margin-bottom:20px;border:1px solid #e2e8f0;',
  qrCard: 'display:inline-block;text-align:center;margin:8px;padding:12px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;vertical-align:top;',
  btnPrimary: 'display:inline-block;padding:14px 28px;background-color:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;',
  btnSecondary: 'display:inline-block;padding:12px 24px;background-color:#f1f5f9;color:#2563eb;text-decoration:none;border-radius:8px;font-weight:600;font-size:13px;border:1px solid #e2e8f0;',
  badge: (color: string, bg: string) => `display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;color:${color};background:${bg};`,
};

// ========================================
// QR Code Helper
// ========================================

function qrUrl(link: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(link)}`;
}

// ========================================
// Layout Wrapper
// ========================================

export function emailLayout(opts: {
  headerTitle: string;
  headerSubtitle?: string;
  headerColor?: string;
  body: string;
}): string {
  const appUrl = getAppUrl();
  const gradient = opts.headerColor || 'linear-gradient(135deg,#1e40af,#2563eb)';

  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;background-color:#f1f5f9;padding:20px;">
      <!-- Header -->
      <div style="background:${gradient};border-radius:14px 14px 0 0;padding:32px 24px;text-align:center;">
        <img src="${appUrl}/logo.png" alt="MEANT" width="64" height="64" style="border-radius:12px;margin-bottom:12px;" />
        <h1 style="color:#ffffff;font-size:24px;margin:0 0 4px;">${opts.headerTitle}</h1>
        ${opts.headerSubtitle ? `<p style="color:#bfdbfe;font-size:14px;margin:0;">${opts.headerSubtitle}</p>` : ''}
      </div>

      <!-- Body -->
      <div style="background:#ffffff;border-radius:0 0 14px 14px;padding:32px 24px;">
        ${opts.body}

        <!-- Footer -->
        <div style="text-align:center;margin-top:24px;padding-top:20px;border-top:1px solid #e2e8f0;">
          <p style="font-size:13px;color:#64748b;margin:0 0 4px;">We look forward to seeing you at our upcoming events!</p>
          <p style="font-size:12px;color:#94a3b8;margin:0;">
            &copy; ${new Date().getFullYear()} MEANT (Malayalee Engineers' Association of North Texas)
          </p>
        </div>
      </div>
    </div>
  `;
}

// ========================================
// Reusable Sections
// ========================================

export function detailsTable(rows: ([string, string] | null)[]): string {
  const filtered = rows.filter(Boolean) as [string, string][];
  if (filtered.length === 0) return '';
  return `<table style="${styles.table}">
    ${filtered.map(([label, value], i) =>
      `<tr style="${i % 2 === 0 ? styles.rowEven : ''}"><td style="${styles.th}">${label}</td><td style="${styles.td}">${value}</td></tr>`
    ).join('')}
  </table>`;
}

export function sectionCard(title: string, content: string): string {
  return `
    <div style="${styles.card}">
      <h3 style="${styles.sectionTitle}">${title}</h3>
      ${content}
    </div>`;
}

export function highlightBox(content: string, color: 'blue' | 'green' | 'amber' = 'blue'): string {
  const colorMap = {
    blue: { bg: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '#93c5fd', heading: '#1e40af' },
    green: { bg: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: '#86efac', heading: '#166534' },
    amber: { bg: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '#fcd34d', heading: '#92400e' },
  };
  const c = colorMap[color];
  return `<div style="background:${c.bg};border-radius:10px;padding:16px 20px;margin-bottom:24px;border:1px solid ${c.border};">${content}</div>`;
}

export function memberDetailsSection(app: Record<string, string>): string {
  const address = (() => { try { return JSON.parse(app.address || '{}'); } catch { return {}; } })();
  const addressStr = [address.street, address.street2, address.city, address.state, address.zipCode, address.country]
    .filter(Boolean).join(', ');

  return detailsTable([
    ['Name', `${app.firstName} ${app.middleName || ''} ${app.lastName}`.replace(/\s+/g, ' ').trim()],
    ['Email', app.email],
    ['Phone', app.phone || app.cellPhone || app.homePhone || '-'],
    app.cellPhone ? ['Cell Phone', app.cellPhone] : null,
    app.homePhone ? ['Home Phone', app.homePhone] : null,
    ['Qualifying Degree', app.qualifyingDegree || '-'],
    ['College', app.college || '-'],
    ['Job Title', app.jobTitle || '-'],
    ['Employer', app.employer || '-'],
    app.nativePlace ? ['Native Place', app.nativePlace] : null,
    app.specialInterests ? ['Special Interests', app.specialInterests] : null,
    addressStr ? ['Address', addressStr] : null,
  ]);
}

export function spouseSection(app: Record<string, string>): string {
  const spouse = (() => { try { return JSON.parse(app.spouse || '{}'); } catch { return {}; } })();
  const spouseName = [spouse.firstName, spouse.middleName, spouse.lastName].filter(Boolean).join(' ');
  if (!spouseName) return '';

  const rows = detailsTable([
    ['Name', spouseName],
    spouse.email ? ['Email', spouse.email] : null,
    spouse.phone ? ['Phone', spouse.phone] : null,
    spouse.company ? ['Company', spouse.company] : null,
    spouse.college ? ['College', spouse.college] : null,
    spouse.qualifyingDegree ? ['Qualifying Degree', spouse.qualifyingDegree] : null,
    spouse.nativePlace ? ['Native Place', spouse.nativePlace] : null,
  ]);

  return sectionCard('Spouse Information', rows);
}

export function childrenSection(app: Record<string, string>): string {
  const children: Array<{ name: string; age?: string; sex?: string; grade?: string }> =
    (() => { try { return JSON.parse(app.children || '[]'); } catch { return []; } })();
  const valid = children.filter(c => c.name?.trim());
  if (valid.length === 0) return '';

  const headerRow = `<tr style="background-color:#f1f5f9;">
    <td style="${styles.th}">Name</td><td style="${styles.th}">Age</td><td style="${styles.th}">Sex</td><td style="${styles.th}">Grade</td>
  </tr>`;
  const dataRows = valid.map((c, i) =>
    `<tr style="${i % 2 === 0 ? styles.rowEven : ''}"><td style="${styles.td}">${c.name}</td><td style="${styles.td}">${c.age || '-'}</td><td style="${styles.td}">${c.sex || '-'}</td><td style="${styles.td}">${c.grade || '-'}</td></tr>`
  ).join('');

  return sectionCard('Children', `<table style="${styles.table}">${headerRow}${dataRows}</table>`);
}

export function sponsorSection(app: Record<string, string>): string {
  if (!app.sponsorName) return '';
  return sectionCard('Sponsoring Member', detailsTable([
    ['Name', app.sponsorName],
    ['Email', app.sponsorEmail || '-'],
    ['Phone', app.sponsorPhone || '-'],
  ]));
}

export function membershipInfoBox(app: Record<string, string>): string {
  return highlightBox(`
    <h3 style="font-size:14px;font-weight:700;color:#1e40af;margin:0 0 8px;">Membership Details</h3>
    ${detailsTable([
      ['Membership Type', app.membershipType || 'Standard'],
      app.amountPaid && app.amountPaid !== '0' ? ['Amount Paid', `$${app.amountPaid}`] : null,
      app.paymentMethod ? ['Payment Method', app.paymentMethod] : null,
      app.paymentStatus ? ['Payment Status', app.paymentStatus] : null,
    ])}
  `, 'blue');
}

export function whatsappSection(): string {
  const qrCards = WHATSAPP_GROUPS.map((g, i) =>
    `<div style="${styles.qrCard}">
      <img src="${qrUrl(g.url)}" alt="WhatsApp QR ${i + 1}" width="140" height="140" style="border-radius:8px;display:block;margin:0 auto 8px;" />
      <p style="margin:0;font-size:13px;font-weight:700;color:#25D366;">WhatsApp: ${g.name}</p>
      <a href="${g.url}" style="font-size:11px;color:#2563eb;word-break:break-all;">${g.url}</a>
    </div>`
  ).join('');

  return sectionCard('Join Our WhatsApp Community',
    `<p style="font-size:13px;color:#475569;margin:0 0 16px;">
      Scan the QR code or click the link to join our WhatsApp groups for event announcements and updates:
    </p>
    <div style="text-align:center;">${qrCards}</div>`
  );
}

export function socialMediaSection(socialLinks: { instagram: string; facebook: string; linkedin: string; youtube: string }): string {
  const items: { name: string; url: string; color: string; icon: string }[] = [];
  if (socialLinks.facebook) items.push({ name: 'Facebook', url: socialLinks.facebook, color: '#1877F2', icon: 'Facebook' });
  if (socialLinks.instagram) items.push({ name: 'Instagram', url: socialLinks.instagram, color: '#E4405F', icon: 'Instagram' });
  if (socialLinks.linkedin) items.push({ name: 'LinkedIn', url: socialLinks.linkedin, color: '#0A66C2', icon: 'LinkedIn' });
  if (socialLinks.youtube) items.push({ name: 'YouTube', url: socialLinks.youtube, color: '#FF0000', icon: 'YouTube' });
  if (items.length === 0) return '';

  const qrCards = items.map(s =>
    `<div style="${styles.qrCard}">
      <img src="${qrUrl(s.url)}" alt="${s.name} QR" width="140" height="140" style="border-radius:8px;display:block;margin:0 auto 8px;" />
      <p style="margin:0;font-size:13px;font-weight:700;color:${s.color};">${s.icon}</p>
      <a href="${s.url}" style="font-size:11px;color:#2563eb;word-break:break-all;">${s.url}</a>
    </div>`
  ).join('');

  return sectionCard('Follow Us on Social Media',
    `<p style="font-size:13px;color:#475569;margin:0 0 16px;">Stay connected with MEANT on social media:</p>
    <div style="text-align:center;">${qrCards}</div>`
  );
}

export function actionButton(label: string, url: string, secondary = false): string {
  const style = secondary ? styles.btnSecondary : styles.btnPrimary;
  return `<p style="margin:24px 0;text-align:center;">
    <a href="${url}" style="${style}">${label}</a>
  </p>`;
}

export function getSpouseEmail(app: Record<string, string>): string | null {
  try {
    const spouse = JSON.parse(app.spouse || '{}');
    return spouse.email?.trim() || null;
  } catch {
    return null;
  }
}
