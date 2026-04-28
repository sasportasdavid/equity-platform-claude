import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Vitest config — apps/web.
 *
 * Tests unitaires sur le code Node-compatible (pas les Edge Functions Deno).
 * Pour tester les helpers Edge (`buildPythonPayload.normalizeRateUnit`,
 * `compute-ifrs2-expense.computeExpenseSchedule`, etc.), on les extrairait
 * dans `packages/shared` pour les rendre importables côté Vitest. V1 :
 * on cible uniquement les helpers pure du frontend + schémas Zod.
 *
 * Exclude `e2e/` (Playwright) et `node_modules`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'e2e', '.next'],
    coverage: {
      reporter: ['text', 'html'],
      exclude: ['**/*.test.ts', '**/*.spec.ts', '**/*.config.*', '**/node_modules/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@equity/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
});
