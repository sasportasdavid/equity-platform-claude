/**
 * Types partagés du moteur de compliance — Module 3b B7.
 *
 * Spec : docs/MODULE_03B_AWARDS_LIFECYCLE.md §7.
 *
 * V1 = 4 règles awards. V2 (Module 12) = configurables par org via
 * une table `compliance_rules_overrides`.
 */

export type ComplianceSeverity = 'ERROR' | 'WARNING';
export type ComplianceEnforcement = 'hard' | 'soft';

export type ComplianceIssue = {
  severity: ComplianceSeverity;
  code: string;
  message: string;
  suggestedAction?: string;
};

export type AwardCheckInput = {
  planId: string;
  beneficiaryId: string;
  unitsGranted: number;
  exercisePrice?: number | null;
  grantDate: string; // YYYY-MM-DD
};

export type AwardCheckContext = {
  plan: {
    id: string;
    plan_type: string;
    pool_size: number;
    pool_allocated: number;
    company_id: string;
  };
  beneficiary: {
    id: string;
    beneficiary_type: string; // 'EMPLOYEE' | 'OFFICER' | 'CONSULTANT' | 'ADVISOR' | 'OTHER'
    email: string | null;
  };
  poolStatus: {
    remaining: number;
  };
  /**
   * SUM des units AGA déjà allouées sur la company. NULL en V1 si on
   * ne sait pas calculer (pas de cap table dispo — full check Module 10).
   */
  agaAllocatedTotal?: number | null;
  /**
   * Total share count of the company (pour le calcul AGA % cap). NULL en V1
   * si Module 10 pas livré.
   */
  companyTotalShares?: number | null;
};

export type ComplianceRule = {
  code: string;
  description: string;
  /** `['*']` = applique à tous les types de plans, sinon liste explicite. */
  appliesTo: string[];
  enforcement: ComplianceEnforcement;
  check: (
    data: AwardCheckInput,
    ctx: AwardCheckContext,
  ) => Promise<ComplianceIssue | null> | ComplianceIssue | null;
};

export type ComplianceCheckResult = {
  errors: ComplianceIssue[];
  warnings: ComplianceIssue[];
  hasHardBlocks: boolean;
};
