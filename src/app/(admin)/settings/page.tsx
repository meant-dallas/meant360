'use client';

import { useState, useEffect } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import {
  HiOutlineCog6Tooth,
  HiOutlineCalendarDays,
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

  // Social media links state
  const [socialLinks, setSocialLinks] = useState({
    instagram: '',
    facebook: '',
    linkedin: '',
    youtube: '',
  });
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

  const saveSocialLinks = async () => {
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

  const saveFeeSettings = async () => {
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

        {/* Events Link */}
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <HiOutlineCalendarDays className="w-5 h-5" /> Events
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            Manage your events used across income, expenses, and sponsorship records.
          </p>
          <Link href="/settings/events" className="btn-secondary inline-flex items-center gap-2">
            <HiOutlineCalendarDays className="w-4 h-4" /> Manage Events
          </Link>
        </div>

        {/* Social Media Links */}
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <HiOutlineGlobeAlt className="w-5 h-5" /> Social Media Links
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            URLs shown as QR codes on the event home page so attendees can follow your accounts.
          </p>
          <div className="space-y-3">
            <div>
              <label className="label">Instagram URL</label>
              <input
                type="url"
                value={socialLinks.instagram}
                onChange={(e) => setSocialLinks({ ...socialLinks, instagram: e.target.value })}
                className="input"
                placeholder="https://instagram.com/yourorg"
              />
            </div>
            <div>
              <label className="label">Facebook URL</label>
              <input
                type="url"
                value={socialLinks.facebook}
                onChange={(e) => setSocialLinks({ ...socialLinks, facebook: e.target.value })}
                className="input"
                placeholder="https://facebook.com/yourorg"
              />
            </div>
            <div>
              <label className="label">LinkedIn URL</label>
              <input
                type="url"
                value={socialLinks.linkedin}
                onChange={(e) => setSocialLinks({ ...socialLinks, linkedin: e.target.value })}
                className="input"
                placeholder="https://linkedin.com/company/yourorg"
              />
            </div>
            <div>
              <label className="label">YouTube URL</label>
              <input
                type="url"
                value={socialLinks.youtube}
                onChange={(e) => setSocialLinks({ ...socialLinks, youtube: e.target.value })}
                className="input"
                placeholder="https://youtube.com/@yourorg"
              />
            </div>
            {isAdmin && (
              <button onClick={saveSocialLinks} disabled={savingSocial} className="btn-primary">
                {savingSocial ? 'Saving...' : 'Save Social Links'}
              </button>
            )}
          </div>
        </div>

        {/* Credit Card Fees */}
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
            <HiOutlineCreditCard className="w-5 h-5" /> Credit Card Processing Fees
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Set the processing fee rates per payment method. Fees are shown to the customer during payment so they cover the processing cost.
          </p>
          <div className="space-y-4">
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
              <button onClick={saveFeeSettings} disabled={savingFees} className="btn-primary">
                {savingFees ? 'Saving...' : 'Save Fee Settings'}
              </button>
            )}
          </div>
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

        {/* Sheets Info */}
        <div className="card p-6">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Google Sheets Database</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            All data is stored in Google Sheets. The following tabs are used:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {['Committee Members', 'Income', 'Sponsorship', 'Expenses', 'Reimbursements', 'Transactions', 'Events', 'Members', 'Settings'].map((tab) => (
              <div key={tab} className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-700 rounded">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                {tab}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
