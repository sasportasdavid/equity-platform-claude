import { cn } from '@/lib/utils';
import {
  buildDefaultTicks,
  computeSegments,
  formatCumulativeLine,
  formatVestingDateLong,
  formatVestingDateShort,
  type TickConfig,
  type VestingTranche,
} from '@/lib/vesting-helpers';

/**
 * Module Design System V1f — Vesting Timeline canonique cw-vt (PR #38).
 *
 * Refonte de la frise vesting selon `docs/DESIGN_SYSTEM_V1_TERRACOTTA.md` §5.4
 * + sources canoniques `cw-screen-plan.jsx` (Plan detail) et
 * `cw-screen-portal.jsx` (Portail bénéficiaire).
 *
 * Anatomie cw-vt :
 * - 5 ticks dates (start + cliff + 2 intermédiaires + end), sub-label
 *   `· cliff · 25 %` brass-700 weight 600 sur le tick cliff
 * - Bar 28px h en flex avec **4 segments empilés horizontalement** :
 *   1. `acquired` bond-500 plein
 *   2. `live` gradient bond-500 → ink-700 (portion courante)
 *   3. `future` hachures 45° ink-300/paper-200 6/12px
 *   4. `cond` repeating 90° brass + border dashed (perf condition)
 * - Repère TODAY : trait vertical 1.5px brass-500 avec halo box-shadow,
 *   label "AUJOURD'HUI" mono 9.5 brass-700 0.16em uppercase au-dessus
 * - Ligne cumulative 5 entrées sous la bar (`0 % · 25 % · 1 050 u. · …`)
 * - Légende 4 swatches 14×10 (Acquis / En cours / À acquérir / Conditionnel)
 *
 * **API stable** : les props existantes sont conservées (3 consommateurs
 * EditorialSynthesisTab + EditorialVestingSection + sandbox dev) — seul
 * le rendu interne change.
 *
 * **Variant `simplified`** (portail bénéficiaire) :
 * - ticks au format court "Mar 2026" au lieu de "15.03.2026"
 * - ligne cumulative ordre inversé "300 u. (25 %)" au lieu de "25 % · 300 u."
 *
 * **`theoreticalMode`** (Plan detail) :
 * - acquired = 0 (un plan n'est pas acquis — les awards le sont)
 * - legend : "Période courante" au lieu de "Acquis"
 *
 * **`conditionalPercentage`** (nouveau V1f) : override la dérivation
 * de la zone conditionnelle depuis `tranches.hasPerformanceCondition`.
 * Si fourni, applique aux N dernières tranches dont la somme atteint
 * ce % (utile quand la granularité par tranche n'est pas modélisée
 * et qu'on veut afficher "20 % conditionnel" agrégé).
 */

const TIMELINE_HEIGHT_PX = 28;

export type VestingTimelineTranche = {
  /** ISO date `YYYY-MM-DD` */
  vestingDate: string;
  /** Nombre d'unités sur cette tranche */
  unitsToVest: number;
  /** Pourcentage cumulé après cette tranche (0-100) */
  cumulativePct: number;
  /** Nombre cumulé d'unités après cette tranche */
  cumulativeUnits: number;
  /** Statut métier */
  status: 'VESTED' | 'PENDING' | 'FORFEITED';
  /** Cette tranche est-elle conditionnée par une performance ? */
  hasPerformanceCondition?: boolean;
  /** Label de la condition (ex: "perf. ARR ≥ 12 M€") */
  conditionLabel?: string;
};

export type VestingTimelineProps = {
  tranches: ReadonlyArray<VestingTimelineTranche>;
  /** ISO date `YYYY-MM-DD` — début du vesting */
  vestingStart: string;
  /** ISO date `YYYY-MM-DD` — fin du vesting */
  vestingEnd: string;
  /** ISO date `YYYY-MM-DD` "aujourd'hui" — override-able pour tests / SSR */
  today?: string;
  /** ISO date `YYYY-MM-DD` du cliff (sub-label sur le 2e tick si fourni). */
  cliffDate?: string;
  /** % du cliff (sub-label `· cliff · 25 %`). */
  cliffPct?: number;
  /** Variante simplifiée pour le portail bénéficiaire (Mar 2026 / units (pct)) */
  simplified?: boolean;
  /**
   * Mode "calendrier théorique" pour Plan Detail.
   * Quand `true`, `acquired = 0` toujours (un plan n'est pas "acquis"),
   * et la légende renomme "Acquis" → "Période courante".
   */
  theoreticalMode?: boolean;
  /**
   * V1f — Override % conditionnel agrégé. Si fourni, marque les N
   * dernières tranches de manière à ce que leur somme atteigne ce %.
   * Utile quand la granularité par tranche n'est pas modélisée DB.
   */
  conditionalPercentage?: number;
  /** Label de la zone conditionnelle dans la légende (default "Conditionnel"). */
  conditionalLabel?: string;
  /** Nombre total d'unités (pour la ligne cumulative) */
  unitsGranted: number;
  className?: string;
  /** Override le style container — par défaut classe `cw-vt`. Utile si
   *  le caller veut un wrapper sans bordure (ex Plan detail dans une card). */
  bare?: boolean;
};

