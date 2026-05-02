/**
 * Titre adaptatif pour le hero du Plan Detail — Étape 13 Design System V1
 * (spec section 5.7).
 *
 * Retourne un titre éditorial qui s'adapte à l'état du vesting du plan,
 * structuré en deux parties : un préfixe `"Plan {name}, "` + un accent
 * italic serif (ex `*vesting en cours*`).
 *
 * 4 états possibles (priorité de haut en bas) :
 *
 *   - `closed`         — `plan.status === 'CLOSED'`
 *                        → "Plan {name}, *clôturé en {Mois Année}*"
 *
 *   - `pre-cliff`      — `today < cliff_date`
 *                        → "Plan {name}, *en attente du cliff dans {Xm}*"
 *                        ou "*en attente du cliff dans {Xm Yj}*" si < 12 mois
 *
 *   - `fully-vested`   — `today >= last_tranche_date`
 *                        → "Plan {name}, *calendrier de vesting terminé*"
 *                        (le mot "acquis" est réservé aux vues
 *                        bénéficiaire / award)
 *
 *   - `vesting-active` — entre cliff et dernière tranche
 *                        → "Plan {name}, *vesting en cours*"
 *                        (pas de pourcentage — la précision vit dans
 *                        les KPIs sous le titre)
 *
 * Helper PUR — pas d'I/O. La date est injectée via `today` (default
 * `new Date()`) pour faciliter les tests Vitest.
 */

export type PlanTitleState = 'pre-cliff' | 'vesting-active' | 'fully-vested' | 'closed';

export type AdaptivePlanTitleInput = {
  plan: {
    name: string;
    status: string; // 'DRAFT' | 'ACTIVE' | 'CLOSED' | ...
    grant_date: string; // ISO YYYY-MM-DD
  };
  vestingSchedule: {
    cliff_months: number | null;
    /** Dernière tranche du schedule (la plus tardive). NULL si aucune tranche. */
    last_tranche_date: string | null; // ISO YYYY-MM-DD
  } | null;
  /** Date de référence — défaut `new Date()`. Override pour tests. */
  today?: Date;
};

export type AdaptivePlanTitle = {
  state: PlanTitleState;
  /** Préfixe non-italic. Ex `"Plan BSPCE-2026-001, "` (avec virgule + espace) */
  prefix: string;
  /** Partie en accent serif italic. Ex `"vesting en cours"` */
  accent: string;
};

export function getAdaptivePlanTitle({
  plan,
  vestingSchedule,
  today = new Date(),
}: AdaptivePlanTitleInput): AdaptivePlanTitle {
  const prefix = `Plan ${plan.name}, `;

  // 1. État closed prime sur tout
  if (plan.status === 'CLOSED') {
    return {
      state: 'closed',
      prefix,
      accent: `clôturé en ${formatMonthYearFr(today)}`,
    };
  }

  // 2. Pre-cliff : avant la date de fin du cliff
  const cliffDate = computeCliffDate(plan.grant_date, vestingSchedule?.cliff_months ?? null);
  if (cliffDate && today < cliffDate) {
    const remaining = formatRemainingFr(today, cliffDate);
    return {
      state: 'pre-cliff',
      prefix,
      accent: `en attente du cliff dans ${remaining}`,
    };
  }

  // 3. Fully-vested : si on a passé la dernière tranche
  if (vestingSchedule?.last_tranche_date) {
    const lastDate = parseIsoLocalDate(vestingSchedule.last_tranche_date);
    if (lastDate && today >= lastDate) {
      return {
        state: 'fully-vested',
        prefix,
        accent: 'calendrier de vesting terminé',
      };
    }
  }

  // 4. Sinon : vesting actif (cliff passé, pas encore au bout du calendrier)
  return {
    state: 'vesting-active',
    prefix,
    accent: 'vesting en cours',
  };
}

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

function computeCliffDate(grantDateIso: string, cliffMonths: number | null): Date | null {
  if (cliffMonths == null || cliffMonths <= 0) return null;
  const grant = parseIsoLocalDate(grantDateIso);
  if (!grant) return null;
  const cliff = new Date(grant.getFullYear(), grant.getMonth() + cliffMonths, grant.getDate());
  return cliff;
}

/**
 * Parse une date ISO "YYYY-MM-DD" en local time (midnight). Évite le piège
 * du fuseau où `new Date('2030-01-15')` est UTC midnight, alors qu'on veut
 * le comparer à un `today` qui est en local time.
 */
function parseIsoLocalDate(iso: string): Date | null {
  if (!iso || typeof iso !== 'string' || iso.length < 10) return null;
  const y = parseInt(iso.slice(0, 4), 10);
  const m = parseInt(iso.slice(5, 7), 10);
  const d = parseInt(iso.slice(8, 10), 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * Format "Xm Yj" pour < 12 mois, "Xm" pour ≥ 12 mois (arrondi).
 * Ex: 11.5 mois → "11 m 14 j", 14.2 mois → "14 m".
 */
function formatRemainingFr(from: Date, to: Date): string {
  const diffMs = to.getTime() - from.getTime();
  if (diffMs <= 0) return '0 j';

  const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const months = Math.floor(totalDays / 30);
  const days = totalDays - months * 30;

  if (months >= 12) {
    return `${months} m`;
  }
  if (days === 0) return `${months} m`;
  return `${months} m ${days} j`;
}

const MONTHS_FR = [
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

function formatMonthYearFr(d: Date): string {
  return `${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}
