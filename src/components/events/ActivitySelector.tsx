'use client';

import { useState, useEffect, useRef } from 'react';
import type { ActivityConfig, ActivityPricingMode, ActivityRegistration, ActivityMode } from '@/types';
import { getActivityLabels } from '@/lib/event-config';
import { HiOutlineXMark, HiOutlinePlus } from 'react-icons/hi2';

interface PerformanceEntry {
  slotId: string;       // unique per performance slot; shared by co-performers in the same slot
  activityId: string;
  participants: string[];
  chestNumber?: number; // set server-side after registration; read-only in UI
}

interface ActivitySelectorProps {
  activities: ActivityConfig[];
  registrations: ActivityRegistration[];
  activityPricingMode: ActivityPricingMode;
  onChange: (registrations: ActivityRegistration[]) => void;
  activityMaxSlots?: number;   // event-level cap on total unique slots (chest numbers)
  totalActivitySlots?: number; // already-committed slots (from server)
  mode?: ActivityMode;         // 'performance' (default) | 'ticketed_event'
  attendeeNames?: string[];    // ticketed_event mode only — names already collected earlier in the wizard
}

function genSlotId(): string {
  return `slot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function ticketSlotId(index: number): string {
  return `ticket_${index}`;
}

/**
 * Convert flat ActivityRegistration[] → grouped PerformanceEntry[].
 * Groups by slotId so that separate registrations for the same activity
 * (e.g. Dance-Son and Dance-Daughter) are kept as distinct entries.
 */
function toGroups(registrations: ActivityRegistration[]): PerformanceEntry[] {
  const map = new Map<string, { activityId: string; participants: string[]; chestNumber?: number }>();
  const order: string[] = [];
  for (const r of registrations) {
    // slotId is required in new data; fall back to a unique key per entry for legacy data
    const key = r.slotId || `${r.activityId}_legacy_${order.length}`;
    if (!map.has(key)) {
      map.set(key, { activityId: r.activityId, participants: [], chestNumber: r.chestNumber });
      order.push(key);
    }
    if (r.participantName) map.get(key)!.participants.push(r.participantName);
  }
  if (order.length === 0) return [{ slotId: genSlotId(), activityId: '', participants: [''] }];
  return order.map((slotId) => {
    const entry = map.get(slotId)!;
    return {
      slotId,
      activityId: entry.activityId,
      participants: entry.participants.length > 0 ? entry.participants : [''],
      chestNumber: entry.chestNumber,
    };
  });
}

/** Flatten grouped PerformanceEntry[] → ActivityRegistration[]; skips slots with no activity selected */
function toFlat(groups: PerformanceEntry[]): ActivityRegistration[] {
  return groups
    .filter((g) => g.activityId)
    .flatMap((g) =>
      g.participants.map((p) => ({
        slotId: g.slotId,
        activityId: g.activityId,
        participantName: p,
        ...(g.chestNumber !== undefined ? { chestNumber: g.chestNumber } : {}),
      })),
    );
}

/** Per-slot cost: first performer at base price, additional at additionalParticipantPrice */
function calcSlotCost(
  activity: ActivityConfig | undefined,
  participantCount: number,
  activityPricingMode: ActivityPricingMode,
): number {
  if (activityPricingMode !== 'per_activity' || !activity || participantCount === 0) return 0;
  const basePrice = activity.price || 0;
  const addlPrice = activity.additionalParticipantPrice ?? basePrice;
  return basePrice + Math.max(0, participantCount - 1) * addlPrice;
}

export default function ActivitySelector({
  activities,
  registrations,
  activityPricingMode,
  onChange,
  activityMaxSlots,
  totalActivitySlots = 0,
  mode = 'performance',
  attendeeNames = [],
}: ActivitySelectorProps) {
  const [groups, setGroups] = useState<PerformanceEntry[]>(() => toGroups(registrations));
  const prevRegistrationsRef = useRef(registrations);

  // Sync inward only when the parent explicitly clears the list (e.g. "No participation" toggle)
  useEffect(() => {
    const prev = prevRegistrationsRef.current;
    prevRegistrationsRef.current = registrations;
    if (registrations.length === 0 && prev.length !== 0) {
      setGroups([{ slotId: genSlotId(), activityId: '', participants: [''] }]);
    }
  }, [registrations]);

  // Ticketed-event mode: one tier selection per already-named attendee.
  const [selections, setSelections] = useState<string[]>(() =>
    attendeeNames.map((name, i) => {
      const bySlot = registrations.find((r) => r.slotId === ticketSlotId(i));
      if (bySlot) return bySlot.activityId;
      const byName = registrations.find((r) => r.participantName === name);
      return byName ? byName.activityId : '';
    }),
  );

  // Keep selections in sync if the attendee list length changes (e.g. the
  // registrant goes back and edits headcount), preserving existing picks.
  useEffect(() => {
    setSelections((prev) => attendeeNames.map((_, i) => prev[i] || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendeeNames.length]);

  if (activities.length === 0) return null;

  const labels = getActivityLabels(mode);

  if (mode === 'ticketed_event') {
    const updateSelection = (index: number, activityId: string) => {
      const updated = selections.map((s, i) => (i === index ? activityId : s));
      setSelections(updated);
      const flat: ActivityRegistration[] = attendeeNames
        .map((name, i) => (updated[i] ? { slotId: ticketSlotId(i), activityId: updated[i], participantName: name } : null))
        .filter((r): r is ActivityRegistration => r !== null);
      onChange(flat);
    };

    const ticketTotal = selections.reduce((sum, activityId) => {
      const activity = activities.find((a) => a.id === activityId);
      return sum + (activity?.price || 0);
    }, 0);

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          {attendeeNames.map((name, i) => (
            <div key={i} className="flex items-center gap-3 border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50/50 dark:bg-gray-800/20">
              <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{name || `Attendee ${i + 1}`}</span>
              <select
                value={selections[i] || ''}
                onChange={(e) => updateSelection(i, e.target.value)}
                className="select text-sm w-56"
              >
                <option value="">{labels.selectPlaceholder}</option>
                {activities.map((act) => (
                  <option key={act.id} value={act.id}>
                    {act.name}
                    {act.price ? ` — $${act.price}` : ''}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {ticketTotal > 0 && (
          <p className="text-sm text-gray-600 dark:text-gray-400 text-right">
            {labels.registrationNoun} total:{' '}
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              ${ticketTotal.toFixed(2)}
            </span>
          </p>
        )}
      </div>
    );
  }

  // How many slots are already taken (server count). How many new ones this user is adding.
  const pendingSlots = groups.filter((g) => g.activityId).length;
  const isAtCapacity = !!activityMaxSlots && totalActivitySlots >= activityMaxSlots;
  const remainingSlots = activityMaxSlots ? Math.max(0, activityMaxSlots - totalActivitySlots) : Infinity;

  const applyGroups = (updated: PerformanceEntry[]) => {
    setGroups(updated);
    onChange(toFlat(updated));
  };

  const updateGroup = (index: number, partial: Partial<PerformanceEntry>) => {
    applyGroups(groups.map((g, i) => (i === index ? { ...g, ...partial } : g)));
  };

  /** Each click creates a brand-new slot with a fresh slotId — even for the same activity */
  const addGroup = () => {
    setGroups((prev) => [...prev, { slotId: genSlotId(), activityId: '', participants: [''] }]);
  };

  const removeGroup = (index: number) => {
    const updated = groups.filter((_, i) => i !== index);
    applyGroups(updated.length > 0 ? updated : [{ slotId: genSlotId(), activityId: '', participants: [''] }]);
  };

  const addParticipant = (groupIndex: number) => {
    applyGroups(
      groups.map((g, i) =>
        i === groupIndex ? { ...g, participants: [...g.participants, ''] } : g,
      ),
    );
  };

  const removeParticipant = (groupIndex: number, participantIndex: number) => {
    applyGroups(
      groups.map((g, i) => {
        if (i !== groupIndex) return g;
        const participants = g.participants.filter((_, pi) => pi !== participantIndex);
        return { ...g, participants: participants.length > 0 ? participants : [''] };
      }),
    );
  };

  const updateParticipant = (groupIndex: number, participantIndex: number, name: string) => {
    applyGroups(
      groups.map((g, i) => {
        if (i !== groupIndex) return g;
        return { ...g, participants: g.participants.map((p, pi) => (pi === participantIndex ? name : p)) };
      }),
    );
  };

  const runningTotal =
    activityPricingMode === 'per_activity'
      ? groups.reduce((sum, g) => {
          const activity = activities.find((a) => a.id === g.activityId);
          const validCount = g.participants.filter((p) => p.trim()).length;
          return sum + calcSlotCost(activity, validCount, activityPricingMode);
        }, 0)
      : 0;

  return (
    <div className="space-y-4">
      {/* Event-level full banner */}
      {isAtCapacity && (
        <div className="text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3">
          Performance registrations for this event are full ({activityMaxSlots} of {activityMaxSlots} slots taken). You can still register for event entry.
        </div>
      )}

      <div className="space-y-3">
        {groups.map((group, groupIndex) => {
          const activity = activities.find((a) => a.id === group.activityId);
          const basePrice = activity?.price || 0;
          const addlPrice = activity?.additionalParticipantPrice ?? basePrice;
          const validCount = group.participants.filter((p) => p.trim()).length;
          const cost = calcSlotCost(activity, validCount, activityPricingMode);

          return (
            <div
              key={group.slotId}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3 bg-gray-50/50 dark:bg-gray-800/20"
            >
              {/* Performance header */}
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <label className="label">
                    {groups.length > 1 ? `Performance ${groupIndex + 1}` : 'Performance'}
                    {group.chestNumber !== undefined && (
                      <span className="ml-2 text-xs font-normal text-primary-600 dark:text-primary-400">
                        Chest #{group.chestNumber}
                      </span>
                    )}
                  </label>
                  <select
                    value={group.activityId}
                    onChange={(e) => updateGroup(groupIndex, { activityId: e.target.value })}
                    className="select text-sm"
                  >
                    <option value="">Select performance...</option>
                    {activities.map((act) => (
                      <option key={act.id} value={act.id}>
                        {act.name}
                        {activityPricingMode === 'per_activity' && act.price
                          ? ` — $${act.price} per participant`
                          : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {groups.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeGroup(groupIndex)}
                    className="mt-6 p-1.5 text-gray-400 hover:text-red-600 flex-shrink-0"
                    title="Remove this performance"
                  >
                    <HiOutlineXMark className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Participants — shown after a performance is selected */}
              {group.activityId && (
                <div className="space-y-2">
                  <label className="label">Performer(s)</label>
                  {group.participants.map((participant, participantIndex) => (
                    <div key={participantIndex} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={participant}
                        onChange={(e) => updateParticipant(groupIndex, participantIndex, e.target.value)}
                        className="input flex-1 text-sm"
                        placeholder={participantIndex === 0 ? 'Performer name' : `Additional performer ${participantIndex + 1}`}
                      />
                      {group.participants.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeParticipant(groupIndex, participantIndex)}
                          className="p-1.5 text-gray-400 hover:text-red-600 flex-shrink-0"
                          title="Remove performer"
                        >
                          <HiOutlineXMark className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}

                  {/* "Add another performer" only when the activity allows more than 1 participant */}
                  {(!activity?.maxParticipants || activity.maxParticipants > 1) && (
                    <button
                      type="button"
                      onClick={() => addParticipant(groupIndex)}
                      className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                    >
                      <HiOutlinePlus className="w-3.5 h-3.5" /> Add another performer
                    </button>
                  )}

                  {/* Per-slot cost breakdown */}
                  {activityPricingMode === 'per_activity' && activity && basePrice > 0 && (
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded px-3 py-2 space-y-0.5">
                      <div className="flex justify-between">
                        <span>1st performer</span>
                        <span>${basePrice.toFixed(2)}</span>
                      </div>
                      {group.participants.slice(1).map((_, i) => (
                        <div key={i} className="flex justify-between">
                          <span>+ performer {i + 2}</span>
                          <span>${addlPrice.toFixed(2)}</span>
                        </div>
                      ))}
                      {validCount > 0 && (
                        <div className="flex justify-between font-semibold text-gray-700 dark:text-gray-200 border-t border-gray-100 dark:border-gray-700 pt-1 mt-0.5">
                          <span>Subtotal</span>
                          <span>${cost.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* "Register for another performance" — hidden when at capacity or pending slots fill remaining room */}
      {!isAtCapacity && pendingSlots < remainingSlots && (
        <button
          type="button"
          onClick={addGroup}
          className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
        >
          <HiOutlinePlus className="w-4 h-4" /> Register for another performance
        </button>
      )}

      {activityPricingMode === 'per_activity' && runningTotal > 0 && (
        <p className="text-sm text-gray-600 dark:text-gray-400 text-right">
          Performance total:{' '}
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            ${runningTotal.toFixed(2)}
          </span>
        </p>
      )}
    </div>
  );
}
