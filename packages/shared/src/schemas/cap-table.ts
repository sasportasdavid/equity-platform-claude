/**
 * Module 10 B2 — Schémas Zod pour Server Actions cap-table
 *
 * Source : docs/MODULE_10_CAP_TABLE.md §3.1
 *
 * Couvre B2 :
 *  - createShareClassSchema, updateShareClassSchema
 *  - createFundingRoundSchema (avec investorSchema)
 *  - cancelFundingRoundSchema
 *
 * Couvre B4-B5 (en avance — pas réutilisé en B2) :
 *  - createScenarioSchema (discriminated union NEW_ROUND / POOL_TOPUP /
 *    BULK_EXERCISE / EXIT)
 *  - runMonteCarloExitSchema
 *
 * Convention : tous les schémas validés en `safeParse` côté Server Action,
 * avec un `validationError` helper qui retourne `Result<…>` négatif.
 */

import { z } from 'zod';
import { uuidSchema } from './common';

// ---------------------------------------------------------------------------
// Enums (cohérents avec les CHECK constraints DB — migrations 00080-00084)
// ---------------------------------------------------------------------------

export const SHARE_CLASS_TYPES = [
  'COMMON',
  'PREFERRED',
  'ESOP',
  'WARRANT',
  'BSPCE',
  'OTHER',
] as const;
export type ShareClassType = (typeof SHARE_CLASS_TYPES)[number];

export const ROUND_TYPES = [
  'PRE_SEED',
  'SEED',
  'SERIES_A',
  'SERIES_B',
  'SERIES_C',
  'SERIES_D_PLUS',
  'BRIDGE',
  'CONVERTIBLE_NOTE',
  'SAFE',
  'OTHER',
] as const;
export type RoundType = (typeof ROUND_TYPES)[number];

export const SCENARIO_TYPES = [
  'NEW_ROUND',
  'POOL_TOPUP',
  'BULK_EXERCISE',
  'EXIT',
  'COMBINED',
] as const;
export type ScenarioType = (typeof SCENARIO_TYPES)[number];

export const VIEW_MODES = ['CONSOLIDATED', 'DILUTED', 'PRO_FORMA'] as const;
export type ViewMode = (typeof VIEW_MODES)[number];

export const LIQUIDATION_PREFERENCE_TYPES = [
  'NON_PARTICIPATING',
  'PARTICIPATING',
  'PARTICIPATING_CAPPED',
] as const;

export const ANTI_DILUTION_TYPES = [
  'NONE',
  'WEIGHTED_AVERAGE_BROAD',
  'WEIGHTED_AVERAGE_NARROW',
  'FULL_RATCHET',
] as const;

// ---------------------------------------------------------------------------
// Share Classes
// ---------------------------------------------------------------------------

/**
 * Création d'une classe d'actions.
 *
 * Contrainte CHECK DB `share_classes_pool_only_for_esop` :
 *   - class_type = 'ESOP' ⇔ pool_total_units IS NOT NULL
 *
 * Validée ici via `.refine()` pour catch côté Server Action avant DB.
 */
export const createShareClassSchema = z
  .object({
    code: z
      .string()
      .min(2, 'Code trop court (min 2)')
      .max(20, 'Code trop long (max 20)')
      .regex(/^[A-Z0-9_]+$/, 'Code invalide (uppercase + chiffres + underscore uniquement)'),
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(500).optional(),
    classType: z.enum(SHARE_CLASS_TYPES),
    parValue: z.number().min(0).max(100).optional(),
    liquidationPreferenceMultiple: z.number().min(0).max(10).default(1.0),
    liquidationPreferenceType: z.enum(LIQUIDATION_PREFERENCE_TYPES).optional(),
    liquidationPreferenceCap: z.number().min(1).max(20).optional(),
    conversionRatio: z.number().positive().default(1.0),
    isConvertibleToCommon: z.boolean().default(true),
    antiDilutionType: z.enum(ANTI_DILUTION_TYPES).default('NONE'),
    votingRightsPerShare: z.number().min(0).max(100).default(1.0),
    poolTotalUnits: z.number().positive().optional(),
  })
  .refine(
    (data) =>
      data.classType === 'ESOP'
        ? data.poolTotalUnits !== undefined
        : data.poolTotalUnits === undefined,
    {
      message: 'pool_total_units est requis SI ET SEULEMENT SI class_type=ESOP',
      path: ['poolTotalUnits'],
    },
  )
  .refine(
    (data) =>
      data.liquidationPreferenceType === 'PARTICIPATING_CAPPED'
        ? data.liquidationPreferenceCap !== undefined
        : true,
    {
      message: 'liquidation_preference_cap requis si type = PARTICIPATING_CAPPED',
      path: ['liquidationPreferenceCap'],
    },
  );

