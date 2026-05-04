import type {
  ComplianceRule,
  DocumentGenerationCheckContext,
  DocumentGenerationCheckInput,
  DocumentSignatureCheckContext,
  DocumentSignatureCheckInput,
} from '../types';
import { readNumberParam, readSeverity } from './_helpers';

/**
 * Règles compliance V1 pour les documents — Module 6 B2
 * + Module 12.5 B3 (wiring effectiveParamsByRule + effectiveSeverityByRule).
 *
 * Spec : docs/MODULE_06_DOCUMENT_ENGINE.md §8 + docs/MODULE_12_*.md §3.2.
 *
 * 3 règles V1 :
 *   1. FMV_RECENT_ENOUGH         (hard, `staleDays`) — bloque génération doc
 *      si plan.fmv_set_at > N jours (default 90, configurable per org)
 *   2. SIGNERS_COMPLETE_INFO     (hard) — chaque signer doit avoir email + fullName
 *   3. DOCUMENT_NOT_VOIDED       (hard) — bloque envoi pour signature si VOIDED
 *
 * Hooks :
 *   - generateAwardDocument : FMV_RECENT_ENOUGH
 *   - sendDocumentForSignature (B3) : SIGNERS_COMPLETE_INFO + DOCUMENT_NOT_VOIDED
 *
 * ⚠️ Évolution sémantique V1 → V1.X (Module 12.5 B3) — FMV_RECENT_ENOUGH :
 *   - V1 (Module 6 B2) : seuil `12 mois` hard-codé, severity='soft' (warning).
 *   - V1.X : seuil `staleDays` configurable (default DB 90 jours), severity DB
 *     `'error'` (bloque génération document si non conforme). Plus strict.
 *   - Si une org avait des FMV >3 mois mais <12 mois en pré-V1.X, elle voit
 *     désormais un ERROR. L'admin peut downgrade via Module 12 settings.
 *   - Le naming a aussi été aligné DB→code : `maxMonths` → `staleDays`.
 *   - L'enforcement legacy `'soft'` est conservé côté code (compatibilité
 *     runner buckets) ; la severity DB `'error'` prend le pas via
 *     `readSeverity` lors de l'émission de l'issue.
 */

const FMV_STALE_DAYS_DEFAULT = 90;

export const FMV_RECENT_ENOUGH: ComplianceRule<
  DocumentGenerationCheckInput,
  DocumentGenerationCheckContext
> = {
  code: 'FMV_RECENT_ENOUGH',
  description: 'La FMV du plan doit avoir été mise à jour dans les N derniers jours',
  appliesTo: ['*'],
  enforcement: 'soft',
  check: (_data, ctx) => {
    if (!ctx.fmvSetAt) return null;
    const ts = Date.parse(ctx.fmvSetAt);
    if (!Number.isFinite(ts)) return null;
    const staleDays = readNumberParam(
      ctx,
      'FMV_RECENT_ENOUGH',
      'staleDays',
      FMV_STALE_DAYS_DEFAULT,
    );
    const ageDays = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
    if (ageDays <= staleDays) return null;
    const severity = readSeverity(ctx, 'FMV_RECENT_ENOUGH', 'WARNING');
    return {
      severity,
      code: 'FMV_RECENT_ENOUGH',
      message: `La FMV du plan date de ${ageDays} jours (seuil ${staleDays} jours). Recommandé de mettre à jour avant émission.`,
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
  check: (data, ctx) => {
    const severity = readSeverity(ctx, 'SIGNERS_COMPLETE_INFO', 'ERROR');
    for (let i = 0; i < data.signers.length; i++) {
      const s = data.signers[i]!;
      if (!s.email || s.email.trim().length === 0) {
        return {
          severity,
          code: 'SIGNERS_COMPLETE_INFO',
          message: `Signataire #${i + 1} sans email — impossible d'envoyer pour signature.`,
          suggestedAction: 'Renseigner un email valide pour chaque signataire.',
        };
      }
      if (!s.fullName || s.fullName.trim().length === 0) {
        return {
          severity,
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
  check: (data, ctx) => {
    if (data.documentStatus !== 'VOIDED') return null;
    const severity = readSeverity(ctx, 'DOCUMENT_NOT_VOIDED', 'ERROR');
    return {
      severity,
      code: 'DOCUMENT_NOT_VOIDED',
      message: 'Ce document a été voidé et ne peut plus être envoyé pour signature.',
      suggestedAction: "Régénérer un nouveau document depuis l'award (regenerateAwardDocument).",
    };
  },
};

export const DOCUMENT_GENERATION_RULES = [FMV_RECENT_ENOUGH];
export const DOCUMENT_SIGNATURE_RULES = [SIGNERS_COMPLETE_INFO, DOCUMENT_NOT_VOIDED];
