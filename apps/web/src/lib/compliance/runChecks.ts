import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AWARD_RULES } from './rules/awardRules';
import { BENEFICIARY_RULES } from './rules/beneficiaryRules';
import {
  APPROVAL_AWARD_RULES,
  APPROVAL_DECISION_RULES,
  APPROVAL_WORKFLOW_RULES,
} from './rules/approvalRules';
import { CAP_TABLE_RULES } from './rules/capTableRules';
import { DOCUMENT_GENERATION_RULES, DOCUMENT_SIGNATURE_RULES } from './rules/documentRules';
import { VALUATION_RULES } from './rules/valuationRules';
import { loadEffectiveRule } from './effectiveRules';
import type { RuleCode } from '@equity/shared';
import type {
  ApprovalAwardCheckContext,
  ApprovalAwardCheckInput,
  ApprovalDecisionCheckContext,
  ApprovalDecisionCheckInput,
  ApprovalWorkflowCheckContext,
  ApprovalWorkflowCheckInput,
  AwardCheckContext,
  AwardCheckInput,
  BeneficiaryCheckContext,
  BeneficiaryCheckInput,
  CapTableCheckContext,
  CapTableCheckInput,
  ComplianceCheckResult,
  ComplianceIssue,
  ComplianceRule,
  DocumentGenerationCheckContext,
  DocumentGenerationCheckInput,
  DocumentSignatureCheckContext,
  DocumentSignatureCheckInput,
  ValuationCheckContext,
  ValuationCheckInput,
} from './types';

/**
 * Helper interne — exécute une liste de rules en parallèle, agrège.
 * Mutualise la logique entre `runComplianceChecks` (awards) et
 * `runBeneficiaryComplianceChecks` (Module 4 B2).
 */
async function runRules<TData, TCtx>(
  rules: ComplianceRule<TData, TCtx>[],
  data: TData,
  ctx: TCtx,
): Promise<ComplianceCheckResult> {
  const results = await Promise.all(
    rules.map(async (rule) => {
      try {
        const issue = await rule.check(data, ctx);
        // Bug #5bis sprint 6 mai 2026 PM — log per-rule pour Vercel debug.
        // L'opérateur peut tracer "quelle règle a évalué et avec quel verdict"
        // pour chaque appel transitionAward / submit / decision.
        console.log(
          `[compliance] ${rule.code} ${issue ? 'FAIL' : 'PASS'} (${rule.enforcement})`,
          issue ? { severity: issue.severity, msg: issue.message } : '',
        );
        return { rule, issue };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        console.error(`[compliance] ${rule.code} INTERNAL_ERROR`, msg);
        return {
          rule,
          issue: {
            severity: 'WARNING' as const,
            code: `${rule.code}_INTERNAL_ERROR`,
            message: `Rule ${rule.code} a échoué : ${msg}`,
          },
        };
      }
    }),
  );

  const errors: ComplianceIssue[] = [];
  const warnings: ComplianceIssue[] = [];
  for (const { rule, issue } of results) {
    if (!issue) continue;
    if (rule.enforcement === 'hard') errors.push(issue);
    else warnings.push(issue);
  }
  return { errors, warnings, hasHardBlocks: errors.length > 0 };
}

/**
 * Helper compliance — Module 3b B7 (initial) + Module 12.5 B1
 * (wiring effectiveParamsByRule + effectiveSeverityByRule pour les 5 award
 * rules).
 *
 * Charge le contexte (plan + beneficiary + poolStatus + effective rules
 * config) côté serveur en parallèle, puis lance toutes les rules applicables
 * au plan_type en parallèle (Promise.all). Aggregé en errors / warnings
 * selon enforcement.
 *
 * Spec : docs/MODULE_03B_AWARDS_LIFECYCLE.md §7 + docs/MODULE_12_*.md §3.2.
 *
 * Module 12.5 B1 — Lecture config DB :
 *   1. Pour chaque rule du registry V1 (5 codes), on appelle `loadEffectiveRule(code)`
 *      pour récupérer la config effective (params merged + severity + active).
 *   2. Si `is_active=false` côté DB → la rule est filtrée (pas exécutée).
 *   3. Les params + severity sont injectés dans `ctx.effectiveParamsByRule`
 *      / `effectiveSeverityByRule`. Les checkers les lisent via `readNumberParam`
 *      / `readSeverity` (`rules/_helpers.ts`) avec fallback sur les constantes
 *      hard-codées.
 *   4. Si `loadEffectiveRule` retourne null (DB indispo, rule absente du
 *      catalogue), la rule s'exécute en mode legacy avec ses defaults.
 *
 * `scope` est réservé pour V2 (Module 12) où on aura des rules différentes
 * pour PROPOSAL vs MODIFICATION. En V1, les 5 rules s'appliquent uniquement
 * au scope AWARD_PROPOSAL.
 */
