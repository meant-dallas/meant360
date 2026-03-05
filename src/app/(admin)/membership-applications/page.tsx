'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import Modal from '@/components/ui/Modal';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import { HiOutlineCheckCircle, HiOutlineXCircle, HiOutlineEye, HiOutlineFunnel } from 'react-icons/hi2';

interface Application {
  id: string;
  status: string;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phone: string;
  homePhone: string;
  cellPhone: string;
  qualifyingDegree: string;
  nativePlace: string;
  college: string;
  jobTitle: string;
  employer: string;
  specialInterests: string;
  membershipType: string;
  sponsorName: string;
  sponsorEmail: string;
  sponsorPhone: string;
  address: string;
  spouse: string;
  children: string;
  amountPaid: string;
  paymentMethod: string;
  transactionId: string;
  paymentStatus: string;
  approvals: string;
  approvalCount: string;
  rejectedBy: string;
  rejectedReason: string;
  memberId: string;
  createdAt: string;
  updatedAt: string;
}

interface Approval {
  email: string;
  name: string;
  date: string;
}

export default function MembershipApplicationsPage() {
  const { data: session } = useSession();
  const userEmail = session?.user?.email || '';
  const userName = session?.user?.name || userEmail;

  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('Pending');
  const [selected, setSelected] = useState<Application | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [requiredApprovals, setRequiredApprovals] = useState(3);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/membership-applications/list${params}`);
      const json = await res.json();
      if (json.success) setApplications(json.data);
    } catch {
      toast.error('Failed to fetch applications');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  useEffect(() => {
    fetch('/api/settings/public')
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data?.membershipSettings?.requiredApprovals) {
          setRequiredApprovals(json.data.membershipSettings.requiredApprovals);
        }
      })
      .catch(() => {});
  }, []);

  function parseApprovals(app: Application): Approval[] {
    try {
      return JSON.parse(app.approvals || '[]');
    } catch {
      return [];
    }
  }

  function parseJson(str: string): Record<string, string> {
    try {
      return JSON.parse(str || '{}');
    } catch {
      return {};
    }
  }

  function parseJsonArray(str: string): Array<Record<string, string>> {
    try {
      return JSON.parse(str || '[]');
    } catch {
      return [];
    }
  }

  async function handleApprove(app: Application) {
    const approvals = parseApprovals(app);
    if (approvals.some((a) => a.email === userEmail)) {
      toast.error('You have already approved this application');
      return;
    }
    setProcessing(true);
    try {
      const res = await fetch(`/api/membership-applications/${app.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', approverName: userName }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success(
        parseInt(json.data.approvalCount) >= requiredApprovals
          ? 'Application approved! Member record created.'
          : `Approval recorded (${json.data.approvalCount}/${requiredApprovals})`,
      );
      fetchApplications();
      setShowDetail(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setProcessing(false);
    }
  }

  async function handleReject() {
    if (!selected) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/membership-applications/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason: rejectReason }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      toast.success('Application rejected');
      setShowRejectModal(false);
      setRejectReason('');
      fetchApplications();
      setShowDetail(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div>
      <PageHeader title="Membership Applications" />

      {/* Filter */}
      <div className="mb-4 flex items-center gap-3">
        <HiOutlineFunnel className="w-4 h-4 text-gray-500" />
        <div className="flex gap-1">
          {['Pending', 'Approved', 'Rejected', ''].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      ) : applications.length === 0 ? (
        <div className="card p-8 text-center text-gray-500 dark:text-gray-400">
          No applications found.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Name</th>
                <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Email</th>
                <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Type</th>
                <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Date</th>
                <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Payment</th>
                <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Approvals</th>
                <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Status</th>
                <th className="text-left p-3 font-medium text-gray-600 dark:text-gray-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => {
                const approvals = parseApprovals(app);
                const count = parseInt(app.approvalCount || '0');
                return (
                  <tr key={app.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="p-3 font-medium text-gray-900 dark:text-gray-100">
                      {app.firstName} {app.lastName}
                    </td>
                    <td className="p-3 text-gray-600 dark:text-gray-400">{app.email}</td>
                    <td className="p-3 text-gray-600 dark:text-gray-400">{app.membershipType || '-'}</td>
                    <td className="p-3 text-gray-600 dark:text-gray-400">{formatDate(app.createdAt)}</td>
                    <td className="p-3">
                      {app.paymentStatus === 'Paid' ? (
                        <span className="text-green-600 dark:text-green-400">${app.amountPaid}</span>
                      ) : (
                        <span className="text-yellow-600 dark:text-yellow-400">Pending</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span className={`font-medium ${count >= requiredApprovals ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'}`}>
                        {count}/{requiredApprovals}
                      </span>
                    </td>
                    <td className="p-3">
                      <StatusBadge status={app.status} />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setSelected(app); setShowDetail(true); }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                          title="View details"
                        >
                          <HiOutlineEye className="w-4 h-4" />
                        </button>
                        {app.status === 'Pending' && !approvals.some((a) => a.email === userEmail) && (
                          <button
                            onClick={() => handleApprove(app)}
                            disabled={processing}
                            className="p-1.5 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600"
                            title="Approve"
                          >
                            <HiOutlineCheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        {app.status === 'Pending' && (
                          <button
                            onClick={() => { setSelected(app); setShowRejectModal(true); }}
                            className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600"
                            title="Reject"
                          >
                            <HiOutlineXCircle className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {showDetail && selected && (
        <Modal open={showDetail} title="Application Details" onClose={() => setShowDetail(false)} size="lg">
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Status */}
            <div className="flex items-center gap-3">
              <StatusBadge status={selected.status} />
              <span className="text-sm text-gray-500">
                Submitted {formatDate(selected.createdAt)}
              </span>
            </div>

            {/* Membership Type */}
            {selected.membershipType && (
              <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-lg p-3">
                <p className="text-sm text-primary-700 dark:text-primary-300">
                  Membership Type: <span className="font-semibold">{selected.membershipType}</span>
                </p>
              </div>
            )}

            {/* Personal Info */}
            <div>
              <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">Personal Information</h3>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm space-y-1">
                <p><span className="text-gray-500">Name:</span> {selected.firstName} {selected.middleName} {selected.lastName}</p>
                <p><span className="text-gray-500">Email:</span> {selected.email}</p>
                <p><span className="text-gray-500">Phone:</span> {selected.phone || selected.cellPhone || selected.homePhone || '-'}</p>
                {selected.qualifyingDegree && <p><span className="text-gray-500">Degree:</span> {selected.qualifyingDegree}</p>}
                {selected.nativePlace && <p><span className="text-gray-500">Native Place:</span> {selected.nativePlace}</p>}
                {selected.college && <p><span className="text-gray-500">College:</span> {selected.college}</p>}
                {selected.employer && <p><span className="text-gray-500">Employer:</span> {selected.employer}</p>}
                {selected.jobTitle && <p><span className="text-gray-500">Job Title:</span> {selected.jobTitle}</p>}
                {selected.specialInterests && <p><span className="text-gray-500">Interests:</span> {selected.specialInterests}</p>}
              </div>
            </div>

            {/* Address */}
            {selected.address && selected.address !== '{}' && (
              <div>
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">Address</h3>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm">
                  {(() => {
                    const addr = parseJson(selected.address);
                    return (
                      <>
                        <p>{addr.street}{addr.street2 ? `, ${addr.street2}` : ''}</p>
                        <p>{addr.city}, {addr.state} {addr.zipCode} {addr.country}</p>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Spouse */}
            {selected.spouse && selected.spouse !== '{}' && selected.spouse !== 'null' && (
              <div>
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">Spouse</h3>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm space-y-1">
                  {(() => {
                    const sp = parseJson(selected.spouse);
                    return (
                      <>
                        <p><span className="text-gray-500">Name:</span> {sp.firstName} {sp.middleName} {sp.lastName}</p>
                        {sp.email && <p><span className="text-gray-500">Email:</span> {sp.email}</p>}
                        {sp.phone && <p><span className="text-gray-500">Phone:</span> {sp.phone}</p>}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Children */}
            {selected.children && selected.children !== '[]' && selected.children !== 'null' && (
              <div>
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">Children</h3>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm space-y-1">
                  {parseJsonArray(selected.children).map((c, i) => (
                    <p key={i}>{c.name} {c.age ? `(Age: ${c.age})` : ''} {c.sex ? `- ${c.sex}` : ''}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Sponsor */}
            {selected.sponsorName && (
              <div>
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">Sponsoring Member</h3>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm space-y-1">
                  <p><span className="text-gray-500">Name:</span> {selected.sponsorName}</p>
                  {selected.sponsorEmail && <p><span className="text-gray-500">Email:</span> {selected.sponsorEmail}</p>}
                  {selected.sponsorPhone && <p><span className="text-gray-500">Phone:</span> {selected.sponsorPhone}</p>}
                </div>
              </div>
            )}

            {/* Payment */}
            <div>
              <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">Payment</h3>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm space-y-1">
                <p><span className="text-gray-500">Amount:</span> ${selected.amountPaid || '0'}</p>
                <p><span className="text-gray-500">Status:</span> {selected.paymentStatus || 'N/A'}</p>
                {selected.paymentMethod && <p><span className="text-gray-500">Method:</span> {selected.paymentMethod}</p>}
                {selected.transactionId && <p><span className="text-gray-500">Transaction:</span> {selected.transactionId}</p>}
              </div>
            </div>

            {/* Approvals */}
            <div>
              <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2">
                Approvals ({parseInt(selected.approvalCount || '0')}/{requiredApprovals})
              </h3>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-sm">
                {parseApprovals(selected).length === 0 ? (
                  <p className="text-gray-400">No approvals yet</p>
                ) : (
                  <div className="space-y-2">
                    {parseApprovals(selected).map((a, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <HiOutlineCheckCircle className="w-4 h-4 text-green-500" />
                        <span>{a.name || a.email}</span>
                        <span className="text-gray-400 text-xs">{formatDate(a.date)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Rejection */}
            {selected.status === 'Rejected' && (
              <div>
                <h3 className="text-sm font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide mb-2">Rejection</h3>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-sm space-y-1">
                  <p><span className="text-gray-500">Rejected by:</span> {selected.rejectedBy}</p>
                  {selected.rejectedReason && <p><span className="text-gray-500">Reason:</span> {selected.rejectedReason}</p>}
                </div>
              </div>
            )}

            {/* Member ID */}
            {selected.memberId && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-3">
                <p className="text-sm text-green-700 dark:text-green-300">
                  Member record created: <span className="font-mono">{selected.memberId}</span>
                </p>
              </div>
            )}

            {/* Actions */}
            {selected.status === 'Pending' && (
              <div className="flex gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                {!parseApprovals(selected).some((a) => a.email === userEmail) && (
                  <button
                    onClick={() => handleApprove(selected)}
                    disabled={processing}
                    className="btn-primary flex items-center gap-2"
                  >
                    <HiOutlineCheckCircle className="w-4 h-4" />
                    {processing ? 'Processing...' : 'Approve'}
                  </button>
                )}
                <button
                  onClick={() => { setShowRejectModal(true); }}
                  className="btn-secondary flex items-center gap-2 text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/20"
                >
                  <HiOutlineXCircle className="w-4 h-4" />
                  Reject
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Reject Modal */}
      {showRejectModal && selected && (
        <Modal open={showRejectModal} title="Reject Application" onClose={() => { setShowRejectModal(false); setRejectReason(''); }}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Reject the application from <strong>{selected.firstName} {selected.lastName}</strong>?
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Reason (optional)
              </label>
              <textarea
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Provide a reason for rejection..."
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={processing}
                className="btn-primary bg-red-600 hover:bg-red-700"
              >
                {processing ? 'Rejecting...' : 'Reject Application'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
