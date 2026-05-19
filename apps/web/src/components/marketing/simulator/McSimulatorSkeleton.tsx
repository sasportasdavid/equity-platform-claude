/**
 * Skeleton du simulateur Monte Carlo — affiché pendant que le wrapper
 * `McSimulatorLazy` attend que le bloc entre en viewport.
 *
 * Marine sombre + animation `animate-pulse` Tailwind subtile.
 * Hauteurs identiques à celles du composant réel pour éviter tout
 * layout shift au mount.
 */

import { cn } from '@/lib/utils';

export function McSimulatorSkeleton({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  const isCompact = variant === 'compact';
  const canvasH = isCompact
    ? 'h-[280px] sm:h-[320px] lg:h-[340px]'
    : 'h-[400px] sm:h-[440px] lg:h-[500px]';

  return (
    <div
      className="border-white/8 relative overflow-hidden rounded-[14px] border p-7 shadow-2xl"
      style={{ background: '#0B1124', color: '#F0EAD8' }}
      aria-hidden
      data-mc-simulator-skeleton
    >
      {/* Header skeleton */}
      <div className="border-white/8 flex items-start justify-between gap-6 border-b pb-6">
        <div className="flex flex-col gap-3">
          <div className="bg-white/8 h-3 w-48 animate-pulse rounded" />
          <div className="h-7 w-72 animate-pulse rounded bg-white/10" />
          {!isCompact ? <div className="bg-white/8 h-3 w-56 animate-pulse rounded" /> : null}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="bg-white/8 h-2.5 w-24 animate-pulse rounded" />
          <div className="bg-white/8 h-2.5 w-32 animate-pulse rounded" />
          <div className="bg-white/8 h-2.5 w-28 animate-pulse rounded" />
        </div>
      </div>

      {/* Preset selector skeleton (full only) */}
      {!isCompact ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white/8 h-8 w-24 animate-pulse rounded" />
          ))}
        </div>
      ) : null}

      {/* Main grid skeleton */}
      <div
        className={
          isCompact
            ? 'mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,8fr)_minmax(0,5fr)]'
            : 'mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12'
        }
      >
        <div className={isCompact ? 'min-w-0' : 'min-w-0 lg:col-span-8'}>
          <div className={cn('animate-pulse rounded-[10px] bg-white/5', canvasH)} />
        </div>
        <div className={isCompact ? 'flex flex-col gap-4' : 'flex flex-col gap-5 lg:col-span-4'}>
          {/* FV card skeleton */}
          <div className="border-white/8 bg-white/3 rounded-[8px] border p-5">
            <div className="bg-white/8 h-2.5 w-32 animate-pulse rounded" />
            <div className="mt-3 h-12 w-40 animate-pulse rounded bg-white/10" />
            <div className="bg-white/8 mt-3 h-2.5 w-44 animate-pulse rounded" />
          </div>
          {!isCompact ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="border-white/8 bg-white/3 rounded-[8px] border p-3.5">
                    <div className="bg-white/8 h-2.5 w-16 animate-pulse rounded" />
                    <div className="mt-2 h-7 w-20 animate-pulse rounded bg-white/10" />
                    <div className="bg-white/8 mt-2 h-2.5 w-24 animate-pulse rounded" />
                  </div>
                ))}
              </div>
              <div className="border-white/8 bg-white/3 rounded-[8px] border p-5">
                <div className="bg-white/8 h-2.5 w-32 animate-pulse rounded" />
                <div className="mt-4 flex flex-col gap-5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex flex-col gap-2">
                      <div className="flex justify-between">
                        <div className="bg-white/8 h-2.5 w-20 animate-pulse rounded" />
                        <div className="bg-white/8 h-2.5 w-12 animate-pulse rounded" />
                      </div>
                      <div className="bg-white/8 h-[3px] w-full animate-pulse rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="h-12 w-full animate-pulse rounded border border-[#D4A06A]/40" />
          )}
        </div>
      </div>

      {/* Footer skeleton */}
      <div className="border-white/8 mt-6 flex flex-col gap-1 border-t pt-4 sm:flex-row sm:justify-between">
        <div className="bg-white/8 h-2.5 w-80 animate-pulse rounded" />
        <div className="bg-white/8 h-2.5 w-56 animate-pulse rounded" />
      </div>
    </div>
  );
}