const AWARD_RULE_CODES: RuleCode[] = [
  'BSPCE_BENEFICIARY_TYPE',
  'AGA_30_PERCENT_CAP',
  'AGA_APPROACHING_CAP',
  'POOL_AVAILABLE',
  'GRANT_DATE_RECENT',
];

export async function runComplianceChecks(
  scope: 'AWARD_PROPOSAL' | 'AWARD_MODIFICATION',
  input: AwardCheckInput,
): Promise<ComplianceCheckResult> {
  // V1 : seul AWARD_PROPOSAL applique des rules. AWARD_MODIFICATION n'a pas
  // de rules dédiées (les modifications IFRS 2 sont déjà validées par la RPC
  // apply_award_modification + son superschema Zod).
  if (scope !== 'AWARD_PROPOSAL') {
    return { errors: [], warnings: [], hasHardBlocks: false };
  }

  const supabase = await createSupabaseServerClient();

  // Charge plan + beneficiary + 5 effective rules en parallèle (Module 12.5 B1).
  // Les RPC `get_effective_rule` sont stables et touchent une vue indexée
  // sur (rule_code) — coût négligeable.
  const [planRes, beneficiaryRes, ...effectiveRules] = await Promise.all([
    supabase
      .from('plans')
      .select('id, plan_type, pool_size, pool_allocated, company_id, org_id')
      .eq('id', input.planId)
      .maybeSingle(),
    supabase
      .from('beneficiaries')
      .select('id, beneficiary_type, email')
      .eq('id', input.beneficiaryId)
      .maybeSingle(),
    ...AWARD_RULE_CODES.map((code) => loadEffectiveRule(code)),
  ]);

  if (planRes.error || !planRes.data) {
    return {
      errors: [
        {
          severity: 'ERROR',
          code: 'PLAN_NOT_FOUND',
          message: `Plan introuvable (id=${input.planId})`,
        },
      ],
      warnings: [],
      hasHardBlocks: true,
    };
  }
  if (beneficiaryRes.error || !beneficiaryRes.data) {
    return {
      errors: [
        {
          severity: 'ERROR',
          code: 'BENEFICIARY_NOT_FOUND',
          message: `Bénéficiaire introuvable (id=${input.beneficiaryId})`,
        },
      ],
      warnings: [],
      hasHardBlocks: true,
    };
  }

  // Module 12.5 B1 — Construit les maps params + severity pour le ctx.
  // `is_active=false` côté DB → on exclut la rule du registry à exécuter.
  const effectiveParamsByRule: Record<string, Record<string, unknown>> = {};
  const effectiveSeverityByRule: Record<string, 'error' | 'warning'> = {};
  const activeCodes = new Set<string>(AWARD_RULE_CODES); // default actif si DB indispo

  for (let i = 0; i < AWARD_RULE_CODES.length; i++) {
    const code = AWARD_RULE_CODES[i]!;
    const eff = effectiveRules[i];
    if (!eff) continue; // DB indispo / rule absente → fallback legacy
    if (!eff.is_active) {
      activeCodes.delete(code);
      continue;
    }
    effectiveParamsByRule[code] = eff.effective_params;
    effectiveSeverityByRule[code] = eff.effective_severity;
  }

  // Module 10 B7 : charge la cap table pour activer AGA_30_PERCENT_CAP
  // (résolution dette #3). On appelle compute_cap_table uniquement pour les
  // plans AGA — coût d'1 query DB en plus, négligeable face au reste.
  let agaAllocatedTotal: number | null = null;
  let companyTotalShares: number | null = null;
  if (planRes.data.plan_type === 'AGA') {
    const orgId = planRes.data.org_id;
    const today = new Date().toISOString().slice(0, 10);
    const { data: capTable } = await supabase.rpc('compute_cap_table', {
      p_org_id: orgId,
      p_asof_date: today,
      p_scenario_id: undefined,
      p_view_mode: 'CONSOLIDATED',
    });
    if (capTable && typeof capTable === 'object' && !Array.isArray(capTable)) {
      const ct = capTable as {
        grand_total_units?: number;
        totals_by_class?: Record<string, number>;
      };
      companyTotalShares = ct.grand_total_units ?? null;
    }
    // AGA allocated = sum(awards.units_outstanding) sur les plans AGA actifs
    // (statuts pré-cancel). On évite les awards CANCELLED/FORFEITED/EXPIRED.
    const { data: agaAwards } = await supabase
      .from('awards')
      .select('units_outstanding, plans!inner(plan_type)')
      .eq('org_id', orgId)
      .eq('plans.plan_type', 'AGA')
      .in('status', [
        'PROPOSED',
        'PENDING_APPROVAL',
        'APPROVED',
        'GRANTED',
        'VESTING',
        'PARTIALLY_EXERCISED',
      ])
      .is('deleted_at', null);
    agaAllocatedTotal = (agaAwards ?? []).reduce((s, a) => s + Number(a.units_outstanding ?? 0), 0);
  }

  const ctx: AwardCheckContext = {
    plan: planRes.data,
    beneficiary: beneficiaryRes.data,
    poolStatus: {
      remaining: planRes.data.pool_size - planRes.data.pool_allocated,
    },
    agaAllocatedTotal,
    companyTotalShares,
    effectiveParamsByRule,
    effectiveSeverityByRule,
  };

  // Filtre les rules applicables (plan_type ou *) ET actives DB Module 12.5 B1
  const applicableRules = AWARD_RULES.filter(
    (rule) =>
      activeCodes.has(rule.code) &&
      (rule.appliesTo.includes('*') || rule.appliesTo.includes(ctx.plan.plan_type)),
  );

  return runRules(applicableRules, input, ctx);
}

