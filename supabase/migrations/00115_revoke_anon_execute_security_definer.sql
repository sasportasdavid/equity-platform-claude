-- ============================================================
-- Hardening DB (audit 2026-06-10, P1) — retrait de l'accès anon aux
-- fonctions SECURITY DEFINER
-- ============================================================
--
-- Advisor `anon_security_definer_function_executable` (×62) : le rôle anon
-- pouvait exécuter toutes les fonctions SECURITY DEFINER de public — via un
-- grant explicite `anon=X` ET le grant PUBLIC par défaut (`=X`). La plupart
-- s'auto-protègent (check auth.uid()/permission interne), mais l'exposition
-- est inutile : défense en profondeur.
--
-- Analyse (cf. rapport audit) :
--   - Aucune de ces fonctions n'est appelée par le client ANON : les flows
--     pré-login (accept-invite get_invitation_by_token, signup
--     ensure_user_profile_exists) passent TOUS par le client admin
--     (service_role), jamais anon.
--   - 5 fonctions sont référencées dans des policies RLS et DOIVENT rester
--     exécutables par anon (sinon les requêtes anon sur des tables à RLS
--     échouent) : current_org_id, has_permission, is_award_beneficiary,
--     is_org_member, user_has_permission. + user_all_permissions (helper
--     permissions, conservé par prudence).
--
-- Stratégie : pour toutes les SECURITY DEFINER de public HORS allowlist :
--   1) GARANTIR un grant explicite à authenticated + service_role (idempotent,
--      pour ne rien casser si une fonction ne dépendait que de PUBLIC) ;
--   2) REVOKE EXECUTE FROM PUBLIC, anon (retire l'accès anon réel).
-- Les fonctions trigger fonctionnent indépendamment du grant EXECUTE.
-- ============================================================

DO $$
DECLARE
  r RECORD;
  v_keep TEXT[] := ARRAY[
    'current_org_id', 'has_permission', 'is_award_beneficiary',
    'is_org_member', 'user_has_permission', 'user_all_permissions'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND NOT (p.proname = ANY(v_keep))
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role;',
      r.proname, r.args
    );
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon;',
      r.proname, r.args
    );
  END LOOP;
END $$;
