import { cn } from '@/lib/utils';

/**
 * Module Design System V1 — Vesting Timeline éditoriale (Étape 9).
 *
 * SVG natif pour les marqueurs (ticks + ligne TODAY) **+** layers
 * HTML/CSS pour les zones (patterns hachures pixel-perfect
 * indépendants de la largeur du conteneur).
 *
 * **Règle critique** : la position TODAY est calculée par formule
 * stricte
 *   `((today - vestingStart) / (vestingEnd - vestingStart)) * 100%`
 * Aucune valeur arbitraire, aucun fallback "centré".
 *
 * Anatomie selon mockup 4 (page Plan Detail) + mockup 2 (Portail
 * bénéficiaire) :
 *
 * - Frise horizontale full-width hauteur **72px**
 * - 4 zones visuelles construites depuis les `vesting_events` :
 *   * **Acquis** (`status='VESTED'`) : bond-500 plein
 *   * **En cours** (segment courant entre last_vested et today) :
 *     gradient bond-500 → ink-700
 *   * **À acquérir** (PENDING futurs sans condition) :
 *     **hachures 45° diagonales** denses ink-300 (CSS gradient,
 *     pas SVG pattern → préservé pixel-perfect quel que soit le
 *     stretching du SVG)
 *   * **Conditionnel** (events liés à conditions de performance) :
 *     **lignes verticales brass régulièrement espacées** (~30px
 *     d'intervalle → 8-12 lignes selon largeur zone)
 * - Sur la frise : ticks ink-500 fines à chaque tranche
 * - **Ligne verticale "AUJOURD'HUI"** cuivre 1.5px avec pulse 3s
 * - Animation au mount : fill scaleX 800ms ease-enter sur "Acquis"
 * - Légende mini-carrés en bas
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
  /**
   * Mode "calendrier théorique" pour Plan Detail (Étape 13).
   * Quand `true` :
   *  - Pas de zone "Acquis" bond plein (un plan n'est pas "acquis" — ce
   *    sont les awards individuels qui le sont).
   *  - Zone "En cours" gradient bond → ink visible UNIQUEMENT entre la
   *    dernière tranche passée et today (si today > première tranche).
   *  - Légende ajustée : pas d'item "Acquis", "En cours" devient
   *    "Période courante".
   */
  theoreticalMode?: boolean;
  /** Nombre total d'unités (pour ratio cumul) */
  unitsGranted: number;
  className?: string;
};

const TIMELINE_HEIGHT = 72;

// Patterns CSS — défini en dehors du composant pour mémoization.
// `repeating-linear-gradient` reste pixel-perfect quelle que soit la
// largeur du conteneur (vs SVG pattern qui se déforme avec
// `preserveAspectRatio="none"`).
const PATTERN_HATCH_PENDING = [
  'repeating-linear-gradient(',
  '45deg,',
  'transparent 0,',
  'transparent 5px,',
  'var(--ink-300) 5px,',
  'var(--ink-300) 6.5px',
  ')',
].join(' ');

const PATTERN_HATCH_CONDITIONAL = [
  'repeating-linear-gradient(',
  '90deg,',
  'transparent 0,',
  'transparent 28px,',
  'var(--brass-500) 28px,',
  'var(--brass-500) 29.5px',
  ')',
].join(' ');

const GRADIENT_EN_COURS = 'linear-gradient(90deg, var(--bond-500), var(--ink-700))';