// ---------------------------------------------------------------------------
// Module 4 B2 — Compliance bénéficiaires
// ---------------------------------------------------------------------------

/**
 * Helper compliance bénéficiaires — Module 4 B2 + Module 12.5 B2.
 *
 * Charge le ctx serveur (collision email intra-org + BSPCE active count
 * + 6 effective rules config) puis exécute les rules actives en parallèle.
 * Appelé depuis createBeneficiary + updateBeneficiary (Server Actions).
 * Pas dans bulkCreateBeneficiaries (V1).
 *
 * Module 12.5 B2 — Pré-charge les 6 beneficiary rules effective config
 * en parallèle (pattern Module 12 B2 + Module 12.5 B1). Si DB indispo,
 * fallback legacy (constantes hard-codées dans les rules).
 */
const BENEFICIARY_RULE_CODES: RuleCode[] = [
  'EMAIL_UNIQUE_IN_ORG',
  'TAX_RESIDENCE_FRANCE_CONSISTENCY',
  'HIRE_DATE_REASONABLE',
  'MANAGER_NOT_SELF',
  'IBAN_FORMAT',
  'BSPCE_BENEFICIARY_TYPE_REVERSE',
];

export async function runBeneficiaryComplianceChecks(
  input: BeneficiaryCheckInput,
  orgId: string,
): Promise<ComplianceCheckResult> {
  const supabase = await createSupabaseServerClient();

  // Charge la collision email intra-org (pour EMAIL_UNIQUE_IN_ORG) +
  // optionnellement le count BSPCE actifs (Module 4 B6 — uniquement si on
  // update vers un type risqué CONSULTANT/EXTERNAL) + 6 effective rules
  // config (Module 12.5 B2). Tout en parallèle.
  const needsBspceCheck =
    input.id != null &&
    (input.beneficiaryType === 'CONSULTANT' || input.beneficiaryType === 'EXTERNAL');

  const [existingRes, bspceRes, ...effectiveRules] = await Promise.all([
    supabase
      .from('beneficiaries')
      .select('id')
      .eq('org_id', orgId)
      .eq('email', input.email.toLowerCase())
      .is('deleted_at', null)
      .maybeSingle(),
    needsBspceCheck
      ? supabase
          .from('awards')
          .select('id, plans!inner(plan_type)', { count: 'exact', head: true })
          .eq('beneficiary_id', input.id!)
          .eq('plans.plan_type', 'BSPCE')
          .not('status', 'in', '(CANCELLED,FORFEITED,EXPIRED,FULLY_EXERCISED)')
          .is('deleted_at', null)
      : Promise.resolve({ count: null as number | null }),
    ...BENEFICIARY_RULE_CODES.map((code) => loadEffectiveRule(code)),
  ]);

  // Module 12.5 B2 — Construit les maps params + severity pour le ctx.
  // `is_active=false` côté DB → on exclut la rule du registry.
  const effectiveParamsByRule: Record<string, Record<string, unknown>> = {};
  const effectiveSeverityByRule: Record<string, 'error' | 'warning'> = {};
  const activeCodes = new Set<string>(BENEFICIARY_RULE_CODES);

  for (let i = 0; i < BENEFICIARY_RULE_CODES.length; i++) {
    const code = BENEFICIARY_RULE_CODES[i]!;
    const eff = effectiveRules[i];
    if (!eff) continue; // DB indispo / rule absente → fallback legacy
    if (!eff.is_active) {
      activeCodes.delete(code);
      continue;
    }
    effectiveParamsByRule[code] = eff.effective_params;
    effectiveSeverityByRule[code] = eff.effective_severity;
  }

  const ctx: BeneficiaryCheckContext = {
    orgId,
    beneficiary: input.id ? { id: input.id, email: input.email } : null,
    emailCollisionId: existingRes.data?.id ?? null,
    bspceActiveAwardsCount: needsBspceCheck ? (bspceRes.count ?? 0) : null,
    effectiveParamsByRule,
    effectiveSeverityByRule,
  };

  // Filtre les rules actives DB Module 12.5 B2
  const activeRules = BENEFICIARY_RULES.filter((rule) => activeCodes.has(rule.code));
  return runRules(activeRules, input, ctx);
}

