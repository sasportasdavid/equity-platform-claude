/**
 * Module 12 B1 — Schemas Zod compliance engine V2.
 *
 * Synchronisés avec la migration 00094 (tables `compliance_rule_definitions`
 * + `compliance_rule_overrides`, vue `effective_compliance_rules`, RPC
 * `get_effective_rule`).
 *
 * Spec : docs/MODULE_12_COMPLIANCE_ENGINE_V2.md §3.1.
 *
 * Couvre :
 *  - `ruleSeveritySchema`               : enum 'error' | 'warning'
 *  - `ruleScopeSchema`                  : enum des 8 domaines fonctionnels
 *  - `ruleCodeSchema`                   : enum des 22 rules existantes
 *  - `paramsSchemaSchema`               : meta-schema des params éditables
 *  - `effectiveRuleSchema`              : output RPC + vue effective
 *  - `complianceRuleOverrideInputSchema`: input updateOverride SA
 *  - `simulationResultSchema`           : output simulateChange SA (B4)
 *  - `complianceRuleDefinitionSchema`   : reflect de la table definitions
 *
 * Les Server Actions (B3) utiliseront ces schemas pour `safeParse(input)` côté
 * écriture, et `parse(rpcResponse)` côté lecture.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// 1. Enums de base
// ---------------------------------------------------------------------------

export const ruleSeveritySchema = z.enum(['error', 'warning']);
export type RuleSeverity = z.infer<typeof ruleSeveritySchema>;

export const ruleScopeSchema = z.enum([
  'plan',
  'award',
  'beneficiary',
  'valuation',
  'cap_table',
  'exercise',
  'approval',
  'document',
]);
export type RuleScope = z.infer<typeof ruleScopeSchema>;

/**
 * Liste des 22 rule_codes V1, alignée avec le seed migration 00094 §6.
 * Toute extension future devra ajouter ici ET dans la migration suivante.
 */
export const ruleCodeSchema = z.enum([
  // plan (4)
  'PLAN_VESTING_SCHEDULE_VALID',
  'PLAN_DRAFT_HAS_REQUIRED_FIELDS',
  'PLAN_PUBLISH_REQUIRES_VALUATION',
  'PLAN_TYPE_FRENCH_REQUIRES_AGREEMENT',
  // award (5)
  'AWARD_UNITS_POSITIVE',
  'AWARD_BENEFICIARY_ACTIVE',
  'AWARD_GRANT_DATE_VALID',
  'AWARD_DRAFT_TO_PROPOSED_VALIDATION',
  'AWARD_PROPOSED_TO_GRANTED_REQUIRES_APPROVAL',
  // beneficiary (2)
  'BENEFICIARY_TAX_PROFILE_REQUIRED',
  'BENEFICIARY_TERMINATION_HAS_DATE',
  // valuation (2)
  'VALUATION_STALE_BLOCKING',
  'FMV_DEVIATION_WARNING',
  // cap_table (3)
  'DILUTION_THRESHOLD_WARNING',
  'POOL_DEPLETION_WARNING',
  'SHAREHOLDER_AGREEMENT_VIOLATION',
  // exercise (3)
  'EXERCISE_WINDOW_VALID',
  'EXERCISE_AVAILABLE_UNITS',
  'EXERCISE_TAX_WITHHOLDING_OK',
  // approval (2)
  'APPROVAL_QUORUM_REQUIRED',
  'APPROVAL_DUAL_SIGNATURE',
  // document (1)
  'DOCUMENT_TEMPLATE_REQUIRED',
]);
export type RuleCode = z.infer<typeof ruleCodeSchema>;

// ---------------------------------------------------------------------------
// 2. Meta-schema des params éditables (params_schema column)
// ---------------------------------------------------------------------------

/**
 * Description d'un paramètre éditable d'une rule. Stocké dans
 * `compliance_rule_definitions.params_schema` au format JSON-Schema simplifié.
 *
 * Ex : `{"staleDays": {"type": "integer", "min": 30, "max": 365, "default": 90, "label_fr": "Seuil péremption (jours)"}}`
 */
export const paramFieldSchema = z.object({
  type: z.enum(['integer', 'number', 'boolean', 'string']),
  min: z.number().optional(),
  max: z.number().optional(),
  default: z.union([z.number(), z.boolean(), z.string()]),
  label_fr: z.string().min(1),
  label_en: z.string().optional(),
  /** Optional unit suffix for UI display (ex: 'jours', '%', '€'). */
  unit: z.string().optional(),
});
export type ParamField = z.infer<typeof paramFieldSchema>;

/**
 * `params_schema` complet d'une rule = record de paramName → ParamField.
 * `{}` = rule sans param éditable (juste activation/désactivation).
 */
export const paramsSchemaSchema = z.record(z.string(), paramFieldSchema);
export type ParamsSchema = z.infer<typeof paramsSchemaSchema>;

// ---------------------------------------------------------------------------
// 3. Effective rule (output RPC `get_effective_rule` + vue)
// ---------------------------------------------------------------------------

