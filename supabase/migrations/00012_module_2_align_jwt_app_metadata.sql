-- ===========================================================================
-- Capiwise — Equity Platform
-- Migration 00012 : Aligner les claims JWT sous app_metadata (Module 2 §2.2/§2.3)
--
-- Module 1 / 00004 injectait active_org_id, org_ids, roles en TOP-LEVEL
-- du JWT via le custom_access_token_hook. C'était techniquement sécure
-- (le hook tourne SECURITY DEFINER, le client ne peut rien modifier),
-- mais ça s'écartait de la spec Module 2 qui standardise sur :
--
--   {
--     "sub": "...",
--     "email": "...",
--     "role": "authenticated",   ← claim Postgres (rôle DB)
--     "app_metadata": {
--       "active_org_id": "org-uuid",
--       "org_ids":       ["..."],
--       "active_roles":  ["ADMIN_HR", "APPROVER"]
--     }
--   }
--
-- Cette migration :
--   1. Réécrit custom_access_token_hook pour fusionner les claims dans
--      event.claims.app_metadata (au lieu du top-level)
--   2. Met à jour current_org_id() pour lire #>> '{app_metadata, active_org_id}'
--
-- Pas de breaking change visible : la DB est vide côté auth.users (pas
-- d'utilisateur avec session active), donc les RLS continueront à
-- fonctionner dès le prochain login.
--
-- Note nommage : on utilise `active_roles` (pas `roles`) dans app_metadata
-- pour éviter la confusion avec le claim `role` du JWT Postgres standard.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_id_param UUID;
  new_claims    jsonb;
  new_app_meta  jsonb;
  active_org    UUID;
  all_orgs      UUID[];
  active_roles  TEXT[];
BEGIN
  user_id_param := (event ->> 'user_id')::UUID;
  new_claims    := COALESCE(event -> 'claims', '{}'::jsonb);
  new_app_meta  := COALESCE(new_claims -> 'app_metadata', '{}'::jsonb);

  -- Org par défaut depuis user_profiles, fallback sur 1ère membership ACTIVE
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

  -- Toutes orgs accessibles (pour l'org switcher)
  SELECT array_agg(org_id) INTO all_orgs
    FROM memberships
   WHERE user_id = user_id_param AND status = 'ACTIVE';

  -- Rôles dans l'org active (pour gating UI rapide ; les RLS lisent toujours
  -- depuis memberships pour la source de vérité)
  IF active_org IS NOT NULL THEN
    SELECT roles INTO active_roles
      FROM memberships
     WHERE user_id = user_id_param
       AND org_id  = active_org
       AND status  = 'ACTIVE';
  END IF;

  -- Construire app_metadata
  IF active_org IS NOT NULL THEN
    new_app_meta := new_app_meta || jsonb_build_object('active_org_id', active_org);
  END IF;
  IF all_orgs IS NOT NULL THEN
    new_app_meta := new_app_meta || jsonb_build_object('org_ids', all_orgs);
  END IF;
  IF active_roles IS NOT NULL THEN
    new_app_meta := new_app_meta || jsonb_build_object('active_roles', active_roles);
  END IF;

  new_claims := jsonb_set(new_claims, '{app_metadata}', new_app_meta, true);

  RETURN jsonb_build_object('claims', new_claims);
END;
$$;

GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM authenticated, anon, public;

-- --------------------------------------------------------------------------
-- current_org_id() : lit maintenant dans app_metadata
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT NULLIF(auth.jwt() #>> '{app_metadata, active_org_id}', '')::UUID
$$;

GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated, anon;

COMMENT ON FUNCTION public.custom_access_token_hook IS
  'Module 2 §2.3 — injecte active_org_id, org_ids, active_roles dans app_metadata du JWT. SECURITY DEFINER, callable uniquement par supabase_auth_admin.';
COMMENT ON FUNCTION public.current_org_id IS
  'Module 2 §2.2 — lit l''org active depuis app_metadata.active_org_id du JWT. Renvoie NULL si non authentifié ou pas d''org sélectionnée.';
