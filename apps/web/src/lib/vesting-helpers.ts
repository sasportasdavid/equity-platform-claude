/**
 * PR #38 B1 — Helpers de calcul pour VestingTimeline (canonique cw-vt).
 *
 * Pure (pas d'I/O, pas de Date.now()). Tests Vitest avec injection date.
 *
 * Cœur du fix : agréger les tranches individuelles en **4 segments**
 * (acquired / live / future / cond) en pourcentage du span temporel total.
 *
 * Formule canonique (brief PR #38) :
 *
 *   span_pct        = elapsed_ms / total_ms × 100
 *   acquired        = sum % tranches !cond AND vesting_date ≤ today
 *   cond            = sum % tranches cond AND vesting_date > today
 *   live            = max(0, span_pct − acquired)
 *   future          = max(0, 100 − acquired − live − cond)
 *
 * Normalisation : la somme des 4 segments doit faire **exactement 100**
 * pour le rendu flex cw-vt-bar (sinon dernier segment dépasse / laisse
 * un trou). Si dérive arithmétique > 0, on rabote `future` pour absorber.
 *
 * Cas particuliers :
 * - today < vestingStart  → { acquired:0, live:0, future:100−cond, cond }
 * - today ≥ vestingEnd    → { acquired:100−cond, live:0, future:0, cond }
 * - 0 tranche             → { acquired:0, live:0, future:100, cond:0 }
 */

export type VestingTranche = {
  /** ISO `YYYY-MM-DD`. */
  vestingDate: string;
  /** Pourcentage cette tranche (par exemple 25 pour le cliff 25 %). */
  percentageOfAward: number;
  /** Si la tranche dépend d'une condition de performance. */
  hasPerformanceCondition?: boolean;
  /** Statut métier (VESTED = déjà acquis cf vesting_events.status). */
  status?: 'VESTED' | 'PENDING' | 'FORFEITED';
};

export type VestingSegments = {
  /** % déjà acquis (somme tranches !cond passées). */
  acquired: number;
  /** % "en cours" (portion du span écoulée − acquired). */
  live: number;
  /** % restant non conditionnel à acquérir. */
  future: number;
  /** % conditionnel non encore acquis (perf condition). */
  cond: number;
};

const PRECISION_EPSILON = 0.001;

/**
 * Compute les 4 segments cw-vt à partir des tranches + dates de référence.
 * Tous les inputs sont strings ISO ou Date — la fonction ne fait pas
 * `new Date()` interne (testabilité).
 */
export function computeSegments(
  tranches: ReadonlyArray<VestingTranche>,
  vestingStart: string | Date,
  vestingEnd: string | Date,
  today: string | Date,
): VestingSegments {
  const startMs = toMs(vestingStart);
  const endMs = toMs(vestingEnd);
  const todayMs = toMs(today);
  const totalSpan = endMs - startMs;

  // Span temporel écoulé en %
  const elapsedPct =
    totalSpan <= 0 ? 0 : Math.max(0, Math.min(100, ((todayMs - startMs) / totalSpan) * 100));

  let acquired = 0;
  let cond = 0;
  for (const t of tranches) {
    const trancheMs = toMs(t.vestingDate);
    const isCond = t.hasPerformanceCondition === true;
    const isVested = t.status === 'VESTED';
    const isForfeited = t.status === 'FORFEITED';
    const isPast = trancheMs <= todayMs && !isForfeited;
    // Conditional non-VESTED → reste en cond (même après vestingEnd, tant
    // que la perf condition n'est pas confirmée comme atteinte).
    if (isCond && !isVested) {
      cond += t.percentageOfAward;
    } else if (!isCond && isPast) {
      acquired += t.percentageOfAward;
    } else if (isCond && isVested) {
      // Tranche cond confirmée VESTED → bascule en acquired
      acquired += t.percentageOfAward;
    }
  }

  // Live = portion du span écoulée moins l'acquired (logique cliff_linear).
  // Borné inférieurement à 0 (pré-vesting). Borné supérieurement à
  // (100 - acquired - cond) pour que la somme des 4 segments ne dépasse
  // jamais 100 — invariant requis par le flex layout cw-vt-bar.
  const liveCap = Math.max(0, 100 - acquired - cond);
  const live = Math.max(0, Math.min(elapsedPct - acquired, liveCap));

  // Future = le reste (non conditionnel).
  const future = Math.max(0, 100 - acquired - live - cond);

  // Sanity check anti-dérive arithmétique
  const sum = acquired + live + future + cond;
  if (Math.abs(sum - 100) > PRECISION_EPSILON) {
    // Edge case rare (arrondi flottant) — ajuster future
    return { acquired, live, future: Math.max(0, 100 - acquired - live - cond), cond };
  }

  return { acquired, live, future, cond };
}

