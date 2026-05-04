import type { BeneficiaryCheckContext, BeneficiaryCheckInput, ComplianceRule } from '../types';
import { readNumberParam, readSeverity } from './_helpers';

/**
 * Règles compliance V1 pour bénéficiaires — Module 4 B2 + B6
 * + Module 12.5 B2 (wiring effectiveParamsByRule + effectiveSeverityByRule).
 *
 * Spec : docs/MODULE_04_BENEFICIARIES_MANAGEMENT.md §6 + docs/MODULE_12_*.md §3.2.
 *
 * 6 règles V1 (toutes seedées DB Module 12 B3b) :
 *   1. EMAIL_UNIQUE_IN_ORG               (hard, severity only)
 *   2. TAX_RESIDENCE_FRANCE_CONSISTENCY  (hard code → soft DB drift, severity only)
 *   3. HIRE_DATE_REASONABLE               (mixte ⚠️, params minYear + maxFutureMonths)
 *   4. MANAGER_NOT_SELF                   (hard, severity only)
 *   5. IBAN_FORMAT                        (soft, severity only)
 *   6. BSPCE_BENEFICIARY_TYPE_REVERSE    (hard code → soft DB drift, severity only)
 *
 * Module 12.5 B2 — Lecture des seuils + severity depuis DB :
 *   - HIRE_DATE_REASONABLE lit 2 params (`minYear` + `maxFutureMonths`).
 *     Note : la sémantique V1 (warning sur N'IMPORTE QUEL futur) évolue vers
 *     V1.X — désormais une marge de `maxFutureMonths` mois (default 3) est
 *     tolérée. Cohérent avec le params_schema DB (00094b).
 *   - Toutes les 6 rules respectent `effectiveSeverityByRule` (admin peut
 *     remap ERROR↔WARNING via la page Module 12).
 *   - Anomalie #114 préservée V1 : sub-rule HIRE_DATE_INVALID (year < minYear)
 *     reste `severity='ERROR'` hardcoded (validation absurde, pas négociable
 *     côté admin). Seul HIRE_DATE_FUTURE lit la severity DB. V2 = split en
 *     2 rules distinctes.
 */

type BenRule = ComplianceRule<BeneficiaryCheckInput, BeneficiaryCheckContext>;

const HIRE_DATE_MIN_YEAR_DEFAULT = 1900;
const HIRE_DATE_MAX_FUTURE_MONTHS_DEFAULT = 3;

export const EMAIL_UNIQUE_IN_ORG: BenRule = {
  code: 'EMAIL_UNIQUE_IN_ORG',
  description: "L'email du bénéficiaire doit être unique dans l'organisation",
  appliesTo: ['*'],
  enforcement: 'hard',
  check: (data, ctx) => {
    if (!ctx.emailCollisionId) return null;
    // Si on update et que la collision est sur le même row → pas un doublon
    if (data.id && ctx.emailCollisionId === data.id) return null;
    const severity = readSeverity(ctx, 'EMAIL_UNIQUE_IN_ORG', 'ERROR');
    return {
      severity,
      code: 'EMAIL_UNIQUE_IN_ORG',
      message: `Un bénéficiaire avec l'email ${data.email} existe déjà dans cette organisation.`,
      suggestedAction: 'Utiliser un email différent ou modifier le bénéficiaire existant.',
    };
  },
};

export const TAX_RESIDENCE_FRANCE_CONSISTENCY: BenRule = {
  code: 'TAX_RESIDENCE_FRANCE_CONSISTENCY',
  description: 'Si tax_residence ≠ FR, isTaxResidentFrance doit être false',
  appliesTo: ['*'],
  enforcement: 'hard',
  check: (data, ctx) => {
    if (data.taxResidence !== 'FR' && data.isTaxResidentFrance === true) {
      const severity = readSeverity(ctx, 'TAX_RESIDENCE_FRANCE_CONSISTENCY', 'ERROR');
      return {
        severity,
        code: 'TAX_RESIDENCE_FRANCE_CONSISTENCY',
        message: `Tax residence ${data.taxResidence} mais isTaxResidentFrance=true. Incohérence.`,
        suggestedAction: 'Mettre isTaxResidentFrance=false pour un bénéficiaire non-résident FR.',
      };
    }
    return null;
  },
};

/**
 * HIRE_DATE_REASONABLE — params `minYear` (default 1900) + `maxFutureMonths`
 * (default 3). 2 sub-codes émis :
 *   - HIRE_DATE_INVALID : year < minYear → ERROR hardcoded (validation
 *     absurde, pas négociable côté admin — dette V2 #114 split).
 *   - HIRE_DATE_FUTURE : hire_date > now + maxFutureMonths → severity DB
 *     (default 'WARNING'). L'admin peut remap WARNING↔ERROR via Module 12.
 *
 * Évolution sémantique V1.X (Module 12.5 B2) : V1 émettait warning si
 * hire > now (pas de marge). V1.X tolère désormais `maxFutureMonths` mois
 * (default 3) — cohérent avec le params_schema DB seedé en 00094b.
 */
