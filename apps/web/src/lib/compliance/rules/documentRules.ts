import type {
  ComplianceRule,
  DocumentGenerationCheckContext,
  DocumentGenerationCheckInput,
  DocumentSignatureCheckContext,
  DocumentSignatureCheckInput,
} from '../types';

/**
 * Règles compliance V1 pour les documents — Module 6 B2.
 *
 * Spec : docs/MODULE_06_DOCUMENT_ENGINE.md §8.
 *
 * 3 règles V1 :
 *   1. FMV_RECENT_ENOUGH         (soft) — warning si plan.fmv_set_at > 12 mois
 *   2. SIGNERS_COMPLETE_INFO     (hard) — chaque signer doit avoir email + fullName
 *   3. DOCUMENT_NOT_VOIDED       (hard) — bloque envoi pour signature si VOIDED
 *
 * Hooks :
 *   - generateAwardDocument : FMV_RECENT_ENOUGH (soft, n'empêche pas)
 *   - sendDocumentForSignature (B3) : SIGNERS_COMPLETE_INFO + DOCUMENT_NOT_VOIDED
 */

const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

export const FMV_RECENT_ENOUGH: ComplianceRule<
  DocumentGenerationCheckInput,
  DocumentGenerationCheckContext
> = {
  code: 'FMV_RECENT_ENOUGH',
  description: 'La FMV du plan doit avoir été mise à jour dans les 12 derniers mois',
  appliesTo: ['*'],
  enforcement: 'soft',
  check: (_data, ctx) => {
    if (!ctx.fmvSetAt) return null;
    const ts = Date.parse(ctx.fmvSetAt);
    if (!Number.isFinite(ts)) return null;
    const ageMs = Date.now() - ts;
    if (ageMs <= TWELVE_MONTHS_MS) return null;
    const months = Math.floor(ageMs / (30 * 24 * 60 * 60 * 1000));
    return {
      severity: 'WARNING',
      code: 'FMV_RECENT_ENOUGH',
      message: `La FMV du plan date de ${months} mois (> 12 mois). Recommandé de mettre à jour avant émission.`,
      suggestedAction:
        'Lancer une nouvelle valorisation du plan (Module 3a) avant de générer ce document.',
    };
  },
};

export const SIGNERS_COMPLETE_INFO: ComplianceRule<
  DocumentSignatureCheckInput,
  DocumentSignatureCheckContext
> = {
  code: 'SIGNERS_COMPLETE_INFO',
  description: 'Chaque signataire doit avoir un email et un nom complet renseignés',
  appliesTo: ['*'],
  enforcement: 'hard',
  check: (data) => {
    for (let i = 0; i < data.signers.length; i++) {
      const s = data.signers[i]!;
      if (!s.email || s.email.trim().length === 0) {
        return {
          severity: 'ERROR',
          code: 'SIGNERS_COMPLETE_INFO',
          message: `Signataire #${i + 1} sans email — impossible d'envoyer pour signature.`,
          suggestedAction: 'Renseigner un email valide pour chaque signataire.',
        };
      }
      if (!s.fullName || s.fullName.trim().length === 0) {
        return {
          severity: 'ERROR',
          code: 'SIGNERS_COMPLETE_INFO',
          message: `Signataire #${i + 1} sans nom complet.`,
          suggestedAction: 'Renseigner le nom complet de chaque signataire.',
        };
      }
    }
    return null;
  },
};

export const DOCUMENT_NOT_VOIDED: ComplianceRule<
  DocumentSignatureCheckInput,
  DocumentSignatureCheckContext
> = {
  code: 'DOCUMENT_NOT_VOIDED',
  description: 'Un document VOIDED ne peut pas être envoyé pour signature',
  appliesTo: ['*'],
  enforcement: 'hard',
  check: (data) => {
    if (data.documentStatus !== 'VOIDED') return null;
    return {
      severity: 'ERROR',
      code: 'DOCUMENT_NOT_VOIDED',
      message: 'Ce document a été voidé et ne peut plus être envoyé pour signature.',
      suggestedAction: "Régénérer un nouveau document depuis l'award (regenerateAwardDocument).",
    };
  },
};

export const DOCUMENT_GENERATION_RULES = [FMV_RECENT_ENOUGH];
export const DOCUMENT_SIGNATURE_RULES = [SIGNERS_COMPLETE_INFO, DOCUMENT_NOT_VOIDED];
