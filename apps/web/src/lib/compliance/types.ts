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
  /**
   * Module 12.5 B1 — Map ruleCode → params merged depuis DB (via
   * `loadEffectiveRule`). Les checkers lisent les seuils via
   * `readNumberParam(ctx, ruleCode, paramName, default)` avec fallback sur
   * la constante hard-codée. Le wiring depuis `runComplianceChecks` est
   * fait pour les 5 award rules : BSPCE_BENEFICIARY_TYPE, AGA_30_PERCENT_CAP,
   * AGA_APPROACHING_CAP, POOL_AVAILABLE, GRANT_DATE_RECENT.
   */
  effectiveParamsByRule?: Record<string, Record<string, unknown> | undefined>;
  /**
   * Module 12.5 B1 — Map ruleCode → severity merged DB. V1 = défaut
   * `severity_default`, sauf override explicite côté table
   * `compliance_rule_overrides.severity_override`.
   */
  effectiveSeverityByRule?: Record<string, 'error' | 'warning' | undefined>;
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
  /**
   * Module 12.5 B2 — Map ruleCode → params merged depuis DB. Lus via
   * `readNumberParam(ctx, ruleCode, paramName, default)` côté checkers
   * (helper partagé `rules/_helpers.ts`). Pré-chargé par
   * `runBeneficiaryComplianceChecks` pour les 6 beneficiary rules.
   */
  effectiveParamsByRule?: Record<string, Record<string, unknown> | undefined>;
  /**
   * Module 12.5 B2 — Map ruleCode → severity merged DB.
   *
   * ⚠️ Cas spécial HIRE_DATE_REASONABLE (dette V2 #114) : la rule émet
   * 2 sub-codes avec severities distinctes (HIRE_DATE_INVALID hardcoded
   * `error` si year < minYear, HIRE_DATE_FUTURE configurable depuis DB
   * via cette map). Le split en 2 rules sera fait V2.
   */
  effectiveSeverityByRule?: Record<string, 'error' | 'warning' | undefined>;
};

export type ComplianceCheckResult = {
  errors: ComplianceIssue[];
  warnings: ComplianceIssue[];
  hasHardBlocks: boolean;
};

// ---------------------------------------------------------------------------
// Module 5 B2 — Approvals
// ---------------------------------------------------------------------------

/**
 * Input WORKFLOW_REQUIRED_FOR_AGA — check à la transition PROPOSED d'un award.
 * Le ctx contient le plan (pour le plan_type) et un flag workflowAttached.
 */
export type ApprovalAwardCheckInput = {
  awardId: string;
  planId: string;
};

export type ApprovalAwardCheckContext = {
  plan: { id: string; plan_type: string } | null;
  workflowAttached: boolean;
};

/**
 * Input NO_SELF_APPROVAL — check au moment d'approuver/rejeter une décision.
 */
export type ApprovalDecisionCheckInput = {
  decisionId: string;
  approverUserId: string;
};

export type ApprovalDecisionCheckContext = {
  /** Award lié à la décision (si subject_type='AWARD'). */
  relatedAward: { id: string; created_by: string | null } | null;
};

/**
 * Input WORKFLOW_HAS_VALID_STEPS — check à la création/update d'un workflow.
 * Les steps sont déjà validés par Zod. Cette rule vérifie que chaque step a
 * au moins 1 approbateur résolvable côté DB (au moment T).
 */
export type ApprovalWorkflowCheckInput = {
  steps: Array<{
    stepOrder: number;
    approverType: string; // ROLE | USER | ANY_OF_ROLE | ALL_OF_ROLE
    approverRole?: string;
    approverUserId?: string;
    requiredApprovals: number;
  }>;
};

export type ApprovalWorkflowCheckContext = {
  /**
   * Map approverUserId → existsAndActive (pour USER steps).
   * Pré-chargée par le runner.
   */
  userExistsMap: Map<string, boolean>;
  /**
   * Map role → count(memberships ACTIVE avec ce role).
   * Pré-chargée par le runner.
   */
  roleUserCountMap: Map<string, number>;
};

// ---------------------------------------------------------------------------
// Module 6 B2 — Documents
// ---------------------------------------------------------------------------

export type DocumentGenerationCheckInput = {
  awardId: string;
  planId: string;
};

export type DocumentGenerationCheckContext = {
  /** Date ISO de la dernière mise à jour de la FMV du plan. NULL si jamais setté. */
  fmvSetAt: string | null;
  /**
   * Module 12.5 B3 — Map ruleCode → params merged depuis DB. Lu via
   * `readNumberParam` pour FMV_RECENT_ENOUGH (`staleDays`).
   */
  effectiveParamsByRule?: Record<string, Record<string, unknown> | undefined>;
  /** Module 12.5 B3 — severity merged DB pour FMV_RECENT_ENOUGH. */
  effectiveSeverityByRule?: Record<string, 'error' | 'warning' | undefined>;
};

export type DocumentSignatureCheckInput = {
  documentId: string;
  documentStatus: string;
  signers: Array<{
    fullName: string;
    email: string;
  }>;
};

/**
 * Module 12.5 B3 — Le ctx signature ne portait initialement aucune donnée.
 * On ajoute uniquement `effectiveSeverityByRule` (les 2 rules
 * SIGNERS_COMPLETE_INFO + DOCUMENT_NOT_VOIDED n'ont pas de params).
 * `effectiveParamsByRule` reste optionnel (placeholder, jamais lu V1).
 */
export type DocumentSignatureCheckContext = {
  effectiveParamsByRule?: Record<string, Record<string, unknown> | undefined>;
  effectiveSeverityByRule?: Record<string, 'error' | 'warning' | undefined>;
};

