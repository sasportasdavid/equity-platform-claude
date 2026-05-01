'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  completeBeneficiaryProfileSchema,
  type CompleteBeneficiaryProfileInput,
  type LeaverScenarioResult,
} from '@equity/shared';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit';
import { requireUser } from '@/lib/auth/rbac';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Module 8 — Server Actions du portail bénéficiaire.
 *
 * Référence : docs/MODULE_08_BENEFICIARY_PORTAL.md §6.
 *
 * Pattern Result : `{ ok: true, ...data } | { ok: false, error: string }`.
 * Pas de throw — l'UI lit `result.ok` pour décider toast / redirect.
 */

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------
type ActionOk<T> = { ok: true } & T;
type ActionError = { ok: false; error: string; validationIssues?: number };

function validationError(err: z.ZodError): ActionError {
  return {
    ok: false,
    error: `Validation échouée : ${err.issues.length} erreur(s)`,
    validationIssues: err.issues.length,
  };
}

// ---------------------------------------------------------------------------
// completeBeneficiaryProfile — onboarding étape 2 (§3.3)
// ---------------------------------------------------------------------------
//
// Met à jour first_name, last_name, address_line_1/2, postal_code, city,
// country sur la table `beneficiaries`. Optionnellement met à jour le phone
// chiffré via RPC dédiée `update_beneficiary_self_phone` (Module 8 B2,
// migration 00054).
//
// Met aussi à jour `user_profiles.full_name` pour cohérence avec le JWT
// (le DashboardLayout lit `userMeta.full_name`).
//
// Sécurité :
//   - requireUser() — pas de permission spéciale, mais le user doit être
//     authentifié et avoir un beneficiary record actif (user_id = auth.uid()).
//   - tax_residence_country EXCLU — bloqué par trigger Module 4
//     `enforce_beneficiary_self_update`. Définit côté admin/import.
//
// Audit : event 'beneficiary.profile_completed' avec metadata
//   { filled_fields, from_onboarding: true }.

export async function completeBeneficiaryProfile(
  input: CompleteBeneficiaryProfileInput,
): Promise<ActionOk<{ beneficiaryId: string }> | ActionError> {
  const parsed = completeBeneficiaryProfileSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;

  const user = await requireUser();
  const admin = getSupabaseAdminClient();

  // 1. Find the beneficiary record (RLS-bypass via admin client — but on
  //    filtre strictement sur user_id pour préserver l'isolation).
  const { data: bene, error: findError } = await admin
    .from('beneficiaries')
    .select('id, org_id, first_name, last_name')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (findError) {
    return { ok: false, error: findError.message };
  }
  if (!bene) {
    return { ok: false, error: 'Aucun bénéficiaire associé à cet utilisateur' };
  }

  // 2. Compose patch (champs autorisés par trigger Module 4)
  const phoneTrimmed = data.phone?.trim() ?? '';
  const addr2 = data.addressLine2?.trim() ?? '';
  const patch = {
    first_name: data.firstName,
    last_name: data.lastName,
    address_line_1: data.addressLine1,
    address_line_2: addr2 === '' ? null : addr2,
    postal_code: data.postalCode,
    city: data.city,
    country: data.country,
    updated_at: new Date().toISOString(),
  };

  const { error: updateError } = await admin.from('beneficiaries').update(patch).eq('id', bene.id);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  // 3. Update phone via RPC (encrypt_sensitive). Empty string → NULL.
  // On utilise le client cookie-based pour que `auth.uid()` soit présent
  // dans la SECURITY DEFINER function (le RPC vérifie ownership).
  if (phoneTrimmed !== '') {
    const userSupabase = await createSupabaseServerClient();
    const { error: rpcError } = await userSupabase.rpc('update_beneficiary_self_phone', {
      p_phone: phoneTrimmed,
    });
    if (rpcError) {
      return { ok: false, error: `Mise à jour du téléphone échouée : ${rpcError.message}` };
    }
  }

  // 4. Sync user_profiles.full_name (cohérence JWT)
  const fullName = `${data.firstName} ${data.lastName}`.trim();
  await admin.from('user_profiles').update({ full_name: fullName }).eq('id', user.id);

  // Aussi sync auth.users.user_metadata.full_name pour le JWT
  try {
    const { data: authUser } = await admin.auth.admin.getUserById(user.id);
    const currentMeta = (authUser?.user?.user_metadata ?? {}) as Record<string, unknown>;
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...currentMeta, full_name: fullName },
    });
  } catch (err) {
    console.error('[portal] failed to sync user_metadata.full_name', err);
  }

  // 5. Audit
  await logAuditEvent({
    eventType: 'beneficiary.profile_completed',
    resourceType: 'BENEFICIARY',
    resourceId: bene.id,
    userId: user.id,
    userEmail: user.email,
    orgId: bene.org_id,
    metadata: {
      filled_fields: [
        'first_name',
        'last_name',
        'address_line_1',
        ...(addr2 !== '' ? ['address_line_2'] : []),
        'postal_code',
        'city',
        'country',
        ...(phoneTrimmed !== '' ? ['phone_encrypted'] : []),
      ],
      from_onboarding: true,
    },
  });

  revalidatePath('/portal');

  return { ok: true, beneficiaryId: bene.id };
}

