/**
 * Module 10 B7 — Compliance rules cap table.
 * Module 12.5 B3 — Wiring effectiveParamsByRule + effectiveSeverityByRule.
 *
 * Spec : docs/MODULE_10_CAP_TABLE.md §5.1 + docs/MODULE_12_*.md §3.2.
 *
 * 4 rules livrées V1 (la 5e — `AGA_30_PERCENT_CAP` — est dans `awardRules.ts`,
 * activée en B7 via le ctx loader `runComplianceChecks` qui charge maintenant
 * la cap table) :
 *
 *   1. POOL_OVER_ALLOCATION (hard, no params) — pool ESOP non sur-alloué
 *   2. SHARE_CLASS_CODE_UNIQUE (hard, no params) — code unique par org
 *   3. ROUND_AMOUNT_CONSISTENCY (hard, `tolerancePct` default 1 %) —
 *      sum(investor.amount) ≈ amount_raised, tolérance relative configurable
 *   4. ESOP_PERCENT_BEST_PRACTICE (soft, `minPct`/`maxPct` default 5/15) —
 *      pool entre N % et M % du capital pré-pool ; cross-validation min < max
 *
 * Module 12.5 B3 lecture DB :
 *   - Les 4 rules respectent `effectiveSeverityByRule` (admin remap E↔W).
 *   - 2 rules paramétriques lisent leurs seuils via `readNumberParam`.
 *   - ESOP_PERCENT_BEST_PRACTICE applique une cross-validation : si DB renvoie
 *     `minPct >= maxPct` (config invalide théoriquement possible si admin
 *     malveillant ou bug UI), on fallback aux defaults `(5, 15)` + warn console.
 *   - Migration 00094c (Module 12.5 B3) : ROUND_AMOUNT_CONSISTENCY param
 *     `toleranceEur` → `tolerancePct` (1 % default), naming aligné code/DB.
 */

import type {
  CapTableCheckContext,
  CapTableCheckInput,
  CapTableFundingRoundCheckInput,
  CapTablePoolTopupCheckInput,
  CapTableShareClassCheckInput,
  ComplianceRule,
} from '../types';
import { readNumberParam, readSeverity } from './_helpers';

const ROUND_TOLERANCE_PCT_DEFAULT = 1; // 1 % en valeur entière (UI lit en %)
const ESOP_MIN_PCT_DEFAULT = 5;
const ESOP_MAX_PCT_DEFAULT = 15;

// ---------------------------------------------------------------------------
// 1. SHARE_CLASS_CODE_UNIQUE
// ---------------------------------------------------------------------------

export const SHARE_CLASS_CODE_UNIQUE: ComplianceRule<CapTableCheckInput, CapTableCheckContext> = {
  code: 'SHARE_CLASS_CODE_UNIQUE',
  description: "Code de classe d'actions unique par org",
  appliesTo: ['SHARE_CLASS_CREATE'],
  enforcement: 'hard',
  check: (data, ctx) => {
    if (data.scope !== 'SHARE_CLASS_CREATE') return null;
    if (!ctx.existingShareClassCodes.has(data.code.toUpperCase())) return null;
    const severity = readSeverity(ctx, 'SHARE_CLASS_CODE_UNIQUE', 'ERROR');
    return {
      severity,
      code: 'SHARE_CLASS_CODE_DUPLICATE',
      message: `Une classe avec le code "${data.code}" existe déjà dans votre organisation.`,
      suggestedAction: 'Choisissez un autre code (ex: PREF_B au lieu de PREF_A).',
    };
  },
};

// ---------------------------------------------------------------------------
// 2. ROUND_AMOUNT_CONSISTENCY
// ---------------------------------------------------------------------------

export const ROUND_AMOUNT_CONSISTENCY: ComplianceRule<CapTableCheckInput, CapTableCheckContext> = {
  code: 'ROUND_AMOUNT_CONSISTENCY',
  description: 'Sum(investor.amount) ≈ amount_raised (tolérance relative configurable)',
  appliesTo: ['FUNDING_ROUND_CREATE'],
  enforcement: 'hard',
  check: (data, ctx) => {
    if (data.scope !== 'FUNDING_ROUND_CREATE') return null;
    const tolerancePct = readNumberParam(
      ctx,
      'ROUND_AMOUNT_CONSISTENCY',
      'tolerancePct',
      ROUND_TOLERANCE_PCT_DEFAULT,
    );
    const sumInvestors = data.investors.reduce((s, i) => s + i.amount, 0);
    const tolerance = (data.amountRaised * tolerancePct) / 100;
    if (Math.abs(sumInvestors - data.amountRaised) <= tolerance) return null;
    const severity = readSeverity(ctx, 'ROUND_AMOUNT_CONSISTENCY', 'ERROR');
    return {
      severity,
      code: 'ROUND_AMOUNT_INCONSISTENT',
      message: `Somme investisseurs (${sumInvestors.toLocaleString('fr-FR')} €) ne correspond pas au montant levé (${data.amountRaised.toLocaleString('fr-FR')} €) à ±${tolerancePct} %.`,
      suggestedAction: 'Vérifier les montants par investisseur ou ajuster amount_raised.',
    };
  },
};

// ---------------------------------------------------------------------------
// 3. POOL_OVER_ALLOCATION
// ---------------------------------------------------------------------------

/**
 * Vérifie qu'un pool ESOP nouvellement créé ou top-uppé tient dans une
 * fourchette saine (poolTotalUnits > 0). La vérif "déjà alloué + nouveau
 * grant <= pool_total_units" est faite au niveau award (POOL_AVAILABLE
 * dans awardRules.ts).
 *
 * V1 simple : reject si poolTotalUnits <= 0 (déjà couvert par Zod, mais
 * gate compliance pour cohérence). V2 = check vs ESOP existing positions.
 */
