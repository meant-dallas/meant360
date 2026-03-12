'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import PublicLayout from '@/components/events/PublicLayout';
import PaymentForm from '@/components/events/PaymentForm';
import { HiOutlineCheckCircle, HiOutlineExclamationTriangle } from 'react-icons/hi2';

const PAYMENTS_ENABLED = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';

interface MembershipTypeOption {
  name: string;
  price: number;
}

interface MemberInfo {
  memberId: string;
  name: string;
  email: string;
  membershipType: string;
  status: string;
}

interface MembershipRenewClientProps {
  membershipTypes: MembershipTypeOption[];
  feeSettings: { squareFeePercent: number; squareFeeFixed: number; paypalFeePercent: number; paypalFeeFixed: number; zelleEmail: string; zellePhone: string };
}

type Step = 'loading' | 'select_type' | 'payment' | 'submitting' | 'success' | 'error';

export default function MembershipRenewClient({ membershipTypes, feeSettings }: MembershipRenewClientProps) {
  const { data: session, status: sessionStatus } = useSession();
  const [step, setStep] = useState<Step>('loading');
  const [memberInfo, setMemberInfo] = useState<MemberInfo | null>(null);
  const [selectedType, setSelectedType] = useState<MembershipTypeOption | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch member info from portal dashboard
  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (!session?.user?.email) {
      setErrorMsg('Please sign in to renew your membership.');
      setStep('error');
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/portal/dashboard');
        const json = await res.json();
        if (!json.success) {
          setErrorMsg('Could not load your membership info. Please try again.');
          setStep('error');
          return;
        }

        // Get memberId from session
        const memberRes = await fetch('/api/portal/member-id');
        const memberJson = await memberRes.json();

        setMemberInfo({
          memberId: memberJson.success ? memberJson.data.memberId : '',
          name: json.data.name || '',
          email: session.user.email || '',
          membershipType: json.data.membershipType || '',
          status: json.data.status || '',
        });

        // Pre-select current membership type
        const match = membershipTypes.find((t) => t.name === json.data.membershipType);
        if (match) setSelectedType(match);
        else if (membershipTypes.length > 0) setSelectedType(membershipTypes[0]);

        setStep('select_type');
      } catch {
        setErrorMsg('Failed to load membership info.');
        setStep('error');
      }
    })();
  }, [session, sessionStatus, membershipTypes]);

  async function handleRenew(paymentMethod: string, transactionId: string) {
    if (!memberInfo || !selectedType) return;
    setStep('submitting');
    try {
      const res = await fetch('/api/members/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: memberInfo.memberId,
          membershipType: selectedType.name,
          amount: String(selectedType.price),
          payerName: memberInfo.name,
          payerEmail: memberInfo.email,
          paymentMethod,
          transactionId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setStep('success');
      } else {
        setErrorMsg(json.error || 'Renewal failed. Please try again.');
        setStep('error');
      }
    } catch {
      setErrorMsg('Renewal failed. Please try again.');
      setStep('error');
    }
  }

  return (
    <PublicLayout eventName="Membership Renewal" maxWidth="md">
      {step === 'loading' && (
        <div className="card p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Loading your membership info...</p>
        </div>
      )}

      {step === 'select_type' && memberInfo && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">Renew Membership</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Welcome back, {memberInfo.name}. Select your membership type to continue.
          </p>
          {memberInfo.membershipType && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Current type: <span className="font-medium">{memberInfo.membershipType}</span>
              {memberInfo.status && (
                <> &middot; Status: <span className="font-medium">{memberInfo.status}</span></>
              )}
            </p>
          )}

          <div className="space-y-3 mb-6">
            {membershipTypes.map((type) => (
              <button
                key={type.name}
                onClick={() => setSelectedType(type)}
                className={`w-full text-left p-4 rounded-lg border-2 transition-colors ${
                  selectedType?.name === type.name
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex justify-between items-center">
                  <p className={`font-medium ${
                    selectedType?.name === type.name
                      ? 'text-primary-700 dark:text-primary-300'
                      : 'text-gray-900 dark:text-gray-100'
                  }`}>
                    {type.name}
                  </p>
                  <span className={`text-lg font-bold ${
                    selectedType?.name === type.name
                      ? 'text-primary-600 dark:text-primary-400'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    ${type.price.toFixed(2)}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {selectedType && (
            <button
              onClick={() => {
                if (PAYMENTS_ENABLED && selectedType.price > 0) {
                  setStep('payment');
                } else {
                  handleRenew('', '');
                }
              }}
              className="btn-primary w-full"
            >
              {PAYMENTS_ENABLED && selectedType.price > 0
                ? `Continue to Payment — $${selectedType.price.toFixed(2)}`
                : 'Renew Membership'}
            </button>
          )}
        </div>
      )}

      {step === 'payment' && memberInfo && selectedType && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Payment</h2>
          <PaymentForm
            amount={selectedType.price}
            eventId=""
            eventName={`Membership Renewal — ${selectedType.name}`}
            payerName={memberInfo.name}
            payerEmail={memberInfo.email}
            squareFeePercent={feeSettings.squareFeePercent}
            squareFeeFixed={feeSettings.squareFeeFixed}
            paypalFeePercent={feeSettings.paypalFeePercent}
            paypalFeeFixed={feeSettings.paypalFeeFixed}
            zelleEmail={feeSettings.zelleEmail}
            zellePhone={feeSettings.zellePhone}
            onSuccess={(result) => handleRenew(result.method, result.transactionId)}
            onCancel={() => handleRenew('', '')}
          />
        </div>
      )}

      {step === 'submitting' && (
        <div className="card p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto" />
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Processing your renewal...</p>
        </div>
      )}

      {step === 'success' && (
        <div className="card p-8 text-center">
          <HiOutlineCheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Membership Renewed!</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
            Your membership has been successfully renewed. Thank you for your continued support!
          </p>
          <a href="/portal" className="btn-primary inline-block">
            Go to Portal
          </a>
        </div>
      )}

      {step === 'error' && (
        <div className="card p-8 text-center">
          <HiOutlineExclamationTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Something went wrong</h2>
          <p className="text-sm text-red-600 dark:text-red-400 mb-6">{errorMsg}</p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => { setErrorMsg(''); setStep('select_type'); }} className="btn-secondary">
              Try Again
            </button>
            <a href="/portal" className="btn-primary inline-block">
              Go to Portal
            </a>
          </div>
        </div>
      )}
    </PublicLayout>
  );
}