// ---------------------------------------------------------------------------
// getPortalDocumentSignedUrl — Module 8 B3 (§4.3 documents)
// ---------------------------------------------------------------------------
//
// Retourne une URL signée Supabase Storage pour télécharger le PDF SIGNED
// d'un `document_instances`, après vérification que le document appartient
// bien à un award du bénéficiaire courant.
//
// Sécurité (3 vérifs) :
//   1. requireUser() : auth check
//   2. Find own beneficiary record (user_id = auth.uid())
//   3. Le document_instance.related_entity = AWARD doit appartenir à un
//      award.beneficiary_id = own beneficiary.id
//
// Sans étape 3, un BENEFICIARY pourrait demander l'URL d'un document d'un
// autre bénéficiaire de la même org (Module 6 `getDocumentPreviewUrl`
// filtre uniquement sur org_id, ce qui est insuffisant côté portail).
//
// On ne sert QUE la variante SIGNED (storage_path post-Yousign). V2
// pourrait étendre à PROOF (audit trail) si besoin.

const portalDocumentInputSchema = z.object({
  documentId: z.string().uuid(),
});

const PORTAL_DOC_URL_TTL_SECONDS = 5 * 60; // 5 minutes (download immediate)

export async function getPortalDocumentSignedUrl(
  input: unknown,
): Promise<ActionOk<{ signedUrl: string; expiresAt: string }> | ActionError> {
  const parsed = portalDocumentInputSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { documentId } = parsed.data;

  const user = await requireUser();
  const admin = getSupabaseAdminClient();

  // 1. Find own beneficiary record
  const { data: bene } = await admin
    .from('beneficiaries')
    .select('id, org_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!bene) {
    return { ok: false, error: 'Aucun bénéficiaire associé à cet utilisateur' };
  }

  // 2. Load document + verify ownership chain (document → award →
  //    beneficiary)
  const { data: doc, error: docErr } = await admin
    .from('document_instances')
    .select(
      'id, status, storage_bucket, signed_pdf_storage_path, related_entity_type, related_entity_id, org_id',
    )
    .eq('id', documentId)
    .maybeSingle();

  if (docErr || !doc) {
    return { ok: false, error: 'Document introuvable' };
  }

  if (doc.org_id !== bene.org_id) {
    return { ok: false, error: 'Document non associé à votre organisation' };
  }
  if (doc.related_entity_type !== 'AWARD' || !doc.related_entity_id) {
    return { ok: false, error: 'Document non lié à une attribution' };
  }
  if (doc.status !== 'SIGNED' || !doc.signed_pdf_storage_path) {
    return { ok: false, error: 'Document non signé ou indisponible' };
  }

  // 3. Verify the award belongs to this beneficiary
  const { data: award } = await admin
    .from('awards')
    .select('id, beneficiary_id')
    .eq('id', doc.related_entity_id)
    .maybeSingle();

  if (!award || award.beneficiary_id !== bene.id) {
    return { ok: false, error: 'Accès refusé à ce document' };
  }

  // 4. Generate signed URL (TTL court)
  const { data: signed, error: signErr } = await admin.storage
    .from(doc.storage_bucket ?? 'documents')
    .createSignedUrl(doc.signed_pdf_storage_path, PORTAL_DOC_URL_TTL_SECONDS);

  if (signErr || !signed?.signedUrl) {
    return {
      ok: false,
      error: signErr?.message ?? 'Génération de l’URL signée échouée',
    };
  }

  // 5. Audit
  await logAuditEvent({
    eventType: 'portal.document_downloaded',
    resourceType: 'document_instance',
    resourceId: documentId,
    userId: user.id,
    userEmail: user.email,
    orgId: bene.org_id,
    metadata: {
      award_id: award.id,
      storage_path: doc.signed_pdf_storage_path,
      ttl_seconds: PORTAL_DOC_URL_TTL_SECONDS,
    },
  });

  return {
    ok: true,
    signedUrl: signed.signedUrl,
    expiresAt: new Date(Date.now() + PORTAL_DOC_URL_TTL_SECONDS * 1000).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// simulateLeaverScenario — Module 8 B4 (§4.3 section 3 + §5.2 + §6)
// ---------------------------------------------------------------------------
//
// Wrapper TypeScript autour du RPC SECURITY DEFINER `simulate_leaver_scenario`
// (Module 8 B1, étendu B4 migration 00055 pour `full_accelerate`).
//
// Sécurité : le RPC fait l'auth check + ownership check côté DB. On utilise
// le client cookie-based pour propager auth.uid().
//
// Audit : event 'portal.leaver_simulated' avec metadata
//   { award_id, leaver_type, termination_date, treatment_returned }.
//
// L'audit est logué APRÈS appel RPC : on inclut le treatment retourné par
// le RPC (utile pour debug + compréhension a posteriori d'un user qui aurait
// simulé un type avec treatment surprenant).

const simulateLeaverSchema = z.object({
  awardId: z.string().uuid(),
  leaverType: z.string().min(1).max(60),
  /** ISO date YYYY-MM-DD */
  terminationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD attendu'),
});

export async function simulateLeaverScenario(
  input: unknown,
): Promise<ActionOk<{ result: LeaverScenarioResult }> | ActionError> {
  const parsed = simulateLeaverSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { awardId, leaverType, terminationDate } = parsed.data;

  const user = await requireUser();
  const userSupabase = await createSupabaseServerClient();

  const { data, error } = await userSupabase.rpc('simulate_leaver_scenario', {
    p_award_id: awardId,
    p_leaver_type: leaverType,
    p_termination_date: terminationDate,
  });

  if (error) {
    if (/not authenticated/i.test(error.message)) {
      return { ok: false, error: 'Non authentifié' };
    }
    if (/no beneficiary record/i.test(error.message)) {
      return { ok: false, error: 'Aucun bénéficiaire associé à cet utilisateur' };
    }
    if (/award not found/i.test(error.message)) {
      return { ok: false, error: 'Attribution introuvable ou accès refusé' };
    }
    return { ok: false, error: error.message };
  }

  const result = data as unknown as LeaverScenarioResult | null;
  if (!result) {
    return { ok: false, error: 'Réponse vide du moteur de simulation' };
  }

  // Audit best-effort (le helper ne throw pas)
  await logAuditEvent({
    eventType: 'portal.leaver_simulated',
    resourceType: 'AWARD',
    resourceId: awardId,
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
    metadata: {
      award_id: awardId,
      leaver_type: leaverType,
      termination_date: terminationDate,
      treatment_returned: result.treatment,
      used_snapshot_fallback: result.used_snapshot_fallback,
    },
  });

  return { ok: true, result };
}
