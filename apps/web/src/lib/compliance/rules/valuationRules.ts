import type { ComplianceRule, ValuationCheckContext, ValuationCheckInput } from '../types';

/**
 * Module 11 B6 — Compliance rules valuation IFRS 2.
 *
 * 2 rules V1 :
 *   1. VALUATION_STALE_BLOCKING (hard)  — valuation IFRS 2 obligatoire
 *      datée de moins de 90 jours pour pouvoir grant un award. Sinon,
 *      la fair value affichée pourrait être obsolète et exposer
 *      l'organisation à un risque IFRS 2 §16-22.
 *   2. FMV_DEVIATION_WARNING   (soft)  — alerte si la dernière FMV
 *      diffère de plus de 20 % de la précédente. Pas bloquant : un
 *      changement de hypothèse de marché peut légitimement entraîner
 *      ce delta. Mais à signaler à l'admin pour audit.
 *
 * Pattern aligné Module 3b/4/5/6/10 : pure functions avec `data` et `ctx`,
 * retourne `ComplianceIssue | null`. Le ctx est pré-chargé dans
 * `runChecks.ts` (`runValuationComplianceChecks`).
 *
 * Spec : docs/MODULE_11_IFRS2_VALUATION_VIZ.md §6 (compliance).
 */

const STALE_THRESHOLD_DAYS = 90;
const FMV_DEVIATION_THRESHOLD = 0.2; // 20 %

export const VALUATION_STALE_BLOCKING: ComplianceRule<ValuationCheckInput, ValuationCheckContext> =
  {
    code: 'VALUATION_STALE_BLOCKING',
    description: `Valorisation IFRS 2 datée de moins de ${STALE_THRESHOLD_DAYS} jours obligatoire pour grant`,
    appliesTo: ['*'],
    enforcement: 'hard',
    check: (_data, ctx) => {
      if (!ctx.latestRun) {
        return {
          severity: 'ERROR',
          code: 'VALUATION_STALE_BLOCKING',
          message: 'Aucune valorisation IFRS 2 disponible pour ce plan.',
          suggestedAction:
            'Lancer une simulation Monte Carlo depuis la page Valorisations du plan avant de proposer cet award.',
        };
      }
      const completedTs = Date.parse(ctx.latestRun.completedAt);
      if (!Number.isFinite(completedTs)) return null;
      const ageDays = Math.floor((Date.now() - completedTs) / (1000 * 60 * 60 * 24));
      if (ageDays <= STALE_THRESHOLD_DAYS) return null;
      return {
        severity: 'ERROR',
        code: 'VALUATION_STALE_BLOCKING',
        message: `Valorisation périmée : ${ageDays} jours (seuil IFRS 2 = ${STALE_THRESHOLD_DAYS} jours).`,
        suggestedAction:
          'Relancer une simulation Monte Carlo avant de proposer cet award (page Valorisations du plan).',
      };
    },
  };

export const FMV_DEVIATION_WARNING: ComplianceRule<ValuationCheckInput, ValuationCheckContext> = {
  code: 'FMV_DEVIATION_WARNING',
  description: `Alerte si dernière FMV s'écarte de >${(FMV_DEVIATION_THRESHOLD * 100).toFixed(0)} % vs précédente`,
  appliesTo: ['*'],
  enforcement: 'soft',
  check: (_data, ctx) => {
    if (!ctx.latestRun || !ctx.previousRun) return null;
    const fvLatest = ctx.latestRun.fairValuePerUnit;
    const fvPrevious = ctx.previousRun.fairValuePerUnit;
    if (fvLatest == null || fvPrevious == null || fvPrevious === 0) return null;
    const deviation = Math.abs((fvLatest - fvPrevious) / fvPrevious);
    if (deviation <= FMV_DEVIATION_THRESHOLD) return null;
    return {
      severity: 'WARNING',
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
