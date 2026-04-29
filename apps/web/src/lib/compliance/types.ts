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

/**
 * Règle de compliance générique. Génériquée sur le type d'input + ctx
 * pour supporter awards (Module 3b B7) et beneficiaries (Module 4 B2).
 *
 * Le `data` arrive du caller (Server Action input post-validation Zod), le
 * `ctx` est chargé par `runComplianceChecks` (Server-side queries).
 */
export type ComplianceRule<TData = AwardCheckInput, TCtx = AwardCheckContext> = {
  code: string;
  description: string;
  /** `['*']` = applique à toutes les variantes (plan_type pour awards, etc.). */
  appliesTo: string[];
  enforcement: ComplianceEnforcement;
  check: (data: TData, ctx: TCtx) => Promise<ComplianceIssue | null> | ComplianceIssue | null;
};

// ---------------------------------------------------------------------------
// Module 4 B2 — Beneficiaries
// ---------------------------------------------------------------------------

export type BeneficiaryCheckInput = {
  /**
   * `id` est NULL si on est en cours de création (createBeneficiary).
   * Sinon présent (updateBeneficiary).
   */
  id?: string | null;
  email: string;
  firstName?: string;
  lastName?: string;
  beneficiaryType: string; // EMPLOYEE | OFFICER | ...
  taxResidence: string; // ISO-3166-1 alpha-2
  isTaxResidentFrance: boolean;
  hireDate?: string | null; // YYYY-MM-DD
  managerId?: string | null;
  iban?: string | null;
};

export type BeneficiaryCheckContext = {
  orgId: string;
  /** Présent si on update un bénéficiaire existant (pour MANAGER_NOT_SELF). */
  beneficiary?: { id: string; email?: string | null } | null;
  /**
   * Email collisions intra-org (vérifié dans runChecks). Plein si déjà existant
   * dans l'org sous un autre id (ou null si on update et qu'aucune collision).
   */
  emailCollisionId?: string | null;
  /**
   * Count des awards BSPCE actifs portés par le bénéficiaire (Module 4 B6).
   * Calculé uniquement en update si le nouveau type est CONSULTANT/EXTERNAL.
   * `null` = check non lancé (ex: création, ou nouveau type compatible BSPCE).
   */
  bspceActiveAwardsCount?: number | null;
};

export type ComplianceCheckResult = {
  errors: ComplianceIssue[];
  warnings: ComplianceIssue[];
  hasHardBlocks: boolean;
};