export function VestingTimeline({
  tranches,
  vestingStart,
  vestingEnd,
  today,
  cliffDate,
  cliffPct,
  simplified = false,
  theoreticalMode = false,
  conditionalPercentage,
  conditionalLabel = 'Conditionnel',
  unitsGranted,
  className,
  bare = false,
}: VestingTimelineProps) {
  const todayIso = today ?? new Date().toISOString().slice(0, 10);
  const todayPct = computeTodayPct(vestingStart, vestingEnd, todayIso);

  // Empty state — pas de tranches, on rend une bar vide + message éditorial.
  if (tranches.length === 0) {
    return (
      <figure
        className={cn(bare ? '' : 'cw-vt', className)}
        role="figure"
        aria-label="Chronologie de vesting — aucune tranche"
        data-testid="vesting-timeline"
      >
        <p className="serif-italic text-ink-500 text-sm">Aucune tranche programmée pour ce plan.</p>
      </figure>
    );
  }

  // Préparation des tranches pour computeSegments (mapping shape vers
  // VestingTranche du helper).
  const helperTranches: VestingTranche[] = tranches.map((t) => ({
    vestingDate: t.vestingDate,
    percentageOfAward:
      t.cumulativePct === 0 ? 0 : t.unitsToVest > 0 ? (t.unitsToVest / unitsGranted) * 100 : 0,
    hasPerformanceCondition: t.hasPerformanceCondition,
    status: t.status,
  }));

  // Override conditionnel agrégé V1f
  const trancheList = applyConditionalOverride(helperTranches, conditionalPercentage);

  // Calcul des segments
  let segments = computeSegments(trancheList, vestingStart, vestingEnd, todayIso);
  if (theoreticalMode) {
    // Mode plan : pas d'acquired (= portion vested) ; live = elapsedPct.
    segments = {
      acquired: 0,
      live: Math.max(0, todayPct - segments.cond),
      future: Math.max(0, 100 - todayPct - segments.cond),
      cond: segments.cond,
    };
    // Normalisation pour invariant somme=100
    const sum = segments.acquired + segments.live + segments.future + segments.cond;
    if (sum < 100) {
      segments = { ...segments, future: segments.future + (100 - sum) };
    }
  }

  // 5 ticks par défaut + sub-label cliff
  const ticks: TickConfig[] = buildDefaultTicks(vestingStart, vestingEnd, {
    count: 5,
    cliffDate: cliffDate ?? null,
    cliffPct: cliffPct ?? null,
    formatLabel: simplified ? formatVestingDateShort : formatVestingDateLong,
  });

  // Ligne cumulative 5 entrées : 0 %, 25 %, 50 %, 75 %, 100 %
  const cumulativeStops = [0, 25, 50, 75, 100];
  const cumulativeEntries = cumulativeStops.map((pct) => {
    const units = Math.round((unitsGranted * pct) / 100);
    return formatCumulativeLine(pct, units, { simplified });
  });

  // Aria-label dynamique pour la bar
  const segmentsAriaLabel = [
    `${formatPct(segments.acquired)} % acquis`,
    `${formatPct(segments.live)} % en cours`,
    `${formatPct(segments.future)} % à acquérir`,
    segments.cond > 0 ? `${formatPct(segments.cond)} % conditionnel` : null,
  ]
    .filter((s): s is string => s !== null)
    .join(', ');

  const todayHumanLabel = formatVestingDateLong(todayIso);

  return (
    <figure
      className={cn(bare ? '' : 'cw-vt', className)}
      role="figure"
      aria-label={`Chronologie de vesting de ${formatVestingDateLong(vestingStart)} à ${formatVestingDateLong(vestingEnd)}`}
      data-testid="vesting-timeline"
    >
      {/* Ticks dates */}
      <div className="cw-vt-ticks" aria-hidden="true">
        {ticks.map((tick, idx) => (
          <span key={idx} className="cw-vt-tick">
            <span>{tick.label}</span>
            {tick.subLabel ? <span className="cw-vt-tick-sub">{tick.subLabel}</span> : null}
          </span>
        ))}
      </div>

      {/* Bar 4 segments + repère TODAY */}
      <div
        className="cw-vt-bar"
        style={{ height: `${TIMELINE_HEIGHT_PX}px` }}
        role="img"
        aria-label={segmentsAriaLabel}
        data-testid="vesting-timeline-bar"
      >
        {segments.acquired > 0 ? (
          <span
            className="cw-vt-seg cw-vt-seg-acquired"
            style={{ width: `${segments.acquired}%` }}
            data-testid="vt-seg-acquired"
          />
        ) : null}
        {segments.live > 0 ? (
          <span
            className="cw-vt-seg cw-vt-seg-live"
            style={{ width: `${segments.live}%` }}
            data-testid="vt-seg-live"
          />
        ) : null}
        {segments.future > 0 ? (
          <span
            className="cw-vt-seg cw-vt-seg-future"
            style={{ width: `${segments.future}%` }}
            data-testid="vt-seg-future"
          />
        ) : null}
        {segments.cond > 0 ? (
          <span
            className="cw-vt-seg cw-vt-seg-cond"
            style={{ width: `${segments.cond}%` }}
            data-testid="vt-seg-cond"
          />
        ) : null}

        {/* Repère TODAY */}
        {todayPct > 0 && todayPct < 100 ? (
          <span
            className="cw-vt-now"
            style={{ left: `${todayPct}%` }}
            aria-label={`Position actuelle : ${todayHumanLabel}, ${formatPct(todayPct)} % du span`}
            data-testid="vesting-timeline-now"
          />
        ) : null}
      </div>

      {/* Ligne cumulative */}
      <div className="cw-vt-cum" data-testid="vesting-timeline-cumulative">
        {cumulativeEntries.map((entry, idx) => (
          <span key={idx}>{entry}</span>
        ))}
      </div>

      {/* Légende */}
      <dl className="cw-vt-legend" data-testid="vesting-timeline-legend">
        {!theoreticalMode && segments.acquired > 0 ? (
          <LegendItem variant="acquired" label="Acquis" />
        ) : null}
        {segments.live > 0 ? (
          <LegendItem variant="live" label={theoreticalMode ? 'Période courante' : 'En cours'} />
        ) : null}
        {segments.future > 0 ? <LegendItem variant="future" label="À acquérir" /> : null}
        {segments.cond > 0 ? <LegendItem variant="cond" label={conditionalLabel} /> : null}
      </dl>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function LegendItem({
  variant,
  label,
}: {
  variant: 'acquired' | 'live' | 'future' | 'cond';
  label: string;
}) {
  const swatchClass = `cw-vt-legend-swatch cw-vt-seg-${variant}`;
  return (
    <div className="cw-vt-legend-item">
      <dt className={swatchClass} aria-hidden="true" />
      <dd>{label}</dd>
    </div>
  );
}

function computeTodayPct(start: string, end: string, today: string): number {
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  const todayMs = Date.parse(today);
  if (endMs <= startMs) return 0;
  const ratio = (todayMs - startMs) / (endMs - startMs);
  return Math.max(0, Math.min(100, ratio * 100));
}

function applyConditionalOverride(
  tranches: VestingTranche[],
  conditionalPercentage: number | undefined,
): VestingTranche[] {
  if (conditionalPercentage == null || conditionalPercentage <= 0) return tranches;
  const cloned = tranches.map((t) => ({ ...t }));
  let acc = 0;
  for (let i = cloned.length - 1; i >= 0 && acc < conditionalPercentage; i--) {
    cloned[i]!.hasPerformanceCondition = true;
    acc += cloned[i]!.percentageOfAward;
  }
  return cloned;
}

function formatPct(pct: number): string {
  if (Number.isInteger(pct)) return String(pct);
  return pct.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}