// ---------------------------------------------------------------------------
// Module 5 B2 — Compliance approbations
// ---------------------------------------------------------------------------

/**
 * WORKFLOW_REQUIRED_FOR_AGA — Module 5 B2 (initial) + Module 12.5 B4
 * (résolution dette #14, branchement dans `transitionAward`).
 *
 * Appelé depuis :
 *   - `transitionAward(_, 'PROPOSED')` côté `awards.ts` (Module 12.5 B4) —
 *     hard block si plan AGA sans workflow attaché ni default org.
 *   - Helper `checkAwardApprovalCompliance` (legacy Module 5 B2) — supprimé
 *     en B4 (0 callers).
 *
 * Le ctx est chargé ici : plan + flag workflowAttached (workflow attach_to_plan
 * OU default org pour AWARD_GRANT) + Module 12.5 B4 effective rule severity
 * (override admin via UI Module 12).
 */
export async function runApprovalAwardComplianceChecks(
  input: ApprovalAwardCheckInput,
  orgId: string,
): Promise<ComplianceCheckResult> {
  const supabase = await createSupabaseServerClient();

  const [planRes, attachedRes, defaultRes, effectiveRule] = await Promise.all([
    supabase.from('plans').select('id, plan_type').eq('id', input.planId).maybeSingle(),
    supabase
      .from('approval_workflows')
      .select('id', { count: 'exact', head: true })
      .eq('attach_to_plan_id', input.planId)
      .is('deleted_at', null)
      .eq('is_active', true),
    supabase
      .from('approval_workflows')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('applies_to', 'AWARD_GRANT')
      .eq('is_default', true)
      .eq('is_active', true)
      .is('deleted_at', null),
    loadEffectiveRule('WORKFLOW_REQUIRED_FOR_AGA'),
  ]);

  // Module 12.5 B4 — Si la rule est désactivée DB, on skip silencieusement.
  if (effectiveRule && !effectiveRule.is_active) {
    return { errors: [], warnings: [], hasHardBlocks: false };
  }

  const effectiveSeverityByRule: Record<string, 'error' | 'warning'> = {};
  if (effectiveRule) {
    effectiveSeverityByRule['WORKFLOW_REQUIRED_FOR_AGA'] = effectiveRule.effective_severity;
  }

  const ctx: ApprovalAwardCheckContext = {
    plan: planRes.data ?? null,
    workflowAttached: (attachedRes.count ?? 0) > 0 || (defaultRes.count ?? 0) > 0,
    effectiveSeverityByRule,
  };

  return runRules(APPROVAL_AWARD_RULES, input, ctx);
}

