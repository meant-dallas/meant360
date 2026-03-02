'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { validateUrl } from '@/lib/validation';
import FieldError from '@/components/ui/FieldError';
import {
  HiOutlineCog6Tooth,
  HiOutlineArrowPath,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineGlobeAlt,
  HiOutlineCreditCard,
} from 'react-icons/hi2';
import { FaSquare, FaPaypal, FaCcVisa, FaCcMastercard, FaCcAmex } from 'react-icons/fa6';

export default function SettingsPage() {
  const { data: session } = useSession();
  const [testingSquare, setTestingSquare] = useState(false);
  const [testingPayPal, setTestingPayPal] = useState(false);
  const [squareStatus, setSquareStatus] = useState<boolean | null>(null);
  const [paypalStatus, setPaypalStatus] = useState<boolean | null>(null);

  // Sync transactions state
  const [syncing, setSyncing] = useState(false);
  const [syncSource, setSyncSource] = useState<'Square' | 'PayPal'>('Square');
  const [syncStartDate, setSyncStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [syncEndDate, setSyncEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [showSyncModal, setShowSyncModal] = useState(false);

  // Social media links state
  const [socialLinks, setSocialLinks] = useState({
    instagram: '',
    facebook: '',
    linkedin: '',
    youtube: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});
  const [savingSocial, setSavingSocial] = useState(false);

  // Fee settings state
  const [feeSettings, setFeeSettings] = useState({
    squareFeePercent: '',
    squareFeeFixed: '',
    paypalFeePercent: '',
    paypalFeeFixed: '',
  });
  const [savingFees, setSavingFees] = useState(false);

  // Load existing settings on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings');
        const json = await res.json();
        if (json.success && json.data) {
          const s = json.data as Record<string, string>;
          setSocialLinks({
            instagram: s['social_instagram'] || '',
            facebook: s['social_facebook'] || '',
            linkedin: s['social_linkedin'] || '',
            youtube: s['social_youtube'] || '',
          });
          setFeeSettings({
            squareFeePercent: s['fee_square_percent'] || '',
            squareFeeFixed: s['fee_square_fixed'] || '',
            paypalFeePercent: s['fee_paypal_percent'] || '',
            paypalFeeFixed: s['fee_paypal_fixed'] || '',
          });
        }
      } catch {
        // Settings may not exist yet
      }
    })();
  }, []);

  const saveSocialLinks = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const errors: Record<string, string | null> = {};
    errors.instagram = validateUrl(socialLinks.instagram);
    errors.facebook = validateUrl(socialLinks.facebook);
    errors.linkedin = validateUrl(socialLinks.linkedin);
    errors.youtube = validateUrl(socialLinks.youtube);
    setFieldErrors((prev) => ({ ...prev, ...errors }));
    if (Object.values(errors).some(Boolean)) return;
    setSavingSocial(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            social_instagram: socialLinks.instagram,
            social_facebook: socialLinks.facebook,
            social_linkedin: socialLinks.linkedin,
            social_youtube: socialLinks.youtube,
          },
        }),
      });
      const json = await res.json();
      if (json.success) toast.success('Social media links saved');
      else toast.error(json.error || 'Failed to save');
    } catch {
      toast.error('Failed to save social media links');
    } finally {
      setSavingSocial(false);
    }
  };

  const saveFeeSettings = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSavingFees(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: {
            fee_square_percent: feeSettings.squareFeePercent,
            fee_square_fixed: feeSettings.squareFeeFixed,
            fee_paypal_percent: feeSettings.paypalFeePercent,
            fee_paypal_fixed: feeSettings.paypalFeeFixed,
          },
        }),
      });
      const json = await res.json();
      if (json.success) toast.success('Credit card fee settings saved');
      else toast.error(json.error || 'Failed to save');
    } catch {
      toast.error('Failed to save fee settings');
    } finally {
      setSavingFees(false);
    }
  };

  const testConnection = async (source: 'square' | 'paypal') => {
    const setTesting = source === 'square' ? setTestingSquare : setTestingPayPal;
    const setStatus = source === 'square' ? setSquareStatus : setPaypalStatus;

    setTesting(true);
    try {
      // Attempt to sync 0 days to test the connection
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch('/api/finance/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: source === 'square' ? 'Square' : 'PayPal',
          startDate: today,
          endDate: today,
        }),
      });
      const json = await res.json();
      setStatus(json.success);
      if (json.success) toast.success(`${source === 'square' ? 'Square' : 'PayPal'} connection successful`);
      else toast.error(`${source === 'square' ? 'Square' : 'PayPal'} connection failed: ${json.error}`);
    } catch {
      setStatus(false);
      toast.error('Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/finance/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: syncSource,
          startDate: syncStartDate,
          endDate: syncEndDate,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Synced ${json.data.imported} new transactions (${json.data.skipped} duplicates skipped)`);
        setShowSyncModal(false);
      } else {
        toast.error(json.error || 'Sync failed');
      }
    } catch {
      toast.error('Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const role = (session?.user as Record<string, unknown>)?.role as string;
  const isAdmin = role === 'admin';

  return (
    <>
      <PageHeader title="Settings" description="Application configuration and integrations" />

      <div className="space-y-6 max-w-2xl">
        {/* User Info */}
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <HiOutlineCog6Tooth className="w-5 h-5" /> Account
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Name</span>
              <span className="font-medium">{session?.user?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Email</span>
              <span className="font-medium">{session?.user?.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Role</span>
              <span className="font-medium capitalize">{role}</span>
            </div>
          </div>
        </div>

        {/* Social Media Links */}
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <HiOutlineGlobeAlt className="w-5 h-5" /> Social Media Links
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            URLs shown as QR codes on the event home page so attendees can follow your accounts.
          </p>
          <form onSubmit={saveSocialLinks} className="space-y-3">
            <div>
              <label className="label">Instagram URL</label>
              <input
                type="url"
                value={socialLinks.instagram}
                onChange={(e) => { setSocialLinks({ ...socialLinks, instagram: e.target.value }); setFieldErrors((fe) => ({ ...fe, instagram: null })); }}
                onBlur={() => setFieldErrors((fe) => ({ ...fe, instagram: validateUrl(socialLinks.instagram) }))}
                className={`input ${fieldErrors.instagram ? 'border-red-500 dark:border-red-500' : ''}`}
                placeholder="https://instagram.com/yourorg"
              />
              <FieldError error={fieldErrors.instagram} />
            </div>
            <div>
              <label className="label">Facebook URL</label>
              <input
                type="url"
                value={socialLinks.facebook}
                onChange={(e) => { setSocialLinks({ ...socialLinks, facebook: e.target.value }); setFieldErrors((fe) => ({ ...fe, facebook: null })); }}
                onBlur={() => setFieldErrors((fe) => ({ ...fe, facebook: validateUrl(socialLinks.facebook) }))}
                className={`input ${fieldErrors.facebook ? 'border-red-500 dark:border-red-500' : ''}`}
                placeholder="https://facebook.com/yourorg"
              />
              <FieldError error={fieldErrors.facebook} />
            </div>
            <div>
              <label className="label">LinkedIn URL</label>
              <input
                type="url"
                value={socialLinks.linkedin}
                onChange={(e) => { setSocialLinks({ ...socialLinks, linkedin: e.target.value }); setFieldErrors((fe) => ({ ...fe, linkedin: null })); }}
                onBlur={() => setFieldErrors((fe) => ({ ...fe, linkedin: validateUrl(socialLinks.linkedin) }))}
                className={`input ${fieldErrors.linkedin ? 'border-red-500 dark:border-red-500' : ''}`}
                placeholder="https://linkedin.com/company/yourorg"
              />
              <FieldError error={fieldErrors.linkedin} />
            </div>
            <div>
              <label className="label">YouTube URL</label>
              <input
                type="url"
                value={socialLinks.youtube}
                onChange={(e) => { setSocialLinks({ ...socialLinks, youtube: e.target.value }); setFieldErrors((fe) => ({ ...fe, youtube: null })); }}
                onBlur={() => setFieldErrors((fe) => ({ ...fe, youtube: validateUrl(socialLinks.youtube) }))}
                className={`input ${fieldErrors.youtube ? 'border-red-500 dark:border-red-500' : ''}`}
                placeholder="https://youtube.com/@yourorg"
              />
              <FieldError error={fieldErrors.youtube} />
            </div>
            {isAdmin && (
              <button type="submit" disabled={savingSocial} className="btn-primary">
                {savingSocial ? 'Saving...' : 'Save Social Links'}
              </button>
            )}
          </form>
        </div>

        {/* Credit Card Fees */}
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <HiOutlineCreditCard className="w-5 h-5" /> Credit Card Processing Fees
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Set the processing fee rates per payment method. Fees are shown to the customer during payment so they cover the processing cost.
          </p>
          <form onSubmit={saveFeeSettings} className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-2">
                <FaSquare className="w-3.5 h-3.5" /> Square (Card)
                <span className="inline-flex items-center gap-1 ml-auto">
                  <FaCcVisa className="w-5 h-3.5 text-blue-400" />
                  <FaCcMastercard className="w-5 h-3.5 text-orange-400" />
                  <FaCcAmex className="w-5 h-3.5 text-blue-300" />
                </span>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Fee %</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={feeSettings.squareFeePercent}
                    onChange={(e) => setFeeSettings({ ...feeSettings, squareFeePercent: e.target.value })}
                    className="input"
                    placeholder="2.9"
                  />
                </div>
                <div>
                  <label className="label">Fixed Fee ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={feeSettings.squareFeeFixed}
                    onChange={(e) => setFeeSettings({ ...feeSettings, squareFeeFixed: e.target.value })}
                    className="input"
                    placeholder="0.30"
                  />
                </div>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300 mb-2 flex items-center gap-2">
                <FaPaypal className="w-3.5 h-3.5 text-[#00457C]" /> PayPal
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Fee %</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={feeSettings.paypalFeePercent}
                    onChange={(e) => setFeeSettings({ ...feeSettings, paypalFeePercent: e.target.value })}
                    className="input"
                    placeholder="3.49"
                  />
                </div>
                <div>
                  <label className="label">Fixed Fee ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={feeSettings.paypalFeeFixed}
                    onChange={(e) => setFeeSettings({ ...feeSettings, paypalFeeFixed: e.target.value })}
                    className="input"
                    placeholder="0.49"
                  />
                </div>
              </div>
            </div>
            {isAdmin && (
              <button type="submit" disabled={savingFees} className="btn-primary">
                {savingFees ? 'Saving...' : 'Save Fee Settings'}
              </button>
            )}
          </form>
        </div>

        {/* Integration Status */}
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <HiOutlineArrowPath className="w-5 h-5" /> Payment Integrations
          </h3>

          <div className="space-y-4">
            {/* Square */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center flex-shrink-0">
                  <FaSquare className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-medium text-sm">Square</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Transaction sync (read-only)</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {squareStatus !== null && (
                  squareStatus ? (
                    <HiOutlineCheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <HiOutlineXCircle className="w-5 h-5 text-red-500" />
                  )
                )}
                {isAdmin && (
                  <button
                    onClick={() => testConnection('square')}
                    disabled={testingSquare}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    {testingSquare ? 'Testing...' : 'Test Connection'}
                  </button>
                )}
              </div>
            </div>

            {/* PayPal */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#003087] rounded-lg flex items-center justify-center flex-shrink-0">
                  <FaPaypal className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-medium text-sm">PayPal</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Transaction sync (read-only)</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {paypalStatus !== null && (
                  paypalStatus ? (
                    <HiOutlineCheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <HiOutlineXCircle className="w-5 h-5 text-red-500" />
                  )
                )}
                {isAdmin && (
                  <button
                    onClick={() => testConnection('paypal')}
                    disabled={testingPayPal}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    {testingPayPal ? 'Testing...' : 'Test Connection'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sync Transactions */}
        {isAdmin && (
          <div className="card p-6">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
              <HiOutlineArrowPath className="w-5 h-5" /> Sync Transactions
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Import transactions from Square or PayPal. Duplicate transactions are automatically skipped.
            </p>
            <button onClick={() => setShowSyncModal(true)} className="btn-primary flex items-center gap-2">
              <HiOutlineArrowPath className="w-4 h-4" /> Sync Transactions
            </button>
          </div>
        )}

        {/* Sheets Info */}
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Google Sheets Database</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            All data is stored in Google Sheets. The following tabs are used:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {['Committee Members', 'Income', 'Sponsors', 'Expenses', 'Transactions', 'Events', 'Members', 'Guests', 'EventParticipants', 'Settings', 'ActivityLog'].map((tab) => (
              <div key={tab} className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-700 rounded">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                {tab}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sync Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowSyncModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">Sync Transactions</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Source</label>
                <select value={syncSource} onChange={(e) => setSyncSource(e.target.value as 'Square' | 'PayPal')} className="select">
                  <option value="Square">Square</option>
                  <option value="PayPal">PayPal</option>
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Start Date</label>
                  <input type="date" value={syncStartDate} onChange={(e) => setSyncStartDate(e.target.value)} className="input" />
                </div>
                <div>
                  <label className="label">End Date</label>
                  <input type="date" value={syncEndDate} onChange={(e) => setSyncEndDate(e.target.value)} className="input" />
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Duplicate transactions will be automatically skipped based on transaction ID.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowSyncModal(false)} className="btn-secondary">Cancel</button>
                <button onClick={handleSync} disabled={syncing} className="btn-primary flex items-center gap-2">
                  {syncing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <HiOutlineArrowPath className="w-4 h-4" /> Sync Now
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
