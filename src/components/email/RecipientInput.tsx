'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { HiOutlineXMark } from 'react-icons/hi2';

interface Recipient {
  email: string;
  name: string;
  type: 'member' | 'guest';
  status: 'active' | 'inactive' | 'guest';
}

interface EventOption {
  id: string;
  name: string;
  date: string;
}

interface RecipientInputProps {
  value: string[];
  onChange: (emails: string[]) => void;
}

type GroupKey = 'active' | 'guests' | 'all';

export default function RecipientInput({ value, onChange }: RecipientInputProps) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<Recipient[]>([]);
  const [allRecipients, setAllRecipients] = useState<Recipient[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Event-based selection
  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [eventRecipients, setEventRecipients] = useState<Recipient[]>([]);

  const fetchRecipients = useCallback(async () => {
    try {
      const res = await fetch('/api/email/recipients');
      const json = await res.json();
      if (json.success) setAllRecipients(json.data);
    } catch { /* ignore */ }
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/events');
      const json = await res.json();
      if (json.success) setEvents(json.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchRecipients();
    fetchEvents();
  }, [fetchRecipients, fetchEvents]);

  // Fetch event participants when an event is selected
  useEffect(() => {
    if (!selectedEventId) {
      setEventRecipients([]);
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/email/recipients?eventId=${selectedEventId}`);
        const json = await res.json();
        if (json.success) setEventRecipients(json.data);
      } catch { /* ignore */ }
    })();
  }, [selectedEventId]);

  // Build the effective recipient pools, applying event filter when selected
  const effectiveRecipients = useMemo(() => {
    if (!selectedEventId || eventRecipients.length === 0) return allRecipients;
    // When event is selected, intersect with event participants by email
    const eventEmails = new Set(eventRecipients.map((r) => r.email.toLowerCase()));
    return allRecipients.filter((r) => eventEmails.has(r.email.toLowerCase()));
  }, [allRecipients, selectedEventId, eventRecipients]);

  // Group emails by status — uses the effective (possibly event-filtered) pool
  const groups = useMemo(() => {
    const active = effectiveRecipients.filter((r) => r.status === 'active').map((r) => r.email.toLowerCase());
    const guests = effectiveRecipients.filter((r) => r.status === 'guest').map((r) => r.email.toLowerCase());
    const all = effectiveRecipients.map((r) => r.email.toLowerCase());
    return { active, guests, all };
  }, [effectiveRecipients]);

  // Check if a group is fully selected
  const isGroupSelected = useCallback((key: GroupKey) => {
    const groupEmails = groups[key];
    if (groupEmails.length === 0) return false;
    const valueSet = new Set(value.map((e) => e.toLowerCase()));
    return groupEmails.every((e) => valueSet.has(e));
  }, [groups, value]);

  const toggleGroup = (key: GroupKey) => {
    const groupEmails = groups[key];
    if (isGroupSelected(key)) {
      const removeSet = new Set(groupEmails);
      onChange(value.filter((e) => !removeSet.has(e.toLowerCase())));
    } else {
      const valueSet = new Set(value.map((e) => e.toLowerCase()));
      const toAdd = groupEmails.filter((e) => !valueSet.has(e));
      onChange([...value, ...toAdd]);
    }
  };

  // Suggestions use the effective pool
  const suggestionPool = effectiveRecipients;

  useEffect(() => {
    if (!input.trim()) {
      setSuggestions([]);
      return;
    }
    const lower = input.toLowerCase();
    const filtered = suggestionPool.filter(
      (r) =>
        !value.includes(r.email) &&
        (r.email.toLowerCase().includes(lower) || r.name.toLowerCase().includes(lower)),
    );
    setSuggestions(filtered.slice(0, 10));
    setHighlightIndex(-1);
  }, [input, suggestionPool, value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addEmail = (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput('');
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const removeEmail = (email: string) => {
    onChange(value.filter((e) => e !== email));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
      e.preventDefault();
      if (highlightIndex >= 0 && suggestions[highlightIndex]) {
        addEmail(suggestions[highlightIndex].email);
      } else if (input.trim()) {
        addEmail(input);
      }
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      removeEmail(value[value.length - 1]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const quickSelectButtons: { key: GroupKey; label: string; count: number }[] = [
    { key: 'active', label: 'Active Members', count: groups.active.length },
    { key: 'guests', label: 'Guests', count: groups.guests.length },
    { key: 'all', label: 'All', count: groups.all.length },
  ];

  const renderPillButton = ({ key, label, count }: { key: GroupKey; label: string; count: number }) => {
    if (count === 0) return null;
    const selected = isGroupSelected(key);
    return (
      <button
        key={key}
        type="button"
        onClick={() => toggleGroup(key)}
        className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
          selected
            ? 'bg-primary-600 text-white border-primary-600'
            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-primary-400'
        }`}
      >
        {label}
        <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 text-xs rounded-full ${
          selected
            ? 'bg-white/20 text-white'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
        }`}>
          {count}
        </span>
      </button>
    );
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Event filter + Quick-select buttons */}
      {allRecipients.length > 0 && (
        <div className="space-y-2 mb-2">
          {/* Event filter */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              className="text-xs border border-gray-300 dark:border-gray-600 rounded-full px-3 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
            >
              <option value="">All (No event filter)</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.name}{ev.date ? ` (${ev.date})` : ''}
                </option>
              ))}
            </select>
            {selectedEventId && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                Filtered to event attendees
              </span>
            )}
          </div>

          {/* Quick-select buttons */}
          <div className="flex flex-wrap gap-2">
            {quickSelectButtons.map(renderPillButton)}
          </div>
        </div>
      )}

      <div
        className="flex flex-wrap gap-1.5 items-center p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 min-h-[42px] cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((email) => (
          <span
            key={email}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-sm rounded-full"
          >
            {email}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeEmail(email); }}
              className="hover:text-red-600"
            >
              <HiOutlineXMark className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowDropdown(true); }}
          onFocus={() => setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? 'Add recipients...' : ''}
          className="flex-1 min-w-[120px] bg-transparent border-0 outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
        />
      </div>

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.map((r, i) => (
            <button
              key={r.email}
              type="button"
              onClick={() => addEmail(r.email)}
              className={`w-full px-3 py-2 text-left text-sm flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 ${
                i === highlightIndex ? 'bg-gray-100 dark:bg-gray-700' : ''
              }`}
            >
              <span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{r.name}</span>
                <span className="text-gray-500 dark:text-gray-400 ml-2">{r.email}</span>
              </span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                r.type === 'member'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
              }`}>
                {r.type}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
