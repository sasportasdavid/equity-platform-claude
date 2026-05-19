import { cn } from '@/lib/utils';

/**
 * Logo Capiwise — Editorial Finance V1.
 * Mark "C" sur fond brass avec une fine baseline cuivre. Pas de
 * dépendance image, full SVG/CSS pour rester vif au LCP.
 */
export function CapiwiseMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'bg-brass-500 text-paper-50 inline-flex items-center justify-center rounded-md font-semibold shadow-sm',
        className,
      )}
      style={{ fontFamily: 'var(--font-serif)' }}
    >
      <span className="-mt-0.5 leading-none">C</span>
    </span>
  );
}
