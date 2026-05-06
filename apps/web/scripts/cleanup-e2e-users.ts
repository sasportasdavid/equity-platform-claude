/**
 * Bug #1 fix sprint 6 mai 2026 PM — cleanup E2E signup users.
 *
 * Usage :
 *   pnpm --filter web tsx scripts/cleanup-e2e-users.ts        # cleanup direct
 *   pnpm --filter web tsx scripts/cleanup-e2e-users.ts --dry  # dry run, log seulement
 *
 * Pré-requis :
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *
 * Politique :
 *   - DELETE auth.users WHERE email LIKE '%@capiwise-e2e.test'
 *     (TLD .test = RFC 6761 réservé jamais routé, domaine *.capiwise-e2e
 *     dédié aux tests dynamiques de signup)
 *   - L'export FK CASCADE de auth.users vers public.user_profiles, memberships,
 *     etc. supprime aussi les rows enfants
 *   - Les users seed QA (owner/admin-hr/approver/auditor/beneficiary @
 *     capiwise-qa.test) ne sont PAS touchés
 *
 * Cron suggéré :
 *   Schedule weekly (e.g. via GitHub Actions) pour ne pas accumuler en QA.
 *   Aussi appelable manuellement après une session E2E locale.
 *
 * SÉCURITÉ : ne JAMAIS pointer ce script vers un projet Supabase prod.
 * Le filtre `@capiwise-e2e.test` est sûr (jamais utilisé par de vrais
 * users), mais une erreur sur le filtre serait catastrophique.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry');
const E2E_DOMAIN = '@capiwise-e2e.test';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    '❌ Missing env vars : NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.',
  );
  process.exit(1);
}

async function main() {
  console.log(`🧹 Cleanup E2E users (${E2E_DOMAIN})${DRY_RUN ? ' [DRY RUN]' : ''}\n`);

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Lister les users E2E. La fonction listUsers admin ne supporte pas
  //    de filtre WHERE ; on paginate et filtre côté JS.
  const matched: Array<{ id: string; email: string }> = [];
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error('❌ listUsers error :', error.message);
      process.exit(1);
    }
    for (const u of data.users) {
      if (u.email?.toLowerCase().endsWith(E2E_DOMAIN)) {
        matched.push({ id: u.id, email: u.email });
      }
    }
    if (data.users.length < perPage) break;
    page += 1;
    if (page > 50) {
      console.error(`❌ Pagination safety stop : > 50 pages × ${perPage}. Aborting.`);
      process.exit(1);
    }
  }

  if (matched.length === 0) {
    console.log('✅ No E2E users to clean up.');
    return;
  }

  console.log(`Found ${matched.length} E2E user(s) to delete :`);
  for (const u of matched) {
    console.log(`  - ${u.email} (${u.id})`);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No deletion performed.');
    return;
  }

  // 2. Delete via admin client (CASCADE supprime user_profiles + memberships)
  let deleted = 0;
  let failed = 0;
  for (const u of matched) {
    const { error } = await supabase.auth.admin.deleteUser(u.id);
    if (error) {
      console.error(`❌ deleteUser ${u.email} :`, error.message);
      failed += 1;
    } else {
      deleted += 1;
    }
  }
  console.log(`\n✅ Deleted ${deleted} user(s)${failed > 0 ? `, ${failed} failed` : ''}.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('❌ Fatal error :', err);
  process.exit(1);
});
