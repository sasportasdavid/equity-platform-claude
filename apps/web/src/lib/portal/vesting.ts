import type {
  PortalVestingEvent,
  PortalVestingScheduleSnapshot,
  PortalVestingScheduleTranche,
  VestingEventStatus,
} from '@equity/shared';

/**
 * Module 8 B3 — Helpers de timeline de vesting pour le portail bénéficiaire.
 *
 * Deux cas :
 *
 * **Cas A — `vesting_events` matérialisés (Module 3b RPC
 * `materialize_vesting_events`)** : on les utilise directement, en respectant
 * leur `units_vested` et `status`.
 *
 * **Cas B — `vesting_events` vides (état actuel V1)** : le RPC Module 3b
 * n'est pas auto-déclenché à GRANTED, donc le portail doit fallback sur
 * `vesting_schedule_snapshot.tranches[]` pour reconstruire la timeline. Les
 * tranches passées sont marquées VESTED, les futures PENDING. Le multiplier
 * est 1.0 par défaut (pas de tracking V1 — Module 11 fera ça).
 *
 * Référence : docs/MODULE_08_BENEFICIARY_PORTAL.md §10 "vesting_events
 * peut être vide".
 */

export type VestingTimelineEntry = {
  /** ISO date `YYYY-MM-DD` */
  date: string;
  unitsToVest: number;
  unitsVested: number;
  status: VestingEventStatus;
  performanceMultiplier: number;
  /** True si l'entrée vient du fallback snapshot (debug / UI). */
  fromSnapshot: boolean;
};

export type CumulativePoint = {
  date: string;
  cumulative: number;
  cumulativeVested: number;
};

/**
 * Construit la timeline de vesting à partir des events matérialisés OU
 * d'un fallback sur `vesting_schedule_snapshot.tranches`.
 *
 * @param unitsGranted nombre total d'unités attribuées (utilisé pour la
 *   conversion percentage → units quand on fallback sur le snapshot)
 * @param vestingEvents events matérialisés (peut être null/[])
 * @param vestingScheduleSnapshot snapshot du plan (peut être null)
 * @param today date "now" pour décider VESTED/PENDING en fallback (défaut :
 *   `new Date()`). Override utile pour les tests.
 *
 * @returns timeline triée par date ascendante. Tableau vide si aucune
 *   source disponible.
 */
export function buildVestingTimeline(
  unitsGranted: number,
  vestingEvents: PortalVestingEvent[] | null | undefined,
  vestingScheduleSnapshot: PortalVestingScheduleSnapshot | null | undefined,
  today: Date = new Date(),
): VestingTimelineEntry[] {
  // Cas A : events matérialisés
  if (vestingEvents && vestingEvents.length > 0) {
    return vestingEvents
      .map(
        (e): VestingTimelineEntry => ({
          date: e.scheduled_date,
          unitsToVest: Number(e.units_to_vest),
          unitsVested: Number(e.units_vested),
          status: e.status,
          performanceMultiplier: e.performance_multiplier ?? 1.0,
          fromSnapshot: false,
        }),
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // Cas B : fallback snapshot
  const tranches = vestingScheduleSnapshot?.tranches;
  if (!tranches || tranches.length === 0) return [];

  const todayIso = toIsoDate(today);

  // On trie d'abord par date pour que la "dernière tranche" (qui absorbe
  // le drift d'arrondi) soit déterministe et chronologiquement la dernière.
  const sorted = [...tranches].sort(
    (a: PortalVestingScheduleTranche, b: PortalVestingScheduleTranche) =>
      a.vesting_date.localeCompare(b.vesting_date),
  );

  // round() par tranche puis correction du drift résiduel sur la dernière
  // tranche pour garantir SUM(unitsToVest) === unitsGranted exact. Aligné
  // sur le RPC SQL `materialize_vesting_events` (migration 00021), source
  // de vérité. Sans ça, la somme des tranches arrondies peut différer de
  // unitsGranted (ex: 3 × round(33,33% × 100) = 99 ≠ 100).
  const perTrancheUnits = sorted.map((t) =>
    Math.round((unitsGranted * Number(t.percentage_of_award)) / 100),
  );
  const totalAlloc = perTrancheUnits.reduce((acc, u) => acc + u, 0);
  const drift = unitsGranted - totalAlloc;
  if (drift !== 0 && perTrancheUnits.length > 0) {
    perTrancheUnits[perTrancheUnits.length - 1]! += drift;
  }

  return sorted.map((t: PortalVestingScheduleTranche, i: number): VestingTimelineEntry => {
    const isPast = t.vesting_date <= todayIso;
    const units = perTrancheUnits[i]!;
    return {
      date: t.vesting_date,
      unitsToVest: units,
      unitsVested: isPast ? units : 0,
      status: isPast ? 'VESTED' : 'PENDING',
      performanceMultiplier: 1.0,
      fromSnapshot: true,
    };
  });
}

/**
 * Calcule le cumul d'unités le long de la timeline.
 *
 * `cumulative` accumule TOUJOURS `unitsToVest` (= prévu, indépendant du
 * status). `cumulativeVested` n'accumule QUE quand status == 'VESTED' (ou
 * effectivement gagné — i.e. units_vested > 0).
 *
 * Utile pour le LineChart Recharts (2 séries : prévu + réalisé).
 */
export function computeCumulativeUnits(timeline: VestingTimelineEntry[]): CumulativePoint[] {
  let cumulative = 0;
  let cumulativeVested = 0;
  return timeline.map((entry) => {
    cumulative += entry.unitsToVest;
    cumulativeVested += entry.unitsVested;
    return { date: entry.date, cumulative, cumulativeVested };
  });
}

/**
 * Pourcentage acquis (0-100, arrondi). Évite la division par zéro.
 */
export function computeVestedPercentage(unitsVested: number, unitsGranted: number): number {
  if (unitsGranted <= 0) return 0;
  return Math.round((unitsVested / unitsGranted) * 100);
}

/**
 * Helper local : convertit une Date en ISO `YYYY-MM-DD` (timezone UTC).
 */
function toIsoDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