export const HIRE_DATE_REASONABLE: BenRule = {
  code: 'HIRE_DATE_REASONABLE',
  description:
    'hire_date doit être ≥ minYear et ne pas dépasser maxFutureMonths mois dans le futur',
  appliesTo: ['*'],
  enforcement: 'soft',
  check: (data, ctx) => {
    if (!data.hireDate) return null;
    const ts = Date.parse(data.hireDate);
    if (!Number.isFinite(ts)) return null;
    const minYear = readNumberParam(
      ctx,
      'HIRE_DATE_REASONABLE',
      'minYear',
      HIRE_DATE_MIN_YEAR_DEFAULT,
    );
    const maxFutureMonths = readNumberParam(
      ctx,
      'HIRE_DATE_REASONABLE',
      'maxFutureMonths',
      HIRE_DATE_MAX_FUTURE_MONTHS_DEFAULT,
    );
    const hire = new Date(ts);
    const hireYear = hire.getFullYear();
    if (hireYear < minYear) {
      return {
        // dette V2 #114 : sub-rule HIRE_DATE_INVALID = ERROR hardcoded
        severity: 'ERROR',
        code: 'HIRE_DATE_INVALID',
        message: `Date d'embauche ${data.hireDate} manifestement invalide (avant ${minYear}).`,
      };
    }
    const now = new Date();
    const futureLimit = new Date(now);
    futureLimit.setMonth(futureLimit.getMonth() + maxFutureMonths);
    if (hire > futureLimit) {
      const severity = readSeverity(ctx, 'HIRE_DATE_REASONABLE', 'WARNING');
      return {
        severity,
        code: 'HIRE_DATE_FUTURE',
        message: `Date d'embauche dans le futur (${data.hireDate}, > ${maxFutureMonths} mois). Confirmer.`,
        suggestedAction: 'Vérifier la date ou documenter (embauche à venir).',
      };
    }
    return null;
  },
};

export const MANAGER_NOT_SELF: BenRule = {
  code: 'MANAGER_NOT_SELF',
  description: 'manager_id ne peut pas pointer vers soi-même',
  appliesTo: ['*'],
  enforcement: 'hard',
  check: (data, ctx) => {
    if (!data.managerId || !data.id) return null;
    if (data.managerId === data.id) {
      const severity = readSeverity(ctx, 'MANAGER_NOT_SELF', 'ERROR');
      return {
        severity,
        code: 'MANAGER_NOT_SELF',
        message: 'Un bénéficiaire ne peut pas être son propre manager.',
        suggestedAction: 'Choisir un autre bénéficiaire comme manager.',
      };
    }
    return null;
  },
};

export const IBAN_FORMAT: BenRule = {
  code: 'IBAN_FORMAT',
  description: 'IBAN format basique (2 lettres + 2 chiffres + alphanumérique)',
  appliesTo: ['*'],
  enforcement: 'soft',
  check: (data, ctx) => {
    if (!data.iban) return null;
    const cleaned = data.iban.replace(/\s/g, '');
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/i.test(cleaned)) {
      const severity = readSeverity(ctx, 'IBAN_FORMAT', 'WARNING');
      return {
        severity,
        code: 'IBAN_INVALID_FORMAT',
        message: `Format IBAN suspect (${data.iban}). Vérifier.`,
        suggestedAction: 'Format attendu : 2 lettres pays + 2 chiffres + alphanumérique.',
      };
    }
    return null;
  },
};

/**
 * Module 4 B6 — BSPCE_BENEFICIARY_TYPE_REVERSE.
 *
 * Bloque le passage d'un bénéficiaire en CONSULTANT/EXTERNAL s'il porte
 * encore des awards BSPCE actifs. Les BSPCE sont réservés aux salariés et
 * dirigeants par le CGI art. 163 bis G : un consultant/externe ne peut pas
 * en détenir.
 *
 * Module 12 B3b drift severity : DB seedée `'warning'` (vs `'ERROR'` code) —
 * Module 12.5 B2 lit la severity DB pour respecter la décision admin
 * (certaines orgs préfèrent terminer manuellement les awards plutôt que
 * le hard block).
 */
const RISKY_TYPES_FOR_BSPCE = new Set(['CONSULTANT', 'EXTERNAL']);

export const BSPCE_BENEFICIARY_TYPE_REVERSE: BenRule = {
  code: 'BSPCE_BENEFICIARY_TYPE_REVERSE',
  description:
    "Empêche de changer un bénéficiaire en CONSULTANT/EXTERNAL s'il a des awards BSPCE actifs",
  appliesTo: ['*'],
  enforcement: 'hard',
  check: (data, ctx) => {
    if (!RISKY_TYPES_FOR_BSPCE.has(data.beneficiaryType)) return null;
    const count = ctx.bspceActiveAwardsCount;
    if (count == null || count === 0) return null;
    const severity = readSeverity(ctx, 'BSPCE_BENEFICIARY_TYPE_REVERSE', 'ERROR');
    return {
      severity,
      code: 'BSPCE_BENEFICIARY_TYPE_REVERSE',
      message: `Ce bénéficiaire a ${count} award(s) BSPCE actif(s). Seuls les salariés et dirigeants peuvent détenir des BSPCE. Annuler les awards avant de changer le type.`,
      suggestedAction:
        'Canceller ou faire expirer les awards BSPCE (transition CANCELLED/FORFEITED) avant de basculer le type.',
    };
  },
};

export const BENEFICIARY_RULES: BenRule[] = [
  EMAIL_UNIQUE_IN_ORG,
  TAX_RESIDENCE_FRANCE_CONSISTENCY,
  HIRE_DATE_REASONABLE,
  MANAGER_NOT_SELF,
  IBAN_FORMAT,
  BSPCE_BENEFICIARY_TYPE_REVERSE,
];
