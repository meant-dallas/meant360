'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { formatCurrency } from '@/lib/utils';
import DynamicFormRenderer, { validateDynamicFields } from '@/components/events/DynamicFormRenderer';
import type { ItemConfig } from '@/types';
import { HiOutlineXMark, HiOutlinePlus, HiOutlineTrash, HiOutlineExclamationTriangle } from 'react-icons/hi2';

interface UnmatchedPayment {
  id: string;
  provider: string;
  externalId: string;
  grossAmount: string;
  payerName: string;
  payerEmail: string;
  description: string;
  transactionDate: string;
  status: string;
}

interface SelectedItemState {
  quantity: number;
  entryTypeKey: string;
  fieldValues: Record<string, string>;
  fieldErrors: Record<string, string | null>;
}

interface AddManualRegistrationModalProps {
  eventId: string;
  catalogItems: ItemConfig[];
  onClose: () => void;
  onCreated: () => void;
}

// Reconciles a payment that was captured (visible in FinRawTransaction) but
// never produced a registration row — e.g. the create request dropped after
// a successful PayPal/Square charge on a flaky mobile connection. Lets an
// admin pick the orphaned payment and manually record what the registrant
// actually selected, using the same createItemsRegistration path as
// self-service registration (server recomputes totalPrice authoritatively;
// this form doesn't try to replicate discount/pricing logic client-side).
export default function AddManualRegistrationModal({ eventId, catalogItems, onClose, onCreated }: AddManualRegistrationModalProps) {
  const { data: session } = useSession();
  const [unmatched, setUnmatched] = useState<UnmatchedPayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>('__none__');

  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentAmountRef, setPaymentAmountRef] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const [selectedItems, setSelectedItems] = useState<Record<string, SelectedItemState>>({});
  const [participants, setParticipants] = useState<{ name: string; age: string }[]>([{ name: '', age: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    fetch(`/api/events/${eventId}/unmatched-payments`)
      .then((r) => r.json())
      .then((json) => { if (json.success) setUnmatched(json.data); else toast.error(json.error || 'Failed to load payments'); })
      .catch(() => toast.error('Failed to load unmatched payments'))
      .finally(() => setLoadingPayments(false));
  }, [eventId]);

  const applyPayment = (paymentId: string) => {
    setSelectedPaymentId(paymentId);
    if (paymentId === '__none__') {
      setTransactionId('');
      setPaymentMethod('');
      setPaymentAmountRef(null);
      return;
    }
    const p = unmatched.find((u) => u.id === paymentId);
    if (!p) return;
    setContactName((prev) => prev || p.payerName);
    setContactEmail((prev) => prev || p.payerEmail);
    setTransactionId(p.externalId);
    setPaymentMethod(p.provider);
    setPaymentAmountRef(p.grossAmount);
    // First named attendee defaults to the payer unless already edited.
    setParticipants((prev) => (prev.length === 1 && !prev[0].name ? [{ name: p.payerName, age: '' }] : prev));
  };

  const toggleItem = (item: ItemConfig) => {
    setSelectedItems((prev) => {
      const next = { ...prev };
      if (next[item.id]) {
        delete next[item.id];
      } else {
        next[item.id] = {
          quantity: 1,
          entryTypeKey: item.entryTypes?.[0]?.key || '',
          fieldValues: {},
          fieldErrors: {},
        };
      }
      return next;
    });
  };

  const updateItemState = (itemId: string, patch: Partial<SelectedItemState>) => {
    setSelectedItems((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
  };

  const addParticipantRow = () => setParticipants((prev) => [...prev, { name: '', age: '' }]);
  const removeParticipantRow = (idx: number) => setParticipants((prev) => prev.filter((_, i) => i !== idx));
  const updateParticipant = (idx: number, patch: Partial<{ name: string; age: string }>) => {
    setParticipants((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  };

  const selectedCount = Object.keys(selectedItems).length;

  const handleSubmit = async () => {
    setFormError('');
    if (!contactName.trim() || !contactEmail.trim()) {
      setFormError('Name and email are required.');
      return;
    }
    if (selectedCount === 0) {
      setFormError('Select at least one item this registrant paid for.');
      return;
    }
    if (!reason.trim()) {
      setFormError('A reason is required — this creates a real registration record on someone else\'s behalf, so the audit trail needs to explain why.');
      return;
    }

    // Validate per-item custom fields the same way the public form does.
    let hasFieldErrors = false;
    const nextSelected = { ...selectedItems };
    for (const [itemId, state] of Object.entries(selectedItems)) {
      const item = catalogItems.find((i) => i.id === itemId);
      if (!item || item.customFields.length === 0) continue;
      const errors = validateDynamicFields(item.customFields, state.fieldValues);
      nextSelected[itemId] = { ...state, fieldErrors: errors };
      if (Object.values(errors).some(Boolean)) hasFieldErrors = true;
    }
    if (hasFieldErrors) {
      setSelectedItems(nextSelected);
      setFormError('Fix the highlighted fields below.');
      return;
    }

    const itemSelections = Object.entries(selectedItems).map(([itemId, state]) => {
      const item = catalogItems.find((i) => i.id === itemId)!;
      return {
        itemId,
        quantity: state.quantity,
        ...(item.customFields.length > 0 ? { customFieldResponses: state.fieldValues } : {}),
        ...(item.isActivity ? { entryTypeKey: state.entryTypeKey } : {}),
      };
    });

    const filledParticipants = participants.filter((p) => p.name.trim());

    setSubmitting(true);
    try {
      const res = await fetch(`/api/events/${eventId}/items-registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactName: contactName.trim(),
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim(),
          attendeeCount: filledParticipants.length || 1,
          participants: filledParticipants,
          itemSelections,
          paymentStatus: transactionId ? 'paid' : 'unpaid',
          paymentMethod,
          transactionId,
          isManualEntry: true,
          manualEntryReason: reason.trim(),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setFormError(json.error || 'Failed to create registration');
        return;
      }
      toast.success('Registration recorded');
      onCreated();
      onClose();
    } catch {
      setFormError('Failed to create registration. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const enabledItems = catalogItems.filter((i) => i.enabled);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Add Registration (Manual Entry)</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">For reconciling a payment that was collected but never produced a registration row.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <HiOutlineXMark className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-5">
          {/* Payment picker */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">Link to a collected payment</label>
            {loadingPayments ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading unmatched payments...</p>
            ) : (
              <select
                className="input w-full"
                value={selectedPaymentId}
                onChange={(e) => applyPayment(e.target.value)}
              >
                <option value="__none__">No payment found — record as unpaid / manual</option>
                {unmatched.map((p) => (
                  <option key={p.id} value={p.id}>
                    {formatCurrency(parseFloat(p.grossAmount))} · {p.payerName || p.payerEmail || 'Unknown payer'} · {p.provider} · {new Date(p.transactionDate).toLocaleDateString()}
                  </option>
                ))}
              </select>
            )}
            {!loadingPayments && unmatched.length === 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">No unmatched income transactions found for this event.</p>
            )}
            {paymentAmountRef && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                <HiOutlineExclamationTriangle className="w-3.5 h-3.5 shrink-0" />
                Payment collected: {formatCurrency(parseFloat(paymentAmountRef))}. The total below is computed from the items you select — make sure they add up.
              </p>
            )}
          </div>

          {/* Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Name *</label>
              <input className="input w-full" value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Email *</label>
              <input className="input w-full" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Phone</label>
              <input className="input w-full" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Transaction ID</label>
              <input className="input w-full" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="from the payment, if not linked above" />
            </div>
          </div>

          {/* Items */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">Items registered for</label>
            <div className="space-y-2">
              {enabledItems.map((item) => {
                const state = selectedItems[item.id];
                const checked = !!state;
                return (
                  <div key={item.id} className={`border rounded-lg p-3 ${checked ? 'border-primary-400 dark:border-primary-600' : 'border-gray-200 dark:border-gray-700'}`}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={() => toggleItem(item)} />
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.name}</span>
                      {!item.isActivity && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                          {formatCurrency(item.memberPrice)} member / {formatCurrency(item.guestPrice)} guest
                        </span>
                      )}
                    </label>

                    {checked && (
                      <div className="mt-3 pl-6 space-y-3">
                        {item.isActivity ? (
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Entry type</label>
                            <select
                              className="input w-full"
                              value={state.entryTypeKey}
                              onChange={(e) => updateItemState(item.id, { entryTypeKey: e.target.value })}
                            >
                              {(item.entryTypes || []).map((et) => (
                                <option key={et.key} value={et.key}>{et.label}</option>
                              ))}
                            </select>
                          </div>
                        ) : item.pricingMode !== 'flat' ? (
                          <div className="w-28">
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Quantity</label>
                            <input
                              type="number"
                              min={1}
                              className="input w-full"
                              value={state.quantity}
                              onChange={(e) => updateItemState(item.id, { quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                            />
                          </div>
                        ) : null}

                        {item.customFields.length > 0 && (
                          <DynamicFormRenderer
                            fields={item.customFields}
                            values={state.fieldValues}
                            onChange={(values) => updateItemState(item.id, { fieldValues: values })}
                            errors={state.fieldErrors}
                            onValidate={(errors) => updateItemState(item.id, { fieldErrors: errors })}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {enabledItems.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">This event has no enabled catalog items.</p>}
            </div>
          </div>

          {/* Roster */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1.5">Attendee roster</label>
            <div className="space-y-2">
              {participants.map((p, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input className="input flex-1" placeholder="Name" value={p.name} onChange={(e) => updateParticipant(idx, { name: e.target.value })} />
                  <input className="input w-24" placeholder="Age" value={p.age} onChange={(e) => updateParticipant(idx, { age: e.target.value })} />
                  {participants.length > 1 && (
                    <button onClick={() => removeParticipantRow(idx)} className="text-gray-400 hover:text-red-500" title="Remove">
                      <HiOutlineTrash className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button onClick={addParticipantRow} className="text-sm text-primary-600 dark:text-primary-400 flex items-center gap-1">
                <HiOutlinePlus className="w-4 h-4" /> Add attendee
              </button>
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Reason for manual entry *</label>
            <textarea
              className="input w-full"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Payment captured via PayPal but the registration request never reached the server (mobile connection dropped)."
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Logged to the activity log under {session?.user?.email || 'your account'}, not the registrant&apos;s.
            </p>
          </div>

          {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="btn-secondary" disabled={submitting}>Cancel</button>
            <button onClick={handleSubmit} className="btn-primary" disabled={submitting}>
              {submitting ? 'Recording...' : 'Record Registration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
