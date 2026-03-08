'use client';

export default function DevBanner() {
  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] bg-amber-500 text-black text-center text-[10px] font-bold tracking-widest uppercase py-0.5 pointer-events-none select-none">
      Development Environment
    </div>
  );
}
