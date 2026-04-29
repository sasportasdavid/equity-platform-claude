import type { BeneficiaryCheckContext, BeneficiaryCheckInput, ComplianceRule } from '../types';

/**
 * Règles compliance V1 pour bénéficiaires — Module 4 B2.
 *
 * Spec : docs/MODULE_04_BENEFICIARIES_MANAGEMENT.md §6.
 *
 * 5 règles V1 :
 *   1. EMAIL_UNIQUE_IN_ORG               (hard) — duplicat DB pour UX
 *   2. TAX_RESIDENCE_FRANCE_CONSISTENCY  (hard) — taxResidence ≠ FR + isFR=true → ERROR
 *   3. HIRE_DATE_REASONABLE               (soft pour futur, hard si année < 1900)
 *   4. MANAGER_NOT_SELF                   (hard) — managerId ne peut pas être soi
 *   5. IBAN_FORMAT                        (soft) — regex basique (2 lettres + 2 chiffres + alphanum)
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

export const BENEFICIARY_RULES: BenRule[] = [
  EMAIL_UNIQUE_IN_ORG,
  TAX_RESIDENCE_FRANCE_CONSISTENCY,
  HIRE_DATE_REASONABLE,
  MANAGER_NOT_SELF,
  IBAN_FORMAT,
];
