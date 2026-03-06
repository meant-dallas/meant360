/**
 * Maps a category background color key to Tailwind gradient classes
 * and provides context-aware watermark SVG for event categories.
 * Used by event home, check-in, and registration pages.
 */

export interface EventTheme {
  gradient: string;
  blobA: string;
  blobB: string;
  /** CSS hex colors for themed buttons (used via CSS custom properties) */
  btnColor: string;
  btnHover: string;
  btnRing: string;
}

const THEMES: Record<string, EventTheme> = {
  '': {
    gradient: 'from-slate-700 via-slate-800 to-slate-900',
    blobA: 'bg-teal-500/10',
    blobB: 'bg-sky-500/10',
    btnColor: '#2563eb',
    btnHover: '#1d4ed8',
    btnRing: '#3b82f6',
  },
  purple: {
    gradient: 'from-violet-600 via-purple-600 to-fuchsia-600',
    blobA: 'bg-pink-400/20',
    blobB: 'bg-indigo-400/20',
    btnColor: '#9333ea',
    btnHover: '#7e22ce',
    btnRing: '#a855f7',
  },
  blue: {
    gradient: 'from-blue-600 via-blue-700 to-indigo-800',
    blobA: 'bg-sky-400/15',
    blobB: 'bg-indigo-400/15',
    btnColor: '#2563eb',
    btnHover: '#1d4ed8',
    btnRing: '#3b82f6',
  },
  teal: {
    gradient: 'from-teal-600 via-teal-700 to-cyan-800',
    blobA: 'bg-emerald-400/15',
    blobB: 'bg-cyan-400/15',
    btnColor: '#0d9488',
    btnHover: '#0f766e',
    btnRing: '#14b8a6',
  },
  emerald: {
    gradient: 'from-emerald-600 via-emerald-700 to-green-800',
    blobA: 'bg-teal-400/15',
    blobB: 'bg-green-400/15',
    btnColor: '#059669',
    btnHover: '#047857',
    btnRing: '#10b981',
  },
  rose: {
    gradient: 'from-rose-500 via-rose-600 to-pink-700',
    blobA: 'bg-pink-400/20',
    blobB: 'bg-rose-400/15',
    btnColor: '#e11d48',
    btnHover: '#be123c',
    btnRing: '#f43f5e',
  },
  amber: {
    gradient: 'from-amber-600 via-orange-600 to-orange-700',
    blobA: 'bg-yellow-400/15',
    blobB: 'bg-orange-400/15',
    btnColor: '#d97706',
    btnHover: '#b45309',
    btnRing: '#f59e0b',
  },
  indigo: {
    gradient: 'from-indigo-600 via-indigo-700 to-violet-800',
    blobA: 'bg-blue-400/15',
    blobB: 'bg-violet-400/15',
    btnColor: '#4f46e5',
    btnHover: '#4338ca',
    btnRing: '#6366f1',
  },
  cyan: {
    gradient: 'from-cyan-600 via-cyan-700 to-sky-800',
    blobA: 'bg-sky-400/15',
    blobB: 'bg-teal-400/15',
    btnColor: '#0891b2',
    btnHover: '#0e7490',
    btnRing: '#06b6d4',
  },
};

export function getEventTheme(bgColor: string | undefined): EventTheme {
  return THEMES[bgColor || ''] || THEMES[''];
}

/**
 * Returns a context-aware watermark SVG string based on event category.
 * Large, sparse, decorative shapes — not tiling patterns.
 * Categories are matched by keyword in the category name.
 */
export function getWatermarkType(category: string): 'tech' | 'community' | 'arts' | 'academic' | 'corporate' | 'default' {
  const lower = (category || '').toLowerCase();
  if (/engineer|tech|hack|code|digital|software|circuit|stem/i.test(lower)) return 'tech';
  if (/academ|school|educat|graduat|scholar|research|science/i.test(lower)) return 'academic';
  if (/art|music|dance|paint|culture|creative|perform|theater|theatre/i.test(lower)) return 'arts';
  if (/corporate|business|profession|conference|summit|leadership|finance/i.test(lower)) return 'corporate';
  if (/communit|social|family|gather|picnic|celebrat|festival|volunteer|women|youth|kids/i.test(lower)) return 'community';
  return 'default';
}
