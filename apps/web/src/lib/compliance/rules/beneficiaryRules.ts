import type { BeneficiaryCheckContext, BeneficiaryCheckInput, ComplianceRule } from '../types';

/**
 * Règles compliance V1 pour bénéficiaires — Module 4 B2 + B6.
 *
 * Spec : docs/MODULE_04_BENEFICIARIES_MANAGEMENT.md §6.
 *
 * 6 règles V1 :
 *   1. EMAIL_UNIQUE_IN_ORG               (hard) — duplicat DB pour UX
 *   2. TAX_RESIDENCE_FRANCE_CONSISTENCY  (hard) — taxResidence ≠ FR + isFR=true → ERROR
 *   3. HIRE_DATE_REASONABLE               (soft pour futur, hard si année < 1900)
 *   4. MANAGER_NOT_SELF                   (hard) — managerId ne peut pas être soi
 *   5. IBAN_FORMAT                        (soft) — regex basique (2 lettres + 2 chiffres + alphanum)
 *   6. BSPCE_BENEFICIARY_TYPE_REVERSE    (hard) — passer un bénéficiaire avec
 *      des awards BSPCE actifs en CONSULTANT/EXTERNAL est interdit (BSPCE
 *      réservés employees + dirigeants par CGI art. 163 bis G).
 *
 * V2 (Module 12) : configurables par org. Pour V1, hardcodés.
 */

type BenRule = ComplianceRule<BeneficiaryCheckInput, BeneficiaryCheckContext>;

export const EMAIL_UNIQUE_IN_ORG: BenRule = {
  code: 'EMAIL_UNIQUE_IN_ORG',
  description: "L'email du bénéficiaire doit être unique dans l'organisation",
  appliesTo: ['*'],
  enforcement: 'hard',
  check: (data, ctx) => {
    if (!ctx.emailCollisionId) return null;
    // Si on update et que la collision est sur le même row → pas un doublon
    if (data.id && ctx.emailCollisionId === data.id) return null;
    return {
      severity: 'ERROR',
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
  check: (data) => {
    if (data.taxResidence !== 'FR' && data.isTaxResidentFrance === true) {
      return {
        severity: 'ERROR',
        code: 'TAX_RESIDENCE_FRANCE_CONSISTENCY',
        message: `Tax residence ${data.taxResidence} mais isTaxResidentFrance=true. Incohérence.`,
        suggestedAction: 'Mettre isTaxResidentFrance=false pour un bénéficiaire non-résident FR.',
      };
    }
    return null;
  },
};

export const HIRE_DATE_REASONABLE: BenRule = {
  code: 'HIRE_DATE_REASONABLE',
  description: 'hire_date ne doit pas être dans le futur ni avant 1900',
  appliesTo: ['*'],
  enforcement: 'soft',
  check: (data) => {
    if (!data.hireDate) return null;
    const ts = Date.parse(data.hireDate);
    if (!Number.isFinite(ts)) return null;
    const hire = new Date(ts);
    const now = new Date();
    if (hire.getFullYear() < 1900) {
      return {
        severity: 'ERROR',
        code: 'HIRE_DATE_INVALID',
        message: `Date d'embauche ${data.hireDate} manifestement invalide (avant 1900).`,
      };
    }
    if (hire > now) {
      return {
        severity: 'WARNING',
        code: 'HIRE_DATE_FUTURE',
        message: `Date d'embauche dans le futur (${data.hireDate}). Confirmer.`,
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
  check: (data) => {
    if (!data.managerId || !data.id) return null;
    if (data.managerId === data.id) {
      return {
        severity: 'ERROR',
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
  check: (data) => {
    if (!data.iban) return null;
    const cleaned = data.iban.replace(/\s/g, '');
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/i.test(cleaned)) {
      return {
        severity: 'WARNING',
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
 * en détenir. Si on tente le changement, l'admin doit d'abord canceller les
 * awards (transition CANCELLED ou FORFEITED) ou les laisser expirer.
 *
 * Le count est chargé par `runBeneficiaryComplianceChecks` uniquement si
 * `data.id` est présent (update) ET que le nouveau type est risqué — sinon
 * `ctx.bspceActiveAwardsCount` reste null et la rule retourne null.
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
    return {
      severity: 'ERROR',
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
