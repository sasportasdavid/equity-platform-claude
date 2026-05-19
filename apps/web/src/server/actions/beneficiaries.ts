'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  archiveBeneficiarySchema,
  bulkBeneficiaryImportSchema,
  createBeneficiarySchema,
  lifecycleTransitionSchema,
  selfUpdateBeneficiarySchema,
  updateBeneficiarySchema,
} from '@equity/shared';
import { logAuditEvent } from '@/lib/audit';
import { hasPermission, requirePermission } from '@/lib/auth/rbac';
import { runBeneficiaryComplianceChecks } from '@/lib/compliance/runChecks';
import type { ComplianceIssue } from '@/lib/compliance/types';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Module 4 — Server Actions bénéficiaires.
 *
 * Étend le stub Module 3b (`upsertBeneficiary` reste pour back-compat avec
 * la modale CreateAwardModal qui crée des bénéficiaires inline).
 *
 * Actions livrées (Module 4 B2) :
 *   1. createBeneficiary           — INSERT direct + compliance + audit
 *   2. updateBeneficiary           — UPDATE direct + compliance + audit
 *   3. loadBeneficiaryDetail       — Server Query minimale (B3 = page liste/détail)
 *   4. archiveBeneficiary          — soft-delete (trigger DB enforce)
 *   5. transitionBeneficiaryLifecycle — RPC transition_beneficiary_lifecycle
 *   6. inviteBeneficiary           — magic link + RPC mark_beneficiary_invited
 *   7. reinviteBeneficiary         — alias de inviteBeneficiary
 *   8. bulkCreateBeneficiaries     — RPC bulk_create_beneficiaries
 *   9. updateMyBeneficiaryProfile  — self-update (RLS + trigger DB enforce)
 *
 * Pattern de retour uniforme : { ok: true, ... } | { ok: false, error, complianceIssues? }.
 */

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

type ActionOk<T> = { ok: true } & T;
type ActionError = {
  ok: false;
  error: string;
  validationIssues?: number;
  complianceIssues?: ComplianceIssue[];
};
type ActionVoid = { ok: true } | ActionError;

function validationError(err: z.ZodError): ActionError {
  return {
    ok: false,
    error: `Validation échouée : ${err.issues.length} erreur(s)`,
    validationIssues: err.issues.length,
  };
}

// ===========================================================================
// 0. upsertBeneficiary — back-compat Module 3b (CreateAwardModal)
// ===========================================================================

const upsertBeneficiarySchema = z.object({
  email: z.string().email().toLowerCase(),
  fullName: z.string().min(1).max(200),
  type: z.enum(['EMPLOYEE', 'OFFICER', 'CONSULTANT', 'ADVISOR', 'OTHER']),
  taxResidence: z
    .string()
    .regex(/^[A-Z]{2}$/, 'Code ISO-3166-1 alpha-2 (ex. FR, US)')
    .default('FR'),
});

export type UpsertResult =
  | { ok: true; id: string; isNew: boolean; fullName: string; email: string }
  | { ok: false; error: string; validationIssues?: number };