/**
 * NO_SELF_APPROVAL — appelé depuis approveDecision/rejectDecision avant le RPC
 * pour bloquer le self-approval.
 *
 * Module 12.5 B4 — pré-charge l'effective rule pour respecter la severity DB
 * + supporter is_active=false (admin off-switch).
 */
export async function runApprovalDecisionComplianceChecks(
  input: ApprovalDecisionCheckInput,
): Promise<ComplianceCheckResult> {
  const supabase = await createSupabaseServerClient();

  // Récupérer la decision → request → award (created_by) + effective rule en parallèle
  const [decisionRes, effectiveRule] = await Promise.all([
    supabase
      .from('approval_decisions')
      .select('request_id, approval_requests!inner(award_id)')
      .eq('id', input.decisionId)
      .maybeSingle(),
    loadEffectiveRule('NO_SELF_APPROVAL'),
  ]);

  if (effectiveRule && !effectiveRule.is_active) {
    return { errors: [], warnings: [], hasHardBlocks: false };
  }

  const requestRow = decisionRes.data as {
    approval_requests?: { award_id?: string | null };
  } | null;
  const awardId = requestRow?.approval_requests?.award_id ?? null;

  let relatedAward: ApprovalDecisionCheckContext['relatedAward'] = null;
  if (awardId) {
    const { data: aw } = await supabase
      .from('awards')
      .select('id, created_by')
      .eq('id', awardId)
      .maybeSingle();
    if (aw) relatedAward = { id: aw.id, created_by: aw.created_by };
  }

  const effectiveSeverityByRule: Record<string, 'error' | 'warning'> = {};
  if (effectiveRule) {
    effectiveSeverityByRule['NO_SELF_APPROVAL'] = effectiveRule.effective_severity;
  }

  const ctx: ApprovalDecisionCheckContext = { relatedAward, effectiveSeverityByRule };
  return runRules(APPROVAL_DECISION_RULES, input, ctx);
}

/**
 * WORKFLOW_HAS_VALID_STEPS — appelé depuis createWorkflow/updateWorkflow.
 * Pré-charge userExistsMap (USER steps) + roleUserCountMap (ROLE/ANY/ALL steps)
 * + Module 12.5 B4 effective rule severity / is_active.
 */
export async function runApprovalWorkflowComplianceChecks(
  input: ApprovalWorkflowCheckInput,
  orgId: string,
): Promise<ComplianceCheckResult> {
  const supabase = await createSupabaseServerClient();

  const effectiveRulePromise = loadEffectiveRule('WORKFLOW_HAS_VALID_STEPS');

  const userIdsToCheck = Array.from(
    new Set(
      input.steps
        .filter((s) => s.approverType === 'USER' && s.approverUserId)
        .map((s) => s.approverUserId as string),
    ),
  );
  const rolesToCount = Array.from(
    new Set(
      input.steps
        .filter((s) => s.approverType !== 'USER' && s.approverRole)
        .map((s) => s.approverRole as string),
    ),
  );

  const userExistsMap = new Map<string, boolean>();
  const roleUserCountMap = new Map<string, number>();

  if (userIdsToCheck.length > 0) {
    const { data: members } = await supabase
      .from('memberships')
      .select('user_id')
      .eq('org_id', orgId)
      .eq('status', 'ACTIVE')
      .in('user_id', userIdsToCheck);
    const found = new Set((members ?? []).map((m) => m.user_id));
    for (const id of userIdsToCheck) userExistsMap.set(id, found.has(id));
  }

  if (rolesToCount.length > 0) {
    // Pour chaque role, count des memberships ACTIVE qui contiennent ce role
    const { data: members } = await supabase
      .from('memberships')
      .select('user_id, roles')
      .eq('org_id', orgId)
      .eq('status', 'ACTIVE');
    for (const role of rolesToCount) {
      const count = (members ?? []).filter((m) =>
        Array.isArray(m.roles) ? (m.roles as string[]).includes(role) : false,
      ).length;
      roleUserCountMap.set(role, count);
    }
  }

  // Module 12.5 B4 — résoudre l'effective rule (chargée en parallèle au début)
  const effectiveRule = await effectiveRulePromise;
  if (effectiveRule && !effectiveRule.is_active) {
    return { errors: [], warnings: [], hasHardBlocks: false };
  }
  const effectiveSeverityByRule: Record<string, 'error' | 'warning'> = {};
  if (effectiveRule) {
    effectiveSeverityByRule['WORKFLOW_HAS_VALID_STEPS'] = effectiveRule.effective_severity;
  }

  const ctx: ApprovalWorkflowCheckContext = {
    userExistsMap,
    roleUserCountMap,
    effectiveSeverityByRule,
  };
  return runRules(APPROVAL_WORKFLOW_RULES, input, ctx);
}

