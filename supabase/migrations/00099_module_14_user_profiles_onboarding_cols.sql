-- Module 14 PR #43 B1 — Colonnes onboarding + ToS sur user_profiles
--
-- Spec brief PR #43 §B2 (onboarding wizard) + §B4 (RGPD ToS).
--
-- Les colonnes sont ADD-only IF NOT EXISTS pour idempotence (rejouable
-- safe si la migration est replay manuellement).

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS tos_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS tos_version_accepted text,
  ADD COLUMN IF NOT EXISTS cookie_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_profiles.onboarding_completed_at IS
  'Module 14: timestamp when user completed the 4-step onboarding wizard. NULL = onboarding pending. Mirror set into auth.users.app_metadata.onboarding_completed=true via Server Action completeOnboarding.';

COMMENT ON COLUMN public.user_profiles.tos_accepted_at IS
  'Module 14: timestamp of last ToS acceptance.';

COMMENT ON COLUMN public.user_profiles.tos_version_accepted IS
  'Module 14: ToS version string accepted (e.g. "v1.0-2026-05-05"). For ToS update re-accept gating in V1.X.';

COMMENT ON COLUMN public.user_profiles.cookie_preferences IS
  'Module 14: cookie consent preferences. V1 schema: { acknowledged: boolean, accepted_at: timestamptz, level: "essential" | "all" }.';
