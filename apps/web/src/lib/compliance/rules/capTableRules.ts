/**
 * Module 10 B7 — Compliance rules cap table.
 *
 * Spec : docs/MODULE_10_CAP_TABLE.md §5.1.
 *
 * 4 rules livrées V1 (la 5e — `AGA_30_PERCENT_CAP` — est dans `awardRules.ts`,
 * activée en B7 via le ctx loader `runComplianceChecks` qui charge maintenant
 * la cap table) :
 *
 *   1. POOL_OVER_ALLOCATION (hard) — pool ESOP non sur-alloué (positions
 *      ESOP cumulées <= pool_total_units de la classe ESOP)
 *   2. SHARE_CLASS_CODE_UNIQUE (hard) — code unique par org
 *   3. ROUND_AMOUNT_CONSISTENCY (hard) — sum(investor.amount) ≈ amount_raised
 *      (tolérance 1%)
 *   4. ESOP_PERCENT_BEST_PRACTICE (soft) — pool entre 5% et 20% du capital
 *      pré-pool
 *
 * Pattern aligné Module 3b/4/5/6 : pure functions + appliesTo + enforcement.
 */

import type {
  CapTableCheckContext,
  CapTableCheckInput,
  CapTableFundingRoundCheckInput,
  CapTablePoolTopupCheckInput,
  CapTableShareClassCheckInput,
  ComplianceRule,
} from '../types';

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
    return {
      severity: 'ERROR',
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
  description: 'Sum(investor.amount) ≈ amount_raised (tolérance 1%)',
  appliesTo: ['FUNDING_ROUND_CREATE'],
  enforcement: 'hard',
  check: (data) => {
    if (data.scope !== 'FUNDING_ROUND_CREATE') return null;
    const sumInvestors = data.investors.reduce((s, i) => s + i.amount, 0);
    const tolerance = data.amountRaised * 0.01;
    if (Math.abs(sumInvestors - data.amountRaised) <= tolerance) return null;
    return {
      severity: 'ERROR',
      code: 'ROUND_AMOUNT_INCONSISTENT',
      message: `Somme investisseurs (${sumInvestors.toLocaleString('fr-FR')} €) ne correspond pas au montant levé (${data.amountRaised.toLocaleString('fr-FR')} €) à ±1 %.`,
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
 * dans awardRules.ts). Cette rule capture le cas spécifique d'un pool ESOP
 * créé avec un poolTotalUnits invalide ou top-up qui pousse au-delà du
 * raisonnable.
 *
 * V1 simple : reject si poolTotalUnits <= 0 (déjà couvert par Zod, mais
 * gate compliance pour cohérence). V2 = check vs ESOP existing positions.
 */
export const POOL_OVER_ALLOCATION: ComplianceRule<CapTableCheckInput, CapTableCheckContext> = {
  code: 'POOL_OVER_ALLOCATION',
  description: 'Pool ESOP : poolTotalUnits doit être > 0 (sanity check)',
  appliesTo: ['SHARE_CLASS_CREATE', 'POOL_TOPUP_SCENARIO'],
  enforcement: 'hard',
  check: (data) => {
    if (data.scope === 'SHARE_CLASS_CREATE' && data.classType === 'ESOP') {
      if (data.poolTotalUnits == null || data.poolTotalUnits <= 0) {
        return {
          severity: 'ERROR',
          code: 'POOL_OVER_ALLOCATION',
          message: 'Pool ESOP : poolTotalUnits doit être > 0',
          suggestedAction: 'Définir une taille de pool positive (ex: 10000 units).',
        };
      }
    }
    if (data.scope === 'POOL_TOPUP_SCENARIO') {
      if (data.poolTotalUnits <= 0) {
        return {
          severity: 'ERROR',
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

export const ESOP_PERCENT_BEST_PRACTICE: ComplianceRule<CapTableCheckInput, CapTableCheckContext> =
  {
    code: 'ESOP_PERCENT_BEST_PRACTICE',
    description: 'Pool ESOP recommandé entre 5 % et 20 % du capital pré-pool',
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

      const poolPercent = poolUnits / ctx.companyTotalSharesIncludingPool;
      if (poolPercent < 0.05) {
        return {
          severity: 'WARNING',
          code: 'ESOP_TOO_SMALL',
          message: `Pool ESOP de ${(poolPercent * 100).toFixed(1)} % en dessous du standard marché (5–15 % recommandé).`,
          suggestedAction: "Envisager d'augmenter le pool pour rester compétitif au recrutement.",
        };
      }
      if (poolPercent > 0.2) {
        return {
          severity: 'WARNING',
          code: 'ESOP_TOO_LARGE',
          message: `Pool ESOP de ${(poolPercent * 100).toFixed(1)} % au-dessus du standard marché (5–15 % recommandé). Dilution founders importante.`,
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
