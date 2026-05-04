'use server';

import { revalidatePath } from 'next/cache';
import {
  complianceRuleOverrideInputSchema,
  effectiveRuleFullSchema,
  ruleCodeSchema,
  type ComplianceRuleOverrideInput,
  type EffectiveRuleFull,
  type RuleCode,
  type RuleScope,
} from '@equity/shared';
import { logAuditEvent } from '@/lib/audit';
import { requirePermission } from '@/lib/auth/rbac';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Module 12 B3b — Server Actions configuration des compliance rules.
 *
 * Spec : docs/MODULE_12_COMPLIANCE_ENGINE_V2.md §3.3-3.6.
 *
 * 4 Server Actions exportées :
 *   1. `updateComplianceRuleOverride(input)` — UPSERT override + audit diff
 *   2. `listComplianceRulesForUI()` — 23 rules groupées par scope (page settings)
 *   3. `getComplianceRuleAuditLog(ruleCode)` — 50 derniers events compliance.*
 *   4. `resetAllComplianceOverrides()` — DELETE tous les overrides de l'org
 *
 * Permission requise pour les writes : `compliance_rules.config.write`
 * (seedée en migration 00094, attribuée au rôle OWNER uniquement).
 *
 * Audit : 4 event_types compliance.* :
 *   - 'compliance_rule.activated'      (is_active false → true)
 *   - 'compliance_rule.deactivated'    (is_active true → false)
 *   - 'compliance_rule.params_updated' (params_override changé)
 *   - 'compliance_rule.reset_all'      (DELETE bulk via resetAllOverrides)
 */

// ---------------------------------------------------------------------------
// Types Result pattern
// ---------------------------------------------------------------------------

type ActionOk<T> = { ok: true } & T;
type ActionError = {
  ok: false;
  error: string;
  validationIssues?: number;
};

// ---------------------------------------------------------------------------
// Helper interne — validate params_override contre params_schema de la rule
// ---------------------------------------------------------------------------

type ParamFieldShape = {
  type: 'integer' | 'number' | 'boolean' | 'string';
  min?: number;
  max?: number;
};

/**
 * Vérifie que chaque param dans `paramsOverride` existe dans `params_schema`
 * et respecte ses bornes/type. Retourne `null` si OK, ou un message d'erreur.
 */
function validateParamsAgainstSchema(
  paramsOverride: Record<string, number | boolean | string>,
  paramsSchema: Record<string, ParamFieldShape>,
): string | null {
  for (const [key, value] of Object.entries(paramsOverride)) {
    const field = paramsSchema[key];
    if (!field) {
      return `Param "${key}" inconnu pour cette rule (pas dans params_schema)`;
    }
    if (field.type === 'integer' && (typeof value !== 'number' || !Number.isInteger(value))) {
      return `Param "${key}" attendu integer, reçu ${typeof value}=${String(value)}`;
    }
    if (field.type === 'number' && typeof value !== 'number') {
      return `Param "${key}" attendu number, reçu ${typeof value}=${String(value)}`;
    }
    if (field.type === 'boolean' && typeof value !== 'boolean') {
      return `Param "${key}" attendu boolean, reçu ${typeof value}=${String(value)}`;
    }
    if (field.type === 'string' && typeof value !== 'string') {
      return `Param "${key}" attendu string, reçu ${typeof value}=${String(value)}`;
    }
    if (typeof value === 'number') {
      if (field.min !== undefined && value < field.min) {
        return `Param "${key}" = ${value} < min ${field.min}`;
      }
      if (field.max !== undefined && value > field.max) {
        return `Param "${key}" = ${value} > max ${field.max}`;
      }
    }
  }
  return null;
}

// =============================================================================
// 1. updateComplianceRuleOverride
// =============================================================================

export type UpdateOverrideOk = ActionOk<{ overrideId: string; ruleCode: RuleCode }>;
export type UpdateOverrideResult = UpdateOverrideOk | ActionError;

/**
 * UPSERT un override de rule pour l'org courante.
 *
 * Workflow :
 *   1. Validation Zod input
 *   2. Permission `compliance_rules.config.write`
 *   3. Charger la rule definition (params_schema pour validation bornes)
 *   4. Valider paramsOverride contre params_schema
 *   5. Charger override actuel (pour computer diff dans audit)
 *   6. UPSERT override
 *   7. Audit event selon le diff (activated / deactivated / params_updated)
 *   8. revalidatePath /dashboard/settings/compliance
 *
 * V1 (Q1=b confirmé) : pas de severity_override possible — ignoré silencieux.
 */
