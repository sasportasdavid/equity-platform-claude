import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';
import { computeVestedPercentage } from '@/lib/portal/vesting';
import { cn } from '@/lib/utils';

/**
 * Module 8 + Étape 14 Design System V1 — Card résumé d'un award sur
 * la liste portail (§4.2).
 *
 * Refonte editorial :
 *   - Header : StatusBadge plan_type + award_number mono ink-500
 *   - Title : plan_name en text-h3 Fraunces
 *   - Body : 3 lignes éditoriales serif italic + numbers tabular
 *   - Progress bar bond-500 / paper-200
 *   - Footer : lien "Voir le détail →" brass-700 hover brass-900
 */

const PLAN_TYPE_TONE: Record<string, StatusBadgeTone> = {
  BSPCE: 'brass',
  AGA: 'bond',
  STOCK_OPTION: 'saffron',
  PHANTOM: 'slate',
  BSA: 'brass',
  RSU: 'slate',
};

const PLAN_TYPE_LABEL: Record<string, string> = {
  BSPCE: 'BSPCE',
  AGA: 'AGA',
  STOCK_OPTION: 'Stock Option',
  PHANTOM: 'Phantom',
  BSA: 'BSA',
  RSU: 'RSU',
};

export function AwardSummaryCard({
  awardId,
  awardNumber,
  planName,
  planType,
  unitsGranted,
  unitsVested,
  exercisePrice,
  grantDate,
}: {
  awardId: string;
  awardNumber: string;
  planName: string;
  planType: string;
  unitsGranted: number;
  unitsVested: number;
  exercisePrice: string | number | null;
  grantDate: string;
}) {
  const percent = computeVestedPercentage(unitsVested, unitsGranted);
  const tone = PLAN_TYPE_TONE[planType] ?? 'slate';
  const label = PLAN_TYPE_LABEL[planType] ?? planType;

  return (
    <Link
      href={`/portal/awards/${awardId}`}
      className="bg-paper-50 border-paper-300 hover:border-brass-300 group relative block rounded-lg border p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-6px_rgba(11,24,56,0.10),0_4px_8px_-4px_rgba(11,24,56,0.06)]"
      data-testid={`portal-award-card-${awardId}`}
    >
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <StatusBadge tone={tone} pattern="solid">
            {label}
          </StatusBadge>
          <span className="text-ink-500 font-mono text-[11px]">{awardNumber}</span>
        </div>

        <div>
          <h2 className="text-h3 text-ink-900 leading-tight">{planName}</h2>
        </div>

        {/* Body editorial */}
        <div className="space-y-2.5 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-ink-500">Unités acquises</span>
            <span className="font-mono tabular-nums">
              <span className="text-ink-900 font-semibold">{formatNumber(unitsVested)}</span>
              <span className="text-ink-400"> / {formatNumber(unitsGranted)}</span>
              <span className={cn('ml-2 font-mono text-xs', percentColor(percent))}>
                ({percent} %)
              </span>
            </span>
          </div>
          {exercisePrice !== null && exercisePrice !== undefined ? (
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-ink-500">Prix d&apos;exercice</span>
              <span className="text-ink-900 font-mono tabular-nums">
                {formatPrice(exercisePrice)}
              </span>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-ink-500">Date d&apos;attribution</span>
            <span className="text-ink-900">{formatLongDate(grantDate)}</span>
          </div>
        </div>

        <ProgressBar percent={percent} />

        {/* Footer CTA */}
        <div className="flex justify-end pt-1">
          <span className="text-brass-700 group-hover:text-brass-900 inline-flex items-center gap-1 text-sm font-medium">
            Voir le détail
            <ArrowRight className="size-4" strokeWidth={1.5} />
          </span>
        </div>
      </div>
    </Link>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div
      className="bg-paper-200 h-1.5 w-full overflow-hidden rounded-full"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="bg-bond-500 h-full transition-all duration-500"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function percentColor(percent: number): string {
  if (percent >= 75) return 'text-bond-700';
  if (percent >= 25) return 'text-saffron-700';
  return 'text-ink-500';
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n);
}

function formatPrice(p: string | number): string {
  const value = typeof p === 'string' ? parseFloat(p) : p;
  if (Number.isNaN(value)) return String(p);
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function formatLongDate(iso: string): string {
  if (!iso || iso.length < 10) return iso;
  const months = [
    'janvier',
    'février',
    'mars',
    'avril',
    'mai',
    'juin',
    'juillet',
    'août',
    'septembre',
    'octobre',
    'novembre',
    'décembre',
  ];
  const day = parseInt(iso.slice(8, 10), 10);
  const month = months[parseInt(iso.slice(5, 7), 10) - 1];
  const year = iso.slice(0, 4);
  return `${day} ${month} ${year}`;
}
