-- ===========================================================================
-- Capiwise — Equity Platform
-- Migration 00004 : Custom Access Token Hook (Module 1 §3.2)
--
-- Injecte les claims suivants dans chaque JWT user :
--   - active_org_id : org actif (lu depuis user_profiles.default_org_id, ou
--     première membership ACTIVE si default_org_id est NULL)
--   - org_ids       : toutes les orgs ACTIVE auxquelles le user appartient
--   - role          : tableau des rôles dans l'org active (pour usage UI rapide)
--
-- Le hook est appelé par GoTrue à chaque émission de token (login, refresh).
-- À activer ensuite dans Supabase Dashboard → Authentication → Hooks
-- → Custom Access Token Hook → public.custom_access_token_hook
-- (pas activable via SQL pur — c'est une config GoTrue côté Auth Settings).
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_id_param UUID;
  new_claims jsonb;
  active_org UUID;
  all_orgs UUID[];
  active_roles TEXT[];
BEGIN
  user_id_param := (event ->> 'user_id')::UUID;
  new_claims := COALESCE(event -> 'claims', '{}'::jsonb);

  -- Récupère l'org par défaut depuis user_profiles, fallback sur 1ère membership
  SELECT default_org_id INTO active_org
    FROM user_profiles
   WHERE id = user_id_param;

  IF active_org IS NULL THEN
    SELECT org_id INTO active_org
      FROM memberships
     WHERE user_id = user_id_param AND status = 'ACTIVE'
     ORDER BY created_at ASC
     LIMIT 1;
  END IF;

  -- Toutes les orgs accessibles (pour l'org switcher côté UI)
  SELECT array_agg(org_id) INTO all_orgs
    FROM memberships
   WHERE user_id = user_id_param AND status = 'ACTIVE';

  -- Rôles dans l'org active (pour affichage UI ; les RLS lisent toujours
  -- depuis memberships pour la source de vérité)
  IF active_org IS NOT NULL THEN
    SELECT roles INTO active_roles
      FROM memberships
     WHERE user_id = user_id_param
       AND org_id = active_org
       AND status = 'ACTIVE';
  END IF;

  IF active_org IS NOT NULL THEN
    new_claims := new_claims || jsonb_build_object('active_org_id', active_org);
  END IF;
  IF all_orgs IS NOT NULL THEN
    new_claims := new_claims || jsonb_build_object('org_ids', all_orgs);
  END IF;
  IF active_roles IS NOT NULL THEN
    new_claims := new_claims || jsonb_build_object('roles', active_roles);
  END IF;

  RETURN jsonb_build_object('claims', new_claims);
END;
$$;

-- Le hook doit être exécutable par le rôle interne supabase_auth_admin
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;

-- Donne l'accès lecture sur les tables nécessaires (memberships, user_profiles)
-- au rôle qui exécute le hook.
GRANT SELECT ON public.memberships TO supabase_auth_admin;
GRANT SELECT ON public.user_profiles TO supabase_auth_admin;

-- ===========================================================================
-- Activation manuelle requise après application de cette migration :
--
-- 1. Supabase Dashboard → Authentication → Hooks → Custom Access Token
-- 2. Activer le toggle, sélectionner public.custom_access_token_hook
-- 3. Save
--
-- Tant que le hook n'est pas activé, current_org_id() retournera NULL et
-- toutes les RLS échoueront pour les utilisateurs avec memberships.
-- ===========================================================================
