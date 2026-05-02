import { cn } from '@/lib/utils';

/**
 * Module Design System V1 — Vesting Timeline éditoriale (Étape 9).
 *
 * SVG natif (pas Recharts) — contrôle pixel-perfect requis pour la
 * **règle critique** : la position TODAY est calculée par formule
 * stricte
 *   `((today - vestingStart) / (vestingEnd - vestingStart)) * 100%`
 * Aucune valeur arbitraire, aucun fallback "centré".
 *
 * Anatomie selon mockup 4 (page Plan Detail) + mockup 2 (Portail
 * bénéficiaire) :
 *
 * - Frise horizontale full-width hauteur ~80px
 * - 4 zones visuelles construites depuis les `vesting_events` :
 *   * **Acquis** (`status='VESTED'`) : bond-500 plein
 *   * **En cours** (segment courant entre last_vested et next_pending) :
 *     gradient bond-500 → ink-700
 *   * **À acquérir** (PENDING futurs sans condition) : hachures 45°
 *     ink-300
 *   * **Conditionnel** (events liés à conditions de performance) :
 *     barres verticales pointillées brass-500
 * - Au-dessus : ticks de dates mono à chaque tranche
 * - En-dessous : pourcentage cumulé + nb d'unités
 * - **Ligne verticale "AUJOURD'HUI"** cuivre 1.5px avec pulse 3s
 * - Animation au mount : fill de gauche à droite 800ms ease-enter
 * - Légende 4 mini-carrés en bas
 *
 * **Prop `simplified={true}`** pour le portail bénéficiaire :
 * désactive les tooltips détaillés, retire la zone "Conditionnel"
 * (sauf si applicable réellement), labels de date courts.
 *
 * Si le plan n'a aucune condition de performance (snapshot vide ou
 * pas de tranche conditionnelle), la zone "Conditionnel" n'apparaît
 * **PAS** dans la légende — frise 3 zones uniquement.
 */

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
  /** ISO date `YYYY-MM-DD` — début du vesting (premier tick X-axis) */
  vestingStart: string;
  /** ISO date `YYYY-MM-DD` — fin du vesting (dernier tick X-axis) */
  vestingEnd: string;
  /** ISO date `YYYY-MM-DD` "aujourd'hui" — override-able pour tests */
  today?: string;
  /** Variante simplifiée pour le portail bénéficiaire */
  simplified?: boolean;
  /** Nombre total d'unités (pour ratio cumul) */
  unitsGranted: number;
  className?: string;
};

const SVG_HEIGHT = 80;
const TIMELINE_Y = 32;
const TIMELINE_HEIGHT = 14;