export const POOL_OVER_ALLOCATION: ComplianceRule<CapTableCheckInput, CapTableCheckContext> = {
  code: 'POOL_OVER_ALLOCATION',
  description: 'Pool ESOP : poolTotalUnits doit être > 0 (sanity check)',
  appliesTo: ['SHARE_CLASS_CREATE', 'POOL_TOPUP_SCENARIO'],
  enforcement: 'hard',
  check: (data, ctx) => {
    const severity = readSeverity(ctx, 'POOL_OVER_ALLOCATION', 'ERROR');
    if (data.scope === 'SHARE_CLASS_CREATE' && data.classType === 'ESOP') {
      if (data.poolTotalUnits == null || data.poolTotalUnits <= 0) {
        return {
          severity,
          code: 'POOL_OVER_ALLOCATION',
          message: 'Pool ESOP : poolTotalUnits doit être > 0',
          suggestedAction: 'Définir une taille de pool positive (ex: 10000 units).',
        };
      }
    }
    if (data.scope === 'POOL_TOPUP_SCENARIO') {
      if (data.poolTotalUnits <= 0) {
        return {
          severity,
          code: 'POOL_OVER_ALLOCATION',
          message: 'Top-up pool : nouveaux units doivent être > 0',
        };
      }
    }
    return null;
  },
};

// ---------------------------------------------------------------------------
// 4. ESOP_PERCENT_BEST_PRACTICE
// ---------------------------------------------------------------------------

/**
 * Pool ESOP recommandé entre `minPct` et `maxPct` du capital pré-pool.
 * Defaults DB (00094b) : minPct=5, maxPct=15.
 *
 * Module 12.5 B3 — Cross-validation : si la config DB est invalide
 * (`minPct >= maxPct`, théoriquement possible si admin contournant l'UI ou
 * bug en V1.5), on fallback aux defaults `(5, 15)` et on log un warning
 * console. Pas de crash, pas de rejet silencieux.
 */
export const ESOP_PERCENT_BEST_PRACTICE: ComplianceRule<CapTableCheckInput, CapTableCheckContext> =
  {
    code: 'ESOP_PERCENT_BEST_PRACTICE',
    description: 'Pool ESOP recommandé entre minPct % et maxPct % du capital pré-pool',
    appliesTo: ['SHARE_CLASS_CREATE', 'POOL_TOPUP_SCENARIO'],
    enforcement: 'soft',
    check: (data, ctx) => {
      let poolUnits: number | null = null;
      if (data.scope === 'SHARE_CLASS_CREATE') {
        if (data.classType !== 'ESOP') return null;
        poolUnits = data.poolTotalUnits ?? null;
      } else if (data.scope === 'POOL_TOPUP_SCENARIO') {
        poolUnits = data.poolTotalUnits;
      } else {
        return null;
      }

      if (
        poolUnits == null ||
        poolUnits <= 0 ||
        ctx.companyTotalSharesIncludingPool == null ||
        ctx.companyTotalSharesIncludingPool <= 0
      ) {
        return null;
      }

      // Cross-validation defensive : minPct < maxPct. Sinon fallback defaults.
      let minPct = readNumberParam(
        ctx,
        'ESOP_PERCENT_BEST_PRACTICE',
        'minPct',
        ESOP_MIN_PCT_DEFAULT,
      );
      let maxPct = readNumberParam(
        ctx,
        'ESOP_PERCENT_BEST_PRACTICE',
        'maxPct',
        ESOP_MAX_PCT_DEFAULT,
      );
      if (minPct >= maxPct) {
        console.warn(
          `[Module 12.5] ESOP_PERCENT_BEST_PRACTICE : config invalide (minPct=${minPct} >= maxPct=${maxPct}). Fallback defaults (${ESOP_MIN_PCT_DEFAULT}, ${ESOP_MAX_PCT_DEFAULT}).`,
        );
        minPct = ESOP_MIN_PCT_DEFAULT;
        maxPct = ESOP_MAX_PCT_DEFAULT;
      }

      const poolPercent = poolUnits / ctx.companyTotalSharesIncludingPool;
      const severity = readSeverity(ctx, 'ESOP_PERCENT_BEST_PRACTICE', 'WARNING');
      if (poolPercent < minPct / 100) {
        return {
          severity,
          code: 'ESOP_TOO_SMALL',
          message: `Pool ESOP de ${(poolPercent * 100).toFixed(1)} % en dessous du standard marché (${minPct}–${maxPct} % recommandé).`,
          suggestedAction: "Envisager d'augmenter le pool pour rester compétitif au recrutement.",
        };
      }
      if (poolPercent > maxPct / 100) {
        return {
          severity,
          code: 'ESOP_TOO_LARGE',
          message: `Pool ESOP de ${(poolPercent * 100).toFixed(1)} % au-dessus du standard marché (${minPct}–${maxPct} % recommandé). Dilution founders importante.`,
          suggestedAction: 'Envisager de réduire le pool ou de planifier des top-ups successifs.',
        };
      }
      return null;
    },
  };

// ---------------------------------------------------------------------------
// Export collection
// ---------------------------------------------------------------------------

export const CAP_TABLE_RULES: ComplianceRule<CapTableCheckInput, CapTableCheckContext>[] = [
  SHARE_CLASS_CODE_UNIQUE,
  ROUND_AMOUNT_CONSISTENCY,
  POOL_OVER_ALLOCATION,
  ESOP_PERCENT_BEST_PRACTICE,
];

// Re-exports utiles pour les tests (typing helpers)
export type {
  CapTableShareClassCheckInput,
  CapTableFundingRoundCheckInput,
  CapTablePoolTopupCheckInput,
};
