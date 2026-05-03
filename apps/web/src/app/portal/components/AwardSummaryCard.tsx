import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { computeVestedPercentage } from '@/lib/portal/vesting';

/**
 * Module 8 B3 — Card résumé d'un award sur la liste portail (§4.2).
 *
 * Layout :
 *   - Header : award_number · plan_type · plan_name
 *   - Body : units acquises / total + %, exercise_price si présent,
 *     grant_date
 *   - Footer : lien "Voir le détail →"
 */
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

  return (
    <Card className="hover:border-primary/40 transition-colors">
      <CardContent className="space-y-4 p-6">
        <div className="space-y-1">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <span className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold">
              {planType}
            </span>
            <span className="font-mono">{awardNumber}</span>
          </div>
          <h2 className="text-lg font-semibold tracking-tight">{planName}</h2>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-muted-foreground">Acquises</span>
            <span className="text-foreground tabular-nums">
              <span className="font-semibold">{formatNumber(unitsVested)}</span>
              <span className="text-muted-foreground"> / {formatNumber(unitsGranted)}</span>
              <span className={cn('ml-2 text-xs', percentColor(percent))}>({percent}%)</span>
            </span>
          </div>
          {exercisePrice !== null && exercisePrice !== undefined ? (
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-muted-foreground">Prix d&apos;exercice</span>
              <span className="tabular-nums">{formatPrice(exercisePrice)}</span>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-muted-foreground">Date d&apos;attribution</span>
            <span className="text-foreground">{formatLongDate(grantDate)}</span>
          </div>
        </div>

        <ProgressBar percent={percent} />

        <div className="flex justify-end pt-1">
          <Link
            href={`/portal/awards/${awardId}`}
            className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
            data-testid={`portal-award-detail-link-${awardId}`}
          >
            Voir le détail
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div
      className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="bg-primary h-full transition-all" style={{ width: `${clamped}%` }} />
    </div>
  );
}

function percentColor(percent: number): string {
  if (percent >= 75) return 'text-emerald-600 dark:text-emerald-400';
  if (percent >= 25) return 'text-amber-600 dark:text-amber-400';
  return 'text-muted-foreground';
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
  // Format français : "30 avril 2026"
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
