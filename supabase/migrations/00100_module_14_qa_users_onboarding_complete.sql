-- Module 14 PR #43 B6 — Backfill `onboarding_completed_at` pour les
-- 5 users QA seedés en PR #44 (migration 99000).
--
-- Justification : les colonnes onboarding sont ajoutées par 00099, et la
-- proxy gate B2 redirige les users sans `app_metadata.onboarding_completed=true`
-- vers /onboarding. Sans ce backfill, le helper `loginAs()` de la suite E2E
-- foundation tomberait sur /onboarding au lieu de /dashboard, cassant
-- audit-trail-smoke.spec.ts + audit-export-download.spec.ts +
-- audit-event-drawer-defensive.spec.ts.
--
-- Strictement DEV-only : filtre sur `is_test_user=true` ET
-- `email LIKE '%@capiwise-qa.test'`. Aucun impact sur les vraies orgs.

UPDATE public.user_profiles
SET onboarding_completed_at = COALESCE(onboarding_completed_at, now())
WHERE is_test_user = true
  AND email LIKE '%@capiwise-qa.test'
  AND onboarding_completed_at IS NULL;

-- Mirror dans auth.users.app_metadata (pour la lecture JWT proxy gate).
-- Pas de loop SQL — Postgres autorise UPDATE sur auth.users sous postgres
-- pour le jsonb merge (l'INSERT/DELETE est interdit, le UPDATE app_metadata
-- est OK).
UPDATE auth.users
SET raw_app_meta_data =
  COALESCE(raw_app_meta_data, '{}'::jsonb) ||
  jsonb_build_object('onboarding_completed', true)
WHERE email LIKE '%@capiwise-qa.test';
