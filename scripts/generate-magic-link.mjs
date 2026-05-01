#!/usr/bin/env node
// One-shot helper: generate a magic link URL for a user via Supabase Admin API.
// Bypasses SMTP rate-limit. Outputs the URL to stdout — open in browser.
//
// Usage:
//   node scripts/generate-magic-link.mjs <email> [redirect-path]
//
// redirect-path defaults to /dashboard. Examples:
//   /dashboard/approvals, /dashboard/awards/<uuid>
//
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env (loaded
// from apps/web/.env.local automatically).

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

// ESM resolves @supabase/supabase-js relative to this file, but the package
// lives in apps/web/node_modules (pnpm hoist boundary). Use createRequire
// scoped to apps/web's package.json to find it.
const requireFromWeb = createRequire(resolve(process.cwd(), 'apps/web/package.json'));
const { createClient } = requireFromWeb('@supabase/supabase-js');

function loadEnvFile(path) {
  try {
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    /* ignore */
  }
}

loadEnvFile(resolve(process.cwd(), 'apps/web/.env.local'));

const email = process.argv[2];
const redirectPathArg = process.argv[3] ?? '/dashboard';
if (!email) {
  console.error('Usage: node scripts/generate-magic-link.mjs <email> [redirect-path]');
  process.exit(1);
}
const redirectPath = redirectPathArg.startsWith('/') ? redirectPathArg : `/${redirectPathArg}`;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// IMPORTANT : on doit passer par /auth/callback?next=... (PKCE/OTP exchange)
// au lieu de redirect direct vers la destination. Sans ça, le token Supabase
// n'est jamais échangé contre une session cookie côté Next.js → proxy renvoie
// sur /login. Cf. apps/web/src/app/auth/callback/route.ts.
const callbackUrl = `${appUrl}/auth/callback?next=${encodeURIComponent(redirectPath)}`;

const { data, error } = await admin.auth.admin.generateLink({
  type: 'magiclink',
  email,
  options: { redirectTo: callbackUrl },
});

if (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

console.log('\n=== MAGIC LINK FOR', email, '===');
console.log('callback →', callbackUrl);
console.log('final dest →', `${appUrl}${redirectPath}`);
console.log(data?.properties?.action_link ?? '(no action_link)');
console.log('===\n');