export type CreateShareClassInput = z.input<typeof createShareClassSchema>;

/**
 * Update share class. Partial sur tout sauf classType (qu'on n'autorise
 * jamais à changer s'il y a déjà des positions sur la classe — vérif côté
 * Server Action).
 *
 * Note : Zod v4 n'a pas de `.partial()` natif sur les schemas avec `.refine()`,
 * donc on redéfinit manuellement les champs en optional.
 */
export const updateShareClassSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().trim().max(500).optional(),
  parValue: z.number().min(0).max(100).optional(),
  liquidationPreferenceMultiple: z.number().min(0).max(10).optional(),
  liquidationPreferenceType: z.enum(LIQUIDATION_PREFERENCE_TYPES).optional(),
  liquidationPreferenceCap: z.number().min(1).max(20).optional(),
  conversionRatio: z.number().positive().optional(),
  isConvertibleToCommon: z.boolean().optional(),
  antiDilutionType: z.enum(ANTI_DILUTION_TYPES).optional(),
  votingRightsPerShare: z.number().min(0).max(100).optional(),
  poolTotalUnits: z.number().positive().optional(),
});

export type UpdateShareClassInput = z.infer<typeof updateShareClassSchema>;

// ---------------------------------------------------------------------------
// Funding Rounds
// ---------------------------------------------------------------------------

export const investorSchema = z.object({
  name: z.string().trim().min(2).max(200),
  email: z.string().trim().toLowerCase().email().optional(),
  units: z.number().positive(),
  amount: z.number().positive(),
});

export type InvestorInput = z.infer<typeof investorSchema>;

/**
 * Création d'une levée de fonds atomique.
 *
 * Contraintes CHECK DB (00081) :
 *   - amount_raised > 0
 *   - pre_money_valuation > 0
 *   - ABS(price * total_shares - amount) < amount * 0.01 (tolerance 1%)
 *
 * Cohérence sum(investors.units) * pricePerShare ≈ amountRaised vérifiée
 * dans `.refine()` côté Server Action avant l'appel RPC.
 */
export const createFundingRoundSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    roundType: z.enum(ROUND_TYPES),
    shareClassId: uuidSchema,
    preMoneyValuation: z.number().positive(),
    amountRaised: z.number().positive(),
    pricePerShare: z.number().positive(),
    liquidationPreferenceMultiple: z.number().min(0).max(10).default(1.0),
    participating: z.boolean().default(false),
    participatingCap: z.number().min(1).max(20).optional(),
    conversionRatio: z.number().positive().default(1.0),
    antiDilutionType: z.enum(ANTI_DILUTION_TYPES).default('NONE'),
    investors: z.array(investorSchema).min(1, 'Au moins 1 investisseur'),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine(
    (data) => {
      const sumUnits = data.investors.reduce((s, i) => s + i.units, 0);
      const expected = sumUnits * data.pricePerShare;
      return Math.abs(expected - data.amountRaised) < data.amountRaised * 0.01;
    },
    {
      message: 'Sum(investors.units) × pricePerShare doit valoir amountRaised à ±1%',
      path: ['investors'],
    },
  );

export type CreateFundingRoundInput = z.input<typeof createFundingRoundSchema>;

/**
 * Cancel d'une levée. Toujours nécessite une raison pour l'audit.
 * Status passe `DRAFT` ou `PENDING_APPROVAL` → `CANCELLED`.
 * Status `CLOSED` est immuable (les positions sont déjà émises).
 */
export const cancelFundingRoundSchema = z.object({
  id: uuidSchema,
  reason: z.string().trim().min(3, 'Raison trop courte').max(500),
});

export type CancelFundingRoundInput = z.infer<typeof cancelFundingRoundSchema>;

// ---------------------------------------------------------------------------
// Scenarios (B4) — schémas en avance, pas utilisés en B2
// ---------------------------------------------------------------------------

export const scenarioNewRoundSchema = z.object({
  scenarioType: z.literal('NEW_ROUND'),
  shareClassCode: z.string().min(2).max(20),
  preMoney: z.number().positive(),
  amountRaised: z.number().positive(),
  pricePerShare: z.number().positive(),
  antiDilutionApply: z.boolean().default(false),
  investorName: z.string().trim().max(200).default('Hypothetical Lead'),
});

export const scenarioPoolTopupSchema = z.object({
  scenarioType: z.literal('POOL_TOPUP'),
  additionalUnits: z.number().positive(),
  targetPoolPercentPost: z.number().min(0).max(100).optional(),
});

