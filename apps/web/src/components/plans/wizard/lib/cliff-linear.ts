import type { Frequency } from '@equity/shared';

export type CliffLinearTranche = {
  index: number;
  date: string; // ISO YYYY-MM-DD
  percentage: number; // 0-100
  cumulative: number; // 0-100
  isCliff: boolean;
};

export type CliffLinearInput = {
  grantDate: string | undefined; // ISO YYYY-MM-DD
  cliffMonths: number;
  cliffPercentage: number;
  totalMonths: number;
  frequency: Frequency;
};

const FREQ_INTERVAL_MONTHS: Record<Frequency, number> = {
  monthly: 1,
  quarterly: 3,
  annually: 12,
};

/**
 * Génère le calendrier des tranches pour un vesting cliff + linéaire.
 *
 * Reproduit la logique de la spec Module 3a §3.7 `generateCliffLinearTranches`
 * mais pour usage UI (preview live sous le formulaire), pas pour persistance.
 *
 * Conventions :
 *  - La 1re tranche est la **cliff tranche** (date = grantDate + cliffMonths).
 *  - Les tranches suivantes sont équiréparties à `frequency` jusqu'à totalMonths
 *    après grantDate.
 *  - Le `% par tranche post-cliff` = (100 - cliffPercentage) / nbTranchesPost.
 *  - Si cliffPercentage = 0, on omet la tranche cliff (uniquement les
 *    paliers réguliers) — sauf si cliffMonths > 0, on conserve la 1re
 *    tranche à cliffMonths à 0 % pour rendre le wait visible (rare cas).
 *  - Renvoie un array vide si l'input est invalide (grantDate manque,
 *    cliffMonths >= totalMonths, etc.).
 */
export function generateCliffLinearTranches(
  input: CliffLinearInput,
): readonly CliffLinearTranche[] {
  const { grantDate, cliffMonths, cliffPercentage, totalMonths, frequency } = input;

  // Garde-fous
  if (!grantDate) return [];
  if (!Number.isFinite(cliffMonths) || cliffMonths < 0) return [];
  if (!Number.isFinite(cliffPercentage) || cliffPercentage < 0 || cliffPercentage > 100) return [];
  // totalMonths < cliffMonths est invalide. L'égalité (totalMonths ===
  // cliffMonths) est légale et représente un "cliff sans paliers" :
  // une seule tranche au cliff date, ramenée à 100 % par drift correction
  // si cliffPercentage < 100.
  if (!Number.isFinite(totalMonths) || totalMonths < cliffMonths) return [];

  const start = parseIsoDate(grantDate);
  if (!start) return [];

  const interval = FREQ_INTERVAL_MONTHS[frequency];
  const postCliffMonths = Math.max(0, totalMonths - cliffMonths);
  const numPostTranches =
    postCliffMonths === 0 ? 0 : Math.max(1, Math.floor(postCliffMonths / interval));
  const remainingPercentage = 100 - cliffPercentage;
  const perTranche = numPostTranches > 0 ? remainingPercentage / numPostTranches : 0;

  const out: CliffLinearTranche[] = [];

  // Tranche 1 : cliff
  const cliffDate = addMonths(start, cliffMonths);
  let cumulative = cliffPercentage;
  out.push({
    index: 1,
    date: toIsoDate(cliffDate),
    percentage: cliffPercentage,
    cumulative,
    isCliff: true,
  });

  // Tranches post-cliff
  for (let i = 1; i <= numPostTranches; i++) {
    const date = addMonths(cliffDate, i * interval);
    cumulative += perTranche;
    out.push({
      index: i + 1,
      date: toIsoDate(date),
      percentage: perTranche,
      cumulative,
      isCliff: false,
    });
  }

  // Ajuste la dernière tranche pour que le cumul finisse exactement à 100
  // (corrige les erreurs d'arrondi accumulées sur perTranche)
  if (out.length > 0) {
    const last = out[out.length - 1]!;
    const drift = 100 - cumulative;
    if (Math.abs(drift) > 0.0001) {
      last.percentage += drift;
      last.cumulative = 100;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Date helpers — internal, naive (no TZ math) since we work in calendar dates.
// ---------------------------------------------------------------------------

function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const targetMonth = d.getUTCMonth() + months;
  d.setUTCMonth(targetMonth);
  // Si le jour-cible n'existe pas dans le mois cible (ex: 31 jan + 1 mois → 31 fev),
  // setUTCMonth aura roll-over ; on corrige en clampant au dernier jour.
  // Approche simple : si le mois résultant n'est pas le mois attendu modulo 12,
  // on revient au dernier jour du mois précédent.
  const expectedMonth = ((targetMonth % 12) + 12) % 12;
  if (d.getUTCMonth() !== expectedMonth) {
    d.setUTCDate(0);
  }
  return d;
}

function toIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