// ---------------------------------------------------------------------------
// Module 10 B7 — Cap Table compliance
// ---------------------------------------------------------------------------

/**
 * Input commun aux 3 scopes cap table (création share class, création round,
 * top-up scenario). Discriminé via le scope passé à `runCapTableComplianceChecks`.
 */
export type CapTableShareClassCheckInput = {
  scope: 'SHARE_CLASS_CREATE';
  code: string;
  classType: 'COMMON' | 'PREFERRED' | 'ESOP' | 'WARRANT' | 'BSPCE' | 'OTHER';
  poolTotalUnits?: number | null;
};

export type CapTableFundingRoundCheckInput = {
  scope: 'FUNDING_ROUND_CREATE';
  amountRaised: number;
  pricePerShare: number;
  investors: Array<{ amount: number; units: number }>;
};

export type CapTablePoolTopupCheckInput = {
  scope: 'POOL_TOPUP_SCENARIO';
  poolTotalUnits: number;
};

export type CapTableCheckInput =
  | CapTableShareClassCheckInput
  | CapTableFundingRoundCheckInput
  | CapTablePoolTopupCheckInput;

export type CapTableCheckContext = {
  /**
   * Map share_class_code → exists. Préchargée par le runner pour
   * `SHARE_CLASS_CODE_UNIQUE`.
   */
  existingShareClassCodes: Set<string>;
  /**
   * Total units émises (CONSOLIDATED) côté org — pour
   * `ESOP_PERCENT_BEST_PRACTICE`. NULL si la cap table est vide.
   */
  companyTotalSharesIncludingPool: number | null;
  /**
   * Module 12.5 B3 — Map ruleCode → params merged depuis DB
   * (`loadEffectiveRule`). Pré-chargé par `runCapTableComplianceChecks`
   * pour les 4 cap_table rules. Lus via `readNumberParam` côté checkers.
   */
  effectiveParamsByRule?: Record<string, Record<string, unknown> | undefined>;
  /**
   * Module 12.5 B3 — Map ruleCode → severity merged DB.
   */
  effectiveSeverityByRule?: Record<string, 'error' | 'warning' | undefined>;
};

// ---------------------------------------------------------------------------
// Module 11 B6 — Compliance valuations
// ---------------------------------------------------------------------------

/**
 * Module 11 B6 — Input commun aux rules valuation.
 *
 * Le scope discrimine les checks selon où on se trouve dans le lifecycle
 * d'un award. V1 = uniquement `AWARD_TRANSITION` (transitionAward), V2+
 * pourra ajouter `MODIFICATION_PROPOSAL`, `EXERCISE_REQUEST`, etc.
 */
export type ValuationCheckInput = {
  scope: 'AWARD_TRANSITION';
  planId: string;
  /** Status cible de la transition (utilisé pour gating fin V2). */
  toStatus?: string;
};

/**
 * Module 11 B6 — Ctx valuation. Pré-chargé dans `runChecks.ts` via 1-2
 * queries parallèles sur `latest_valuation_per_plan` + `valuation_runs`.
 *
 * Module 12 B2 — Étendu avec `effectiveParams` (params merged depuis DB via
 * `loadEffectiveRule`) et `effectiveSeverity`. Si non fourni (rule absente
 * de `compliance_rule_definitions` ou DB indisponible), les checks fallback
 * sur les constantes hard-codées Module 11 B6 (`STALE_THRESHOLD_DAYS=90`,
 * `FMV_DEVIATION_THRESHOLD=0.2`).
 */
export type ValuationCheckContext = {
  /** Dernière valorisation DONE pour ce plan, NULL si jamais valorisé. */
  latestRun: {
    runId: string;
    completedAt: string;
    fairValuePerUnit: number | null;
  } | null;
  /**
   * Avant-dernière valorisation DONE (pour FMV_DEVIATION_WARNING). NULL si
   * un seul run DONE existe (ou aucun).
   */
  previousRun: {
    runId: string;
    completedAt: string;
    fairValuePerUnit: number | null;
  } | null;
  /**
   * Module 12 B2 — Map ruleCode → params merged DB (via `loadEffectiveRule`).
   * Le checker lit `effectiveParamsByRule['VALUATION_STALE_BLOCKING']?.staleDays`
   * avec fallback sur la constante hard-codée si absent. Permet la config
   * configurable par org sans casser les checks si la DB n'est pas dispo.
   */
  effectiveParamsByRule?: Record<string, Record<string, unknown> | undefined>;
  /**
   * Module 12 B2 — Map ruleCode → severity merged DB. V1 = même que
   * `severity_default` (Q1=b confirme : pas de severity override en V1).
   * Présence du champ optionnelle pour découplage progressif.
   */
  effectiveSeverityByRule?: Record<string, 'error' | 'warning' | undefined>;
};

// ---------------------------------------------------------------------------
// Module 10 B7 — Étendre AwardCheckContext (déjà déclaré ci-dessus mais
// agaAllocatedTotal/companyTotalShares étaient null V1 — Module 10 les active)
// ---------------------------------------------------------------------------

/**
 * Note typing : AwardCheckContext (Module 3b) a déjà `agaAllocatedTotal` et
 * `companyTotalShares` optionnels nullables. Module 10 B7 active leur
 * chargement réel via `compute_cap_table` dans `runComplianceChecks`.
 *
 * Pas de nouveau type à ajouter — la rule `AGA_30_PERCENT_CAP` lit ces 2
 * champs dans le ctx. Voir `runChecks.ts` pour le wiring.
 */
