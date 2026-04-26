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

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  QUANT_ENGINE_URL: z.string().url().optional(),
  QUANT_ENGINE_API_KEY: z.string().optional(),
  YOUSIGN_API_KEY: z.string().optional(),
  YOUSIGN_API_BASE_URL: z.string().url().optional(),
  YOUSIGN_WEBHOOK_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  RESEND_WEBHOOK_SECRET: z.string().optional(),
  EODHD_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().url().optional(),
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
