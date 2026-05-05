/**
 * PR #44 — Seed QA users (5 users + 1 org Capiwise QA).
 *
 * Usage : `pnpm --filter web tsx scripts/seed-qa-users.ts`
 *
 * Pré-requis :
 *   1. Migration `99000_qa_seed_users_org_dev_only.sql` appliquée
 *      (col `is_test_user` + org `aaaaaaaa-1111-2222-3333-444444444444`)
 *   2. Variables d'env :
 *      - NEXT_PUBLIC_SUPABASE_URL (cloud dev V1, ou QA dédié si V2)
 *      - SUPABASE_SERVICE_ROLE_KEY
 *
 * Ce script utilise `supabase.auth.admin.createUser()` qui :
 *   - crée l'auth user avec `email_confirm: true` (skip confirmation)
 *   - retourne le UUID auth pour insérer le user_profile + membership
 *
 * Idempotent : si user déjà créé (email collision), log "skipped" et continue.
 *
 * SÉCURITÉ : ce script crée des users avec password fixe `qa-test-pwd-2026`.
 * NEVER run on a Supabase prod project.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error(
    '❌ Missing env vars : NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.',
  );
  process.exit(1);
}

const QA_ORG_ID = 'aaaaaaaa-1111-2222-3333-444444444444';
const QA_PASSWORD = 'qa-test-pwd-2026';

type QARole = 'OWNER' | 'ADMIN_HR' | 'APPROVER' | 'AUDITOR' | 'BENEFICIARY';

type TestUser = {
  email: string;
  role: QARole;
  fullName: string;
};

const TEST_USERS: ReadonlyArray<TestUser> = [
  { email: 'owner@capiwise-qa.test', role: 'OWNER', fullName: 'QA Owner' },
  { email: 'admin-hr@capiwise-qa.test', role: 'ADMIN_HR', fullName: 'QA AdminHR' },
  { email: 'approver@capiwise-qa.test', role: 'APPROVER', fullName: 'QA Approver' },
  { email: 'auditor@capiwise-qa.test', role: 'AUDITOR', fullName: 'QA Auditor' },
  { email: 'beneficiary@capiwise-qa.test', role: 'BENEFICIARY', fullName: 'QA Beneficiary' },
];

async function main() {
  console.log(`🌱 Seeding 5 QA users + memberships in org ${QA_ORG_ID}…\n`);

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Vérifier que l'org QA existe
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', QA_ORG_ID)
    .maybeSingle();

  if (orgErr || !org) {
    console.error(
      `❌ Org QA ${QA_ORG_ID} introuvable. Apply migration 99000_qa_seed_users_org_dev_only.sql first.`,
    );
    process.exit(1);
  }
  console.log(`✓ Org QA found : ${org.name}\n`);

  // 2. Pour chaque user
  let succeeded = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of TEST_USERS) {
    try {
      // 2a. Créer auth user (idempotent — si existe, on récupère l'id existant)
      let userId: string;
      const { data: createRes, error: createErr } = await supabase.auth.admin.createUser({
        email: user.email,
        password: QA_PASSWORD,
        email_confirm: true,
        user_metadata: { is_test_user: true, qa_role: user.role },
      });

      if (createErr) {
        // Si déjà existant, lookup l'ID via listUsers (Supabase Auth ne fournit
        // pas getUserByEmail nativement)
        if (
          createErr.message?.toLowerCase().includes('already') ||
          createErr.message?.toLowerCase().includes('registered')
        ) {
          const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const existing = list?.users?.find((u) => u.email === user.email);
          if (!existing) {
            console.error(`❌ ${user.email}: already exists but not found in listUsers`);
            failed++;
            continue;
          }
          userId = existing.id;
          console.log(`⊘ ${user.email}: auth user already exists (id ${userId.slice(0, 8)}…)`);
          skipped++;
        } else {
          console.error(`❌ ${user.email}: createUser failed —`, createErr.message);
          failed++;
          continue;
        }
      } else {
        userId = createRes.user!.id;
      }

      // 2b. UPSERT user_profile avec is_test_user=true
      const { error: profileErr } = await supabase.from('user_profiles').upsert(
        {
          id: userId,
          email: user.email,
          full_name: user.fullName,
          is_test_user: true,
          default_org_id: QA_ORG_ID,
        },
        { onConflict: 'id' },
      );

      if (profileErr) {
        console.error(`❌ ${user.email}: user_profile upsert failed —`, profileErr.message);
        failed++;
        continue;
      }

      // 2c. UPSERT membership (status='ACTIVE' avec accepted_at pour cohérence
      // RBAC — Module 2 considère un membership ACTIVE complet uniquement
      // si accepted_at IS NOT NULL)
      const { error: membershipErr } = await supabase.from('memberships').upsert(
        {
          user_id: userId,
          org_id: QA_ORG_ID,
          roles: [user.role],
          status: 'ACTIVE',
          accepted_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,org_id' },
      );

      if (membershipErr) {
        console.error(`❌ ${user.email}: membership upsert failed —`, membershipErr.message);
        failed++;
        continue;
      }

      console.log(`✅ ${user.email} (${user.role}) — id ${userId.slice(0, 8)}…`);
      succeeded++;
    } catch (err) {
      console.error(`❌ ${user.email}: unexpected error —`, err);
      failed++;
    }
  }

  console.log(`\n🎉 Seed terminé.`);
  console.log(`   succeeded : ${succeeded}`);
  console.log(`   skipped   : ${skipped} (already existed)`);
  console.log(`   failed    : ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected fatal error:', err);
  process.exit(1);
});