// ---------------------------------------------------------------------------
// Module 6 B2 — Compliance documents
// ---------------------------------------------------------------------------

/**
 * FMV_RECENT_ENOUGH — appelé depuis generateAwardDocument.
 * V1 : la colonne plans.fmv_set_at n'existe pas encore (Module 11), donc
 * ctx.fmvSetAt est null par défaut → la rule retourne null (no-op). Le
 * caller peut passer un `fmvSetAt` explicite si on a la donnée ailleurs.
 *
 * Module 12.5 B3 — pré-charge la config DB pour FMV_RECENT_ENOUGH (1 RPC).
 * Si désactivée par l'org, la rule est filtrée. Params/severity injectés
 * dans le ctx pour lecture par les checkers.
 */
export async function runDocumentGenerationComplianceChecks(
  input: DocumentGenerationCheckInput,
  fmvSetAt?: string | null,
): Promise<ComplianceCheckResult> {
  const eff = await loadEffectiveRule('FMV_RECENT_ENOUGH');

  const effectiveParamsByRule: Record<string, Record<string, unknown>> = {};
  const effectiveSeverityByRule: Record<string, 'error' | 'warning'> = {};
  const isActive = eff?.is_active ?? true;
  if (eff && eff.is_active) {
    effectiveParamsByRule['FMV_RECENT_ENOUGH'] = eff.effective_params;
    effectiveSeverityByRule['FMV_RECENT_ENOUGH'] = eff.effective_severity;
  }

  const ctx: DocumentGenerationCheckContext = {
    fmvSetAt: fmvSetAt ?? null,
    effectiveParamsByRule,
    effectiveSeverityByRule,
  };
  const rules = isActive ? DOCUMENT_GENERATION_RULES : [];
  return runRules(rules, input, ctx);
}

/**
 * SIGNERS_COMPLETE_INFO + DOCUMENT_NOT_VOIDED — appelé depuis
 * sendDocumentForSignature (B3). Pas de ctx async nécessaire (toutes les
 * données sont déjà dans l'input).
 *
 * Module 12.5 B3 — pré-charge la config DB pour les 2 rules en parallèle.
 * Filtre is_active=false. Pas de params dynamiques (V1 booléen pur), seule
 * la severity est lue.
 */
const DOCUMENT_SIGNATURE_RULE_CODES: RuleCode[] = ['SIGNERS_COMPLETE_INFO', 'DOCUMENT_NOT_VOIDED'];

export async function runDocumentSignatureComplianceChecks(
  input: DocumentSignatureCheckInput,
): Promise<ComplianceCheckResult> {
  const effectiveRules = await Promise.all(
    DOCUMENT_SIGNATURE_RULE_CODES.map((code) => loadEffectiveRule(code)),
  );

  const effectiveSeverityByRule: Record<string, 'error' | 'warning'> = {};
  const activeCodes = new Set<string>(DOCUMENT_SIGNATURE_RULE_CODES);

  for (let i = 0; i < DOCUMENT_SIGNATURE_RULE_CODES.length; i++) {
    const code = DOCUMENT_SIGNATURE_RULE_CODES[i]!;
    const eff = effectiveRules[i];
    if (!eff) continue;
    if (!eff.is_active) {
      activeCodes.delete(code);
      continue;
    }
    effectiveSeverityByRule[code] = eff.effective_severity;
  }

  const ctx: DocumentSignatureCheckContext = { effectiveSeverityByRule };
  const activeRules = DOCUMENT_SIGNATURE_RULES.filter((r) => activeCodes.has(r.code));
  return runRules(activeRules, input, ctx);
}

// ---------------------------------------------------------------------------
// Module 10 B7 — Compliance cap table
// ---------------------------------------------------------------------------

