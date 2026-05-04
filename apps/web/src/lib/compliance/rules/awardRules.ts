import type { ComplianceRule } from '../types';

/**
 * Règles compliance V1 — Module 3b B7.
 *
 * Spec : docs/MODULE_03B_AWARDS_LIFECYCLE.md §7.
 *
 * 4 règles V1 :
 *   1. BSPCE_BENEFICIARY_TYPE  (hard) — BSPCE réservés aux salariés/dirigeants
 *   2. AGA_30_PERCENT_CAP      (hard) — max 30 % du capital en AGA cumulées
 *   3. POOL_AVAILABLE          (hard) — duplicat du trigger DB pour UX
 *   4. GRANT_DATE_RECENT       (soft) — warning si grant_date > 30j ago
 *
 * Toutes les checks sont pure functions (sauf accès au ctx déjà chargé).
 * Le caller (`runComplianceChecks`) charge les contextes en amont.
 *
 * Limitations V1 documentées :
 *   - AGA_30_PERCENT_CAP retourne null si `companyTotalShares` ou
 *     `agaAllocatedTotal` ne sont pas dispo (Module 10 pas livré).
 *     Le check sera complet en V2 (Module 10 cap table) ou Module 12.
 */

export const BSPCE_BENEFICIARY_TYPE: ComplianceRule = {
  code: 'BSPCE_BENEFICIARY_TYPE',
  description: 'BSPCE : bénéficiaire doit être salarié ou dirigeant (pas consultant/external)',
  appliesTo: ['BSPCE'],
  enforcement: 'hard',
  check: (_data, ctx) => {
    const allowed = ['EMPLOYEE', 'OFFICER'];
    if (allowed.includes(ctx.beneficiary.beneficiary_type)) return null;
    return {
      severity: 'ERROR',
      code: 'BSPCE_BENEFICIARY_TYPE',
      message: `BSPCE : seuls les salariés et dirigeants éligibles. Type actuel : ${ctx.beneficiary.beneficiary_type}.`,
      suggestedAction: 'Pour un consultant externe, utiliser un plan BSA à la place.',
    };
  },
};

export const AGA_30_PERCENT_CAP: ComplianceRule = {
  code: 'AGA_30_PERCENT_CAP',
  description: 'AGA : pas plus de 30 % du capital alloué en AGA cumulées',
  appliesTo: ['AGA'],
  enforcement: 'hard',
  check: (data, ctx) => {
    // Module 10 B7 : ctx maintenant chargé via compute_cap_table.
    // Skip si la cap table est vide (orgs early-stage avant 1ère levée).
    if (
      ctx.companyTotalShares == null ||
      ctx.companyTotalShares <= 0 ||
      ctx.agaAllocatedTotal == null
    ) {
      return null;
    }
    const newTotal = ctx.agaAllocatedTotal + data.unitsGranted;
    const pct = newTotal / ctx.companyTotalShares;
    if (pct <= 0.3) return null;
    return {
      severity: 'ERROR',
      code: 'AGA_30_PERCENT_CAP',
      message: `AGA : ${(pct * 100).toFixed(1)} % du capital après cette attribution (max légal 30 %).`,
      suggestedAction: 'Réduire les units ou attendre une augmentation de capital.',
    };
  },
};

/**
 * Module 10 B7 — Soft warning quand on approche du cap AGA légal (27 %+ < 30 %).
 *
 * Séparée de AGA_30_PERCENT_CAP (hard) car le runner bucket par
 * `rule.enforcement`, pas par `issue.severity`. Spec §5.1 (`AGA_APPROACHING_CAP`).
 */
export const AGA_APPROACHING_CAP: ComplianceRule = {
  code: 'AGA_APPROACHING_CAP',
  description: 'AGA : warning si > 27 % du capital alloué (approche cap légal 30 %)',
  appliesTo: ['AGA'],
  enforcement: 'soft',
  check: (data, ctx) => {
    if (
      ctx.companyTotalShares == null ||
      ctx.companyTotalShares <= 0 ||
      ctx.agaAllocatedTotal == null
    ) {
      return null;
    }
    const newTotal = ctx.agaAllocatedTotal + data.unitsGranted;
    const pct = newTotal / ctx.companyTotalShares;
    if (pct <= 0.27 || pct > 0.3) return null; // > 30% géré par AGA_30_PERCENT_CAP
    return {
      severity: 'WARNING',
      code: 'AGA_APPROACHING_CAP',
      message: `Cap AGA bientôt atteint : ${(pct * 100).toFixed(1)} % (max légal 30 %).`,
      suggestedAction: 'Anticiper une augmentation de capital avant la prochaine attribution AGA.',
    };
  },
};

export const POOL_AVAILABLE: ComplianceRule = {
  code: 'POOL_AVAILABLE',
  description: 'Pool restant doit être ≥ units demandées',
  appliesTo: ['*'],
  enforcement: 'hard',
  check: (data, ctx) => {
    if (ctx.poolStatus.remaining >= data.unitsGranted) return null;
    return {
      severity: 'ERROR',
      code: 'POOL_AVAILABLE',
      message: `Pool insuffisant : ${ctx.poolStatus.remaining.toLocaleString('fr-FR')} unités restantes, ${data.unitsGranted.toLocaleString('fr-FR')} demandées.`,
      suggestedAction: 'Réduire les units ou agrandir le pool du plan.',
    };
  },
};

export const GRANT_DATE_RECENT: ComplianceRule = {
  code: 'GRANT_DATE_RECENT',
  description: 'grant_date ne doit pas être antidatée de plus de 30 jours',
  appliesTo: ['*'],
  enforcement: 'soft',
  check: (data) => {
    const grantTs = Date.parse(data.grantDate);
    if (!Number.isFinite(grantTs)) return null;
    const diffDays = (Date.now() - grantTs) / (1000 * 60 * 60 * 24);
    if (diffDays <= 30) return null;
    return {
      severity: 'WARNING',
      code: 'GRANT_DATE_RECENT',
      message: `Date d'attribution antérieure de ${Math.round(diffDays)} jours. Justifier dans les notes (back-dating).`,
      suggestedAction: "Documenter la raison de l'antidate (décision board, retro acquittement…).",
    };
  },
};

export const AWARD_RULES: ComplianceRule[] = [
  BSPCE_BENEFICIARY_TYPE,
  AGA_30_PERCENT_CAP,
  AGA_APPROACHING_CAP,
  POOL_AVAILABLE,
  GRANT_DATE_RECENT,
];