/**
 * Réponse de `get_effective_rule(p_rule_code)` ou row de la vue
 * `effective_compliance_rules` filtrée à `current_org_id()`.
 *
 * `effective_params` = `default_params || params_override` (jsonb merge top-level).
 * Le caller (helper `loadEffectiveRule` côté Node) lira typiquement les params
 * via `parsed.effective_params['staleDays']` etc.
 */
export const effectiveRuleSchema = z.object({
  rule_code: ruleCodeSchema,
  scope: ruleScopeSchema,
  is_active: z.boolean(),
  effective_severity: ruleSeveritySchema,
  /** JSONB libre — typage strict côté caller selon la rule_code. */
  effective_params: z.record(z.string(), z.unknown()),
  cta_url_template: z.string().nullable(),
});
export type EffectiveRule = z.infer<typeof effectiveRuleSchema>;

/**
 * Variante étendue : retournée par `listComplianceRulesForUI` (B3.5) — inclut
 * tous les fields de la vue pour l'UI de configuration.
 */
export const effectiveRuleFullSchema = effectiveRuleSchema.extend({
  description_fr: z.string(),
  description_en: z.string().nullable(),
  severity_default: ruleSeveritySchema,
  is_severity_overridable: z.boolean(),
  default_params: z.record(z.string(), z.unknown()),
  params_schema: paramsSchemaSchema,
  documentation_url: z.string().nullable(),
  is_overridden: z.boolean(),
  override_notes: z.string().nullable(),
  params_override: z.record(z.string(), z.unknown()).nullable(),
  override_updated_at: z.string().nullable(),
  override_updated_by: z.string().uuid().nullable(),
});
export type EffectiveRuleFull = z.infer<typeof effectiveRuleFullSchema>;

// ---------------------------------------------------------------------------
// 4. Inputs Server Actions
// ---------------------------------------------------------------------------

/**
 * Input pour `updateComplianceRuleOverride(input)` (B3.3).
 *
 * V1 (Q1=b, Q3=b) :
 *   - `isActive` toggle activation/désactivation
 *   - `paramsOverride` record partial (mergé avec default_params côté DB)
 *   - `notes` libre OWNER ("Durci à 60j sur demande comité d'audit")
 *   - PAS de severity_override (V2, dépend de is_severity_overridable=true)
 *
 * Le SA validera côté serveur que les params soient conformes au
 * params_schema de la rule (bornes min/max, types).
 */
export const complianceRuleOverrideInputSchema = z.object({
  ruleCode: ruleCodeSchema,
  isActive: z.boolean(),
  paramsOverride: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])).default({}),
  notes: z.string().max(2000).nullable().default(null),
});
export type ComplianceRuleOverrideInput = z.input<typeof complianceRuleOverrideInputSchema>;

/**
 * Input pour `simulateComplianceChange(input)` (B4 — what-if simulator).
 *
 * Le caller fournit la même shape qu'un override mais on ne PERSISTE pas —
 * on calcule juste le nombre d'awards / plans qui seraient impactés
 * rétroactivement par le changement.
 */
export const simulateComplianceChangeInputSchema = complianceRuleOverrideInputSchema;
export type SimulateComplianceChangeInput = z.input<typeof simulateComplianceChangeInputSchema>;

// ---------------------------------------------------------------------------
// 5. Output simulation (B4)
// ---------------------------------------------------------------------------

/**
 * Réponse de `simulateComplianceChange`. Structure stable pour le UI.
 *
 * V1 (Q5=a) : juste les counts agrégés. V2 = preview détaillé par
 * award/plan impacté.
 */
export const simulationResultSchema = z.object({
  ruleCode: ruleCodeSchema,
  /** Count d'entités qui PASSERAIENT la rule avec la nouvelle config. */
  passingCount: z.number().int().nonnegative(),
  /** Count d'entités qui ÉCHOUERAIENT (= bloquées si severity=error, ou warning sinon). */
  failingCount: z.number().int().nonnegative(),
  /** Count d'entités non-évaluables (data manquante, etc.). */
  notEvaluableCount: z.number().int().nonnegative(),
  /**
   * Échantillon d'IDs d'entités impactées (pour CTA "Voir les awards
   * concernés"). Cap V1 = 10 IDs max.
   */
  impactedSampleIds: z.array(z.string().uuid()).max(10),
});
export type SimulationResult = z.infer<typeof simulationResultSchema>;

// ---------------------------------------------------------------------------
// 6. Definition complète (admin debug + listage UI)
// ---------------------------------------------------------------------------

export const complianceRuleDefinitionSchema = z.object({
  id: z.string().uuid(),
  rule_code: ruleCodeSchema,
  scope: ruleScopeSchema,
  severity_default: ruleSeveritySchema,
  description_fr: z.string(),
  description_en: z.string().nullable(),
  params_schema: paramsSchemaSchema,
  default_params: z.record(z.string(), z.unknown()),
  is_active_by_default: z.boolean(),
  is_severity_overridable: z.boolean(),
  cta_url_template: z.string().nullable(),
  documentation_url: z.string().nullable(),
  created_at: z.string(),
});
export type ComplianceRuleDefinition = z.infer<typeof complianceRuleDefinitionSchema>;