/**
 * Lance les rules cap table applicables au scope donné. Discriminé via
 * `input.scope` (SHARE_CLASS_CREATE | FUNDING_ROUND_CREATE | POOL_TOPUP_SCENARIO).
 *
 * Ctx pré-chargé :
 *   - `existingShareClassCodes` : pour SHARE_CLASS_CODE_UNIQUE
 *   - `companyTotalSharesIncludingPool` : pour ESOP_PERCENT_BEST_PRACTICE
 *   - Module 12.5 B3 : `effectiveParamsByRule` + `effectiveSeverityByRule`
 *     pour les 4 cap_table rules (chargés en parallèle via 4× loadEffectiveRule).
 *
 * Appelé depuis :
 *   - `createShareClass` (scope SHARE_CLASS_CREATE) → Module 10 B2
 *   - `createFundingRound` (scope FUNDING_ROUND_CREATE) → Module 10 B2
 *   - V2 : POOL_TOPUP scenario apply (Module 12)
 */
const CAP_TABLE_RULE_CODES: RuleCode[] = [
  'SHARE_CLASS_CODE_UNIQUE',
  'ROUND_AMOUNT_CONSISTENCY',
  'POOL_OVER_ALLOCATION',
  'ESOP_PERCENT_BEST_PRACTICE',
];

export async function runCapTableComplianceChecks(
  input: CapTableCheckInput,
  orgId: string,
): Promise<ComplianceCheckResult> {
  const supabase = await createSupabaseServerClient();

  // Module 12.5 B3 — pré-charge les 4 effective rules en parallèle des
  // queries métier. Les RPC `get_effective_rule` sont stables.
  const effectivePromises = CAP_TABLE_RULE_CODES.map((code) => loadEffectiveRule(code));

  // Pré-charge codes existants (uniquement pour SHARE_CLASS_CREATE)
  const existingShareClassCodes = new Set<string>();
  if (input.scope === 'SHARE_CLASS_CREATE') {
    const { data: classes } = await supabase
      .from('share_classes')
      .select('code')
      .eq('org_id', orgId);
    for (const c of classes ?? []) {
      if (c.code) existingShareClassCodes.add(c.code.toUpperCase());
    }
  }

  // Pré-charge cap table (uniquement pour les rules ESOP best practice)
  let companyTotalSharesIncludingPool: number | null = null;
  if (input.scope === 'SHARE_CLASS_CREATE' || input.scope === 'POOL_TOPUP_SCENARIO') {
    const today = new Date().toISOString().slice(0, 10);
    const { data: capTable } = await supabase.rpc('compute_cap_table', {
      p_org_id: orgId,
      p_asof_date: today,
      p_scenario_id: undefined,
      p_view_mode: 'DILUTED',
    });
    if (capTable && typeof capTable === 'object' && !Array.isArray(capTable)) {
      const ct = capTable as { grand_total_units?: number };
      companyTotalSharesIncludingPool = ct.grand_total_units ?? null;
    }
  }

  const effectiveRules = await Promise.all(effectivePromises);

  // Module 12.5 B3 — Build maps params + severity, filtre is_active=false
  const effectiveParamsByRule: Record<string, Record<string, unknown>> = {};
  const effectiveSeverityByRule: Record<string, 'error' | 'warning'> = {};
  const activeCodes = new Set<string>(CAP_TABLE_RULE_CODES);

  for (let i = 0; i < CAP_TABLE_RULE_CODES.length; i++) {
    const code = CAP_TABLE_RULE_CODES[i]!;
    const eff = effectiveRules[i];
    if (!eff) continue;
    if (!eff.is_active) {
      activeCodes.delete(code);
      continue;
    }
    effectiveParamsByRule[code] = eff.effective_params;
    effectiveSeverityByRule[code] = eff.effective_severity;
  }

  const ctx: CapTableCheckContext = {
    existingShareClassCodes,
    companyTotalSharesIncludingPool,
    effectiveParamsByRule,
    effectiveSeverityByRule,
  };

  // Filtre les rules applicables au scope ET actives DB
  const applicableRules = CAP_TABLE_RULES.filter(
    (rule) => activeCodes.has(rule.code) && rule.appliesTo.includes(input.scope),
  );

  return runRules(applicableRules, input, ctx);
}

// ---------------------------------------------------------------------------
// Module 11 B6 — Compliance valuations
// ---------------------------------------------------------------------------

