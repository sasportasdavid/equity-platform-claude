import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AWARD_RULES } from './rules/awardRules';
import { BENEFICIARY_RULES } from './rules/beneficiaryRules';
import type {
  AwardCheckContext,
  AwardCheckInput,
  BeneficiaryCheckContext,
  BeneficiaryCheckInput,
  ComplianceCheckResult,
  ComplianceIssue,
  ComplianceRule,
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
      .select('id, plan_type, pool_size, pool_allocated, company_id')
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

  const ctx: AwardCheckContext = {
    plan: planRes.data,
    beneficiary: beneficiaryRes.data,
    poolStatus: {
      remaining: planRes.data.pool_size - planRes.data.pool_allocated,
    },
    // V1 : on ne charge pas la cap table — AGA_30_PERCENT_CAP retournera null
    // (cf. note dans la rule). Module 10 ajoutera ces 2 champs ici.
    agaAllocatedTotal: null,
    companyTotalShares: null,
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