export async function updateComplianceRuleOverride(
  input: ComplianceRuleOverrideInput,
): Promise<UpdateOverrideResult> {
  const parsed = complianceRuleOverrideInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Validation échouée : ${parsed.error.issues.length} erreur(s)`,
      validationIssues: parsed.error.issues.length,
    };
  }
  const { ruleCode, isActive, paramsOverride, notes } = parsed.data;

  const user = await requirePermission('compliance_rules.config.write');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  // 1. Charger definition pour valider params_schema
  const { data: definition, error: defErr } = await supabase
    .from('compliance_rule_definitions')
    .select('rule_code, params_schema, default_params, is_active_by_default, severity_default')
    .eq('rule_code', ruleCode)
    .maybeSingle();

  if (defErr || !definition) {
    return { ok: false, error: `Rule definition introuvable pour code=${ruleCode}` };
  }

  const paramsSchema = (definition.params_schema ?? {}) as Record<string, ParamFieldShape>;
  const validationError = validateParamsAgainstSchema(paramsOverride, paramsSchema);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  // 2. Charger override actuel pour le diff
  const { data: existing } = await supabase
    .from('compliance_rule_overrides')
    .select('id, is_active, params_override')
    .eq('org_id', user.activeOrgId)
    .eq('rule_code', ruleCode)
    .maybeSingle();

  const beforeState = {
    is_active: existing?.is_active ?? definition.is_active_by_default,
    params_override: (existing?.params_override ?? {}) as Record<string, unknown>,
  };
  const afterState = {
    is_active: isActive,
    params_override: paramsOverride,
  };

  // 3. UPSERT
  const nowIso = new Date().toISOString();
  const { data: upserted, error: upsertErr } = await supabase
    .from('compliance_rule_overrides')
    .upsert(
      {
        org_id: user.activeOrgId,
        rule_code: ruleCode,
        is_active: isActive,
        params_override: paramsOverride as never,
        notes,
        created_by: existing ? undefined : user.id,
        updated_by: user.id,
        updated_at: nowIso,
      },
      { onConflict: 'org_id,rule_code' },
    )
    .select('id')
    .single();

  if (upsertErr || !upserted) {
    return {
      ok: false,
      error: upsertErr?.message ?? 'UPSERT compliance_rule_overrides échoué',
    };
  }

  // 4. Audit selon le diff
  let eventType: string = 'compliance_rule.params_updated';
  if (beforeState.is_active && !isActive) eventType = 'compliance_rule.deactivated';
  else if (!beforeState.is_active && isActive) eventType = 'compliance_rule.activated';

  const paramsDiff: Record<string, { from: unknown; to: unknown }> = {};
  const allKeys = new Set([
    ...Object.keys(beforeState.params_override),
    ...Object.keys(afterState.params_override),
  ]);
  for (const key of allKeys) {
    const before = beforeState.params_override[key];
    const after = afterState.params_override[key];
    if (before !== after) paramsDiff[key] = { from: before, to: after };
  }

  await logAuditEvent({
    eventType,
    resourceType: 'compliance_rule_override',
    resourceId: upserted.id,
    beforeState: beforeState as Record<string, unknown>,
    afterState: afterState as Record<string, unknown>,
    metadata: {
      rule_code: ruleCode,
      diff: paramsDiff,
      notes: notes ?? null,
    },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/settings/compliance');

  return { ok: true, overrideId: upserted.id, ruleCode };
}

// =============================================================================
// 2. listComplianceRulesForUI
// =============================================================================

export type ListRulesOk = ActionOk<{
  rulesByScope: Record<RuleScope, EffectiveRuleFull[]>;
  totalCount: number;
}>;
export type ListRulesResult = ListRulesOk | ActionError;

/**
 * Liste les 23 rules effectives groupées par scope pour la page UI.
 *
 * Lecture seule : ne nécessite PAS `compliance_rules.config.write`. Tous les
 * users authenticated avec accès à l'org peuvent voir la config (pas
 * d'information sensible — juste les seuils business).
 */
export async function listComplianceRulesForUI(): Promise<ListRulesResult> {
  const user = await requirePermission('plans.read'); // permission liée à l'org membership
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('effective_compliance_rules')
    .select(
      'rule_code, scope, description_fr, description_en, is_active, effective_severity, severity_default, is_severity_overridable, effective_params, params_schema, default_params, cta_url_template, documentation_url, is_overridden, override_notes, params_override, override_updated_at, override_updated_by',
    )
    .eq('org_id', user.activeOrgId)
    .order('scope', { ascending: true })
    .order('rule_code', { ascending: true });

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Réponse DB inattendue (data null)' };

  const rulesByScope: Record<RuleScope, EffectiveRuleFull[]> = {
    plan: [],
    award: [],
    beneficiary: [],
    valuation: [],
    cap_table: [],
    exercise: [],
    approval: [],
    document: [],
  };

  let totalCount = 0;
  for (const row of data) {
    const parseRes = effectiveRuleFullSchema.safeParse(row);
    if (!parseRes.success) {
      // Skip silently — log warning pour visibilité dev
      console.warn(
        '[Module 12] Skipping malformed effective rule row:',
        (row as { rule_code?: unknown }).rule_code,
        parseRes.error.issues[0]?.message,
      );
      continue;
    }
    const rule = parseRes.data;
    rulesByScope[rule.scope].push(rule);
    totalCount += 1;
  }

  return { ok: true, rulesByScope, totalCount };
}

// =============================================================================
// 3. getComplianceRuleAuditLog
// =============================================================================

export type AuditLogEntry = {
  id: string;
  eventType: string;
  occurredAt: string;
  userEmail: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
};

export type AuditLogOk = ActionOk<{ entries: AuditLogEntry[] }>;
export type AuditLogResult = AuditLogOk | ActionError;

/**
 * Retourne les 50 derniers audit events compliance.* pour une rule donnée.
 *
 * Permission : `compliance_rules.config.write` (lecture audit = même perm que
 * write — V2 pourra séparer si besoin).
 *
 * Filtrage : event_type LIKE 'compliance_rule.%' AND metadata->>rule_code =
 * input.ruleCode AND org_id = current_org_id().
 */
export async function getComplianceRuleAuditLog(ruleCode: string): Promise<AuditLogResult> {
  const codeCheck = ruleCodeSchema.safeParse(ruleCode);
  if (!codeCheck.success) {
    return { ok: false, error: 'rule_code invalide' };
  }

  const user = await requirePermission('compliance_rules.config.write');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('audit_events')
    .select('id, event_type, occurred_at, user_email, before_state, after_state, metadata')
    .eq('org_id', user.activeOrgId)
    .like('event_type', 'compliance_rule.%')
    .filter('metadata->>rule_code', 'eq', codeCheck.data)
    .order('occurred_at', { ascending: false })
    .limit(50);

  if (error) return { ok: false, error: error.message };

  const entries: AuditLogEntry[] = (data ?? []).map((row) => ({
    id: row.id,
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    userEmail: row.user_email,
    beforeState: (row.before_state ?? null) as Record<string, unknown> | null,
    afterState: (row.after_state ?? null) as Record<string, unknown> | null,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
  }));

  return { ok: true, entries };
}

// =============================================================================
// 4. resetAllComplianceOverrides
// =============================================================================

export type ResetAllOk = ActionOk<{ deletedCount: number }>;
export type ResetAllResult = ResetAllOk | ActionError;

/**
 * Supprime TOUS les overrides compliance pour l'org courante (= retour aux
 * defaults DB).
 *
 * Use case : un OWNER veut « reset » sa config après expérimentation.
 * Audit event unique `compliance_rule.reset_all` avec metadata.deleted_count.
 *
 * Pas de soft-delete : la table `compliance_rule_overrides` n'a pas de
 * `deleted_at`. Si le user veut revenir à un état antérieur, il devra
 * recréer manuellement les overrides souhaités.
 */
export async function resetAllComplianceOverrides(): Promise<ResetAllResult> {
  const user = await requirePermission('compliance_rules.config.write');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  // Count existing avant DELETE pour audit
  const { count: beforeCount } = await supabase
    .from('compliance_rule_overrides')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', user.activeOrgId);

  const { error } = await supabase
    .from('compliance_rule_overrides')
    .delete()
    .eq('org_id', user.activeOrgId);

  if (error) return { ok: false, error: error.message };

  const deletedCount = beforeCount ?? 0;

  await logAuditEvent({
    eventType: 'compliance_rule.reset_all',
    resourceType: 'compliance_rule_overrides',
    metadata: { deleted_count: deletedCount },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  revalidatePath('/dashboard/settings/compliance');

  return { ok: true, deletedCount };
}
