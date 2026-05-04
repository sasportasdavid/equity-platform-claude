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
 * Liste des 23 rule_codes V1 — alignée avec migration 00094b (Module 12 B3b).
 *
 * Source de vérité : `compliance_rule_definitions` cloud post-realign DB↔code.
 * Inventaire détaillé : `memory/module_12_b3a_inventory.md`.
 *
 * Toute extension future devra ajouter ici ET dans une migration séquentielle.
 *
 * BREAKING CHANGE Module 12 B3b vs B1 :
 *   - Suppression des 20 rules aspirationnelles (PLAN_*, AWARD_UNITS_POSITIVE,
 *     EXERCISE_*, etc.)
 *   - Ajout des 21 rules réellement implémentées en code TS
 *   - 2 valuation overlap conservées (VALUATION_STALE_BLOCKING + FMV_DEVIATION_WARNING)
 *
 * Total final : 23 codes (5 award + 6 beneficiary + 4 cap_table + 3 document
 * + 3 approval + 2 valuation).
 */
export const ruleCodeSchema = z.enum([
  // award (5)
  'BSPCE_BENEFICIARY_TYPE',
  'AGA_30_PERCENT_CAP',
  'AGA_APPROACHING_CAP',
  'POOL_AVAILABLE',
  'GRANT_DATE_RECENT',
  // beneficiary (6)
  'EMAIL_UNIQUE_IN_ORG',
  'TAX_RESIDENCE_FRANCE_CONSISTENCY',
  'HIRE_DATE_REASONABLE',
  'MANAGER_NOT_SELF',
  'IBAN_FORMAT',
  'BSPCE_BENEFICIARY_TYPE_REVERSE',
  // cap_table (4)
  'SHARE_CLASS_CODE_UNIQUE',
  'ROUND_AMOUNT_CONSISTENCY',
  'POOL_OVER_ALLOCATION',
  'ESOP_PERCENT_BEST_PRACTICE',
  // document (3)
  'FMV_RECENT_ENOUGH',
  'SIGNERS_COMPLETE_INFO',
  'DOCUMENT_NOT_VOIDED',
  // approval (3)
  'WORKFLOW_REQUIRED_FOR_AGA',
  'NO_SELF_APPROVAL',
  'WORKFLOW_HAS_VALID_STEPS',
  // valuation (2) — déjà présentes depuis B1, conservées
  'VALUATION_STALE_BLOCKING',
  'FMV_DEVIATION_WARNING',
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
// 5. Output simulation (B5 — what-if simulator)
// ---------------------------------------------------------------------------

/**
 * Élément d'échantillon pour le preview. L'UI utilise ces items pour montrer
 * "Voici les 10 plans/awards qui seraient nouvellement bloqués si vous
 * appliquez ce changement".
 */
export const simulationSampleItemSchema = z.object({
  id: z.string().uuid(),
  /** Label humain (plan name, award number, beneficiary fullName, etc.) */
  label: z.string(),
  /** Raison spécifique (ex: "Valuation à 105j > nouveau seuil 90j"). */
  reason: z.string(),
});
export type SimulationSampleItem = z.infer<typeof simulationSampleItemSchema>;

/**
 * Module 12 B5 — Réponse de `simulateComplianceChange`.
 *
 * Compare l'état actuel (config DB) avec une config proposée pour mesurer
 * combien d'entités basculeraient compliant ↔ non-compliant.
 *
 * V1 :
 *   - `simulationSupported=false` → la rule n'est pas simulable (toggle-only,
 *     ou logique trop complexe pour V1). UI affiche message "Simulation non
 *     applicable".
 *   - Sinon : counts + delta + échantillon des items "newly blocked".
 *
 * Effet prospectif uniquement (Q4=b) : on ne modifie PAS les entités
 * existantes, on calcule juste l'impact si la nouvelle config était appliquée
 * aux prochaines transitions.
 */
export const simulationResultSchema = z.object({
  ruleCode: ruleCodeSchema,
  /** `false` si la rule n'a pas de helper de simulation V1. */
  simulationSupported: z.boolean(),
  /** Compte d'entités qui PASSAIENT la rule avec la config actuelle. */
  currentCompliant: z.number().int().nonnegative(),
  /** Compte d'entités qui ÉCHOUAIENT avec la config actuelle. */
  currentNonCompliant: z.number().int().nonnegative(),
  /** Compte d'entités qui PASSERAIENT avec la config proposée. */
  afterCompliant: z.number().int().nonnegative(),
  /** Compte d'entités qui ÉCHOUERAIENT avec la config proposée. */
  afterNonCompliant: z.number().int().nonnegative(),
  /** Compte d'entités qui basculeraient compliant → non-compliant. */
  newlyBlocked: z.number().int().nonnegative(),
  /** Compte d'entités qui basculeraient non-compliant → compliant. */
  newlyUnblocked: z.number().int().nonnegative(),
  /** Échantillon des items "newly blocked" (cap 10) pour preview UI. */
  sampleNewlyBlocked: z.array(simulationSampleItemSchema).max(10),
  /**
   * Total d'entités évaluées dans cette simulation (= base de calcul). Permet
   * à l'UI d'afficher "X / Y plans impactés" pour mise en contexte.
   */
  totalEvaluated: z.number().int().nonnegative(),
  /** Si `simulationSupported=false` : message expliquant pourquoi. */
  notSupportedReason: z.string().nullable(),
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
