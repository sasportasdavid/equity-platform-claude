-- Module 14 PR #43 B1 — RPC ensure_user_profile_exists + backfill orphan
--
-- Spec MODULE_02_IDENTITY_ROLES §1.4 (création auth.users + user_profile
-- atomique côté Server Action) + brief PR #43 §B1.
--
-- ⚠️ Décision archi (5 mai 2026) : pas de trigger AFTER INSERT ON auth.users
--    Sur Supabase managed PG17, `postgres` (rôle utilisé par les migrations)
--    n'est PAS membre de `supabase_auth_admin` (owner d'auth.users) — la
--    création d'un trigger sur cette table échoue avec "must be owner of
--    relation users". C'est la nouvelle politique de sécurité Supabase.
--
--    Solution adoptée : RPC `public.ensure_user_profile_exists` SECURITY
--    DEFINER que les Server Actions appellent explicitement après chaque
--    création auth.users (signup, invitation accept, admin.createUser).
--    Plus propre architecturalement (la création du profile reste dans le
--    domaine applicatif, pas un side-effect DB caché). Conforme spec §1.4.
--
-- ⚠️ SECURITY DEFINER lockdown :
--   - SET search_path = '' bloque schema poisoning.
--   - REVOKE EXECUTE FROM public, anon, authenticated, service_role.
--   - GRANT EXECUTE TO postgres uniquement (le service_role peut SET ROLE
--     postgres pour invoquer si besoin, mais en pratique on l'appelle via
--     getSupabaseAdminClient().rpc() qui passe par PostgREST en
--     authenticator → service_role qui a déjà SET ROLE postgres en interne).

CREATE OR REPLACE FUNCTION public.ensure_user_profile_exists(
  p_user_id uuid,
  p_email text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, is_test_user)
  VALUES (p_user_id, p_email, false)
  ON CONFLICT (id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.ensure_user_profile_exists(uuid, text) IS
  'Module 14 B1: ensure a public.user_profiles row exists for the given auth.users id. Idempotent (ON CONFLICT DO NOTHING). Called by Server Actions signupWithMagicLink + acceptInvitation post auth.admin.createUser. is_test_user defaults to false (PR #44 seed QA convention).';

-- Lockdown : seul le owner (postgres) peut invoquer
REVOKE EXECUTE ON FUNCTION public.ensure_user_profile_exists(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ensure_user_profile_exists(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ensure_user_profile_exists(uuid, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.ensure_user_profile_exists(uuid, text) TO service_role;

-- Backfill : créer le profile pour les users orphelins existants
-- (sasportasdavid@gmail.com confirmé orphelin au 5 mai 2026)
INSERT INTO public.user_profiles (id, email, is_test_user)
SELECT u.id, u.email, false
FROM auth.users u
LEFT JOIN public.user_profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;
