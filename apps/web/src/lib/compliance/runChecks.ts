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
        return { rule, issue };
      } catch (err) {
        return {
          rule,
          issue: {
            severity: 'WARNING' as const,
            code: `${rule.code}_INTERNAL_ERROR`,
            message: `Rule ${rule.code} a échoué : ${err instanceof Error ? err.message : 'unknown'}`,
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
 * Helper compliance — Module 3b B7.
 *
 * Charge le contexte (plan + beneficiary + poolStatus) côté serveur via
 * 1 query parallèle, puis lance toutes les rules applicables au plan_type
 * en parallèle (Promise.all). Aggregé en errors / warnings selon enforcement.
 *
 * Spec : docs/MODULE_03B_AWARDS_LIFECYCLE.md §7.
 *
 * `scope` est réservé pour V2 (Module 12) où on aura des rules différentes
 * pour PROPOSAL vs MODIFICATION. En V1, les 4 rules s'appliquent uniquement
 * au scope AWARD_PROPOSAL.
 */
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

  // Charge plan + beneficiary en parallèle (1 RTT chacun, 2 total)
  const [planRes, beneficiaryRes] = await Promise.all([
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
  };

  // Filtre les rules applicables (plan_type ou *)
  const applicableRules = AWARD_RULES.filter(
    (rule) => rule.appliesTo.includes('*') || rule.appliesTo.includes(ctx.plan.plan_type),
  );

  return runRules(applicableRules, input, ctx);
}

// ---------------------------------------------------------------------------
// Module 4 B2 — Compliance bénéficiaires
// ---------------------------------------------------------------------------

/**
 * Helper compliance bénéficiaires — Module 4 B2.
 *
 * Charge le ctx serveur (collision email intra-org) puis exécute les 5 rules
 * BENEFICIARY_RULES en parallèle. Appelé depuis createBeneficiary +
 * updateBeneficiary (Server Actions). Pas dans bulkCreateBeneficiaries (V1).
 */
export async function runBeneficiaryComplianceChecks(
  input: BeneficiaryCheckInput,
  orgId: string,
): Promise<ComplianceCheckResult> {
  const supabase = await createSupabaseServerClient();

  // Charge la collision email intra-org (pour EMAIL_UNIQUE_IN_ORG) +
  // optionnellement le count BSPCE actifs (Module 4 B6 — uniquement si on
  // update vers un type risqué CONSULTANT/EXTERNAL).
  const needsBspceCheck =
    input.id != null &&
    (input.beneficiaryType === 'CONSULTANT' || input.beneficiaryType === 'EXTERNAL');

  const [existingRes, bspceRes] = await Promise.all([
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
  ]);

  const ctx: BeneficiaryCheckContext = {
    orgId,
    beneficiary: input.id ? { id: input.id, email: input.email } : null,
    emailCollisionId: existingRes.data?.id ?? null,
    bspceActiveAwardsCount: needsBspceCheck ? (bspceRes.count ?? 0) : null,
  };

  return runRules(BENEFICIARY_RULES, input, ctx);
}

// ---------------------------------------------------------------------------
// Module 5 B2 — Compliance approbations
// ---------------------------------------------------------------------------

/**
 * WORKFLOW_REQUIRED_FOR_AGA — appelé depuis transitionAward(*, 'PROPOSED')
 * pour générer un soft warning si AGA + pas de workflow attaché.
 *
 * Le ctx est chargé ici : plan + flag workflowAttached (workflow attach_to_plan
 * OU default org pour AWARD_GRANT).
 */
export async function runApprovalAwardComplianceChecks(
  input: ApprovalAwardCheckInput,
  orgId: string,
): Promise<ComplianceCheckResult> {
  const supabase = await createSupabaseServerClient();

  const [planRes, attachedRes, defaultRes] = await Promise.all([
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
  ]);

  const ctx: ApprovalAwardCheckContext = {
    plan: planRes.data ?? null,
    workflowAttached: (attachedRes.count ?? 0) > 0 || (defaultRes.count ?? 0) > 0,
  };

  return runRules(APPROVAL_AWARD_RULES, input, ctx);
}

/**
 * NO_SELF_APPROVAL — appelé depuis approveDecision/rejectDecision avant le RPC
 * pour bloquer le self-approval.
 */
export async function runApprovalDecisionComplianceChecks(
  input: ApprovalDecisionCheckInput,
): Promise<ComplianceCheckResult> {
  const supabase = await createSupabaseServerClient();

  // Récupérer la decision → request → award (created_by)
  const { data: row } = await supabase
    .from('approval_decisions')
    .select('request_id, approval_requests!inner(award_id)')
    .eq('id', input.decisionId)
    .maybeSingle();

  // approval_requests join → award_id
  const requestRow = row as { approval_requests?: { award_id?: string | null } } | null;
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

  const ctx: ApprovalDecisionCheckContext = { relatedAward };
  return runRules(APPROVAL_DECISION_RULES, input, ctx);
}

/**
 * WORKFLOW_HAS_VALID_STEPS — appelé depuis createWorkflow/updateWorkflow.
 * Pré-charge userExistsMap (USER steps) + roleUserCountMap (ROLE/ANY/ALL steps).
 */
export async function runApprovalWorkflowComplianceChecks(
  input: ApprovalWorkflowCheckInput,
  orgId: string,
): Promise<ComplianceCheckResult> {
  const supabase = await createSupabaseServerClient();

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

  const ctx: ApprovalWorkflowCheckContext = { userExistsMap, roleUserCountMap };
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
 */
export async function runDocumentGenerationComplianceChecks(
  input: DocumentGenerationCheckInput,
  fmvSetAt?: string | null,
): Promise<ComplianceCheckResult> {
  const ctx: DocumentGenerationCheckContext = { fmvSetAt: fmvSetAt ?? null };
  return runRules(DOCUMENT_GENERATION_RULES, input, ctx);
}

/**
 * SIGNERS_COMPLETE_INFO + DOCUMENT_NOT_VOIDED — appelé depuis
 * sendDocumentForSignature (B3). Pas de ctx async nécessaire (toutes les
 * données sont déjà dans l'input).
 */
export async function runDocumentSignatureComplianceChecks(
  input: DocumentSignatureCheckInput,
): Promise<ComplianceCheckResult> {
  return runRules(DOCUMENT_SIGNATURE_RULES, input, {} as DocumentSignatureCheckContext);
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
 *
 * Appelé depuis :
 *   - `createShareClass` (scope SHARE_CLASS_CREATE) → Module 10 B2
 *   - `createFundingRound` (scope FUNDING_ROUND_CREATE) → Module 10 B2
 *   - V2 : POOL_TOPUP scenario apply (Module 12)
 */
export async function runCapTableComplianceChecks(
  input: CapTableCheckInput,
  orgId: string,
): Promise<ComplianceCheckResult> {
  const supabase = await createSupabaseServerClient();

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

  const ctx: CapTableCheckContext = {
    existingShareClassCodes,
    companyTotalSharesIncludingPool,
  };

  // Filtre les rules applicables au scope
  const applicableRules = CAP_TABLE_RULES.filter((rule) => rule.appliesTo.includes(input.scope));

  return runRules(applicableRules, input, ctx);
}
