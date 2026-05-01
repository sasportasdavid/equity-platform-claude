'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  completeBeneficiaryProfileSchema,
  type CompleteBeneficiaryProfileInput,
} from '@equity/shared';
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
    const { createSupabaseServerClient } = await import('@/lib/supabase/server');
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