export async function upsertBeneficiary(input: unknown): Promise<UpsertResult> {
  const parsed = upsertBeneficiarySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Validation échouée : ${parsed.error.issues.length} erreur(s)`,
      validationIssues: parsed.error.issues.length,
    };
  }
  const data = parsed.data;

  const user = await requirePermission('beneficiaries.create');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from('beneficiaries')
    .select('id, first_name, last_name, email')
    .eq('org_id', user.activeOrgId)
    .eq('email', data.email)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing) {
    const fullName =
      `${existing.first_name ?? ''} ${existing.last_name ?? ''}`.trim() || existing.email;
    return { ok: true, id: existing.id, isNew: false, fullName, email: existing.email };
  }

  const parts = data.fullName.trim().split(/\s+/);
  const firstName = parts[0] ?? data.fullName;
  const lastName = parts.slice(1).join(' ') || '—';

  const { data: ins, error } = await supabase
    .from('beneficiaries')
    .insert({
      org_id: user.activeOrgId,
      email: data.email,
      first_name: firstName,
      last_name: lastName,
      beneficiary_type: data.type,
      status: 'active',
      tax_residence_country: data.taxResidence,
    })
    .select('id, first_name, last_name, email')
    .single();

  if (error || !ins) {
    return { ok: false, error: error?.message ?? 'Insert beneficiary échoué' };
  }

  await logAuditEvent({
    eventType: 'beneficiary.created',
    resourceType: 'BENEFICIARY',
    resourceId: ins.id,
    metadata: { email: data.email, full_name: data.fullName, type: data.type, source: 'upsert' },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  const fullName = `${ins.first_name} ${ins.last_name}`.trim();
  return { ok: true, id: ins.id, isNew: true, fullName, email: ins.email };
}

// ===========================================================================
// 1. createBeneficiary — Module 4 V1 complet (compliance + audit)
// ===========================================================================

export async function createBeneficiary(
  input: unknown,
): Promise<ActionOk<{ id: string }> | ActionError> {
  const parsed = createBeneficiarySchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;

  const user = await requirePermission('beneficiaries.create');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  // Compliance check
  const compliance = await runBeneficiaryComplianceChecks(
    {
      id: null,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      beneficiaryType: data.beneficiaryType,
      taxResidence: data.taxResidence,
      isTaxResidentFrance: data.isTaxResidentFrance,
      hireDate: data.hireDate ?? null,
      managerId: data.managerId ?? null,
      iban: data.iban ?? null,
    },
    user.activeOrgId,
  );
  if (compliance.hasHardBlocks) {
    return {
      ok: false,
      error: `Compliance check failed : ${compliance.errors.length} erreur(s) bloquante(s)`,
      complianceIssues: compliance.errors,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data: ins, error } = await supabase
    .from('beneficiaries')
    .insert({
      org_id: user.activeOrgId,
      email: data.email,
      first_name: data.firstName,
      last_name: data.lastName,
      preferred_name: data.preferredName ?? null,
      beneficiary_type: data.beneficiaryType,
      contract_type: data.contractType ?? null,
      job_title: data.jobTitle ?? null,
      department: data.department ?? null,
      manager_id: data.managerId ?? null,
      address_line_1: data.addressLine1 ?? null,
      address_line_2: data.addressLine2 ?? null,
      postal_code: data.postalCode ?? null,
      city: data.city ?? null,
      country: data.country,
      tax_residence_country: data.taxResidence,
      is_tax_resident_france: data.isTaxResidentFrance,
      tax_id: data.taxId ?? null,
      hire_date: data.hireDate ?? null,
      iban: data.iban ?? null,
      bic: data.bic ?? null,
      bank_name: data.bankName ?? null,
      bank_account_holder_name: data.bankAccountHolderName ?? null,
      gender: data.gender ?? null,
      status: 'active',
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error || !ins) return { ok: false, error: error?.message ?? 'Insert beneficiary échoué' };

  // Stocker les soft warnings dans custom_fields (pas de colonne dédiée
  // compliance_warnings sur beneficiaries — différent d'awards)
  if (compliance.warnings.length > 0) {
    await supabase
      .from('beneficiaries')
      .update({
        custom_fields: { compliance_warnings: compliance.warnings } as never,
      })
      .eq('id', ins.id);
  }

  await logAuditEvent({
    eventType: 'beneficiary.created',
    resourceType: 'BENEFICIARY',
    resourceId: ins.id,
    metadata: {
      email: data.email,
      type: data.beneficiaryType,
      contract_type: data.contractType,
      hire_date: data.hireDate,
      compliance_warnings: compliance.warnings.length,
    },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  // V1.X — auto-invite par défaut (résout demande user 2026-05-19)
  // Le caller peut passer `skipInvitation: true` pour les imports CSV
  // (où on préfère batcher les envois en post-import). Fire-and-forget :
  // si le magic link foire (Supabase Auth indispo, etc.), le bénéficiaire
  // est quand même créé et un admin peut cliquer "Inviter" manuellement.
  // L'erreur est logguée mais n'empêche pas le success.
  if (!data.skipInvitation) {
    const inv = await inviteBeneficiary({ beneficiaryId: ins.id });
    if (!inv.ok) {
      console.warn('[createBeneficiary] auto-invite failed (non-blocking)', {
        beneficiaryId: ins.id,
        email: data.email,
        error: inv.error,
      });
    }
  }

  revalidatePath('/dashboard/beneficiaries');
  return { ok: true, id: ins.id };
}

// ===========================================================================
// 2. updateBeneficiary — UPDATE direct + compliance + audit
// ===========================================================================

const updateInputSchema = z.object({
  beneficiaryId: z.string().uuid(),
  patch: updateBeneficiarySchema,
});

export async function updateBeneficiary(input: unknown): Promise<ActionVoid> {
  const parsed = updateInputSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { beneficiaryId, patch } = parsed.data;

  const user = await requirePermission('beneficiaries.update');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  // Charge le row courant pour merge avec le patch (compliance check)
  const { data: existing } = await supabase
    .from('beneficiaries')
    .select(
      'id, email, first_name, last_name, beneficiary_type, tax_residence_country, is_tax_resident_france, hire_date, manager_id, iban',
    )
    .eq('id', beneficiaryId)
    .eq('org_id', user.activeOrgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'Beneficiary introuvable' };

  // Compliance avec valeurs mergées
  const merged = {
    id: beneficiaryId,
    email: patch.email ?? existing.email,
    firstName: patch.firstName ?? existing.first_name ?? undefined,
    lastName: patch.lastName ?? existing.last_name ?? undefined,
    beneficiaryType: patch.beneficiaryType ?? existing.beneficiary_type,
    taxResidence: patch.taxResidence ?? existing.tax_residence_country,
    isTaxResidentFrance: patch.isTaxResidentFrance ?? existing.is_tax_resident_france ?? true,
    hireDate: patch.hireDate ?? existing.hire_date,
    managerId: patch.managerId ?? existing.manager_id,
    iban: patch.iban ?? existing.iban,
  };
  const compliance = await runBeneficiaryComplianceChecks(merged, user.activeOrgId);
  if (compliance.hasHardBlocks) {
    return {
      ok: false,
      error: `Compliance check failed : ${compliance.errors.length} erreur(s) bloquante(s)`,
      complianceIssues: compliance.errors,
    };
  }

  // Mapping camelCase → snake_case
  const updateRow: Record<string, unknown> = {};
  if (patch.email !== undefined) updateRow.email = patch.email;
  if (patch.firstName !== undefined) updateRow.first_name = patch.firstName;
  if (patch.lastName !== undefined) updateRow.last_name = patch.lastName;
  if (patch.preferredName !== undefined) updateRow.preferred_name = patch.preferredName;
  if (patch.beneficiaryType !== undefined) updateRow.beneficiary_type = patch.beneficiaryType;
  if (patch.contractType !== undefined) updateRow.contract_type = patch.contractType;
  if (patch.jobTitle !== undefined) updateRow.job_title = patch.jobTitle;
  if (patch.department !== undefined) updateRow.department = patch.department;
  if (patch.managerId !== undefined) updateRow.manager_id = patch.managerId;
  if (patch.addressLine1 !== undefined) updateRow.address_line_1 = patch.addressLine1;
  if (patch.addressLine2 !== undefined) updateRow.address_line_2 = patch.addressLine2;
  if (patch.postalCode !== undefined) updateRow.postal_code = patch.postalCode;
  if (patch.city !== undefined) updateRow.city = patch.city;
  if (patch.country !== undefined) updateRow.country = patch.country;
  if (patch.taxResidence !== undefined) updateRow.tax_residence_country = patch.taxResidence;
  if (patch.isTaxResidentFrance !== undefined)
    updateRow.is_tax_resident_france = patch.isTaxResidentFrance;
  if (patch.taxId !== undefined) updateRow.tax_id = patch.taxId;
  if (patch.hireDate !== undefined) updateRow.hire_date = patch.hireDate;
  if (patch.iban !== undefined) updateRow.iban = patch.iban;
  if (patch.bic !== undefined) updateRow.bic = patch.bic;
  if (patch.bankName !== undefined) updateRow.bank_name = patch.bankName;
  if (patch.bankAccountHolderName !== undefined)
    updateRow.bank_account_holder_name = patch.bankAccountHolderName;
  if (patch.gender !== undefined) updateRow.gender = patch.gender;

  if (Object.keys(updateRow).length === 0) {
    return { ok: false, error: 'Aucun champ à modifier' };
  }

  const { error } = await supabase
    .from('beneficiaries')
    .update(updateRow as never)
    .eq('id', beneficiaryId);
  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    eventType: 'beneficiary.updated',
    resourceType: 'BENEFICIARY',
    resourceId: beneficiaryId,
    metadata: {
      fields_updated: Object.keys(updateRow),
      compliance_warnings: compliance.warnings.length,
    },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/beneficiaries');
  revalidatePath(`/dashboard/beneficiaries/${beneficiaryId}`);
  return { ok: true };
}

// ===========================================================================
// 3. loadBeneficiaryDetail — version minimale B2 (B3 livrera la query complète)
// ===========================================================================

export async function loadBeneficiaryDetail(beneficiaryId: string): Promise<
  | ActionOk<{
      beneficiary: Record<string, unknown>;
      activeAwardsCount: number;
    }>
  | ActionError
> {
  if (!beneficiaryId || typeof beneficiaryId !== 'string') {
    return { ok: false, error: 'beneficiaryId requis' };
  }

  const user = await requirePermission('beneficiaries.read');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();
  const [beneRes, awardsRes] = await Promise.all([
    supabase
      .from('beneficiaries')
      .select('*')
      .eq('id', beneficiaryId)
      .eq('org_id', user.activeOrgId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('awards')
      .select('id', { count: 'exact', head: true })
      .eq('beneficiary_id', beneficiaryId)
      .not('status', 'in', '(CANCELLED,FORFEITED,EXPIRED,FULLY_EXERCISED)')
      .is('deleted_at', null),
  ]);

  if (beneRes.error || !beneRes.data) {
    return { ok: false, error: 'Beneficiary introuvable' };
  }

  return {
    ok: true,
    beneficiary: beneRes.data as Record<string, unknown>,
    activeAwardsCount: awardsRes.count ?? 0,
  };
}

// ===========================================================================
// 4. archiveBeneficiary — soft-delete (le trigger DB bloque si awards actifs)
// ===========================================================================

export async function archiveBeneficiary(input: unknown): Promise<ActionVoid> {
  const parsed = archiveBeneficiarySchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { beneficiaryId, reason } = parsed.data;

  const user = await requirePermission('beneficiaries.delete');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('beneficiaries')
    .update({ deleted_at: new Date().toISOString() } as never)
    .eq('id', beneficiaryId)
    .eq('org_id', user.activeOrgId);

  if (error) {
    // Le trigger DB raise check_violation si awards actifs
    return {
      ok: false,
      error: error.message.includes('Cannot soft-delete')
        ? 'Impossible d\'archiver : ce bénéficiaire a des awards actifs. Utilisez le statut "terminated".'
        : error.message,
    };
  }

  await logAuditEvent({
    eventType: 'beneficiary.archived',
    resourceType: 'BENEFICIARY',
    resourceId: beneficiaryId,
    metadata: { reason },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/beneficiaries');
  return { ok: true };
}

// ===========================================================================
// 5. transitionBeneficiaryLifecycle — RPC transition_beneficiary_lifecycle
// ===========================================================================

export async function transitionBeneficiaryLifecycle(input: unknown): Promise<ActionVoid> {
  const parsed = lifecycleTransitionSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { beneficiaryId, toStatus, reason, terminationDate } = parsed.data;

  const user = await requirePermission('beneficiaries.lifecycle');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('transition_beneficiary_lifecycle', {
    p_beneficiary_id: beneficiaryId,
    p_to_status: toStatus,
    p_reason: reason,
    p_termination_date: terminationDate ?? undefined,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/dashboard/beneficiaries');
  revalidatePath(`/dashboard/beneficiaries/${beneficiaryId}`);
  return { ok: true };
}

// ===========================================================================
// 6 + 7. inviteBeneficiary / reinviteBeneficiary
// ===========================================================================

const inviteSchema = z.object({ beneficiaryId: z.string().uuid() });

export async function inviteBeneficiary(
  input: unknown,
): Promise<ActionOk<{ invitedAt: string }> | ActionError> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { beneficiaryId } = parsed.data;

  const user = await requirePermission('beneficiaries.invite');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  // 1. Charger le bénéficiaire
  const { data: bene, error: loadErr } = await supabase
    .from('beneficiaries')
    .select('id, email, status')
    .eq('id', beneficiaryId)
    .eq('org_id', user.activeOrgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (loadErr || !bene) return { ok: false, error: 'Beneficiary introuvable' };

  if (bene.status === 'terminated') {
    return {
      ok: false,
      error: "Impossible d'inviter un bénéficiaire terminated. Réactiver le statut d'abord.",
    };
  }

  // 2. Magic link Supabase Auth (V1 — Module 7 personnalisera via Resend)
  // ⚠️ On utilise le client admin (service_role, persistSession:false) et NON
  // le client cookie-based : sinon signInWithOtp écrase la session du caller
  // (admin) avec un nouveau token côté Set-Cookie, ce qui casse les requêtes
  // suivantes (RPC mark_beneficiary_invited, puis router.refresh client) avec
  // une "TypeError: network error" en dev Next.js.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const adminClient = getSupabaseAdminClient();
  const { error: authErr } = await adminClient.auth.signInWithOtp({
    email: bene.email,
    options: { emailRedirectTo: `${appUrl}/dashboard` },
  });
  if (authErr) return { ok: false, error: `Échec envoi magic link : ${authErr.message}` };

  // 3. Mark invited (RPC + audit interne au RPC)
  const { error: rpcErr } = await supabase.rpc('mark_beneficiary_invited', {
    p_beneficiary_id: beneficiaryId,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };

  revalidatePath('/dashboard/beneficiaries');
  revalidatePath(`/dashboard/beneficiaries/${beneficiaryId}`);
  return { ok: true, invitedAt: new Date().toISOString() };
}

/** Alias UI-friendly de inviteBeneficiary (libellé du bouton change si déjà invité). */
export async function reinviteBeneficiary(
  input: unknown,
): Promise<ActionOk<{ invitedAt: string }> | ActionError> {
  return inviteBeneficiary(input);
}

// ===========================================================================
// 8. bulkCreateBeneficiaries — RPC bulk_create_beneficiaries
// ===========================================================================

export type BulkBeneficiaryResult =
  | ActionOk<{
      created: number;
      createdIds: string[];
      errors: Array<{
        rowIndex: number;
        email: string;
        severity: string;
        message: string;
        existing_id?: string;
      }>;
    }>
  | ActionError;

export async function bulkCreateBeneficiaries(input: unknown): Promise<BulkBeneficiaryResult> {
  const parsed = bulkBeneficiaryImportSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const user = await requirePermission('beneficiaries.bulk_import');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();
  const { data: rpcResult, error } = await supabase.rpc('bulk_create_beneficiaries', {
    p_rows: parsed.data.rows as never,
  });
  if (error) return { ok: false, error: error.message };

  const result = rpcResult as {
    created: number;
    errors: Array<{
      rowIndex: number;
      email: string;
      severity: string;
      message: string;
      existing_id?: string;
    }>;
    created_ids: string[];
  } | null;
  if (!result) return { ok: false, error: 'Réponse bulk_create_beneficiaries inattendue' };

  revalidatePath('/dashboard/beneficiaries');
  return {
    ok: true,
    created: result.created,
    createdIds: result.created_ids ?? [],
    errors: result.errors ?? [],
  };
}

// ===========================================================================
// 9. updateMyBeneficiaryProfile — self-update (RLS + trigger DB enforcent)
// ===========================================================================

export async function updateMyBeneficiaryProfile(input: unknown): Promise<ActionVoid> {
  const parsed = selfUpdateBeneficiarySchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const patch = parsed.data;

  // Pas de requirePermission ici : la RLS policy beneficiaries_update_self +
  // le trigger enforce_beneficiary_self_update bloqueront tout abus côté DB.
  // On vérifie juste qu'un user est authentifié.
  const can = await hasPermission('beneficiaries.read');
  void can;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return { ok: false, error: 'Non authentifié' };

  // Charge le row pour avoir id + org_id (audit)
  const { data: bene } = await supabase
    .from('beneficiaries')
    .select('id, org_id')
    .eq('user_id', authUser.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!bene) return { ok: false, error: 'Aucun profil bénéficiaire lié à votre compte' };

  // Mapping camelCase → snake_case (sous-ensemble restreint)
  const updateRow: Record<string, unknown> = {};
  if (patch.phone !== undefined) updateRow.phone_encrypted = patch.phone; // V1 stocké en clair via colonne legacy
  if (patch.preferredName !== undefined) updateRow.preferred_name = patch.preferredName;
  if (patch.addressLine1 !== undefined) updateRow.address_line_1 = patch.addressLine1;
  if (patch.addressLine2 !== undefined) updateRow.address_line_2 = patch.addressLine2;
  if (patch.postalCode !== undefined) updateRow.postal_code = patch.postalCode;
  if (patch.city !== undefined) updateRow.city = patch.city;
  if (patch.country !== undefined) updateRow.country = patch.country;
  if (patch.iban !== undefined) updateRow.iban = patch.iban;
  if (patch.bic !== undefined) updateRow.bic = patch.bic;
  if (patch.bankName !== undefined) updateRow.bank_name = patch.bankName;
  if (patch.bankAccountHolderName !== undefined)
    updateRow.bank_account_holder_name = patch.bankAccountHolderName;

  if (Object.keys(updateRow).length === 0) return { ok: false, error: 'Aucun champ à modifier' };

  const { error } = await supabase
    .from('beneficiaries')
    .update(updateRow as never)
    .eq('id', bene.id);
  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    eventType: 'beneficiary.self_updated',
    resourceType: 'BENEFICIARY',
    resourceId: bene.id,
    metadata: { fields_updated: Object.keys(updateRow) },
    userId: authUser.id,
    userEmail: authUser.email ?? null,
    orgId: bene.org_id,
  });

  revalidatePath('/portal');
  return { ok: true };
}
