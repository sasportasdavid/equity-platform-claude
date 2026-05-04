import type {
  ComplianceIssue,
  ComplianceRule,
  ValuationCheckContext,
  ValuationCheckInput,
} from '../types';
import { readNumberParam, readSeverity } from './_helpers';

/**
 * Module 11 B6 — Compliance rules valuation IFRS 2.
 * Module 12 B2 — Refactor : lecture des seuils depuis `ctx.effectiveParamsByRule`
 *                (pré-chargé via `loadEffectiveRule` dans `runChecks.ts`).
 *                Fallback sur les constantes hard-codées si absent.
 * Module 12.5 B1 — Helpers `readNumberParam` / `readSeverity` extraits dans
 *                  `_helpers.ts` (partagés avec awardRules + autres scopes).
 *
 * 2 rules V1 :
 *   1. VALUATION_STALE_BLOCKING (hard)  — valuation IFRS 2 obligatoire
 *      datée de moins de N jours (default 90, configurable par org via
 *      `compliance_rule_overrides.params_override.staleDays`).
 *   2. FMV_DEVIATION_WARNING   (soft)  — alerte si la dernière FMV
 *      diffère de plus de X % de la précédente (default 20, configurable
 *      via `params_override.deviationPct`).
 *
 * Pattern aligné Module 3b/4/5/6/10 : pure functions avec `data` et `ctx`,
 * retourne `ComplianceIssue | null`. Le ctx est pré-chargé dans
 * `runChecks.ts` (`runValuationComplianceChecks`).
 *
 * Severity dynamique (Module 12 B2) : si `ctx.effectiveSeverityByRule` est
 * fourni avec une valeur DB, on remap `'error'`→`'ERROR'` / `'warning'`→
 * `'WARNING'`. Sinon, les rules conservent leur severity historique
 * (`hard`→`'ERROR'`, `soft`→`'WARNING'`).
 *
 * Spec : docs/MODULE_11_IFRS2_VALUATION_VIZ.md §6 + docs/MODULE_12_*.md §3.2.
 */

/** Fallback constantes Module 11 B6 — utilisées si DB Module 12 indispo. */
const STALE_THRESHOLD_DAYS_DEFAULT = 90;
const FMV_DEVIATION_THRESHOLD_DEFAULT = 0.2; // 20 %

export const VALUATION_STALE_BLOCKING: ComplianceRule<ValuationCheckInput, ValuationCheckContext> =
  {
    code: 'VALUATION_STALE_BLOCKING',
    description: `Valorisation IFRS 2 datée de moins de N jours obligatoire pour grant (seuil configurable par org)`,
    appliesTo: ['*'],
    enforcement: 'hard',
    check: (_data, ctx): ComplianceIssue | null => {
      const staleDays = readNumberParam(
        ctx,
        'VALUATION_STALE_BLOCKING',
        'staleDays',
        STALE_THRESHOLD_DAYS_DEFAULT,
      );
      const severity = readSeverity(ctx, 'VALUATION_STALE_BLOCKING', 'ERROR');

      if (!ctx.latestRun) {
        return {
          severity,
          code: 'VALUATION_STALE_BLOCKING',
          message: 'Aucune valorisation IFRS 2 disponible pour ce plan.',
          suggestedAction:
            'Lancer une simulation Monte Carlo depuis la page Valorisations du plan avant de proposer cet award.',
        };
      }
      const completedTs = Date.parse(ctx.latestRun.completedAt);
      if (!Number.isFinite(completedTs)) return null;
      const ageDays = Math.floor((Date.now() - completedTs) / (1000 * 60 * 60 * 24));
      if (ageDays <= staleDays) return null;
      return {
        severity,
        code: 'VALUATION_STALE_BLOCKING',
        message: `Valorisation périmée : ${ageDays} jours (seuil IFRS 2 = ${staleDays} jours).`,
        suggestedAction:
          'Relancer une simulation Monte Carlo avant de proposer cet award (page Valorisations du plan).',
      };
    },
  };

export const FMV_DEVIATION_WARNING: ComplianceRule<ValuationCheckInput, ValuationCheckContext> = {
  code: 'FMV_DEVIATION_WARNING',
  description: `Alerte si dernière FMV s'écarte de >X % vs précédente (seuil configurable par org)`,
  appliesTo: ['*'],
  enforcement: 'soft',
  check: (_data, ctx): ComplianceIssue | null => {
    // Le param est un pourcentage entier en DB (ex: 20 = 20%), converti en
    // fraction (0.20) ici pour cohérence avec la logique de calcul.
    const deviationPct = readNumberParam(
      ctx,
      'FMV_DEVIATION_WARNING',
      'deviationPct',
      FMV_DEVIATION_THRESHOLD_DEFAULT * 100,
    );
    const threshold = deviationPct / 100;
    const severity = readSeverity(ctx, 'FMV_DEVIATION_WARNING', 'WARNING');

    if (!ctx.latestRun || !ctx.previousRun) return null;
    const fvLatest = ctx.latestRun.fairValuePerUnit;
    const fvPrevious = ctx.previousRun.fairValuePerUnit;
    if (fvLatest == null || fvPrevious == null || fvPrevious === 0) return null;
    const deviation = Math.abs((fvLatest - fvPrevious) / fvPrevious);
    if (deviation <= threshold) return null;
    return {
      severity,
      code: 'FMV_DEVIATION_WARNING',
      message: `Déviation FMV ${(deviation * 100).toFixed(1)} % entre les 2 dernières valorisations (${fvPrevious.toFixed(2)} € → ${fvLatest.toFixed(2)} €).`,
      suggestedAction:
        'Vérifier la cohérence des inputs (volatilité, taux, dividend yield) entre les runs.',
    };
  },
};

export const VALUATION_RULES: ComplianceRule<ValuationCheckInput, ValuationCheckContext>[] = [
  VALUATION_STALE_BLOCKING,
  FMV_DEVIATION_WARNING,
];
