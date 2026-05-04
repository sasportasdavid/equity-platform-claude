/**
 * @equity/shared — Code partagé entre apps/web et les Edge Functions.
 *
 * Sous-points d'entrée disponibles :
 *  - `@equity/shared/types`           Types DB générés
 *  - `@equity/shared/schemas`         Schémas Zod (Server Actions + formulaires)
 *  - `@equity/shared/constants`       Permissions, rôles, plan types, statuts
 *  - `@equity/shared/state-machines`  State machines (awards, etc.)
 *
 * L'import nu `@equity/shared` ré-exporte le sous-ensemble le plus courant.
 */
export * from './constants';
export * from './schemas';
export * from './state-machines';
export * from './notifications/resend-event-classifier';
export type { Database, Json, Tables, TablesInsert, TablesUpdate } from './types/database';
export * from './types/portal';
export * from './types/valuation';
