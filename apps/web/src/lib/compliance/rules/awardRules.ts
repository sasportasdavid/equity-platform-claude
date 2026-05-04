import type { ComplianceRule } from '../types';
import { readNumberParam, readSeverity } from './_helpers';

/**
 * Règles compliance V1 — Module 3b B7 (initial) + Module 10 B7 (AGA cap)
 * + Module 12.5 B1 (wiring effectiveParamsByRule + effectiveSeverityByRule).
 *
 * Spec : docs/MODULE_03B_AWARDS_LIFECYCLE.md §7 + docs/MODULE_12_*.md §3.2.
 *
 * 5 règles V1 (toutes wired DB Module 12 B3b — codes seedés en
 * `compliance_rule_definitions`) :
 *   1. BSPCE_BENEFICIARY_TYPE  (hard, no params) — BSPCE réservés salariés/dirigeants
 *   2. AGA_30_PERCENT_CAP      (hard, capPct)    — max N % du capital en AGA cumulées
 *   3. AGA_APPROACHING_CAP     (soft, warningPct/capPct) — soft warning approche cap
 *   4. POOL_AVAILABLE          (hard, no params) — duplicat trigger DB pour UX
 *   5. GRANT_DATE_RECENT       (soft, maxDaysAgo) — warning si grant_date > N jours ago
 *
 * Module 12.5 B1 — Lecture des seuils + severity depuis DB :
 *   - Les 3 rules paramétriques lisent leur seuil via `readNumberParam(ctx, code,
 *     paramName, default)`. Si DB indispo / param absent → fallback sur la
 *     constante hard-codée historique (ex: `30` % pour AGA_30_PERCENT_CAP).
 *   - Toutes les 5 rules respectent `effectiveSeverityByRule` (admin peut
 *     downgrade ERROR→WARNING ou inversement). Fallback sur la severity legacy.
 *   - Le wiring complet (loadEffectiveRule × 5 + injection ctx) est fait dans
 *     `runComplianceChecks` (`runChecks.ts`).
 *
 * Constantes fallback historiques (Module 3b B7 / Module 10 B7) :
 */
const AGA_CAP_PCT_DEFAULT = 30; // % en valeur entière (UI lit en %)
const AGA_APPROACHING_PCT_DEFAULT = 27; // seuil soft warning, < cap_pct par contrat UI
const GRANT_DATE_MAX_DAYS_DEFAULT = 30;

export const BSPCE_BENEFICIARY_TYPE: ComplianceRule = {
  code: 'BSPCE_BENEFICIARY_TYPE',
  description: 'BSPCE : bénéficiaire doit être salarié ou dirigeant (pas consultant/external)',
  appliesTo: ['BSPCE'],
  enforcement: 'hard',
  check: (_data, ctx) => {
    const allowed = ['EMPLOYEE', 'OFFICER'];
    if (allowed.includes(ctx.beneficiary.beneficiary_type)) return null;
    const severity = readSeverity(ctx, 'BSPCE_BENEFICIARY_TYPE', 'ERROR');
    return {
      severity,
      code: 'BSPCE_BENEFICIARY_TYPE',
      message: `BSPCE : seuls les salariés et dirigeants éligibles. Type actuel : ${ctx.beneficiary.beneficiary_type}.`,
      suggestedAction: 'Pour un consultant externe, utiliser un plan BSA à la place.',
    };
  },
};

export const AGA_30_PERCENT_CAP: ComplianceRule = {
  code: 'AGA_30_PERCENT_CAP',
  description: 'AGA : pas plus de N % du capital alloué en AGA cumulées (cap légal 30 %)',
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
    const capPct = readNumberParam(ctx, 'AGA_30_PERCENT_CAP', 'capPct', AGA_CAP_PCT_DEFAULT);
    const cap = capPct / 100;
    const newTotal = ctx.agaAllocatedTotal + data.unitsGranted;
    const pct = newTotal / ctx.companyTotalShares;
    if (pct <= cap) return null;
    const severity = readSeverity(ctx, 'AGA_30_PERCENT_CAP', 'ERROR');
    return {
      severity,
      code: 'AGA_30_PERCENT_CAP',
      message: `AGA : ${(pct * 100).toFixed(1)} % du capital après cette attribution (max légal ${capPct} %).`,
      suggestedAction: 'Réduire les units ou attendre une augmentation de capital.',
    };
  },
};

/**
 * Module 10 B7 — Soft warning quand on approche du cap AGA légal.
 *
 * Seuil V1 : `warningPct` (default 27 %) configurable via DB Module 12.
 * La rule retourne `null` si on a déjà dépassé `capPct` (cas géré par
 * AGA_30_PERCENT_CAP). Pas de validation cross-field stricte côté checker
 * (V1.5 : UI cross-validate `warningPct < capPct`).
 *
 * Spec §5.1 (`AGA_APPROACHING_CAP`).
 */
export const AGA_APPROACHING_CAP: ComplianceRule = {
  code: 'AGA_APPROACHING_CAP',
  description: 'AGA : warning si > N % du capital alloué (approche cap légal)',
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
    const warningPct = readNumberParam(
      ctx,
      'AGA_APPROACHING_CAP',
      'warningPct',
      AGA_APPROACHING_PCT_DEFAULT,
    );
    const capPct = readNumberParam(ctx, 'AGA_30_PERCENT_CAP', 'capPct', AGA_CAP_PCT_DEFAULT);
    const newTotal = ctx.agaAllocatedTotal + data.unitsGranted;
    const pct = newTotal / ctx.companyTotalShares;
    // Skip si en dessous du seuil de warning OU si déjà au-delà du cap (hard rule prend la main)
    if (pct <= warningPct / 100 || pct > capPct / 100) return null;
    const severity = readSeverity(ctx, 'AGA_APPROACHING_CAP', 'WARNING');
    return {
      severity,
      code: 'AGA_APPROACHING_CAP',
      message: `Cap AGA bientôt atteint : ${(pct * 100).toFixed(1)} % (max légal ${capPct} %).`,
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
    const severity = readSeverity(ctx, 'POOL_AVAILABLE', 'ERROR');
    return {
      severity,
      code: 'POOL_AVAILABLE',
      message: `Pool insuffisant : ${ctx.poolStatus.remaining.toLocaleString('fr-FR')} unités restantes, ${data.unitsGranted.toLocaleString('fr-FR')} demandées.`,
      suggestedAction: 'Réduire les units ou agrandir le pool du plan.',
    };
  },
};

export const GRANT_DATE_RECENT: ComplianceRule = {
  code: 'GRANT_DATE_RECENT',
  description: 'grant_date ne doit pas être antidatée de plus de N jours',
  appliesTo: ['*'],
  enforcement: 'soft',
  check: (data, ctx) => {
    const grantTs = Date.parse(data.grantDate);
    if (!Number.isFinite(grantTs)) return null;
    const maxDaysAgo = readNumberParam(
      ctx,
      'GRANT_DATE_RECENT',
      'maxDaysAgo',
      GRANT_DATE_MAX_DAYS_DEFAULT,
    );
    const diffDays = (Date.now() - grantTs) / (1000 * 60 * 60 * 24);
    if (diffDays <= maxDaysAgo) return null;
    const severity = readSeverity(ctx, 'GRANT_DATE_RECENT', 'WARNING');
    return {
      severity,
      code: 'GRANT_DATE_RECENT',
      message: `Date d'attribution antérieure de ${Math.round(diffDays)} jours (seuil ${maxDaysAgo} jours). Justifier dans les notes (back-dating).`,
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
