-- =============================================================================
-- Migration 99000 — QA seed (DEV ONLY)
-- =============================================================================
--
-- PR #44 — QA E2E Foundation (cf docs/QA_SETUP.md).
--
-- Préfixe `99` réservé aux migrations QA pour ne pas collisionner avec les
-- migrations modules 00001 → 00097+. Suffixe `_dev_only` rappelle que cette
-- migration ne doit JAMAIS être appliquée sur un projet Supabase prod
-- (elle ajoute la colonne `is_test_user` qui n'a aucune utilité prod).
--
-- Ce que cette migration fait :
--   1. ALTER user_profiles ADD COLUMN is_test_user (idempotent)
--   2. Crée 1 org QA isolée (id `aaaaaaaa-1111-2222-3333-444444444444`)
--
-- Ce que cette migration ne fait PAS :
--   - Créer les 5 users de test (auth.users.* via SQL pur est tricky avec
--     la stack Supabase Auth). Le seed des users se fait via le script
--     TypeScript `apps/web/scripts/seed-qa-users.ts` qui utilise
--     `supabase.auth.admin.createUser()` puis insère le user_profile +
--     membership.
--
-- Re-run : idempotente (ALTER IF NOT EXISTS + INSERT ON CONFLICT DO NOTHING).
-- =============================================================================

-- 1. Ajouter colonne is_test_user (idempotent)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_test_user BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_profiles.is_test_user IS
  'PR #44 QA E2E — TRUE pour les users de seed QA (capiwise-qa.test). Utilisé par /api/test/login (couche 4 défense en profondeur) pour gate l''accès au bypass auth. NEVER true en prod.';

-- 2. Index pour query rapide de la liste des test users (cleanup script V1.X)
CREATE INDEX IF NOT EXISTS idx_user_profiles_test_users
  ON public.user_profiles (is_test_user)
  WHERE is_test_user = true;

-- 3. Créer org QA isolée (schema réel : pas de `country` ni `plan_type` columns,
--    defaults default_locale='fr-FR', plan_tier='STANDARD' suffisent)
INSERT INTO public.organizations (id, slug, name)
VALUES (
  'aaaaaaaa-1111-2222-3333-444444444444',
  'capiwise-qa',
  'Capiwise QA'
)
ON CONFLICT (id) DO NOTHING;
