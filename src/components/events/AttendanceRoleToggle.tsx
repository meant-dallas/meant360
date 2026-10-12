'use client';

interface AttendanceRoleToggleProps {
  name: string;
  isParticipant: boolean;
  onChange: (isParticipant: boolean) => void;
  attendeeLabel: string;
  participantLabel: string;
}

// Segmented-pill control for the General Attendance roster's Attendee vs
// Participant role — native radio inputs underneath (keyboard/screen-reader
// accessible, real form semantics) but styled as one filled pill instead of
// two easy-to-miss radio dots. Shared by the registration page and the
// check-in walk-in flow so both stay visually and behaviorally identical.
export default function AttendanceRoleToggle({ name, isParticipant, onChange, attendeeLabel, participantLabel }: AttendanceRoleToggleProps) {
  const options: [boolean, string][] = [[false, attendeeLabel], [true, participantLabel]];
  return (
    <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-0.5">
      {options.map(([value, label]) => (
        <label key={String(value)} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            className="peer sr-only"
            checked={isParticipant === value}
            onChange={() => onChange(value)}
          />
          <span className="block px-3 py-1 rounded-full text-xs font-medium text-slate-500 transition-colors peer-checked:bg-primary-600 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-primary-400 peer-focus-visible:ring-offset-1">
            {label}
          </span>
        </label>
      ))}
    </div>
  );
}
