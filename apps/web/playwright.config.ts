import { defineConfig, devices } from '@playwright/test';

const PORT = 3100; // distinct from `next dev` (3000) so both can coexist

/**
 * PR #44 — Config étendue pour supporter le bypass auth via /api/test/login.
 *
 * 2 modes :
 *   1. **Real Supabase mode** (défaut V1) : si NEXT_PUBLIC_SUPABASE_URL est
 *      défini dans process.env (typiquement via .env.local), Playwright
 *      forwarde les vraies clés au webServer. Permet aux tests qui utilisent
 *      `loginAs()` (cf e2e/helpers/auth.ts) de fonctionner.
 *   2. **Mocked fallback** : si NEXT_PUBLIC_SUPABASE_URL absent, fallback
 *      sur l'URL mockée 127.0.0.1:54331 + clé fake. Suffisant pour les
 *      anon redirect tests (auth-flow.spec.ts).
 *
 * NODE_ENV=test pour que la route /api/test/login (couche 2) accepte les
 * requêtes (la couche 1 VERCEL_ENV est inactive en local).
 */

const REAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REAL_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const REAL_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const E2E_BYPASS_SECRET = process.env.E2E_BYPASS_SECRET;

const useRealBackend = Boolean(
  REAL_SUPABASE_URL && REAL_SUPABASE_ANON_KEY && REAL_SERVICE_ROLE_KEY,
);

const webServerEnv: Record<string, string> = useRealBackend
  ? {
      NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${PORT}`,
      NEXT_PUBLIC_SUPABASE_URL: REAL_SUPABASE_URL!,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: REAL_SUPABASE_ANON_KEY!,
      SUPABASE_SERVICE_ROLE_KEY: REAL_SERVICE_ROLE_KEY!,
      E2E_BYPASS_SECRET: E2E_BYPASS_SECRET ?? 'qa-bypass-secret-change-me-in-ci',
      NODE_ENV: 'test',
    }
  : {
      NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${PORT}`,
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54331',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'mock-anon-key-for-e2e',
      NODE_ENV: 'test',
    };

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // PR #44 — keep false (DB partagée, V1 read-only)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'fr-FR',
    extraHTTPHeaders: {
      // Forward le secret pour les `request.post('/api/test/login')`
      // (les tests utilisent helpers qui le passent explicitement, mais
      // ça simplifie les futurs tests inline).
      'x-test-secret': E2E_BYPASS_SECRET ?? 'qa-bypass-secret-change-me-in-ci',
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: webServerEnv,
  },
});
