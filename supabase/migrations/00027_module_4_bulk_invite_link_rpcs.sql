-- =============================================================================
-- Module 4 — sous-module B1.3 : RPCs bulk_create_beneficiaries + mark_beneficiary_invited
-- + link_beneficiary_to_user + extension custom_access_token_hook (Module 2)
-- =============================================================================
-- 3 RPCs + 1 extension de hook auth pour le linking automatique au login.
-- Tous SECURITY DEFINER avec checks de permission ou contexte auth approprié.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. bulk_create_beneficiaries — import CSV (max 500 rows)
-- ---------------------------------------------------------------------------
-- Skip avec WARNING dans `errors[]` si email déjà existant (pas de rollback
-- total — les nouveaux passent). Audit global award.bulk_imported.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION bulk_create_beneficiaries(p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id        UUID := auth.uid();
  v_org_id         UUID := current_org_id();
  v_row            JSONB;
  v_created_count  INTEGER := 0;
  v_errors         JSONB[] := ARRAY[]::JSONB[];
  v_created_ids    UUID[] := ARRAY[]::UUID[];
  v_email          TEXT;
  v_existing_id    UUID;
  v_new_id         UUID;
  v_idx            INTEGER := 0;
BEGIN
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié ou org active manquante';
  END IF;

  IF NOT user_has_permission('beneficiaries.bulk_import') THEN
    RAISE EXCEPTION 'Permission denied : beneficiaries.bulk_import requise';
  END IF;

  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows doit être un array JSONB';
  END IF;

  IF jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'Bulk limit: 500 rows max (got %)', jsonb_array_length(p_rows);
  END IF;

  IF jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'p_rows vide — au moins 1 row requise';
  END IF;

  FOR v_row IN SELECT jsonb_array_elements(p_rows)
  LOOP
    v_idx := v_idx + 1;
    v_email := lower(v_row->>'email');

    -- Check existence (par email lowercased dans org)
    SELECT id INTO v_existing_id
      FROM beneficiaries
     WHERE org_id = v_org_id AND lower(email) = v_email AND deleted_at IS NULL;

    IF v_existing_id IS NOT NULL THEN
      v_errors := array_append(v_errors, jsonb_build_object(
        'rowIndex', v_idx - 1,
        'email', v_email,
        'severity', 'WARNING',
        'message', 'Beneficiary already exists, skipped',
        'existing_id', v_existing_id
      ));
      CONTINUE;
    END IF;

    -- Insert new (firstName/lastName requis NOT NULL en DB)
    INSERT INTO beneficiaries (
      org_id, email, first_name, last_name,
      beneficiary_type, contract_type, job_title, department,
      tax_residence_country, is_tax_resident_france,
      hire_date, status, created_by
    ) VALUES (
      v_org_id, v_email,
      COALESCE(v_row->>'firstName', SPLIT_PART(COALESCE(v_row->>'fullName', v_email), ' ', 1)),
      COALESCE(
        v_row->>'lastName',
        NULLIF(SUBSTRING(COALESCE(v_row->>'fullName', '') FROM POSITION(' ' IN COALESCE(v_row->>'fullName', '')) + 1), ''),
        '—'
      ),
      COALESCE(v_row->>'beneficiaryType', 'EMPLOYEE'),
      v_row->>'contractType',
      v_row->>'jobTitle',
      v_row->>'department',
      COALESCE(v_row->>'taxResidence', 'FR'),
      COALESCE((v_row->>'isTaxResidentFrance')::BOOLEAN, true),
      NULLIF(v_row->>'hireDate', '')::DATE,
      'active',
      v_user_id
    )
    RETURNING id INTO v_new_id;

    v_created_count := v_created_count + 1;
    v_created_ids := array_append(v_created_ids, v_new_id);
  END LOOP;

  -- Audit global
  INSERT INTO audit_events (org_id, user_id, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id, v_user_id, 'beneficiary.bulk_imported', 'BENEFICIARY', NULL,
    jsonb_build_object(
      'rows_count', jsonb_array_length(p_rows),
      'created_count', v_created_count,
      'errors_count', COALESCE(array_length(v_errors, 1), 0),
      'created_ids', to_jsonb(v_created_ids)
    )
  );

  RETURN jsonb_build_object(
    'created', v_created_count,
    'errors', to_jsonb(v_errors),
    'created_ids', to_jsonb(v_created_ids)
  );
END $$;

GRANT EXECUTE ON FUNCTION bulk_create_beneficiaries(JSONB) TO authenticated;

COMMENT ON FUNCTION bulk_create_beneficiaries(JSONB) IS
  'Module 4 B1 — Bulk import bénéficiaires (max 500 rows). Skip avec WARNING si email déjà existant (pas de rollback total). Audit beneficiary.bulk_imported.';

-- ---------------------------------------------------------------------------
-- 2. mark_beneficiary_invited — bump invitation_count + audit
-- ---------------------------------------------------------------------------
-- L'envoi du magic link est fait par le Server Action TS via supabase.auth.signInWithOtp().
-- Ce RPC marque juste en DB qu'on a invité.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION mark_beneficiary_invited(p_beneficiary_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id  UUID := current_org_id();
  v_email   TEXT;
BEGIN
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié ou org active manquante';
  END IF;

  IF NOT user_has_permission('beneficiaries.invite') THEN
    RAISE EXCEPTION 'Permission denied : beneficiaries.invite requise';
  END IF;

  UPDATE beneficiaries
     SET invited_at = now(),
         invitation_count = COALESCE(invitation_count, 0) + 1
   WHERE id = p_beneficiary_id AND org_id = v_org_id AND deleted_at IS NULL
   RETURNING email INTO v_email;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Beneficiary % introuvable ou non accessible', p_beneficiary_id;
  END IF;

  INSERT INTO audit_events (org_id, user_id, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id, v_user_id, 'beneficiary.invited', 'BENEFICIARY', p_beneficiary_id,
    jsonb_build_object('email', v_email)
  );

  RETURN p_beneficiary_id;
END $$;

GRANT EXECUTE ON FUNCTION mark_beneficiary_invited(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. link_beneficiary_to_user — appelé par custom_access_token_hook
-- ---------------------------------------------------------------------------
-- Lie automatiquement beneficiaries.user_id au 1er login d'un user dont
-- l'email matche un bénéficiaire. Idempotent (ne réécrase pas).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION link_beneficiary_to_user(p_user_id UUID, p_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL OR p_email IS NULL THEN
    RETURN;
  END IF;

  UPDATE beneficiaries
     SET user_id = p_user_id,
         first_login_at = COALESCE(first_login_at, now())
   WHERE lower(email) = lower(p_email)
     AND user_id IS NULL
     AND deleted_at IS NULL;
END $$;

GRANT EXECUTE ON FUNCTION link_beneficiary_to_user(UUID, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION link_beneficiary_to_user(UUID, TEXT) IS
  'Module 4 B1 — Link beneficiary.user_id au 1er login. Appelé par custom_access_token_hook. Idempotent (ne réécrase pas).';

-- ---------------------------------------------------------------------------
-- 4. Extension du custom_access_token_hook (Module 2)
-- ---------------------------------------------------------------------------
-- On préserve l'intégralité du body Module 2 + on ajoute l'appel à
-- link_beneficiary_to_user à la fin (après set des claims). L'email du user
-- est récupéré via auth.users.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  user_id_param UUID;
  user_email    TEXT;
  new_claims    jsonb;
  new_app_meta  jsonb;
  active_org    UUID;
  all_orgs      UUID[];
  active_roles  TEXT[];
BEGIN
  user_id_param := (event ->> 'user_id')::UUID;
  new_claims    := COALESCE(event -> 'claims', '{}'::jsonb);
  new_app_meta  := COALESCE(new_claims -> 'app_metadata', '{}'::jsonb);

  -- Module 2 : org_id + roles
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

  SELECT array_agg(org_id) INTO all_orgs
    FROM memberships
   WHERE user_id = user_id_param AND status = 'ACTIVE';

  IF active_org IS NOT NULL THEN
    SELECT roles INTO active_roles
      FROM memberships
     WHERE user_id = user_id_param
       AND org_id  = active_org
       AND status  = 'ACTIVE';
  END IF;

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

  -- Module 4 B1 : link beneficiary au 1er login (idempotent — ne fait rien si déjà lié)
  -- Récupère l'email depuis auth.users (le hook reçoit user_id, pas email)
  SELECT email INTO user_email FROM auth.users WHERE id = user_id_param;
  IF user_email IS NOT NULL THEN
    PERFORM link_beneficiary_to_user(user_id_param, user_email);
  END IF;

  RETURN jsonb_build_object('claims', new_claims);
END;
$function$;

COMMENT ON FUNCTION custom_access_token_hook(jsonb) IS
  'Module 2 + Module 4 — Injecte active_org_id, org_ids, active_roles dans app_metadata + lie automatiquement beneficiary.user_id au 1er login.';
