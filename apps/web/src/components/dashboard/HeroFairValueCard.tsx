'use client';

import { TrendingDown, TrendingUp } from 'lucide-react';
import { EditorialAreaChart } from '@/components/charts';
import type { FairValueSummary } from '@/server/queries/dashboard';
import { cn } from '@/lib/utils';

/**
 * Hero card du Dashboard CFO — Fair Value IFRS 2 (Étape 12).
 *
 * Variante éditoriale du KPICard standard : au lieu d'une sparkline 8-12px
 * de hauteur, embarque un `EditorialAreaChart` ~140-180px qui montre la
 * trajectoire 12 mois de la juste-valeur cumulée.
 *
 * Anatomie (mockup 1) :
 *  - Overline brass-500 "FAIR VALUE · IFRS 2"
 *  - Valeur en text-numeric-xl Fraunces (ex: "12,4 M€")
 *  - Delta variation MoM (TrendingUp/Down + couleur sémantique)
 *  - AreaChart 12 mois sur ~80% largeur de la card
 *  - Footer mono "Dernière valorisation · 31 mars 2026"
 *
 * Empty state : illustration plume + copy éditorial si aucun plan
 * n'a de valuation_run DONE encore.
 */

export type HeroFairValueCardProps = {
  data: FairValueSummary;
  /** href CTA au-dessus / sous la card pour rebondir vers la page Plans. */
  href?: string;
  className?: string;
};

/** Format compact "12,4 M€" / "847 K€" / "12 €". */
function formatCompactEur(eur: number): string {
  if (eur >= 1_000_000) {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(eur / 1_000_000);
  }
  if (eur >= 1_000) {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(eur / 1_000);
  }
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(eur);
}

function compactUnit(eur: number): string {
  if (eur >= 1_000_000) return 'M€';
  if (eur >= 1_000) return 'K€';
  return '€';
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function HeroFairValueCard({ data, href, className }: HeroFairValueCardProps) {
  const { totalEur, variationMonthPct, sparkline, latestValuationAt } = data;
  const isEmpty = totalEur === 0 || sparkline.length === 0;

  // Détection tendance baissière sur les 3 derniers points (signature DS V1)
  const isDownTrend =
    sparkline.length >= 3 &&
    sparkline[sparkline.length - 3]!.value > sparkline[sparkline.length - 2]!.value &&
    sparkline[sparkline.length - 2]!.value > sparkline[sparkline.length - 1]!.value;

  const cardClass = cn(
    'bg-card border-border/50 group relative flex h-full flex-col gap-4 rounded-lg border p-6 transition-all duration-200',
    href &&
      'hover:border-brass-300 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-6px_rgba(11,24,56,0.10),0_4px_8px_-4px_rgba(11,24,56,0.06)]',
    className,
  );

  const content = (
    <>
      {/* Overline */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-overline text-brass-500">FAIR VALUE · IFRS 2</p>
      </div>

      {isEmpty ? (
        <HeroEmptyState />
      ) : (
        <>
          {/* Valeur principale + delta */}
          <div className="flex items-baseline gap-3">
            <span className="text-numeric-xl text-ink-900">{formatCompactEur(totalEur)}</span>
            <span className="text-numeric-md text-ink-500">{compactUnit(totalEur)}</span>
            {variationMonthPct !== null ? (
              <DeltaPill value={variationMonthPct} downTrend={isDownTrend} />
            ) : null}
          </div>

          {/* Citation italic éditoriale */}
          <p className="serif-italic text-ink-700 max-w-md text-sm leading-relaxed">
            {isDownTrend
              ? 'La juste-valeur recule sur le dernier trimestre.'
              : 'La trajectoire reste orientée à la hausse.'}
          </p>

          {/* AreaChart 12 mois */}
          <div className="mt-2">
            <EditorialAreaChart
              data={sparkline}
              xKey="label"
              series={[{ key: 'value', label: 'Fair Value', colorIndex: 0, unit: ' €' }]}
              height={160}
              showAxes
              showGrid
              showLegend={false}
              italicTooltipLabel
            />
          </div>

          {/* Footer date dernière valorisation */}
          <div className="border-paper-300 mt-auto flex items-center justify-between border-t pt-3">
            <p className="text-ink-500 font-mono text-xs">
              {latestValuationAt
                ? `Dernière valorisation · ${formatRelativeDate(latestValuationAt)}`
                : 'Aucune valorisation à afficher'}
            </p>
            {href ? (
              <span className="text-brass-700 group-hover:text-brass-900 text-xs font-medium">
                Voir tous les plans →
              </span>
            ) : null}
          </div>
        </>
      )}
    </>
  );

  return href ? (
    <a href={href} className={cardClass} data-testid="hero-fair-value-card">
      {content}
    </a>
  ) : (
    <div className={cardClass} data-testid="hero-fair-value-card">
      {content}
    </div>
  );
}

function DeltaPill({ value, downTrend }: { value: number; downTrend: boolean }) {
  const isUp = value > 0;
  const isDown = value < 0;
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : null;
  // downTrend trigger force le ton title même si la dernière variation est positive
  const tone = downTrend
    ? 'text-title-500'
    : isUp
      ? 'text-bond-500'
      : isDown
        ? 'text-title-500'
        : 'text-ink-500';

  return (
    <span className={cn('text-numeric-sm ml-1 inline-flex items-center gap-1', tone)}>
      {Icon ? <Icon className="size-3.5" strokeWidth={1.5} /> : null}
      <span>
        {value > 0 ? '+' : ''}
        {value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %
      </span>
      <span className="text-ink-400">vs M-1</span>
    </span>
  );
}

function HeroEmptyState() {
  return (
    <div className="flex flex-1 flex-col items-start gap-3 py-4">
      <svg
        width="48"
        height="48"
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Plume stylisée brass — métaphore "à valoriser" */}
        <path
          d="M 14 50 L 32 32 L 50 14"
          stroke="var(--brass-300)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M 32 32 Q 26 24 22 22 M 32 32 Q 38 26 40 20 M 32 32 Q 28 38 22 40 M 32 32 Q 38 36 44 36"
          stroke="var(--brass-500)"
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="50" cy="14" r="2" fill="var(--brass-500)" />
      </svg>
      <p className="serif-italic text-ink-700 max-w-md text-base leading-relaxed">
        Aucun plan n&apos;a encore de valorisation IFRS 2.
      </p>
      <p className="text-ink-500 text-sm">
        Lancez une valorisation depuis la page d&apos;un plan pour démarrer le suivi.
      </p>
    </div>
  );
}
