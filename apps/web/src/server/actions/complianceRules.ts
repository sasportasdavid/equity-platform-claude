'use server';

import { revalidatePath } from 'next/cache';
import {
  complianceRuleOverrideInputSchema,
  effectiveRuleFullSchema,
  ruleCodeSchema,
  simulateComplianceChangeInputSchema,
  type ComplianceRuleOverrideInput,
  type EffectiveRuleFull,
  type RuleCode,
  type RuleScope,
  type SimulateComplianceChangeInput,
  type SimulationResult,
  type SimulationSampleItem,
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

// =============================================================================
// 5. simulateComplianceChange — Module 12 B5 (what-if simulator)
// =============================================================================

/**
 * Module 12 B5 — Whitelist des rules avec simulation V1.
 *
 * Critère d'inclusion : la rule a une logique de check qu'on peut reproduire
 * via 1 SELECT SQL agrégé sans complexité (joins, computed states, etc.).
 *
 * 4 rules deeply implemented V1 :
 *   - VALUATION_STALE_BLOCKING (count plans by latest valuation age)
 *   - GRANT_DATE_RECENT (count awards by grant_date age)
 *   - HIRE_DATE_REASONABLE (count beneficiaries by hire_date validity)
 *   - ESOP_PERCENT_BEST_PRACTICE (count ESOP share_classes by pool %)
 *
 * 5 rules deferred V1.5 (returnent simulationSupported=false avec reason) :
 *   - AGA_30_PERCENT_CAP / AGA_APPROACHING_CAP : nécessitent compute_cap_table
 *   - FMV_RECENT_ENOUGH : column plans.fmv_set_at non-finalisée
 *   - ROUND_AMOUNT_CONSISTENCY : tickets investisseurs en JSONB nested
 *   - FMV_DEVIATION_WARNING : comparison cross-runs complexe
 *
 * Les 14 rules toggle-only retournent toujours simulationSupported=false
 * avec reason="Rule sans paramètre numérique".
 */
const SIMULATABLE_RULES = new Set<RuleCode>([
  'VALUATION_STALE_BLOCKING',
  'GRANT_DATE_RECENT',
  'HIRE_DATE_REASONABLE',
  'ESOP_PERCENT_BEST_PRACTICE',
]);

const DEFERRED_V1_5_RULES = new Set<RuleCode>([
  'AGA_30_PERCENT_CAP',
  'AGA_APPROACHING_CAP',
  'FMV_RECENT_ENOUGH',
  'ROUND_AMOUNT_CONSISTENCY',
  'FMV_DEVIATION_WARNING',
]);

export type SimulateOk = ActionOk<{ simulation: SimulationResult }>;
export type SimulateResult = SimulateOk | ActionError;

/**
 * Server Action B5 — Calcule l'impact prospectif d'un changement de config
 * compliance pour la rule courante.
 *
 * Workflow :
 *   1. Validation Zod input (même shape qu'updateOverride)
 *   2. Permission `compliance_rules.config.write`
 *   3. Si rule_code pas dans `SIMULATABLE_RULES` → return result avec
 *      simulationSupported=false + reason explicite
 *   4. Sinon : charge config actuelle (override actif) + dispatch vers le
 *      helper de simulation correspondant
 *   5. Retourne SimulationResult avec counts + sample
 *
 * Pas d'écriture en DB — simulation pure (effet prospectif Q4=b).
 */
export async function simulateComplianceChange(
  input: SimulateComplianceChangeInput,
): Promise<SimulateResult> {
  const parsed = simulateComplianceChangeInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Validation échouée : ${parsed.error.issues.length} erreur(s)`,
      validationIssues: parsed.error.issues.length,
    };
  }
  const { ruleCode, isActive: futureActive, paramsOverride: futureParams } = parsed.data;

  const user = await requirePermission('compliance_rules.config.write');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  // Si pas simulable V1 → retour explicite
  if (!SIMULATABLE_RULES.has(ruleCode)) {
    const reason = DEFERRED_V1_5_RULES.has(ruleCode)
      ? 'Simulation non disponible V1 — déférée Module 12 V1.5 (logique cap table ou cross-runs)'
      : 'Simulation non applicable (rule sans paramètre numérique)';
    return {
      ok: true,
      simulation: emptyUnsupportedResult(ruleCode, reason),
    };
  }

  const supabase = await createSupabaseServerClient();

  // Charger config actuelle (override actif si présent, sinon defaults)
  const { data: definition } = await supabase
    .from('compliance_rule_definitions')
    .select('rule_code, default_params, is_active_by_default')
    .eq('rule_code', ruleCode)
    .maybeSingle();
  if (!definition) {
    return { ok: false, error: `Rule definition introuvable pour code=${ruleCode}` };
  }
  const { data: existing } = await supabase
    .from('compliance_rule_overrides')
    .select('is_active, params_override')
    .eq('org_id', user.activeOrgId)
    .eq('rule_code', ruleCode)
    .maybeSingle();

  const currentActive = existing?.is_active ?? definition.is_active_by_default;
  const currentParams = {
    ...(definition.default_params as Record<string, unknown>),
    ...((existing?.params_override ?? {}) as Record<string, unknown>),
  };
  const futureParamsMerged = {
    ...(definition.default_params as Record<string, unknown>),
    ...futureParams,
  };

  // Dispatch vers le helper spécifique
  let simulation: SimulationResult;
  switch (ruleCode) {
    case 'VALUATION_STALE_BLOCKING':
      simulation = await simulateValuationStale(
        currentParams,
        currentActive,
        futureParamsMerged,
        futureActive,
        user.activeOrgId,
        supabase,
      );
      break;
    case 'GRANT_DATE_RECENT':
      simulation = await simulateGrantDateRecent(
        currentParams,
        currentActive,
        futureParamsMerged,
        futureActive,
        user.activeOrgId,
        supabase,
      );
      break;
    case 'HIRE_DATE_REASONABLE':
      simulation = await simulateHireDateReasonable(
        currentParams,
        currentActive,
        futureParamsMerged,
        futureActive,
        user.activeOrgId,
        supabase,
      );
      break;
    case 'ESOP_PERCENT_BEST_PRACTICE':
      simulation = await simulateEsopBestPractice(
        currentParams,
        currentActive,
        futureParamsMerged,
        futureActive,
        user.activeOrgId,
        supabase,
      );
      break;
    default:
      // Defensive — ne devrait jamais arriver vu le check SIMULATABLE_RULES plus haut
      simulation = emptyUnsupportedResult(ruleCode, 'Helper de simulation manquant');
  }

  return { ok: true, simulation };
}

// ---------------------------------------------------------------------------
// Helpers internes — simulators par rule
// ---------------------------------------------------------------------------

type SupabaseLike = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function emptyUnsupportedResult(ruleCode: RuleCode, reason: string): SimulationResult {
  return {
    ruleCode,
    simulationSupported: false,
    currentCompliant: 0,
    currentNonCompliant: 0,
    afterCompliant: 0,
    afterNonCompliant: 0,
    newlyBlocked: 0,
    newlyUnblocked: 0,
    sampleNewlyBlocked: [],
    totalEvaluated: 0,
    notSupportedReason: reason,
  };
}

/** Calcule l'âge en jours d'une date ISO. Retourne Infinity si null/invalide. */
function ageInDays(iso: string | null): number {
  if (!iso) return Infinity;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return Infinity;
  return Math.floor((Date.now() - ts) / 86400000);
}

/**
 * VALUATION_STALE_BLOCKING — count plans by valuation age.
 *
 * Compliant si rule désactivée OU pas de valuation OU age <= staleDays.
 * Non-compliant si rule active ET valuation existe ET age > staleDays.
 *
 * Note : si pas de valuation du tout, on considère "non-applicable" donc
 * compliant (l'autre branche du checker — `!ctx.latestRun → return null`
 * dans le code TS — est ici interprétée comme "pas évalué"). Cette logique
 * V1 sous-estime peut-être les non-conformes mais est cohérente avec le
 * checker actuel.
 */
async function simulateValuationStale(
  currentParams: Record<string, unknown>,
  currentActive: boolean,
  futureParams: Record<string, unknown>,
  futureActive: boolean,
  orgId: string,
  supabase: SupabaseLike,
): Promise<SimulationResult> {
  const currentDays = (currentParams.staleDays as number | undefined) ?? 90;
  const futureDays = (futureParams.staleDays as number | undefined) ?? 90;

  // SELECT plans + dernière valuation_run DONE par plan
  const { data: rows } = await supabase
    .from('plans')
    .select('id, name, valuation_runs(id, status, completed_at)')
    .eq('org_id', orgId)
    .is('deleted_at', null);

  type Row = {
    id: string;
    name: string | null;
    valuation_runs: { id: string; status: string | null; completed_at: string | null }[] | null;
  };
  const plans = (rows ?? []) as Row[];
  let currentCompliant = 0;
  let currentNonCompliant = 0;
  let afterCompliant = 0;
  let afterNonCompliant = 0;
  const sample: SimulationSampleItem[] = [];

  for (const plan of plans) {
    // Latest valuation DONE
    const doneRuns = (plan.valuation_runs ?? []).filter((r) => r.status === 'DONE');
    doneRuns.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
    const latest = doneRuns[0]?.completed_at ?? null;
    const age = ageInDays(latest);

    // Compliant si rule inactive ou pas de valuation (skip) ou age OK
    const isCurrentCompliant = !currentActive || latest === null || age <= currentDays;
    const isFutureCompliant = !futureActive || latest === null || age <= futureDays;
    if (isCurrentCompliant) currentCompliant++;
    else currentNonCompliant++;
    if (isFutureCompliant) afterCompliant++;
    else afterNonCompliant++;

    if (isCurrentCompliant && !isFutureCompliant && sample.length < 10 && latest !== null) {
      sample.push({
        id: plan.id,
        label: plan.name ?? `Plan ${plan.id.slice(0, 8)}`,
        reason: `Valorisation à ${age}j > nouveau seuil ${futureDays}j`,
      });
    }
  }

  const newlyBlocked = Math.max(0, currentCompliant - afterCompliant);
  const newlyUnblocked = Math.max(0, currentNonCompliant - afterNonCompliant);
  return {
    ruleCode: 'VALUATION_STALE_BLOCKING',
    simulationSupported: true,
    currentCompliant,
    currentNonCompliant,
    afterCompliant,
    afterNonCompliant,
    newlyBlocked,
    newlyUnblocked,
    sampleNewlyBlocked: sample,
    totalEvaluated: plans.length,
    notSupportedReason: null,
  };
}

/**
 * GRANT_DATE_RECENT — count awards by grant_date age.
 *
 * Warning si grant_date antidatée de plus de N jours. V1 = scope sur les
 * awards non-cancelled (status != CANCELLED/FORFEITED).
 */
async function simulateGrantDateRecent(
  currentParams: Record<string, unknown>,
  currentActive: boolean,
  futureParams: Record<string, unknown>,
  futureActive: boolean,
  orgId: string,
  supabase: SupabaseLike,
): Promise<SimulationResult> {
  const currentDays = (currentParams.recentDays as number | undefined) ?? 30;
  const futureDays = (futureParams.recentDays as number | undefined) ?? 30;

  const { data: rows } = await supabase
    .from('awards')
    .select('id, award_number, grant_date, status')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .not('status', 'in', '(CANCELLED,FORFEITED)');

  type Row = {
    id: string;
    award_number: string | null;
    grant_date: string | null;
    status: string | null;
  };
  const awards = (rows ?? []) as Row[];
  let currentCompliant = 0;
  let currentNonCompliant = 0;
  let afterCompliant = 0;
  let afterNonCompliant = 0;
  const sample: SimulationSampleItem[] = [];

  for (const award of awards) {
    const age = ageInDays(award.grant_date);
    const isCurrentCompliant = !currentActive || age <= currentDays;
    const isFutureCompliant = !futureActive || age <= futureDays;
    if (isCurrentCompliant) currentCompliant++;
    else currentNonCompliant++;
    if (isFutureCompliant) afterCompliant++;
    else afterNonCompliant++;

    if (isCurrentCompliant && !isFutureCompliant && sample.length < 10) {
      sample.push({
        id: award.id,
        label: award.award_number ?? `Award ${award.id.slice(0, 8)}`,
        reason: `Grant date à ${age}j > nouveau seuil ${futureDays}j (anti-backdating)`,
      });
    }
  }

  return {
    ruleCode: 'GRANT_DATE_RECENT',
    simulationSupported: true,
    currentCompliant,
    currentNonCompliant,
    afterCompliant,
    afterNonCompliant,
    newlyBlocked: Math.max(0, currentCompliant - afterCompliant),
    newlyUnblocked: Math.max(0, currentNonCompliant - afterNonCompliant),
    sampleNewlyBlocked: sample,
    totalEvaluated: awards.length,
    notSupportedReason: null,
  };
}

/**
 * HIRE_DATE_REASONABLE — count beneficiaries with valid hire_date.
 *
 * Warning si hire_date dans le futur (> maxFutureMonths) OU année < minYear.
 * Anomalie connue : émet ERROR si année < 1900 mais on traite comme un seul
 * niveau "non-compliant" pour simplifier la simulation.
 */
async function simulateHireDateReasonable(
  currentParams: Record<string, unknown>,
  currentActive: boolean,
  futureParams: Record<string, unknown>,
  futureActive: boolean,
  orgId: string,
  supabase: SupabaseLike,
): Promise<SimulationResult> {
  const currentMinYear = (currentParams.minYear as number | undefined) ?? 1900;
  const currentMaxMonths = (currentParams.maxFutureMonths as number | undefined) ?? 3;
  const futureMinYear = (futureParams.minYear as number | undefined) ?? 1900;
  const futureMaxMonths = (futureParams.maxFutureMonths as number | undefined) ?? 3;

  const { data: rows } = await supabase
    .from('beneficiaries')
    .select('id, first_name, last_name, hire_date')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .not('hire_date', 'is', null);

  type Row = {
    id: string;
    first_name: string | null;
    last_name: string | null;
    hire_date: string | null;
  };
  const bens = (rows ?? []) as Row[];

  function isCompliant(
    hireDateIso: string | null,
    active: boolean,
    minYear: number,
    maxMonths: number,
  ): boolean {
    if (!active) return true;
    if (!hireDateIso) return true;
    const ts = Date.parse(hireDateIso);
    if (!Number.isFinite(ts)) return true;
    const d = new Date(ts);
    if (d.getFullYear() < minYear) return false;
    const futureLimit = Date.now() + maxMonths * 30 * 86400000;
    if (ts > futureLimit) return false;
    return true;
  }

  let currentCompliant = 0;
  let currentNonCompliant = 0;
  let afterCompliant = 0;
  let afterNonCompliant = 0;
  const sample: SimulationSampleItem[] = [];

  for (const ben of bens) {
    const isCurrentOk = isCompliant(ben.hire_date, currentActive, currentMinYear, currentMaxMonths);
    const isFutureOk = isCompliant(ben.hire_date, futureActive, futureMinYear, futureMaxMonths);
    if (isCurrentOk) currentCompliant++;
    else currentNonCompliant++;
    if (isFutureOk) afterCompliant++;
    else afterNonCompliant++;

    if (isCurrentOk && !isFutureOk && sample.length < 10) {
      const fullName =
        [ben.first_name, ben.last_name].filter(Boolean).join(' ') ||
        `Bénéficiaire ${ben.id.slice(0, 8)}`;
      sample.push({
        id: ben.id,
        label: fullName,
        reason: `Hire date ${ben.hire_date} hors plage [${futureMinYear}; +${futureMaxMonths} mois]`,
      });
    }
  }

  return {
    ruleCode: 'HIRE_DATE_REASONABLE',
    simulationSupported: true,
    currentCompliant,
    currentNonCompliant,
    afterCompliant,
    afterNonCompliant,
    newlyBlocked: Math.max(0, currentCompliant - afterCompliant),
    newlyUnblocked: Math.max(0, currentNonCompliant - afterNonCompliant),
    sampleNewlyBlocked: sample,
    totalEvaluated: bens.length,
    notSupportedReason: null,
  };
}

/**
 * ESOP_PERCENT_BEST_PRACTICE — count ESOP share_classes by pool % bracket.
 *
 * V1 simplifié : compte les share_classes ESOP dont pool_total_units sort de
 * la fourchette [minPct%, maxPct%] du capital pré-pool. Le calcul du capital
 * pré-pool nécessite cap_table — on approxime ici par la SUM(pool_total_units)
 * de l'org en attendant Module 13.
 */
async function simulateEsopBestPractice(
  currentParams: Record<string, unknown>,
  currentActive: boolean,
  futureParams: Record<string, unknown>,
  futureActive: boolean,
  orgId: string,
  supabase: SupabaseLike,
): Promise<SimulationResult> {
  const currentMin = (currentParams.minPct as number | undefined) ?? 5;
  const currentMax = (currentParams.maxPct as number | undefined) ?? 15;
  const futureMin = (futureParams.minPct as number | undefined) ?? 5;
  const futureMax = (futureParams.maxPct as number | undefined) ?? 15;

  const { data: rows } = await supabase
    .from('share_classes')
    .select('id, code, class_type, pool_total_units')
    .eq('org_id', orgId)
    .eq('class_type', 'ESOP');

  type Row = {
    id: string;
    code: string | null;
    class_type: string | null;
    pool_total_units: number | null;
  };
  const classes = (rows ?? []) as Row[];

  // Total org shares (approximation V1 — vrai capital pré-pool nécessite compute_cap_table)
  const { data: allRows } = await supabase
    .from('share_classes')
    .select('pool_total_units')
    .eq('org_id', orgId);
  const totalShares = (allRows ?? []).reduce(
    (sum, c) => sum + (Number((c as { pool_total_units: number | null }).pool_total_units) || 0),
    0,
  );

  if (totalShares <= 0) {
    return {
      ...emptyUnsupportedResult(
        'ESOP_PERCENT_BEST_PRACTICE',
        'Cap table vide pour cette org — impossible de calculer le %',
      ),
    };
  }

  function isCompliant(
    units: number | null,
    active: boolean,
    minPct: number,
    maxPct: number,
  ): boolean {
    if (!active) return true;
    const u = Number(units) || 0;
    if (u <= 0) return true;
    const pct = (u / totalShares) * 100;
    return pct >= minPct && pct <= maxPct;
  }

  let currentCompliant = 0;
  let currentNonCompliant = 0;
  let afterCompliant = 0;
  let afterNonCompliant = 0;
  const sample: SimulationSampleItem[] = [];

  for (const cls of classes) {
    const isCurrentOk = isCompliant(cls.pool_total_units, currentActive, currentMin, currentMax);
    const isFutureOk = isCompliant(cls.pool_total_units, futureActive, futureMin, futureMax);
    if (isCurrentOk) currentCompliant++;
    else currentNonCompliant++;
    if (isFutureOk) afterCompliant++;
    else afterNonCompliant++;

    if (isCurrentOk && !isFutureOk && sample.length < 10) {
      const u = Number(cls.pool_total_units) || 0;
      const pct = ((u / totalShares) * 100).toFixed(1);
      sample.push({
        id: cls.id,
        label: cls.code ?? `Share class ${cls.id.slice(0, 8)}`,
        reason: `Pool à ${pct}% hors plage [${futureMin}%; ${futureMax}%]`,
      });
    }
  }

  return {
    ruleCode: 'ESOP_PERCENT_BEST_PRACTICE',
    simulationSupported: true,
    currentCompliant,
    currentNonCompliant,
    afterCompliant,
    afterNonCompliant,
    newlyBlocked: Math.max(0, currentCompliant - afterCompliant),
    newlyUnblocked: Math.max(0, currentNonCompliant - afterNonCompliant),
    sampleNewlyBlocked: sample,
    totalEvaluated: classes.length,
    notSupportedReason: null,
  };
}
