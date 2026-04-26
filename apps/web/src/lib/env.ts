import { z } from 'zod';
// Smoke import to validate workspace wiring (no runtime cost — type re-export only).
export type { Permission, Role, AwardStatus } from '@equity/shared';

/**
 * Validation runtime des variables d'environnement.
 * Exécutée au démarrage du process serveur (importée depuis lib/supabase/server par exemple).
 *
 * Les variables NEXT_PUBLIC_* sont aussi exposées via process.env côté client mais
 * on ne les valide que côté serveur ; côté client on les consomme directement.
 */

/** Treat empty strings (`FOO=`) as undefined so optional URL/email checks pass. */
const optionalString = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().optional(),
);
const optionalUrl = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().url().optional(),
);
const optionalEmail = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().email().optional(),
);

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  QUANT_ENGINE_URL: optionalUrl,
  QUANT_ENGINE_API_KEY: optionalString,
  YOUSIGN_API_KEY: optionalString,
  YOUSIGN_API_BASE_URL: optionalUrl,
  YOUSIGN_WEBHOOK_SECRET: optionalString,
  RESEND_API_KEY: optionalString,
  RESEND_FROM_EMAIL: optionalEmail,
  RESEND_WEBHOOK_SECRET: optionalString,
  EODHD_API_KEY: optionalString,
  SENTRY_DSN: optionalUrl,
});

const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;

let cachedServerEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    const msg = Object.entries(flat)
      .map(([k, errs]) => `  - ${k}: ${errs?.join(', ')}`)
      .join('\n');
    throw new Error(`Invalid server environment variables:\n${msg}`);
  }
  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

export const clientEnv: ClientEnv = clientEnvSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