export function VestingTimeline({
  tranches,
  vestingStart,
  vestingEnd,
  today,
  simplified = false,
  unitsGranted,
  className,
}: VestingTimelineProps) {
  // Position TODAY — formule stricte (pas de fallback)
  const todayIso = today ?? new Date().toISOString().slice(0, 10);
  const startMs = Date.parse(vestingStart);
  const endMs = Date.parse(vestingEnd);
  const todayMs = Date.parse(todayIso);

  // Clamp 0..1 pour gérer pré-vesting et post-vesting
  const todayRatio =
    endMs <= startMs ? 0 : Math.max(0, Math.min(1, (todayMs - startMs) / (endMs - startMs)));
  const todayPct = todayRatio * 100;

  // Détection de tranches conditionnelles (zone 4 visible UNIQUEMENT si
  // au moins une tranche a hasPerformanceCondition=true)
  const hasConditionalZone = tranches.some((t) => t.hasPerformanceCondition);

  // Calcul des positions X de chaque tranche (ratio sur la timeline)
  const tranchePositions = tranches.map((t) => {
    const trancheMs = Date.parse(t.vestingDate);
    const ratio =
      endMs <= startMs ? 0 : Math.max(0, Math.min(1, (trancheMs - startMs) / (endMs - startMs)));
    return { ...t, xPct: ratio * 100 };
  });

  // Position de la dernière tranche VESTED (fin de la zone "Acquis")
  const lastVested = tranchePositions
    .filter((t) => t.status === 'VESTED')
    .sort((a, b) => b.xPct - a.xPct)[0];
  const acquisEndPct = lastVested?.xPct ?? 0;

  // "En cours" = segment entre last_vested et today (si today > last_vested)
  const enCoursStartPct = acquisEndPct;
  const enCoursEndPct = Math.max(acquisEndPct, todayPct);

  return (
    <div className={cn('w-full', className)} data-testid="vesting-timeline">
      <svg
        viewBox={`0 0 100 ${SVG_HEIGHT}`}
        preserveAspectRatio="none"
        width="100%"
        height={SVG_HEIGHT}
        role="img"
        aria-label="Chronologie de vesting"
      >
        <defs>
          {/* Hachures 45° pour "À acquérir" */}
          <pattern
            id="hatch-pending"
            patternUnits="userSpaceOnUse"
            width="6"
            height="6"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink-300)" strokeWidth="2" />
          </pattern>
          {/* Gradient bond-500 → ink-700 pour "En cours" */}
          <linearGradient id="grad-encours" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--bond-500)" />
            <stop offset="100%" stopColor="var(--ink-700)" />
          </linearGradient>
          {/* Hachures verticales pointillées brass pour "Conditionnel" */}
          <pattern id="hatch-conditional" patternUnits="userSpaceOnUse" width="4" height="6">
            <line x1="2" y1="0" x2="2" y2="2" stroke="var(--brass-500)" strokeWidth="1.5" />
            <line x1="2" y1="3" x2="2" y2="5" stroke="var(--brass-500)" strokeWidth="1.5" />
          </pattern>
        </defs>

        {/* Zone "À acquérir" — fond complet (sera recouvert par les autres zones) */}
        <rect
          x="0"
          y={TIMELINE_Y}
          width="100"
          height={TIMELINE_HEIGHT}
          fill="url(#hatch-pending)"
        />

        {/* Zone "Conditionnel" superposée si applicable */}
        {hasConditionalZone
          ? tranchePositions
              .filter((t) => t.hasPerformanceCondition && t.status !== 'VESTED')
              .map((t, idx, arr) => {
                const prev = idx === 0 ? acquisEndPct : arr[idx - 1]!.xPct;
                return (
                  <rect
                    key={`cond-${idx}`}
                    x={prev}
                    y={TIMELINE_Y}
                    width={Math.max(0, t.xPct - prev)}
                    height={TIMELINE_HEIGHT}
                    fill="url(#hatch-conditional)"
                  />
                );
              })
          : null}

        {/* Zone "En cours" — gradient si on est entre dernier vested et today */}
        {enCoursEndPct > enCoursStartPct ? (
          <rect
            x={enCoursStartPct}
            y={TIMELINE_Y}
            width={enCoursEndPct - enCoursStartPct}
            height={TIMELINE_HEIGHT}
            fill="url(#grad-encours)"
          />
        ) : null}

        {/* Zone "Acquis" — bond-500 plein, animation fill 800ms */}
        <rect
          x="0"
          y={TIMELINE_Y}
          width={acquisEndPct}
          height={TIMELINE_HEIGHT}
          fill="var(--bond-500)"
          style={{
            animation: 'vesting-fill 800ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
            transformOrigin: 'left',
          }}
        />

        {/* Tranches — petits ticks verticaux brass au-dessus de la frise */}
        {tranchePositions.map((t, idx) => (
          <line
            key={`tick-${idx}`}
            x1={t.xPct}
            y1={TIMELINE_Y - 4}
            x2={t.xPct}
            y2={TIMELINE_Y + TIMELINE_HEIGHT + 4}
            stroke="var(--ink-500)"
            strokeWidth="0.3"
          />
        ))}

        {/* Ligne verticale TODAY — cuivre, formule stricte */}
        <line
          x1={todayPct}
          y1={TIMELINE_Y - 8}
          x2={todayPct}
          y2={TIMELINE_Y + TIMELINE_HEIGHT + 8}
          stroke="var(--brass-500)"
          strokeWidth="0.6"
          className="animate-pulse-live"
          style={{ transformOrigin: `${todayPct}% center` }}
        />
      </svg>

      {/* Labels au-dessus : dates de tranches */}
      <div className="relative mt-1">
        <div className="flex justify-between">
          <span className="text-numeric-sm text-ink-500">
            {formatDate(vestingStart, simplified)}
          </span>
          <span className="text-numeric-sm text-ink-500">{formatDate(vestingEnd, simplified)}</span>
        </div>
      </div>

      {/* Labels en-dessous : pourcentage + unités cumulés */}
      <div className="relative mt-2 flex items-baseline justify-between">
        <span className="text-numeric-sm text-ink-700">0 %</span>
        <span className="text-numeric-sm text-ink-700">
          100 % · {formatNumber(unitsGranted)} u.
        </span>
      </div>

      {/* Légende — 4 mini-carrés (3 si hasConditionalZone=false) */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <LegendItem
          color="var(--bond-500)"
          label={`Acquis · ${tranches.filter((t) => t.status === 'VESTED').reduce((sum, t) => sum + t.unitsToVest, 0)} u.`}
        />
        {enCoursEndPct > enCoursStartPct ? (
          <LegendItem fill="url(#grad-encours-legend)" label="En cours" gradient />
        ) : null}
        <LegendItem pattern="pending" label="À acquérir" />
        {hasConditionalZone ? (
          <LegendItem
            pattern="conditional"
            label={
              tranches.find((t) => t.hasPerformanceCondition)?.conditionLabel ??
              'Conditionnel · perf. ARR'
            }
          />
        ) : null}
      </div>
    </div>
  );
}

function LegendItem({
  color,
  fill,
  pattern,
  label,
  gradient,
}: {
  color?: string;
  fill?: string;
  pattern?: 'pending' | 'conditional';
  label: string;
  gradient?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-xs">
      <span
        className="border-paper-300 inline-block h-3 w-3 rounded-sm border"
        style={{
          backgroundColor: color,
          backgroundImage:
            pattern === 'pending'
              ? 'repeating-linear-gradient(45deg, var(--ink-300) 0, var(--ink-300) 1px, transparent 1px, transparent 3px)'
              : pattern === 'conditional'
                ? 'repeating-linear-gradient(0deg, var(--brass-500) 0, var(--brass-500) 1px, transparent 1px, transparent 3px)'
                : gradient
                  ? 'linear-gradient(90deg, var(--bond-500), var(--ink-700))'
                  : undefined,
        }}
      />
      <span className="text-ink-700">{label}</span>
    </span>
  );
}

function formatDate(iso: string, simplified: boolean): string {
  if (!iso || iso.length < 10) return iso;
  const day = iso.slice(8, 10);
  const month = iso.slice(5, 7);
  const year = iso.slice(0, 4);
  if (simplified) {
    const months = [
      'Jan',
      'Fév',
      'Mar',
      'Avr',
      'Mai',
      'Juin',
      'Juil',
      'Août',
      'Sept',
      'Oct',
      'Nov',
      'Déc',
    ];
    return `${months[parseInt(month, 10) - 1]} ${year}`;
  }
  return `${day}.${month}.${year}`;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n);
}
