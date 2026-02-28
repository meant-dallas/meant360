'use client';

export default function FieldError({ error }: { error?: string | null }) {
  if (!error) return null;
  return <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>;
}
