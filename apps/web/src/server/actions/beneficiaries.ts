'use server';

import { z } from 'zod';
import { logAuditEvent } from '@/lib/audit';
import { requirePermission } from '@/lib/auth/rbac';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Module 3b B3 — Server Action upsertBeneficiary.
 *
 * Mini-version V1 du futur module Beneficiaries (Module 4) :
 *   - SELECT par (org_id, lower(email)) — la table a déjà l'index unique
 *   - Si existe : retourne { id, isNew: false }
 *   - Sinon : INSERT + audit `beneficiary.created`, retourne { id, isNew: true }
 *
 * Permission : `beneficiaries.create` (déjà seedée en Module 1).
 *
 * Cette action est appelée :
 *   - Depuis CreateAwardModal quand le user tape un email inexistant
 *   - Plus tard, depuis bulk_create_awards (Module 3b B5) pour la résolution
 *     email → id en amont du RPC
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const upsertBeneficiarySchema = z.object({
  email: z.string().email().toLowerCase(),
  fullName: z.string().min(1).max(200),
  type: z.enum(['EMPLOYEE', 'OFFICER', 'CONSULTANT', 'ADVISOR', 'OTHER']),
  taxResidence: z
    .string()
    .regex(/^[A-Z]{2}$/, 'Code ISO-3166-1 alpha-2 (ex. FR, US)')
    .default('FR'),
});

export type UpsertBeneficiaryInput = z.infer<typeof upsertBeneficiarySchema>;

export type UpsertOk = {
  ok: true;
  id: string;
  isNew: boolean;
  /** Concaténation first_name + last_name (display label). */
  fullName: string;
  email: string;
};
export type UpsertError = { ok: false; error: string; validationIssues?: number };
export type UpsertResult = UpsertOk | UpsertError;

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

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

  // 1. SELECT par email (insensible casse via toLowerCase + index unique
  //    sur lower(email))
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

  // 2. Pas trouvé → INSERT
  // Split fullName en first/last (heuristique simple : 1er mot = prénom)
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
    metadata: {
      email: data.email,
      full_name: data.fullName,
      type: data.type,
      tax_residence: data.taxResidence,
    },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  const fullName = `${ins.first_name} ${ins.last_name}`.trim();
  return { ok: true, id: ins.id, isNew: true, fullName, email: ins.email };
}