/**
 * Module 11 B6 — Lance les rules valuation pour un plan donné.
 *
 * Pré-charge le ctx via la vue `latest_valuation_per_plan` (1 query) +
 * les valuation_results joints (pour la fair_value_per_unit). Le run
 * « précédent » est récupéré via 1 SELECT secondaire ordonné par
 * completed_at desc, limit 2.
 *
 * Appelé depuis `transitionAward` (toStatus='PROPOSED') pour bloquer un
 * award sur un plan sans valorisation récente. Les warnings (FMV deviation)
 * sont remontés à l'UI mais n'empêchent pas la transition.
 *
 * Module 12 B2 — Lecture des params depuis DB :
 *   1. Pour chaque rule du registry V1, on appelle `loadEffectiveRule(code)`
 *      pour récupérer la config effective (params merged + severity + active).
 *   2. Si `is_active=false` côté DB → la rule est filtrée (pas exécutée).
 *   3. Les params + severity sont injectés dans `ctx.effectiveParamsByRule`
 *      / `effectiveSeverityByRule`. Les checkers les lisent via
 *      `readNumberParam()` avec fallback sur les constantes hard-codées.
 *   4. Si `loadEffectiveRule` retourne null (DB indispo, rule absente du
 *      catalogue), la rule s'exécute en mode legacy (Module 11 B6) avec ses
 *      defaults.
 *
 * Spec : docs/MODULE_11_IFRS2_VALUATION_VIZ.md §6 + docs/MODULE_12_*.md §3.2.
 */
export async function runValuationComplianceChecks(
  input: ValuationCheckInput,
): Promise<ComplianceCheckResult> {
  const supabase = await createSupabaseServerClient();

  // Module 12 B2 — Pré-charge la config effective DB pour les 2 rules valuation
  // en parallèle des données métier. 2 RPC calls supplémentaires, négligeables
  // (la vue est cross-join × 22 → quelques µs côté Postgres).
  const valuationRuleCodes: RuleCode[] = ['VALUATION_STALE_BLOCKING', 'FMV_DEVIATION_WARNING'];

  const [runsRes, ...effectiveRules] = await Promise.all([
    supabase
      .from('valuation_runs')
      .select('id, completed_at, valuation_results ( fair_value_per_instrument )')
      .eq('plan_id', input.planId)
      .eq('status', 'DONE')
      .order('completed_at', { ascending: false })
      .limit(2),
    ...valuationRuleCodes.map((code) => loadEffectiveRule(code)),
  ]);

  type RunRow = {
    id: string;
    completed_at: string | null;
    valuation_results: { fair_value_per_instrument: number | null }[] | null;
  };
  const rows = (runsRes.data ?? []) as RunRow[];
  const fvFromRow = (row: RunRow): number | null => {
    const arr = row.valuation_results;
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const v = arr[0]?.fair_value_per_instrument;
    return v == null ? null : Number(v);
  };

  // Construit les maps params + severity par ruleCode pour le ctx.
  // is_active=false → on exclut la rule du registry à exécuter.
  const effectiveParamsByRule: Record<string, Record<string, unknown>> = {};
  const effectiveSeverityByRule: Record<string, 'error' | 'warning'> = {};
  const activeCodes = new Set<string>(valuationRuleCodes); // default actif si DB indispo

  for (let i = 0; i < valuationRuleCodes.length; i++) {
    const code = valuationRuleCodes[i]!;
    const eff = effectiveRules[i];
    if (!eff) continue; // DB indispo / rule absente → fallback legacy
    if (!eff.is_active) {
      activeCodes.delete(code);
      continue;
    }
    effectiveParamsByRule[code] = eff.effective_params;
    effectiveSeverityByRule[code] = eff.effective_severity;
  }

  const latestRow = rows[0];
  const previousRow = rows[1];
  const ctx: ValuationCheckContext = {
    latestRun:
      latestRow && latestRow.completed_at
        ? {
            runId: latestRow.id,
            completedAt: latestRow.completed_at,
            fairValuePerUnit: fvFromRow(latestRow),
          }
        : null,
    previousRun:
      previousRow && previousRow.completed_at
        ? {
            runId: previousRow.id,
            completedAt: previousRow.completed_at,
            fairValuePerUnit: fvFromRow(previousRow),
          }
        : null,
    effectiveParamsByRule,
    effectiveSeverityByRule,
  };

  // Filtre les rules active (Module 12 B2) — désactivation par org
  const activeRules = VALUATION_RULES.filter((r) => activeCodes.has(r.code));
  return runRules(activeRules, input, ctx);
}
