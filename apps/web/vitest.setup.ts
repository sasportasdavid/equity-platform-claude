import { vi } from 'vitest';

/**
 * Setup global Vitest pour apps/web.
 *
 * `server-only` est un marker package Next.js qui throw au runtime si
 * importé depuis un client component. Vitest n'a pas accès au resolve
 * Next, donc l'import échoue. Mock noop pour permettre l'import en tests.
 */
vi.mock('server-only', () => ({}));
