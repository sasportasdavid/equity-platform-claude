-- ===========================================================================
-- Capiwise — Equity Platform
-- Migration 00007 : RBAC helpers Module 2 §3.3 / §3.4
--
-- Module 1 a déjà créé :
--   - current_org_id()             OK (lit auth.jwt()->>'active_org_id')
--   - has_permission(perm)         OK (vérifie si user a une perm)
--   - is_award_beneficiary(uuid)   OK
--   - is_org_member(uuid)          OK
--
-- Module 2 §3.3 / §3.4 demande deux fonctions supplémentaires avec
-- des noms préfixés `user_` (convention RPC) :
--   - user_has_permission(p_perm)  → alias de has_permission, callable via supabase.rpc()
--   - user_all_permissions()       → renvoie TEXT[] de toutes les perms du user actif
--
-- Toutes les fonctions sont SECURITY DEFINER avec search_path explicit
-- pour passer les advisors Supabase.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- 1. user_has_permission — RPC frontale au-dessus de has_permission()
-- --------------------------------------------------------------------------
--
-- Pourquoi un alias plutôt que renommer has_permission ? Parce que la
-- migration 00002 RLS et plein de policies appellent has_permission()
-- directement dans leurs USING/CHECK clauses. Renommer casserait toutes
-- les policies. On garde donc has_permission() comme source de vérité
-- interne, et user_has_permission() devient l'API publique stable.

CREATE OR REPLACE FUNCTION public.user_has_permission(p_perm TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_permission(p_perm);
$$;

GRANT EXECUTE ON FUNCTION public.user_has_permission(TEXT) TO authenticated, anon;

-- --------------------------------------------------------------------------
-- 2. user_all_permissions — liste complète des perms du user actif
-- --------------------------------------------------------------------------
--
-- Combine :
--   - les perms héritées de chaque rôle dans la membership active
--   - les perms ajoutées explicitement (permissions_grant)
--   - moins les perms révoquées explicitement (permissions_revoke)
--
-- Retourne ARRAY[]::TEXT[] si pas de session ou pas d'org active.
-- Utilisé par le hook React usePermissions() pour gating UI granulaire.

CREATE OR REPLACE FUNCTION public.user_all_permissions()
RETURNS TEXT[]
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id  UUID := public.current_org_id();
  v_roles         TEXT[];
  v_grants        TEXT[];
  v_revokes       TEXT[];
  v_role_perms    TEXT[];
  v_final         TEXT[];
BEGIN
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  -- Charger les rôles + grants/revokes du membership actif
  SELECT roles, permissions_grant, permissions_revoke
    INTO v_roles, v_grants, v_revokes
    FROM memberships
   WHERE user_id = v_user_id
     AND org_id  = v_org_id
     AND status  = 'ACTIVE';

  IF v_roles IS NULL THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  -- Toutes les perms héritées des rôles (DISTINCT pour dédupliquer
  -- les rôles qui partagent la même perm)
  SELECT COALESCE(ARRAY_AGG(DISTINCT rp.permission_code), ARRAY[]::TEXT[])
    INTO v_role_perms
    FROM role_permissions rp
   WHERE rp.role = ANY(v_roles);

  -- Union avec grants explicites, moins les revokes explicites
  SELECT COALESCE(ARRAY_AGG(DISTINCT p), ARRAY[]::TEXT[])
    INTO v_final
    FROM unnest(v_role_perms || COALESCE(v_grants, ARRAY[]::TEXT[])) AS p
   WHERE NOT (p = ANY(COALESCE(v_revokes, ARRAY[]::TEXT[])));

  RETURN v_final;
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_all_permissions() TO authenticated, anon;

-- --------------------------------------------------------------------------
-- Sanity check : recharger une fois pour l'edge case "anon caller"
-- (devrait juste renvoyer ARRAY[]::TEXT[] sans erreur).
-- --------------------------------------------------------------------------
COMMENT ON FUNCTION public.user_has_permission(TEXT) IS
  'Module 2 §3.3 — alias frontal de has_permission() pour usage en RPC depuis le client.';

COMMENT ON FUNCTION public.user_all_permissions() IS
  'Module 2 §3.4 — liste complète des perms effectives du user actif (rôles + grants - revokes).';
