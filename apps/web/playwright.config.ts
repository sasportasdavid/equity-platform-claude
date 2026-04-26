import { defineConfig, devices } from '@playwright/test';

const PORT = 3100; // distinct from `next dev` (3000) so both can coexist

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
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
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Run with the mocked Supabase env so we don't hit the real backend.
    command: `pnpm exec next dev -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${PORT}`,
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54331',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'mock-anon-key-for-e2e',
      NODE_ENV: 'test',
    },
  },
});
