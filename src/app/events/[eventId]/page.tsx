'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import QRCode from 'react-qr-code';
import { parsePricingRules } from '@/lib/pricing';
import {
  HiOutlineUserGroup,
  HiOutlineCheckCircle,
  HiOutlineIdentification,
  HiOutlineTicket,
  HiOutlineMagnifyingGlass,
  HiOutlineXMark,
  HiOutlineUserPlus,
  HiOutlineCurrencyDollar,
} from 'react-icons/hi2';

interface EventData {
  id: string;
  name: string;
  date: string;
  description: string;
  status: string;
  pricingRules: string;
  totalRegistrations: number;
  totalCheckins: number;
  memberCheckins: number;
  guestCheckins: number;
  registrationOpen: string;
}

interface SearchResult {
  name: string;
  email: string;
  type: string;
  source: string;
}

export default function EventLandingPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params.eventId as string;

  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const fetchEvent = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}`);
      const json = await res.json();
      if (json.success) {
        if (json.data.date) {
          const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
          if (today > json.data.date) {
            setError('This event has ended.');
            setLoading(false);
            return;
          }
        }
        setEvent(json.data);
      } else {
        setError('Event not found.');
      }
    } catch {
      setError('Failed to load event.');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchEvent();
    // Auto-refresh stats every 30 seconds
    const interval = setInterval(fetchEvent, 30000);
    return () => clearInterval(interval);
  }, [fetchEvent]);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/events/${eventId}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setSearchResults(json.data);
      }
    } catch {
      // Silently fail search
    } finally {
      setSearching(false);
    }
  };

  const handleSelectResult = (result: SearchResult) => {
    router.push(`/events/${eventId}/checkin?email=${encodeURIComponent(result.email)}`);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'America/Chicago',
      });
    } catch {
      return dateStr;
    }
  };

  const checkinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/events/${eventId}/checkin`
    : '';

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center max-w-sm w-full border border-gray-200 dark:border-gray-700">
          <p className="text-red-600 dark:text-red-400 font-medium">{error || 'Event not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {/* Hero Section */}
      <div className="pt-12 pb-8 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium mb-4 bg-black/10 dark:bg-white/20 text-gray-900 dark:text-white backdrop-blur-sm">
            {event.status}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">
            {event.name}
          </h1>
          <p className="text-lg text-gray-500 dark:text-gray-400 mb-2">
            {formatDate(event.date)}
          </p>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="px-4 pb-8">
        <div className="max-w-2xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Registered', value: event.totalRegistrations, icon: HiOutlineTicket, color: 'bg-blue-500/20 text-blue-200' },
            { label: 'Checked In', value: event.totalCheckins, icon: HiOutlineCheckCircle, color: 'bg-green-500/20 text-green-200' },
            { label: 'Members', value: event.memberCheckins, icon: HiOutlineIdentification, color: 'bg-purple-500/20 text-purple-200' },
            { label: 'Guests', value: event.guestCheckins, icon: HiOutlineUserGroup, color: 'bg-amber-500/20 text-amber-200' },
          ].map((stat) => (
            <div key={stat.label} className="bg-black/5 dark:bg-white/10 backdrop-blur-sm rounded-xl p-4 text-center">
              <stat.icon className={`w-6 h-6 mx-auto mb-1 ${stat.color.split(' ')[1]}`} />
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="px-4 pb-12">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* QR Code Section */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 text-center shadow-xl border border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Scan to Check In</h2>
            <div className="bg-white p-4 rounded-xl inline-block border-2 border-gray-200">
              {checkinUrl && <QRCode value={checkinUrl} size={200} />}
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">Point your camera at the QR code</p>
          </div>

          {/* Pricing Info */}
          {(() => {
            const rules = parsePricingRules(event.pricingRules);
            if (!rules.enabled) return null;
            return (
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-200 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <HiOutlineCurrencyDollar className="w-5 h-5 text-green-400" />
                  Pricing
                </h2>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-purple-100 dark:bg-purple-900/30 rounded-lg p-3 text-center">
                    <p className="text-xs text-purple-700 dark:text-purple-300 font-medium">Member</p>
                    <p className="text-lg font-bold text-purple-800 dark:text-purple-200">
                      ${rules.memberPricingModel === 'family' ? rules.memberFamilyPrice : rules.memberAdultPrice}
                    </p>
                    <p className="text-xs text-purple-600 dark:text-purple-400">
                      {rules.memberPricingModel === 'family' ? 'per family' : 'per adult'}
                    </p>
                  </div>
                  <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">Guest</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">${rules.guestAdultPrice}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">per adult</p>
                  </div>
                </div>
                {rules.guestKidPrice > 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 text-center">
                    Guest kids: ${rules.guestKidPrice} each
                    {rules.guestKidFreeUnderAge > 0 && ` (${rules.guestKidFreeUnderAge} and under free)`}
                  </p>
                )}
                {(rules.siblingDiscount.enabled || rules.multiEventDiscount.enabled) && (
                  <div className="mt-3 space-y-1">
                    {rules.siblingDiscount.enabled && (
                      <p className="text-xs text-green-600">
                        Sibling discount from 2nd paid kid
                      </p>
                    )}
                    {rules.multiEventDiscount.enabled && (
                      <p className="text-xs text-green-600">
                        Multi-event discount for {rules.multiEventDiscount.minEvents}+ events
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Tablet Check-In Section */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-200 dark:border-gray-700">
            {!showSearch ? (
              <div className="text-center">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Tablet Check-In</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Search by name to check in attendees</p>
                <button
                  onClick={() => setShowSearch(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors"
                >
                  <HiOutlineMagnifyingGlass className="w-5 h-5" />
                  Check In
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Find Attendee</h2>
                  <button
                    onClick={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}
                    className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  >
                    <HiOutlineXMark className="w-5 h-5" />
                  </button>
                </div>

                <div className="relative mb-4">
                  <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 dark:text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Type a name to search..."
                    autoFocus
                  />
                </div>

                {searching && (
                  <div className="text-center py-4">
                    <div className="w-6 h-6 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  </div>
                )}

                {searchResults.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {searchResults.map((result, i) => (
                      <button
                        key={i}
                        onClick={() => handleSelectResult(result)}
                        className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500 transition-colors text-left"
                      >
                        <div>
                          <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{result.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{result.email}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          result.type === 'Member'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                        }`}>
                          {result.type}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-3">No results found</p>
                )}

                <button
                  onClick={() => router.push(`/events/${eventId}/checkin`)}
                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:border-primary-400 hover:text-primary-400 transition-colors"
                >
                  <HiOutlineUserPlus className="w-4 h-4" />
                  New Guest Check-In
                </button>
              </div>
            )}
          </div>

          {/* Register Link */}
          <div className="text-center">
            {event.registrationOpen?.toLowerCase() !== 'true' && event.status === 'Upcoming' ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Registration is currently closed for this event.</p>
            ) : (
              <button
                onClick={() => router.push(`/events/${eventId}/register`)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-black/5 dark:bg-white/10 backdrop-blur-sm text-gray-900 dark:text-white rounded-xl font-medium hover:bg-black/10 dark:hover:bg-white/20 transition-colors border border-black/10 dark:border-white/20"
              >
                Register for this Event
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
