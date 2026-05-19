'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  createSignatureWorkflowSchema,
  deleteSignatureWorkflowSchema,
  updateSignatureSettingsSchema,
  updateSignatureWorkflowSchema,
} from '@equity/shared';
import { logAuditEvent } from '@/lib/audit';
import { requirePermission } from '@/lib/auth/rbac';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Module Signature (V1.X) — Server Actions pour les settings + workflows.
 *
 * Layer A : signature_settings (1 row par org, autosave)
 * Layer C : signature_workflows + signature_workflow_signers (multi par org)
 *
 * Resolution cascade utilisée par sendForSignature (cf documents.ts) :
 *   1. Workflow matching plan_type ou template_code → utilise ses params
 *   2. Defaults A → fallback
 *   3. Override modale envoi → priorité absolue
 */

type ActionOk<T> = { ok: true } & T;
type ActionError = { ok: false; error: string; validationIssues?: number };

function validationError(err: z.ZodError): ActionError {
  return {
    ok: false,
    error: `Validation échouée : ${err.issues.length} erreur(s)`,
    validationIssues: err.issues.length,
  };
}

// ============================================================================
// Types résultat
// ============================================================================

export type SignatureSettingsRow = {
  orgId: string;
  defaultExpiryDays: number;
  defaultSigningOrder: 'SEQUENTIAL' | 'PARALLEL';
  requireOwnerCosigner: boolean;
  reminderDays: number;
  updatedAt: string;
};

export type SignatureWorkflowSignerRow = {
  id: string;
  signerOrder: number;
  signerType: 'BENEFICIARY' | 'ROLE' | 'USER';
  signerRole: string | null;
  signerUserId: string | null;
  isRequired: boolean;
};

export type SignatureWorkflowRow = {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  appliesPlanTypes: string[];
  appliesTemplateCodes: string[];
  expiryDays: number;
  signingOrder: 'SEQUENTIAL' | 'PARALLEL';
  reminderDays: number;
  isDefault: boolean;
  isActive: boolean;
  signers: SignatureWorkflowSignerRow[];
  createdAt: string;
  updatedAt: string;
};

// ============================================================================
// Layer A — Server Actions signature_settings
// ============================================================================

export async function getSignatureSettings(): Promise<
  ActionOk<{ settings: SignatureSettingsRow }> | ActionError