export const scenarioBulkExerciseSchema = z.object({
  scenarioType: z.literal('BULK_EXERCISE'),
  onlyVested: z.boolean().default(true),
  beneficiaryFilter: z.array(uuidSchema).optional(),
});

export const scenarioExitSchema = z.object({
  scenarioType: z.literal('EXIT'),
  exitValuation: z.number().positive(),
  exitDate: z.string().date().optional(),
  conversionStrategy: z.enum(['AUTO_BEST', 'AS_PREFERRED', 'AS_COMMON']).default('AUTO_BEST'),
});

export const createScenarioSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  baseSnapshotId: uuidSchema.optional(),
  baseAsofDate: z.string().date().optional(),
  isShared: z.boolean().default(false),
  parameters: z.discriminatedUnion('scenarioType', [
    scenarioNewRoundSchema,
    scenarioPoolTopupSchema,
    scenarioBulkExerciseSchema,
    scenarioExitSchema,
  ]),
});

export type CreateScenarioInput = z.input<typeof createScenarioSchema>;

// ---------------------------------------------------------------------------
// Monte Carlo (B5) — schémas en avance
// ---------------------------------------------------------------------------

export const runMonteCarloExitSchema = z.object({
  scenarioId: uuidSchema.optional(),
  valuationMean: z.number().positive(),
  valuationStddev: z.number().positive(),
  timeHorizonYears: z.number().min(0.1).max(20),
  numPaths: z.number().int().min(1000).max(100000).default(10000),
});

export type RunMonteCarloExitInput = z.input<typeof runMonteCarloExitSchema>;

// ---------------------------------------------------------------------------
// Cap Table read query (B3) — schéma en avance
// ---------------------------------------------------------------------------

export const getCapTableInputSchema = z.object({
  asofDate: z.string().date().optional(),
  scenarioId: uuidSchema.optional(),
  viewMode: z.enum(VIEW_MODES).default('CONSOLIDATED'),
});

export type GetCapTableInput = z.input<typeof getCapTableInputSchema>;

// ---------------------------------------------------------------------------
// Snapshots (B6)
// ---------------------------------------------------------------------------

export const SNAPSHOT_TYPES = [
  'POST_ROUND',
  'PRE_AUDIT',
  'YEAR_END',
  'MANUAL_FREEZE',
  'NIGHTLY',
] as const;
export type SnapshotType = (typeof SNAPSHOT_TYPES)[number];

export const createManualSnapshotSchema = z.object({
  asofDate: z.string().date(),
  label: z.string().trim().min(2).max(200).optional(),
  isImmutable: z.boolean().default(false),
});

export type CreateManualSnapshotInput = z.input<typeof createManualSnapshotSchema>;

export const freezeSnapshotSchema = z.object({
  id: uuidSchema,
});

export const deleteSnapshotSchema = z.object({
  id: uuidSchema,
});

// ---------------------------------------------------------------------------
// Bulk import positions (B6)
// ---------------------------------------------------------------------------

export const STAKEHOLDER_TYPES_IMPORT = [
  'FOUNDER',
  'INVESTOR',
  'BENEFICIARY',
  'ENTITY',
  'POOL_RESERVE',
] as const;
export type StakeholderTypeImport = (typeof STAKEHOLDER_TYPES_IMPORT)[number];

/**
 * Une ligne CSV d'import de positions cap table.
 *
 * Le mapping côté Server Action gère la résolution :
 *   - share_class par `code` (lookup share_classes)
 *   - beneficiary par `email` si stakeholderType = BENEFICIARY (lookup beneficiaries)
 */
export const importPositionRowSchema = z.object({
  stakeholderType: z.enum(STAKEHOLDER_TYPES_IMPORT),
  stakeholderName: z.string().trim().min(2).max(200),
  stakeholderEmail: z.string().trim().toLowerCase().email().optional(),
  shareClassCode: z
    .string()
    .min(2)
    .max(20)
    .regex(/^[A-Z0-9_]+$/, 'Code classe invalide'),
  units: z.number().positive(),
  acquiredAt: z.string().date(),
  costBasisPerUnit: z.number().min(0).optional(),
  notes: z.string().trim().max(500).optional(),
});

export type ImportPositionRowInput = z.input<typeof importPositionRowSchema>;

export const BULK_IMPORT_MAX_ROWS = 500;

export const bulkImportPositionsSchema = z
  .object({
    rows: z.array(importPositionRowSchema).min(1).max(BULK_IMPORT_MAX_ROWS),
  })
  .refine((data) => data.rows.length <= BULK_IMPORT_MAX_ROWS, {
    message: `Maximum ${BULK_IMPORT_MAX_ROWS} positions par import`,
    path: ['rows'],
  });

export type BulkImportPositionsInput = z.input<typeof bulkImportPositionsSchema>;
