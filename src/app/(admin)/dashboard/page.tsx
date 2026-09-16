import { redirect } from 'next/navigation';

// Superseded by /accounting, which reads from the unified ledger instead of
// the legacy Income/Expense/Sponsor tables this page used to read from.
// Kept as a redirect so old bookmarks/links still land somewhere useful.
export default function DashboardRedirectPage() {
  redirect('/accounting');
}