> {
  const user = await requirePermission('org.manage_settings');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const admin = getSupabaseAdminClient();
  const { data, error } = await (
    admin as never as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (
            k: string,
            v: string,
          ) => {
            maybeSingle: () => Promise<{
              data: SignatureSettingsRow | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    }
  )
    .from('signature_settings')
    .select('*')
    .eq('org_id', user.activeOrgId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) {
    // Auto-seed si jamais manquant (idempotent)
    const { error: seedErr } = await (
      admin as never as {
        rpc: (
          n: string,
          p: Record<string, unknown>,
        ) => Promise<{ error: { message: string } | null }>;
      }
    ).rpc('seed_signature_settings_for_org', { p_org_id: user.activeOrgId });
    if (seedErr) return { ok: false, error: seedErr.message };

    const { data: fresh } = await (
      admin as never as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (
              k: string,
              v: string,
            ) => {
              single: () => Promise<{
                data: Record<string, unknown> | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      }
    )
      .from('signature_settings')
      .select('*')
      .eq('org_id', user.activeOrgId)
      .single();
    if (!fresh) return { ok: false, error: 'Seed signature_settings échoué' };
    return { ok: true, settings: rowToSettings(fresh) };
  }

  return { ok: true, settings: rowToSettings(data as unknown as Record<string, unknown>) };
}

export async function updateSignatureSettings(
  input: unknown,
): Promise<ActionOk<{ settings: SignatureSettingsRow }> | ActionError> {
  const parsed = updateSignatureSettingsSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const user = await requirePermission('org.manage_settings');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const admin = getSupabaseAdminClient();

  // UPSERT (insert si pas encore créé)
  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };
  if (parsed.data.defaultExpiryDays !== undefined)
    updatePayload.default_expiry_days = parsed.data.defaultExpiryDays;
  if (parsed.data.defaultSigningOrder !== undefined)
    updatePayload.default_signing_order = parsed.data.defaultSigningOrder;
  if (parsed.data.requireOwnerCosigner !== undefined)
    updatePayload.require_owner_cosigner = parsed.data.requireOwnerCosigner;
  if (parsed.data.reminderDays !== undefined)
    updatePayload.reminder_days = parsed.data.reminderDays;

  const { data, error } = await (
    admin as never as {
      from: (t: string) => {
        upsert: (
          r: Record<string, unknown>,
          opts?: Record<string, unknown>,
        ) => {
          select: () => {
            single: () => Promise<{
              data: Record<string, unknown> | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    }
  )
    .from('signature_settings')
    .upsert({ org_id: user.activeOrgId, ...updatePayload }, { onConflict: 'org_id' })
    .select()
    .single();

  if (error || !data)
    return { ok: false, error: error?.message ?? 'Update signature_settings échoué' };

  await logAuditEvent({
    eventType: 'signature.settings_updated',
    resourceType: 'ORGANIZATION',
    resourceId: user.activeOrgId,
    metadata: parsed.data as Record<string, unknown>,
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/settings/signatures');
  return { ok: true, settings: rowToSettings(data) };
}

// ============================================================================
// Layer C — Server Actions signature_workflows
// ============================================================================

export async function listSignatureWorkflows(): Promise<
  ActionOk<{ workflows: SignatureWorkflowRow[] }> | ActionError
> {
  const user = await requirePermission('org.manage_settings');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const admin = getSupabaseAdminClient();

  const { data: workflows, error } = await (
    admin as never as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (
            k: string,
            v: string,
          ) => {
            is: (
              k: string,
              v: null,
            ) => {
              order: (
                k: string,
                opts: { ascending: boolean },
              ) => Promise<{
                data: Record<string, unknown>[] | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };
    }
  )
    .from('signature_workflows')
    .select('*')
    .eq('org_id', user.activeOrgId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: error.message };

  // Charger les signers pour chaque workflow
  const workflowIds = (workflows ?? []).map((w) => w.id as string);
  const signersByWf = new Map<string, SignatureWorkflowSignerRow[]>();

  if (workflowIds.length > 0) {
    const { data: signers } = await (
      admin as never as {
        from: (t: string) => {
          select: (s: string) => {
            in: (
              k: string,
              v: string[],
            ) => {
              order: (
                k: string,
                opts: { ascending: boolean },
              ) => Promise<{ data: Record<string, unknown>[] | null }>;
            };
          };
        };
      }
    )
      .from('signature_workflow_signers')
      .select('*')
      .in('workflow_id', workflowIds)
      .order('signer_order', { ascending: true });

    for (const s of signers ?? []) {
      const wfId = s.workflow_id as string;
      const row = rowToSigner(s);
      const arr = signersByWf.get(wfId) ?? [];
      arr.push(row);
      signersByWf.set(wfId, arr);
    }
  }

  const rows: SignatureWorkflowRow[] = (workflows ?? []).map((w) =>
    rowToWorkflow(w, signersByWf.get(w.id as string) ?? []),
  );

  return { ok: true, workflows: rows };
}

export async function createSignatureWorkflow(
  input: unknown,
): Promise<ActionOk<{ id: string }> | ActionError> {
  const parsed = createSignatureWorkflowSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;

  const user = await requirePermission('org.manage_settings');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const admin = getSupabaseAdminClient();

  // Auto-swap : si is_default+is_active, désactiver l'ancien default
  if (data.isDefault && data.isActive) {
    await (
      admin as never as {
        from: (t: string) => {
          update: (p: Record<string, unknown>) => {
            eq: (
              k: string,
              v: unknown,
            ) => {
              eq: (
                k: string,
                v: unknown,
              ) => {
                eq: (
                  k: string,
                  v: unknown,
                ) => {
                  is: (k: string, v: null) => Promise<unknown>;
                };
              };
            };
          };
        };
      }
    )
      .from('signature_workflows')
      .update({ is_default: false })
      .eq('org_id', user.activeOrgId)
      .eq('is_default', true)
      .eq('is_active', true)
      .is('deleted_at', null);
  }

  const { data: wf, error } = await (
    admin as never as {
      from: (t: string) => {
        insert: (r: Record<string, unknown>) => {
          select: (s: string) => {
            single: () => Promise<{
              data: { id: string } | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    }
  )
    .from('signature_workflows')
    .insert({
      org_id: user.activeOrgId,
      name: data.name,
      description: data.description ?? null,
      applies_to_plan_types: data.appliesPlanTypes,
      applies_to_template_codes: data.appliesTemplateCodes,
      expiry_days: data.expiryDays,
      signing_order: data.signingOrder,
      reminder_days: data.reminderDays,
      is_default: data.isDefault,
      is_active: data.isActive,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error || !wf)
    return { ok: false, error: error?.message ?? 'INSERT signature_workflow échoué' };

  // INSERT signers
  const signersRows = data.signers.map((s) => ({
    workflow_id: wf.id,
    signer_order: s.signerOrder,
    signer_type: s.signerType,
    signer_role: s.signerRole ?? null,
    signer_user_id: s.signerUserId ?? null,
    is_required: s.isRequired,
  }));

  const { error: signersErr } = await (
    admin as never as {
      from: (t: string) => {
        insert: (r: unknown) => Promise<{ error: { message: string } | null }>;
      };
    }
  )
    .from('signature_workflow_signers')
    .insert(signersRows);

  if (signersErr) {
    // Rollback workflow
    await (
      admin as never as {
        from: (t: string) => {
          delete: () => { eq: (k: string, v: string) => Promise<unknown> };
        };
      }
    )
      .from('signature_workflows')
      .delete()
      .eq('id', wf.id);
    return { ok: false, error: `INSERT signers échoué : ${signersErr.message}` };
  }

  await logAuditEvent({
    eventType: 'signature.workflow_created',
    resourceType: 'SIGNATURE_WORKFLOW',
    resourceId: wf.id,
    metadata: {
      name: data.name,
      signers_count: data.signers.length,
      is_default: data.isDefault,
    },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/settings/signatures');
  return { ok: true, id: wf.id };
}

export async function updateSignatureWorkflow(input: unknown): Promise<{ ok: true } | ActionError> {
  const parsed = updateSignatureWorkflowSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { workflowId, patch } = parsed.data;

  const user = await requirePermission('org.manage_settings');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const admin = getSupabaseAdminClient();

  // Auto-swap si patch rend default+active
  if (patch.isDefault === true && (patch.isActive ?? true)) {
    await (
      admin as never as {
        from: (t: string) => {
          update: (p: Record<string, unknown>) => {
            eq: (
              k: string,
              v: unknown,
            ) => {
              eq: (
                k: string,
                v: unknown,
              ) => {
                eq: (
                  k: string,
                  v: unknown,
                ) => {
                  is: (
                    k: string,
                    v: null,
                  ) => {
                    neq: (k: string, v: unknown) => Promise<unknown>;
                  };
                };
              };
            };
          };
        };
      }
    )
      .from('signature_workflows')
      .update({ is_default: false })
      .eq('org_id', user.activeOrgId)
      .eq('is_default', true)
      .eq('is_active', true)
      .is('deleted_at', null)
      .neq('id', workflowId);
  }

  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) updatePayload.name = patch.name;
  if (patch.description !== undefined) updatePayload.description = patch.description;
  if (patch.appliesPlanTypes !== undefined)
    updatePayload.applies_to_plan_types = patch.appliesPlanTypes;
  if (patch.appliesTemplateCodes !== undefined)
    updatePayload.applies_to_template_codes = patch.appliesTemplateCodes;
  if (patch.expiryDays !== undefined) updatePayload.expiry_days = patch.expiryDays;
  if (patch.signingOrder !== undefined) updatePayload.signing_order = patch.signingOrder;
  if (patch.reminderDays !== undefined) updatePayload.reminder_days = patch.reminderDays;
  if (patch.isDefault !== undefined) updatePayload.is_default = patch.isDefault;
  if (patch.isActive !== undefined) updatePayload.is_active = patch.isActive;

  const { error: updErr } = await (
    admin as never as {
      from: (t: string) => {
        update: (p: Record<string, unknown>) => {
          eq: (
            k: string,
            v: string,
          ) => {
            eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
    }
  )
    .from('signature_workflows')
    .update(updatePayload)
    .eq('id', workflowId)
    .eq('org_id', user.activeOrgId);

  if (updErr) return { ok: false, error: updErr.message };

  // Si signers fourni : DELETE + re-INSERT
  if (patch.signers) {
    await (
      admin as never as {
        from: (t: string) => {
          delete: () => { eq: (k: string, v: string) => Promise<unknown> };
        };
      }
    )
      .from('signature_workflow_signers')
      .delete()
      .eq('workflow_id', workflowId);

    const signersRows = patch.signers.map((s) => ({
      workflow_id: workflowId,
      signer_order: s.signerOrder,
      signer_type: s.signerType,
      signer_role: s.signerRole ?? null,
      signer_user_id: s.signerUserId ?? null,
      is_required: s.isRequired,
    }));

    const { error: insErr } = await (
      admin as never as {
        from: (t: string) => {
          insert: (r: unknown) => Promise<{ error: { message: string } | null }>;
        };
      }
    )
      .from('signature_workflow_signers')
      .insert(signersRows);

    if (insErr) return { ok: false, error: `INSERT signers échoué : ${insErr.message}` };
  }

  await logAuditEvent({
    eventType: 'signature.workflow_updated',
    resourceType: 'SIGNATURE_WORKFLOW',
    resourceId: workflowId,
    metadata: patch as Record<string, unknown>,
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/settings/signatures');
  return { ok: true };
}

export async function deleteSignatureWorkflow(input: unknown): Promise<{ ok: true } | ActionError> {
  const parsed = deleteSignatureWorkflowSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { workflowId } = parsed.data;

  const user = await requirePermission('org.manage_settings');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const admin = getSupabaseAdminClient();
  const { error } = await (
    admin as never as {
      from: (t: string) => {
        update: (p: Record<string, unknown>) => {
          eq: (
            k: string,
            v: string,
          ) => {
            eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
    }
  )
    .from('signature_workflows')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', workflowId)
    .eq('org_id', user.activeOrgId);

  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    eventType: 'signature.workflow_deleted',
    resourceType: 'SIGNATURE_WORKFLOW',
    resourceId: workflowId,
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/settings/signatures');
  return { ok: true };
}

// ============================================================================
// Mappers row → DTO
// ============================================================================

function rowToSettings(row: Record<string, unknown>): SignatureSettingsRow {
  return {
    orgId: row.org_id as string,
    defaultExpiryDays: row.default_expiry_days as number,
    defaultSigningOrder: row.default_signing_order as 'SEQUENTIAL' | 'PARALLEL',
    requireOwnerCosigner: row.require_owner_cosigner as boolean,
    reminderDays: row.reminder_days as number,
    updatedAt: row.updated_at as string,
  };
}

function rowToSigner(row: Record<string, unknown>): SignatureWorkflowSignerRow {
  return {
    id: row.id as string,
    signerOrder: row.signer_order as number,
    signerType: row.signer_type as 'BENEFICIARY' | 'ROLE' | 'USER',
    signerRole: (row.signer_role as string | null) ?? null,
    signerUserId: (row.signer_user_id as string | null) ?? null,
    isRequired: row.is_required as boolean,
  };
}

function rowToWorkflow(
  row: Record<string, unknown>,
  signers: SignatureWorkflowSignerRow[],
): SignatureWorkflowRow {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    appliesPlanTypes: (row.applies_to_plan_types as string[] | null) ?? [],
    appliesTemplateCodes: (row.applies_to_template_codes as string[] | null) ?? [],
    expiryDays: row.expiry_days as number,
    signingOrder: row.signing_order as 'SEQUENTIAL' | 'PARALLEL',
    reminderDays: row.reminder_days as number,
    isDefault: row.is_default as boolean,
    isActive: row.is_active as boolean,
    signers,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
