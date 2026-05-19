-- ===========================================================================
-- Capiwise — Equity Platform
-- Migration 00104 : Fix custom_access_token_hook — purge des claims stales
--
-- BUG (dette V1.X #33) :
-- Le hook tel qu'écrit en 00012 LISAIT `event.claims.app_metadata` comme
-- état initial puis MERGEAIT (`||`) les valeurs fraîchement calculées
-- depuis `user_profiles.default_org_id` + `memberships`. Mais si le calcul
-- retournait NULL (pas de default_org_id, pas de membership ACTIVE), le
-- hook ne touchait PAS au claim existant — les valeurs stales du précédent
-- JWT étaient préservées.
--
-- Symptôme observé : "boucle redirect lors du switch de profil"
--   1. User A login → JWT avec active_org_id=orgA
--   2. User A logout → cookies clear côté browser, mais
--      auth.users.raw_app_meta_data garde active_org_id=orgA en DB
--   3. User B login (même browser) → magic link → exchangeCodeForSession
--   4. Hook fire pour User B → lit raw_app_meta_data (vide pour B la
--      première fois, mais si B avait déjà un setup test → stale claim)
--   5. Si B n'a pas de default_org_id ET pas de membership ACTIVE :
--      le claim active_org_id stale est PRÉSERVÉ
--   6. Proxy laisse passer (claim présent) → dashboard SSR rend en mode
--      "broken" car les queries org-scoped retournent vide
--   7. User confused, retry login → loop perçu
--
-- FIX :
-- Le hook RETIRE EXPLICITEMENT les 3 claims contrôlés (active_org_id,
-- org_ids, active_roles) avant de re-injecter les valeurs fraîches. Ainsi
-- l'absence de membership ACTIVE se traduit par un JWT SANS active_org_id,
-- ce qui force le proxy à rediriger /select-org → flow propre.
--
-- Pas de breaking change pour les users existants : à leur prochain
-- refreshSession / SIGNED_IN, le hook ré-injectera les bonnes valeurs
-- depuis la DB (default_org_id + memberships ACTIVE).
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

  -- **Fix dette #33** — purge des claims contrôlés avant recalcul.
  -- Sans ça les valeurs stales du précédent JWT (ou de raw_app_meta_data
  -- jamais nettoyé) étaient préservées si le user n'avait plus de
  -- membership ACTIVE → état mixte → boucle.
  new_app_meta := new_app_meta - 'active_org_id' - 'org_ids' - 'active_roles';

  -- Org par défaut depuis user_profiles, fallback sur 1ère membership ACTIVE
  SELECT default_org_id INTO active_org
    FROM user_profiles
   WHERE id = user_id_param;

  IF active_org IS NOT NULL THEN
    -- Garde-fou : vérifie que default_org_id correspond toujours à une
    -- membership ACTIVE. Sinon (membership révoquée mais default_org_id
    -- pas nettoyé), on ignore et on tente le fallback.
    IF NOT EXISTS (
      SELECT 1 FROM memberships
       WHERE user_id = user_id_param
         AND org_id  = active_org
         AND status  = 'ACTIVE'
    ) THEN
      active_org := NULL;
    END IF;
  END IF;

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

  -- Réinjection des claims fraîchement calculés (le purge ci-dessus garantit
  -- que les NULL sont reflétés par l'absence du claim au lieu d'un résidu)
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

COMMENT ON FUNCTION public.custom_access_token_hook IS
  'Module 2 §2.3 + fix V1.X #33 — injecte active_org_id / org_ids / active_roles dans app_metadata du JWT. Purge des claims stales avant recalcul (fix boucle redirect au switch de profil). SECURITY DEFINER, callable uniquement par supabase_auth_admin.';
