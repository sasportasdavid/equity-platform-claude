import { request, type Page } from '@playwright/test';

/**
 * PR #44 B4 — Helpers auth E2E pour les tests Playwright.
 *
 * `loginAs(page, role)` :
 *   1. Appelle POST /api/test/login avec header x-test-secret + email QA
 *   2. Récupère l'action_link (magic link Supabase non-envoyé par email)
 *   3. Navigue page vers le lien → redirect vers /dashboard
 *
 * Garde-fous :
 *   - Refuse si role pas dans la map (typing strict)
 *   - Refuse si la SA retourne ok=false (couches sécurité bypass)
 *   - Throw avec body de l'erreur pour debug rapide
 *
 * Helpers Mailpit :
 *   - getMailpitMessages(filter) : list emails (filtre to/subject)
 *   - clearMailpit() : vide la boîte avant un test (afterEach pattern)
 */

const E2E_BYPASS_SECRET = process.env.E2E_BYPASS_SECRET ?? 'qa-bypass-secret-change-me-in-ci';

const MAILPIT_BASE_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

export type QAUserRole = 'OWNER' | 'ADMIN_HR' | 'APPROVER' | 'AUDITOR' | 'BENEFICIARY';

const ROLE_TO_EMAIL: Record<QAUserRole, string> = {
  OWNER: 'owner@capiwise-qa.test',
  ADMIN_HR: 'admin-hr@capiwise-qa.test',
  APPROVER: 'approver@capiwise-qa.test',
  AUDITOR: 'auditor@capiwise-qa.test',
  BENEFICIARY: 'beneficiary@capiwise-qa.test',
};

/**
 * Bypass auth pour tests E2E. Authentifie le user via /api/test/login +
 * suit le magic link → arrive sur /dashboard.
 *
 * Usage :
 *   test.beforeEach(async ({ page }) => { await loginAs(page, 'OWNER'); });
 */
export async function loginAs(page: Page, role: QAUserRole): Promise<void> {
  const email = ROLE_TO_EMAIL[role];

  const response = await page.request.post('/api/test/login', {
    data: { email },
    headers: { 'x-test-secret': E2E_BYPASS_SECRET },
  });

  if (!response.ok()) {
    const errorBody = await response.text();
    throw new Error(`loginAs(${role}, ${email}) failed : HTTP ${response.status()} — ${errorBody}`);
  }

  const json = (await response.json()) as { ok: boolean; action_link?: string; error?: string };
  if (!json.ok || !json.action_link) {
    throw new Error(
      `loginAs(${role}) — bypass returned ok=false : ${json.error ?? 'no error message'}`,
    );
  }

  // Suivre le magic link (Supabase consume + redirect dashboard)
  await page.goto(json.action_link);
  // Attendre l'arrivée sur dashboard (redirect chain peut passer par /select-org)
  await page.waitForURL(/\/(dashboard|portal|onboarding)/, { timeout: 10_000 });
}

// =============================================================================
// Mailpit helpers
// =============================================================================

export type MailpitMessage = {
  ID: string;
  From?: { Address: string; Name?: string };
  To?: Array<{ Address: string; Name?: string }>;
  Subject?: string;
  Date?: string;
  Snippet?: string;
};

export type MailpitFilter = {
  to?: string;
  subject?: string;
};

/**
 * List messages Mailpit (optionnellement filtré par destinataire / sujet).
 *
 * Renvoie les messages les plus récents en premier. Cap implicite Mailpit
 * (MP_MAX_MESSAGES=5000 dans docker-compose.qa.yml).
 */
export async function getMailpitMessages(filter: MailpitFilter = {}): Promise<MailpitMessage[]> {
  const ctx = await request.newContext({ baseURL: MAILPIT_BASE_URL });
  try {
    const response = await ctx.get('/api/v1/messages');
    if (!response.ok()) {
      throw new Error(`Mailpit list failed : HTTP ${response.status()}`);
    }
    const body = (await response.json()) as { messages?: MailpitMessage[] };
    let messages = body.messages ?? [];

    if (filter.to) {
      messages = messages.filter((m) => m.To?.some((t) => t.Address === filter.to));
    }
    if (filter.subject) {
      messages = messages.filter((m) => m.Subject?.includes(filter.subject!));
    }
    return messages;
  } finally {
    await ctx.dispose();
  }
}

/**
 * Vide la boîte Mailpit. À utiliser dans `test.beforeEach` ou
 * `test.afterEach` pour isoler les tests entre eux.
 */
export async function clearMailpit(): Promise<void> {
  const ctx = await request.newContext({ baseURL: MAILPIT_BASE_URL });
  try {
    const response = await ctx.delete('/api/v1/messages');
    if (!response.ok() && response.status() !== 404) {
      throw new Error(`Mailpit clear failed : HTTP ${response.status()}`);
    }
  } finally {
    await ctx.dispose();
  }
}
