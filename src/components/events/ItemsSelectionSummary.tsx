'use client';

import { formatCurrency } from '@/lib/utils';

export interface SelectionSummaryRow {
  label: string;
  amount: number;
  participants?: string[];
}

interface ItemsSelectionSummaryProps {
  rows: SelectionSummaryRow[];
  generalAttendanceRoster?: string[];
  additionalInfo?: { label: string; value: string }[];
}

// Structured per-item/entry recap — replaces the old flat, comma-joined
// item-name string (which read as a confusing run-on sentence once entry
// types and participant names were involved). Shared by the "You're
// Registered" screen and the post-submit success screen so both show the
// same shape of detail.
export default function ItemsSelectionSummary({ rows, generalAttendanceRoster, additionalInfo }: ItemsSelectionSummaryProps) {
  if (rows.length === 0 && (!generalAttendanceRoster || generalAttendanceRoster.length === 0)) return null;

  return (
    <div className="space-y-2">
      {generalAttendanceRoster && generalAttendanceRoster.length > 0 && (
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-sm font-medium text-slate-900">Attendees</p>
          <ul className="mt-1 space-y-0.5 pl-3 border-l-2 border-slate-200">
            {generalAttendanceRoster.map((name, i) => (
              <li key={i} className="text-xs text-slate-500">{name}</li>
            ))}
          </ul>
        </div>
      )}
      {rows.map((row, i) => (
        <div key={i} className="bg-slate-50 rounded-lg p-3">
          <div className="flex justify-between items-start gap-3">
            <span className="text-sm font-medium text-slate-900">{row.label}</span>
            {row.amount > 0 && (
              <span className="text-sm font-mono tabular-nums text-slate-700 shrink-0">{formatCurrency(row.amount)}</span>
            )}
          </div>
          {row.participants && row.participants.length > 0 && (
            <ul className="mt-1 space-y-0.5 pl-3 border-l-2 border-slate-200">
              {row.participants.map((p, j) => (
                <li key={j} className="text-xs text-slate-500">{p}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {additionalInfo && additionalInfo.length > 0 && (
        <div className="bg-slate-50 rounded-lg p-3 space-y-1">
          {additionalInfo.map((a, i) => (
            <div key={i} className="flex justify-between gap-3 text-sm">
              <span className="text-slate-500 shrink-0">{a.label}</span>
              <span className="text-slate-900 text-right">{a.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
