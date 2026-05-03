/**
 * Schémas Zod pour la simulation fiscale française (Module 9 B2).
 *
 * Pure validation runtime — n'exporte aucun helper de calcul.
 */

import { z } from 'zod';

export const planTypeSchema = z.enum(['BSPCE', 'STOCK_OPTION', 'BSA', 'AGA']);

export const tmiRateSchema = z.union([
  z.literal(0),
  z.literal(11),
  z.literal(30),
  z.literal(41),
  z.literal(45),
]);

const dateLike = z
  .union([z.date(), z.string().datetime()])
  .transform((val) => (val instanceof Date ? val : new Date(val)));

export const simulationInputSchema = z
  .object({
    planType: planTypeSchema,
    attributionDate: dateLike,
    exerciseDate: dateLike,
    cessionDate: dateLike.optional(),
    hireDate: dateLike.optional(),

    unitsToExercise: z.number().int().positive(),
    strikePrice: z.number().nonnegative(),
    fmvAtExercise: z.number().nonnegative(),
    fmvAtCession: z.number().nonnegative().optional(),

    tmiMode: z.enum(['manual', 'auto']),
    manualTmiRate: tmiRateSchema.optional(),
    annualTaxableIncome: z.number().nonnegative().optional(),
    householdParts: z.number().positive().optional(),

    optBaremeProgressif: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.tmiMode === 'manual') {
        return data.manualTmiRate !== undefined;
      }
      return data.annualTaxableIncome !== undefined;
    },
    {
      message: 'tmiMode=manual requires manualTmiRate; tmiMode=auto requires annualTaxableIncome',
      path: ['tmiMode'],
    },
  )
  .refine(
    (data) => {
      if (data.cessionDate && data.exerciseDate) {
        return data.cessionDate.getTime() >= data.exerciseDate.getTime();
      }
      return true;
    },
    {
      message: 'cessionDate must be ≥ exerciseDate',
      path: ['cessionDate'],
    },
  );

export const trancheInputSchema = z.object({
  unitsToExercise: z.number().int().positive(),
  vestingDate: dateLike,
});

export const taxBreakdownSchema = z.object({
  regime: z.enum([
    'BSPCE_3Y_PLUS',
    'BSPCE_3Y_LESS',
    'STOCK_OPTION_QUALIFIE',
    'STOCK_OPTION_NON_QUALIFIE',
    'BSA',
    'AGA_POST_2018',
    'AGA_PRE_2018',
  ]),
  grossExerciseAmount: z.number(),
  grossSaleAmount: z.number(),
  grossGainAmount: z.number(),
  acquisitionTaxableBase: z.number(),
  acquisitionIncomeTax: z.number(),
  acquisitionSocialContributions: z.number(),
  cessionTaxableBase: z.number(),
  cessionIncomeTax: z.number(),
  cessionSocialContributions: z.number(),
  totalTaxAmount: z.number(),
  netGainAmount: z.number(),
  effectiveTaxRate: z.number(),
  warnings: z.array(z.string()),
  ratesYear: z.literal(2026),
  computedAt: z.string(),
  sources: z.array(
    z.object({
      regime: z.string(),
      url: z.string().url(),
    }),
  ),
});

export type SimulationInputDto = z.input<typeof simulationInputSchema>;
export type SimulationInputParsed = z.output<typeof simulationInputSchema>;
export type TaxBreakdownDto = z.output<typeof taxBreakdownSchema>;
