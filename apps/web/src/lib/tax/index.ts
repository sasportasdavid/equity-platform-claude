/**
 * API publique de simulation fiscale.
 *
 * Toutes les entrées sont validées Zod et toutes les sorties suivent le
 * pattern Result<T> = { ok: true, data } | { ok: false, error }.
 *
 * Pure TS — réutilisable côté client (live preview UX) et côté serveur
 * (snapshot dans exercise_requests.tax_simulation_snapshot).
 */

import { simulationInputSchema } from '@equity/shared';
import { simulateBspce } from './bspce';
import { simulateStockOption } from './stockOption';
import { simulateBsa } from './bsa';
import { simulateAga } from './aga';
import { simulateMultiTranche } from './multiTranche';
import type {
  MultiTrancheBreakdown,
  Result,
  SimulationInput,
  TaxBreakdown,
  TrancheInput,
} from './types';

export type { SimulationInput, TaxBreakdown, MultiTrancheBreakdown, TrancheInput, Result };

/**
 * Calcule un breakdown fiscal selon le `planType` détecté dans l'input.
 *
 * - BSPCE → simulateBspce
 * - STOCK_OPTION → simulateStockOption (qualifié par défaut)
 * - BSA → simulateBsa
 * - AGA → simulateAga (post-2018 par défaut)
 */
export function simulateExerciseTax(input: unknown): Result<TaxBreakdown> {
  const parsed = simulationInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'TAX_INPUT_INVALID',
        message: parsed.error.issues
          .map((i) => `${i.path.join('.') || '(root)'} : ${i.message}`)
          .join('; '),
      },
    };
  }

  const data = parsed.data as SimulationInput;

  try {
    let breakdown: TaxBreakdown;
    switch (data.planType) {
      case 'BSPCE':
        breakdown = simulateBspce(data);
        break;
      case 'STOCK_OPTION':
        breakdown = simulateStockOption(data);
        break;
      case 'BSA':
        breakdown = simulateBsa(data);
        break;
      case 'AGA':
        breakdown = simulateAga(data);
        break;
    }
    return { ok: true, data: breakdown };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'TAX_DATA_INCONSISTENT',
        message: e instanceof Error ? e.message : 'Unknown error',
      },
    };
  }
}

/**
 * Simulation multi-tranches : permet de calculer un breakdown agrégé
 * à partir de plusieurs sub-quantités avec leur propre vestingDate.
 *
 * Note V1 : pas de schema Zod pour les tranches — l'appelant est
 * responsable de la validation. Le schema Zod sera ajouté en B3 si la
 * fn est exposée à des inputs externes.
 */
export function simulateExerciseTaxMultiTranche(
  input: unknown,
  tranches: TrancheInput[],
): Result<MultiTrancheBreakdown> {
  const parsed = simulationInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'TAX_INPUT_INVALID',
        message: parsed.error.issues
          .map((i) => `${i.path.join('.') || '(root)'} : ${i.message}`)
          .join('; '),
      },
    };
  }

  if (!tranches || tranches.length === 0) {
    return {
      ok: false,
      error: {
        code: 'TAX_INPUT_INVALID',
        message: 'tranches must not be empty',
      },
    };
  }

  try {
    const data = parsed.data as SimulationInput;
    const breakdown = simulateMultiTranche(data, tranches);
    return { ok: true, data: breakdown };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'TAX_DATA_INCONSISTENT',
        message: e instanceof Error ? e.message : 'Unknown error',
      },
    };
  }
}

// Re-export interne pour permettre aux call-sites avancés (Server Actions
// avec inputs déjà validés) de bypass Zod.
export { simulateBspce, simulateStockOption, simulateBsa, simulateAga, simulateMultiTranche };
