import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
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
  // @vitejs/plugin-react ajouté en PR #9 (Bug #45) — permet aux tests qui
  // touchent (ou importent transitivement) du JSX/TSX d'être bundlés
  // correctement. Avant : tout test qui chaînait vers `@/lib/pdf/render.tsx`
  // plantait au transform Rolldown. Workaround historique = dynamic import
  // dans approvals.ts (cf. PR #9 closure dans memory).
  plugins: [react()],
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./vitest.setup.ts'],
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
