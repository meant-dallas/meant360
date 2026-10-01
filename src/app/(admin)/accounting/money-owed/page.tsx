'use client';

import { useEffect, useState, useCallback } from 'react';
import * as Sentry from '@sentry/nextjs';
import PageHeader from '@/components/ui/PageHeader';
import StatCard from '@/components/ui/StatCard';
import StatusBadge from '@/components/ui/StatusBadge';
import Modal from '@/components/ui/Modal';
import { formatCurrency } from '@/lib/utils';

interface Receivable {
  id: string;
  sourceType: string;
  partyName: string;
  amount: string;
  receivedAmount: string;
  status: string;
  dueDate: string | null;
  notes: string | null;
}

interface Payable {
  id: string;
  vendorName: string;
  sourceType: string;
  amount: string;
  paidAmount: string;
  status: string;
  dueDate: string | null;
  notes: string | null;
}

const STATUS_DISPLAY: Record<string, string> = {
  pending: 'Pending',
  partial: 'Partial',
  received: 'Received',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === 'received' || status === 'paid' || status === 'cancelled') return false;
  return new Date(dueDate) < new Date();
}

export default function MoneyOwedPage() {
  const [tab, setTab] = useState<'owed' | 'bills'>('owed');
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [payables, setPayables] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);
  const [arStats, setArStats] = useState({ totalOutstanding: 0, totalOverdue: 0, overdueCount: 0, pendingCount: 0 });
  const [apStats, setApStats] = useState({ totalUnpaid: 0, totalOverdue: 0, overdueCount: 0, pendingCount: 0 });

  const [showAddAR, setShowAddAR] = useState(false);
  const [showAddAP, setShowAddAP] = useState(false);
  const [editArId, setEditArId] = useState<string | null>(null);
  const [editApId, setEditApId] = useState<string | null>(null);
  const [arForm, setArForm] = useState({ partyName: '', sourceType: 'sponsor', amount: '', receivedAmount: '', status: 'pending', dueDate: '', notes: '' });
  const [apForm, setApForm] = useState({ vendorName: '', sourceType: 'vendor', amount: '', paidAmount: '', status: 'pending', dueDate: '', notes: '' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [arRes, apRes] = await Promise.all([
        fetch('/api/fin/receivables'),
        fetch('/api/fin/payables'),
      ]);
      const arJson = await arRes.json();
      const apJson = await apRes.json();
      if (arJson.success) setReceivables(arJson.data);
      if (apJson.success) setPayables(apJson.data);

      // Compute stats client-side
      if (arJson.success) {
        const now = new Date();
        let totalOutstanding = 0, totalOverdue = 0, overdueCount = 0;
        const pending = arJson.data.filter((r: Receivable) => r.status === 'pending' || r.status === 'partial');
        for (const r of pending) {
          const rem = Number(r.amount) - Number(r.receivedAmount);
          totalOutstanding += rem;
          if (r.dueDate && new Date(r.dueDate) < now) { totalOverdue += rem; overdueCount++; }
        }
        setArStats({ totalOutstanding, totalOverdue, overdueCount, pendingCount: pending.length });
      }
      if (apJson.success) {
        const now = new Date();
        let totalUnpaid = 0, totalOverdue = 0, overdueCount = 0;
        const pending = apJson.data.filter((p: Payable) => p.status === 'pending' || p.status === 'partial');
        for (const p of pending) {
          const rem = Number(p.amount) - Number(p.paidAmount);
          totalUnpaid += rem;
          if (p.dueDate && new Date(p.dueDate) < now) { totalOverdue += rem; overdueCount++; }
        }
        setApStats({ totalUnpaid, totalOverdue, overdueCount, pendingCount: pending.length });
      }
    } catch (err) {
      console.error('Failed to fetch:', err);
      Sentry.captureException(err, { extra: { context: 'Money owed fetch' } });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveAR = async () => {
    const amount = parseFloat(arForm.amount);
    if (isNaN(amount) || !arForm.partyName) return;
    try {
      const res = await fetch('/api/fin/receivables', {
        method: editArId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editArId ? { id: editArId } : {}),
          partyName: arForm.partyName,
          sourceType: arForm.sourceType,
          amount,
          ...(editArId ? { receivedAmount: parseFloat(arForm.receivedAmount) || 0, status: arForm.status } : {}),
          dueDate: arForm.dueDate || undefined,
          notes: arForm.notes || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowAddAR(false);
        setEditArId(null);
        setArForm({ partyName: '', sourceType: 'sponsor', amount: '', receivedAmount: '', status: 'pending', dueDate: '', notes: '' });
        fetchData();
      } else {
        alert(json.error || 'Failed to save');
      }
    } catch {}
  };

  const handleEditAR = (r: Receivable) => {
    setArForm({
      partyName: r.partyName,
      sourceType: r.sourceType,
      amount: r.amount,
      receivedAmount: r.receivedAmount,
      status: r.status,
      dueDate: r.dueDate ? r.dueDate.slice(0, 10) : '',
      notes: r.notes || '',
    });
    setEditArId(r.id);
    setShowAddAR(true);
  };

  const handleDeleteAR = async (id: string) => {
    if (!confirm('Delete this expected payment? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/fin/receivables?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) alert(json.error || 'Failed to delete');
      fetchData();
    } catch {}
  };

  const handleSaveAP = async () => {
    const amount = parseFloat(apForm.amount);
    if (isNaN(amount) || !apForm.vendorName) return;
    try {
      const res = await fetch('/api/fin/payables', {
        method: editApId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(editApId ? { id: editApId } : {}),
          vendorName: apForm.vendorName,
          sourceType: apForm.sourceType,
          amount,
          ...(editApId ? { paidAmount: parseFloat(apForm.paidAmount) || 0, status: apForm.status } : {}),
          dueDate: apForm.dueDate || undefined,
          notes: apForm.notes || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowAddAP(false);
        setEditApId(null);
        setApForm({ vendorName: '', sourceType: 'vendor', amount: '', paidAmount: '', status: 'pending', dueDate: '', notes: '' });
        fetchData();
      } else {
        alert(json.error || 'Failed to save');
      }
    } catch {}
  };

  const handleEditAP = (p: Payable) => {
    setApForm({
      vendorName: p.vendorName,
      sourceType: p.sourceType,
      amount: p.amount,
      paidAmount: p.paidAmount,
      status: p.status,
      dueDate: p.dueDate ? p.dueDate.slice(0, 10) : '',
      notes: p.notes || '',
    });
    setEditApId(p.id);
    setShowAddAP(true);
  };

  const handleDeleteAP = async (id: string) => {
    if (!confirm('Delete this bill? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/fin/payables?id=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) alert(json.error || 'Failed to delete');
      fetchData();
    } catch {}
  };

  return (
    <div>
      <PageHeader title="Money Owed / Bills" />

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
        <button onClick={() => setTab('owed')} className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${tab === 'owed' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Money Owed to Us
        </button>
        <button onClick={() => setTab('bills')} className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${tab === 'bills' ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
          Bills to Pay
        </button>
      </div>

      {tab === 'owed' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard title="Total Outstanding" value={formatCurrency(arStats.totalOutstanding)} className={arStats.totalOutstanding > 0 ? 'border-l-4 border-yellow-400' : ''} />
            <StatCard title="Overdue" value={formatCurrency(arStats.totalOverdue)} subtitle={`${arStats.overdueCount} items`} className={arStats.overdueCount > 0 ? 'border-l-4 border-red-400' : ''} trend={arStats.overdueCount > 0 ? 'down' : undefined} />
            <StatCard title="Pending Items" value={String(arStats.pendingCount)} />
          </div>

          <div className="card">
            <div className="p-4 flex justify-end">
              <button onClick={() => { setEditArId(null); setArForm({ partyName: '', sourceType: 'sponsor', amount: '', receivedAmount: '', status: 'pending', dueDate: '', notes: '' }); setShowAddAR(true); }} className="btn btn-primary text-sm">+ Add Expected Payment</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-400">Who Owes Us</th>
                    <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-400">For What</th>
                    <th className="p-3 text-right font-semibold text-gray-600 dark:text-gray-400">Expected</th>
                    <th className="p-3 text-right font-semibold text-gray-600 dark:text-gray-400">Received</th>
                    <th className="p-3 text-right font-semibold text-gray-600 dark:text-gray-400">Remaining</th>
                    <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-400">Due Date</th>
                    <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-400">Status</th>
                    <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="p-8 text-center text-gray-400">Loading...</td></tr>
                  ) : receivables.length === 0 ? (
                    <tr><td colSpan={8} className="p-8 text-center text-gray-400">No receivables</td></tr>
                  ) : receivables.map((r) => {
                    const remaining = Number(r.amount) - Number(r.receivedAmount);
                    const overdue = isOverdue(r.dueDate, r.status);
                    return (
                      <tr key={r.id} className={`border-b border-gray-100 dark:border-gray-800 ${overdue ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                        <td className="p-3 font-semibold">{r.partyName}</td>
                        <td className="p-3 capitalize">{r.sourceType}</td>
                        <td className="p-3 text-right">{formatCurrency(Number(r.amount))}</td>
                        <td className="p-3 text-right text-green-600">{formatCurrency(Number(r.receivedAmount))}</td>
                        <td className={`p-3 text-right font-semibold ${remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(remaining)}</td>
                        <td className={`p-3 ${overdue ? 'text-red-600 font-semibold' : ''}`}>
                          {r.dueDate ? new Date(r.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--'}
                        </td>
                        <td className="p-3 text-center">
                          <StatusBadge status={overdue ? 'Overdue' : STATUS_DISPLAY[r.status] || r.status} />
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => handleEditAR(r)} className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700">Edit</button>
                            <button onClick={() => handleDeleteAR(r.id)} className="text-xs px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50">Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'bills' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard title="Total Unpaid" value={formatCurrency(apStats.totalUnpaid)} className={apStats.totalUnpaid > 0 ? 'border-l-4 border-yellow-400' : ''} />
            <StatCard title="Overdue" value={formatCurrency(apStats.totalOverdue)} subtitle={`${apStats.overdueCount} items`} className={apStats.overdueCount > 0 ? 'border-l-4 border-red-400' : ''} trend={apStats.overdueCount > 0 ? 'down' : undefined} />
            <StatCard title="Pending Bills" value={String(apStats.pendingCount)} />
          </div>

          <div className="card">
            <div className="p-4 flex justify-end">
              <button onClick={() => { setEditApId(null); setApForm({ vendorName: '', sourceType: 'vendor', amount: '', paidAmount: '', status: 'pending', dueDate: '', notes: '' }); setShowAddAP(true); }} className="btn btn-primary text-sm">+ Add Bill</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-400">We Owe To</th>
                    <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-400">For What</th>
                    <th className="p-3 text-right font-semibold text-gray-600 dark:text-gray-400">Amount</th>
                    <th className="p-3 text-right font-semibold text-gray-600 dark:text-gray-400">Paid</th>
                    <th className="p-3 text-right font-semibold text-gray-600 dark:text-gray-400">Remaining</th>
                    <th className="p-3 text-left font-semibold text-gray-600 dark:text-gray-400">Due Date</th>
                    <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-400">Status</th>
                    <th className="p-3 text-center font-semibold text-gray-600 dark:text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} className="p-8 text-center text-gray-400">Loading...</td></tr>
                  ) : payables.length === 0 ? (
                    <tr><td colSpan={8} className="p-8 text-center text-gray-400">No bills</td></tr>
                  ) : payables.map((p) => {
                    const remaining = Number(p.amount) - Number(p.paidAmount);
                    const overdue = isOverdue(p.dueDate, p.status);
                    return (
                      <tr key={p.id} className={`border-b border-gray-100 dark:border-gray-800 ${overdue ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                        <td className="p-3 font-semibold">{p.vendorName}</td>
                        <td className="p-3 capitalize">{p.sourceType}</td>
                        <td className="p-3 text-right">{formatCurrency(Number(p.amount))}</td>
                        <td className="p-3 text-right text-green-600">{formatCurrency(Number(p.paidAmount))}</td>
                        <td className={`p-3 text-right font-semibold ${remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(remaining)}</td>
                        <td className={`p-3 ${overdue ? 'text-red-600 font-semibold' : ''}`}>
                          {p.dueDate ? new Date(p.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '--'}
                        </td>
                        <td className="p-3 text-center">
                          <StatusBadge status={overdue ? 'Overdue' : STATUS_DISPLAY[p.status] || p.status} />
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => handleEditAP(p)} className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700">Edit</button>
                            <button onClick={() => handleDeleteAP(p.id)} className="text-xs px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50">Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Add/Edit AR Modal */}
      <Modal open={showAddAR} onClose={() => { setShowAddAR(false); setEditArId(null); }} title={editArId ? 'Edit Expected Payment' : 'Add Expected Payment'}>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Track money someone has promised to pay you.</p>
        <label className="block text-sm font-medium mb-1">Who owes us?</label>
        <input value={arForm.partyName} onChange={(e) => setArForm({ ...arForm, partyName: e.target.value })} className="input w-full mb-3" placeholder="Company or person name" />
        <label className="block text-sm font-medium mb-1">What is it for?</label>
        <select value={arForm.sourceType} onChange={(e) => setArForm({ ...arForm, sourceType: e.target.value })} className="input w-full mb-3">
          <option value="sponsor">Sponsorship</option>
          <option value="event">Event</option>
          <option value="membership">Membership</option>
          <option value="other">Other</option>
        </select>
        <label className="block text-sm font-medium mb-1">Amount Expected</label>
        <input type="number" step="0.01" value={arForm.amount} onChange={(e) => setArForm({ ...arForm, amount: e.target.value })} className="input w-full mb-3" placeholder="0.00" />
        {editArId && (
          <>
            <label className="block text-sm font-medium mb-1">Amount Received</label>
            <input type="number" step="0.01" value={arForm.receivedAmount} onChange={(e) => setArForm({ ...arForm, receivedAmount: e.target.value })} className="input w-full mb-3" placeholder="0.00" />
            <label className="block text-sm font-medium mb-1">Status</label>
            <select value={arForm.status} onChange={(e) => setArForm({ ...arForm, status: e.target.value })} className="input w-full mb-3">
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </>
        )}
        <label className="block text-sm font-medium mb-1">Due Date</label>
        <input type="date" value={arForm.dueDate} onChange={(e) => setArForm({ ...arForm, dueDate: e.target.value })} className="input w-full mb-3" />
        <label className="block text-sm font-medium mb-1">Notes (optional)</label>
        <textarea value={arForm.notes} onChange={(e) => setArForm({ ...arForm, notes: e.target.value })} className="input w-full mb-4" rows={2} />
        <div className="flex gap-2 justify-end">
          <button onClick={() => { setShowAddAR(false); setEditArId(null); }} className="btn btn-outline">Cancel</button>
          <button onClick={handleSaveAR} className="btn btn-primary">Save</button>
        </div>
      </Modal>

      {/* Add/Edit AP Modal */}
      <Modal open={showAddAP} onClose={() => { setShowAddAP(false); setEditApId(null); }} title={editApId ? 'Edit Bill' : 'Add Bill'}>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Track a bill your organization needs to pay.</p>
        <label className="block text-sm font-medium mb-1">We owe to?</label>
        <input value={apForm.vendorName} onChange={(e) => setApForm({ ...apForm, vendorName: e.target.value })} className="input w-full mb-3" placeholder="Company or person name" />
        <label className="block text-sm font-medium mb-1">What is it for?</label>
        <select value={apForm.sourceType} onChange={(e) => setApForm({ ...apForm, sourceType: e.target.value })} className="input w-full mb-3">
          <option value="venue">Venue</option>
          <option value="vendor">Vendor</option>
          <option value="reimbursement">Reimbursement</option>
          <option value="other">Other</option>
        </select>
        <label className="block text-sm font-medium mb-1">Amount</label>
        <input type="number" step="0.01" value={apForm.amount} onChange={(e) => setApForm({ ...apForm, amount: e.target.value })} className="input w-full mb-3" placeholder="0.00" />
        {editApId && (
          <>
            <label className="block text-sm font-medium mb-1">Amount Paid</label>
            <input type="number" step="0.01" value={apForm.paidAmount} onChange={(e) => setApForm({ ...apForm, paidAmount: e.target.value })} className="input w-full mb-3" placeholder="0.00" />
            <label className="block text-sm font-medium mb-1">Status</label>
            <select value={apForm.status} onChange={(e) => setApForm({ ...apForm, status: e.target.value })} className="input w-full mb-3">
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
              <option value="paid">Paid</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </>
        )}
        <label className="block text-sm font-medium mb-1">Due Date</label>
        <input type="date" value={apForm.dueDate} onChange={(e) => setApForm({ ...apForm, dueDate: e.target.value })} className="input w-full mb-3" />
        <label className="block text-sm font-medium mb-1">Notes (optional)</label>
        <textarea value={apForm.notes} onChange={(e) => setApForm({ ...apForm, notes: e.target.value })} className="input w-full mb-4" rows={2} />
        <div className="flex gap-2 justify-end">
          <button onClick={() => { setShowAddAP(false); setEditApId(null); }} className="btn btn-outline">Cancel</button>
          <button onClick={handleSaveAP} className="btn btn-primary">Save</button>
        </div>
      </Modal>
    </div>
  );
}