export function VestingTimeline({
  tranches,
  vestingStart,
  vestingEnd,
  today,
  simplified = false,
  theoreticalMode = false,
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

  // Position de la dernière tranche VESTED (fin de la zone "Acquis").
  // En theoreticalMode, on ne dessine pas la zone Acquis (un plan n'est
  // pas "acquis"), donc acquisEndPct = 0 toujours.
  const lastVested = theoreticalMode
    ? null
    : tranchePositions.filter((t) => t.status === 'VESTED').sort((a, b) => b.xPct - a.xPct)[0];
  const acquisEndPct = lastVested?.xPct ?? 0;

  // "En cours" :
  //  - Mode normal : segment entre last_vested et today
  //  - theoreticalMode : segment entre la tranche passée la plus récente
  //    (vesting_date <= today) et today, UNIQUEMENT si today est entre
  //    deux tranches (donc après la première mais avant la dernière)
  let enCoursStartPct: number;
  let enCoursEndPct: number;
  if (theoreticalMode) {
    const passedTranches = tranchePositions
      .filter((t) => Date.parse(t.vestingDate) <= todayMs)
      .sort((a, b) => b.xPct - a.xPct);
    const futureTranches = tranchePositions.filter((t) => Date.parse(t.vestingDate) > todayMs);
    if (passedTranches.length > 0 && futureTranches.length > 0) {
      // today est entre deux tranches → zone En cours visible
      enCoursStartPct = passedTranches[0]!.xPct;
      enCoursEndPct = todayPct;
    } else {
      // pré-première tranche OU post-dernière tranche → pas de zone En cours
      enCoursStartPct = 0;
      enCoursEndPct = 0;
    }
  } else {
    enCoursStartPct = acquisEndPct;
    enCoursEndPct = Math.max(acquisEndPct, todayPct);
  }

  // Zones conditionnelles à dessiner (depuis acquisEndPct vers chaque
  // tranche conditionnelle PENDING). On regroupe en plages contiguës.
  const conditionalRanges = hasConditionalZone
    ? tranchePositions
        .filter((t) => t.hasPerformanceCondition && t.status !== 'VESTED')
        .map((t, idx, arr) => {
          const prev = idx === 0 ? acquisEndPct : arr[idx - 1]!.xPct;
          return { startPct: prev, endPct: t.xPct };
        })
        .filter((r) => r.endPct > r.startPct)
    : [];

  return (
    <div className={cn('w-full', className)} data-testid="vesting-timeline">
      {/* Frise horizontale — wrapper relatif h=72px */}
      <div
        className="relative w-full overflow-hidden rounded-sm"
        style={{ height: `${TIMELINE_HEIGHT}px` }}
      >
        {/* Layer 1 — fond "À acquérir" (hachures 45° diagonales) */}
        <div
          className="absolute inset-0"
          style={{ backgroundImage: PATTERN_HATCH_PENDING }}
          aria-hidden="true"
        />

        {/* Layer 2 — zones "Conditionnel" (lignes verticales brass) superposées.
            backgroundColor paper-100 masque le Layer 1 ink-300 dessous afin
            que seules les verticales brass restent visibles dans la zone */}
        {conditionalRanges.map((r, idx) => (
          <div
            key={`cond-${idx}`}
            className="absolute bottom-0 top-0"
            style={{
              left: `${r.startPct}%`,
              width: `${r.endPct - r.startPct}%`,
              backgroundColor: 'var(--paper-100)',
              backgroundImage: PATTERN_HATCH_CONDITIONAL,
            }}
            aria-hidden="true"
          />
        ))}

        {/* Layer 3 — "En cours" (gradient bond → ink) */}
        {enCoursEndPct > enCoursStartPct ? (
          <div
            className="absolute bottom-0 top-0"
            style={{
              left: `${enCoursStartPct}%`,
              width: `${enCoursEndPct - enCoursStartPct}%`,
              backgroundImage: GRADIENT_EN_COURS,
            }}
            aria-hidden="true"
          />
        ) : null}

        {/* Layer 4 — "Acquis" (bond-500 plein, scaleX 800ms à mount) */}
        <div
          className="absolute bottom-0 left-0 top-0"
          style={{
            width: `${acquisEndPct}%`,
            backgroundColor: 'var(--bond-500)',
            transformOrigin: 'left',
            animation: 'vesting-fill 800ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
          }}
          aria-hidden="true"
        />

        {/* Layer 5 — SVG superposé pour ticks + ligne TODAY (preserveAspectRatio="none"
            pour l'étirement, OK ici car on n'a que des lignes verticales — leur
            épaisseur est trop fine pour que la déformation X soit visible) */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 100 ${TIMELINE_HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Chronologie de vesting"
        >
          {/* Ticks fins ink-500 à chaque tranche */}
          {tranchePositions.map((t, idx) => (
            <line
              key={`tick-${idx}`}
              x1={t.xPct}
              y1={6}
              x2={t.xPct}
              y2={TIMELINE_HEIGHT - 6}
              stroke="var(--ink-500)"
              strokeWidth="0.25"
              opacity="0.6"
            />
          ))}

          {/* Ligne verticale TODAY — cuivre, formule stricte */}
          <line
            x1={todayPct}
            y1={-2}
            x2={todayPct}
            y2={TIMELINE_HEIGHT + 2}
            stroke="var(--brass-500)"
            strokeWidth="0.5"
            className="animate-pulse-live"
          />
        </svg>
      </div>

      {/* Labels au-dessus : dates de tranches */}
      <div className="relative mt-1 flex justify-between">
        <span className="text-numeric-sm text-ink-500">{formatDate(vestingStart, simplified)}</span>
        <span className="text-numeric-sm text-ink-500">{formatDate(vestingEnd, simplified)}</span>
      </div>

      {/* Labels en-dessous : pourcentage + unités cumulés */}
      <div className="relative mt-2 flex items-baseline justify-between">
        <span className="text-numeric-sm text-ink-700">0 %</span>
        <span className="text-numeric-sm text-ink-700">
          100 % · {formatNumber(unitsGranted)} u.
        </span>
      </div>

      {/* Légende — items conditionnels selon le mode */}
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        {!theoreticalMode ? (
          <LegendItem
            color="var(--bond-500)"
            label={`Acquis · ${tranches.filter((t) => t.status === 'VESTED').reduce((sum, t) => sum + t.unitsToVest, 0)} u.`}
          />
        ) : null}
        {enCoursEndPct > enCoursStartPct ? (
          <LegendItem gradient label={theoreticalMode ? 'Période courante' : 'En cours'} />
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
  pattern,
  label,
  gradient,
}: {
  color?: string;
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
              ? 'repeating-linear-gradient(45deg, transparent 0, transparent 1.5px, var(--ink-300) 1.5px, var(--ink-300) 2.5px)'
              : pattern === 'conditional'
                ? 'repeating-linear-gradient(90deg, transparent 0, transparent 2.5px, var(--brass-500) 2.5px, var(--brass-500) 3.5px)'
                : gradient
                  ? GRADIENT_EN_COURS
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