export type TickConfig = {
  /** Date de référence du tick. */
  date: Date;
  /** Label principal (formaté selon variant). */
  label: string;
  /** Sub-label éditorial (ex `· cliff · 25 %`). Brass-700 weight 600. */
  subLabel?: string;
};

/**
 * Construit 5 ticks équidistants entre vestingStart et vestingEnd.
 * Si `cliffDate` fourni, le tick le plus proche du cliff reçoit
 * le sub-label `· cliff · {cliffPct} %` (en brass-700 sur le rendu).
 *
 * Le format du label dépend du caller (long `15.03.2026` ou court
 * `Mar 2026` simplified) — ici on retourne juste les Date.
 */
export function buildDefaultTicks(
  vestingStart: string | Date,
  vestingEnd: string | Date,
  options: {
    count?: number;
    cliffDate?: string | Date | null;
    cliffPct?: number | null;
    formatLabel?: (date: Date) => string;
  } = {},
): TickConfig[] {
  const count = Math.max(2, options.count ?? 5);
  const startMs = toMs(vestingStart);
  const endMs = toMs(vestingEnd);
  const fmt = options.formatLabel ?? formatVestingDateLong;
  if (endMs <= startMs) {
    return [{ date: new Date(startMs), label: fmt(new Date(startMs)) }];
  }
  const stepMs = (endMs - startMs) / (count - 1);
  const cliffMs = options.cliffDate != null ? toMs(options.cliffDate) : null;
  const cliffPct = options.cliffPct ?? null;

  // Index du tick le plus proche du cliff (pour sub-label)
  let cliffTickIdx = -1;
  if (cliffMs != null) {
    let minDist = Infinity;
    for (let i = 0; i < count; i++) {
      const tickMs = startMs + i * stepMs;
      const dist = Math.abs(tickMs - cliffMs);
      if (dist < minDist) {
        minDist = dist;
        cliffTickIdx = i;
      }
    }
  }

  const ticks: TickConfig[] = [];
  for (let i = 0; i < count; i++) {
    const tickMs = startMs + i * stepMs;
    const tickDate = new Date(tickMs);
    const tick: TickConfig = { date: tickDate, label: fmt(tickDate) };
    if (i === cliffTickIdx && cliffPct != null) {
      tick.subLabel = `· cliff · ${formatPct(cliffPct)} %`;
    }
    ticks.push(tick);
  }
  return ticks;
}

/** Format `15.03.2026` (ISO ou Date). */
export function formatVestingDateLong(input: string | Date): string {
  const d = input instanceof Date ? input : parseIsoDate(input);
  if (!d) return typeof input === 'string' ? input : '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

const SHORT_MONTHS_FR = [
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
] as const;

/** Format `Mar 2026` (variant simplified). */
export function formatVestingDateShort(input: string | Date): string {
  const d = input instanceof Date ? input : parseIsoDate(input);
  if (!d) return typeof input === 'string' ? input : '';
  const month = SHORT_MONTHS_FR[d.getMonth()] ?? '';
  return `${month} ${d.getFullYear()}`;
}

/**
 * Format ligne cumulative.
 * - default `pct % · {units} u.` (ex `25 % · 1 050 u.`)
 * - simplified `{units} u. ({pct} %)` (ex `300 u. (25 %)`)
 */
export function formatCumulativeLine(
  pct: number,
  units: number,
  options: { simplified?: boolean } = {},
): string {
  const pctStr = formatPct(pct);
  const unitsStr = formatNumber(units);
  if (options.simplified) {
    if (pct === 0) return '0';
    return `${unitsStr} u. (${pctStr} %)`;
  }
  if (pct === 0) return '0 %';
  return `${pctStr} % · ${unitsStr} u.`;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function toMs(input: string | Date): number {
  if (input instanceof Date) return input.getTime();
  // ISO `YYYY-MM-DD` → parse en local time pour cohérence avec getDate/getMonth
  return Date.parse(input);
}

function parseIsoDate(iso: string): Date | null {
  if (!iso || iso.length < 10) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function formatPct(pct: number): string {
  if (Number.isInteger(pct)) return String(pct);
  return pct.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n);
}
