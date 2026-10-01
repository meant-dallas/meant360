// Shared "is this member currently active" check for the items registration
// model. Deliberately keyed off Member.status (not a per-year membership
// record) — a simpler, agreed-on interim definition of "active in the
// running year" pending a future per-year renewal tracking pass.
export function isMemberActive(status: string | null | undefined): boolean {
  return status === 'Active';
}
