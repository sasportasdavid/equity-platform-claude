/**
 * Design System V2 B1b — `AwardHeroKpis.tsx`.
 *
 * Banner inline de 4 KPI en tête de la page detail award. Reproduit le pattern
 * mockup "4 200 unités, quatre ans devant elles" avec décomposition par état.
 *
 * Aucune sparkline (l'award n'a pas de série temporelle exploitable V1).
 * Les 4 chiffres sont :
 *   - UNITÉS ATTRIBUÉES (units_granted)
 *   - VESTED (units_vested) — vert bond si > 0
 *   - EXERCÉES (units_exercised) — saffron si > 0
 *   - RESTANTES (units_outstanding) — brass signature
 *
 * Design choices :
 *   - Numeric font JetBrains Mono via `text-numeric-lg` utility (DS V1)
 *   - Card brass-50 pour la valeur signature, paper-50 pour les autres
 *   - Layout 2/4 cols responsive
 */

import { cn } from '@/lib/utils';

const numFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const eurFmt = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

export type AwardHeroKpisProps = {
  unitsGranted: number;
  unitsVested: number;
  unitsExercised: number;
  unitsOutstanding: number | null;
  totalFairValue: number | null;
  fairValuePerUnit: number | null;
};

export function AwardHeroKpis({
  unitsGranted,
  unitsVested,
  unitsExercised,
  unitsOutstanding,
  totalFairValue,
  fairValuePerUnit,
}: AwardHeroKpisProps) {
  const remaining = unitsOutstanding ?? Math.max(0, unitsGranted - unitsVested - unitsExercised);
  const vestedPct = unitsGranted > 0 ? (unitsVested / unitsGranted) * 100 : 0;

  return (
    <section
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      data-testid="award-hero-kpis"
      aria-label="Indicateurs clés de l'attribution"
    >
      <KpiTile
        label="UNITÉS ATTRIBUÉES"
        value={numFmt.format(unitsGranted)}
        unit="u."
        accent="brass"
        subtitle={
          totalFairValue != null
            ? `Juste valeur · ${eurFmt.format(totalFairValue)}`
            : fairValuePerUnit != null
              ? `${eurFmt.format(fairValuePerUnit)} par unité · IFRS 2`
              : 'Juste valeur — non valorisée'
        }
      />
      <KpiTile
        label="VESTED"
        value={numFmt.format(unitsVested)}
        unit="u."
        accent={unitsVested > 0 ? 'bond' : 'neutral'}
        subtitle={`${vestedPct.toFixed(1)} % acquis`}
      />
      <KpiTile
        label="EXERCÉES"
        value={numFmt.format(unitsExercised)}
        unit="u."
        accent={unitsExercised > 0 ? 'saffron' : 'neutral'}
        subtitle={unitsExercised > 0 ? 'Cumul depuis grant' : 'Aucune levée à ce jour'}
      />
      <KpiTile
        label="RESTANTES"
        value={numFmt.format(remaining)}
        unit="u."
        accent="neutral"
        subtitle="Disponibles pour vesting / exercise"
      />
    </section>
  );
}

type Accent = 'brass' | 'bond' | 'saffron' | 'neutral';

function KpiTile({
  label,
  value,
  unit,
  accent,
  subtitle,
}: {
  label: string;
  value: string;
  unit?: string;
  accent: Accent;
  subtitle: string;
}) {
  const accentClasses: Record<Accent, { card: string; numeric: string; overline: string }> = {
    brass: {
      card: 'border-brass-300 bg-brass-50',
      numeric: 'text-brass-900',
      overline: 'text-brass-700',
    },
    bond: {
      card: 'border-bond-300 bg-bond-50',
      numeric: 'text-bond-900',
      overline: 'text-bond-700',
    },
    saffron: {
      card: 'border-saffron-300 bg-saffron-50',
      numeric: 'text-saffron-900',
      overline: 'text-saffron-700',
    },
    neutral: {
      card: 'border-paper-300 bg-paper-50',
      numeric: 'text-ink-900',
      overline: 'text-ink-500',
    },
  };
  const cl = accentClasses[accent];
  return (
    <article className={cn('rounded-md border p-4', cl.card)}>
      <p className={cn('text-overline', cl.overline)}>{label}</p>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className={cn('font-mono text-2xl', cl.numeric)}>{value}</span>
        {unit ? <span className="text-ink-500 font-mono text-xs">{unit}</span> : null}
      </div>
      <p className="text-ink-500 mt-1 text-xs">{subtitle}</p>
    </article>
  );
}
