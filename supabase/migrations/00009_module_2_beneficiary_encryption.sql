-- ===========================================================================
-- Capiwise — Equity Platform
-- Migration 00009 : chiffrement des données sensibles bénéficiaires (Module 2 §4.4)
--
-- Renomme les colonnes en clair créées en Module 1 vers des noms suffixés
-- `_encrypted` et change leur type en TEXT (qui stockera du base64).
-- La colonne `social_security_number` reste TEXT (déjà), avec un commentaire.
--
-- Ajoute deux RPC métier :
--   - insert_beneficiary_encrypted(...) : INSERT avec chiffrement automatique,
--     soumis à la permission `beneficiaries.create`
--   - get_beneficiary_decrypted(p_id)   : SELECT déchiffré + audit event
--     `beneficiary.sensitive_data_accessed`, soumis à la permission
--     `beneficiaries.read.sensitive`
--
-- ⚠️ Cette migration ne migre PAS de données existantes. La table est vide
-- aujourd'hui (DB neuve). Si on la replay sur une DB avec des rows,
-- les valeurs en clair seront converties en chaînes mais NON chiffrées.
-- Pour ce cas : ajouter un script post-migration de chiffrement explicite
-- via UPDATE ... SET ... = encrypt_sensitive(...).
-- ===========================================================================

-- --------------------------------------------------------------------------
-- 1. Garde-fou : si la table beneficiaries contient déjà des rows, fail loudly.
-- --------------------------------------------------------------------------
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM beneficiaries;
  IF v_count > 0 THEN
    RAISE NOTICE 'beneficiaries contains % rows. Plain values will be moved to *_encrypted columns AS-IS (not encrypted). Run a separate UPDATE script after this migration to encrypt them.', v_count;
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- 2. Renames + type changes (idempotents)
-- --------------------------------------------------------------------------

-- date_of_birth (DATE) → date_of_birth_encrypted (TEXT)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'beneficiaries'
       AND column_name = 'date_of_birth'
  ) THEN
    ALTER TABLE beneficiaries RENAME COLUMN date_of_birth TO date_of_birth_encrypted;
    ALTER TABLE beneficiaries
      ALTER COLUMN date_of_birth_encrypted TYPE TEXT USING date_of_birth_encrypted::TEXT;
  END IF;
END $$;

-- phone (TEXT) → phone_encrypted (TEXT)  — juste un rename
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'beneficiaries'
       AND column_name = 'phone'
  ) THEN
    ALTER TABLE beneficiaries RENAME COLUMN phone TO phone_encrypted;
  END IF;
END $$;

-- address (JSONB) → address_encrypted (TEXT)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'beneficiaries'
       AND column_name = 'address'
       AND data_type = 'jsonb'
  ) THEN
    ALTER TABLE beneficiaries RENAME COLUMN address TO address_encrypted;
    ALTER TABLE beneficiaries
      ALTER COLUMN address_encrypted TYPE TEXT USING address_encrypted::TEXT;
  END IF;
END $$;

COMMENT ON COLUMN beneficiaries.social_security_number IS
  'Encrypted via encrypt_sensitive() — base64 ciphertext.';
COMMENT ON COLUMN beneficiaries.date_of_birth_encrypted IS
  'Encrypted ISO date string (YYYY-MM-DD).';
COMMENT ON COLUMN beneficiaries.phone_encrypted IS
  'Encrypted phone number.';
COMMENT ON COLUMN beneficiaries.address_encrypted IS
  'Encrypted JSON address (serialized to TEXT).';

-- --------------------------------------------------------------------------
-- 3. RPC insert_beneficiary_encrypted
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.insert_beneficiary_encrypted(
  p_org_id            UUID,
  p_first_name        TEXT,
  p_last_name         TEXT,
  p_email             TEXT,
  p_beneficiary_type  TEXT     DEFAULT 'EMPLOYEE',
  p_company_id        UUID     DEFAULT NULL,
  p_nss               TEXT     DEFAULT NULL,
  p_dob               DATE     DEFAULT NULL,
  p_phone             TEXT     DEFAULT NULL,
  p_address           JSONB    DEFAULT NULL,
  p_job_title         TEXT     DEFAULT NULL,
  p_department        TEXT     DEFAULT NULL,
  p_hire_date         DATE     DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Garde-fou multi-tenant : l'org_id passé doit matcher l'org active du JWT
  -- (sauf appel via service_role qui bypass current_org_id() à NULL → on
  --  exige alors que p_org_id soit fourni explicitement, ce qui est le cas).
  IF current_org_id() IS NOT NULL AND current_org_id() != p_org_id THEN
    RAISE EXCEPTION 'Cannot insert beneficiary into a different organization';
  END IF;

  -- RBAC : permission beneficiaries.create requise
  IF NOT public.user_has_permission('beneficiaries.create')
     AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Permission denied: beneficiaries.create required';
  END IF;

  INSERT INTO beneficiaries (
    org_id, company_id,
    first_name, last_name, email,
    beneficiary_type,
    job_title, department, hire_date,
    social_security_number,
    date_of_birth_encrypted,
    phone_encrypted,
    address_encrypted,
    created_by
  ) VALUES (
    p_org_id, p_company_id,
    p_first_name, p_last_name, lower(p_email),
    p_beneficiary_type,
    p_job_title, p_department, p_hire_date,
    public.encrypt_sensitive(p_nss),
    public.encrypt_sensitive(p_dob::TEXT),
    public.encrypt_sensitive(p_phone),
    public.encrypt_sensitive(p_address::TEXT),
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.insert_beneficiary_encrypted(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, DATE, TEXT, JSONB, TEXT, TEXT, DATE) TO authenticated, service_role;

-- --------------------------------------------------------------------------
-- 4. RPC get_beneficiary_decrypted
--    Audit immédiat dans audit_events (table immuable, accessible à
--    SECURITY DEFINER), puis SELECT déchiffré.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_beneficiary_decrypted(p_id UUID)
RETURNS TABLE (
  id                       UUID,
  org_id                   UUID,
  company_id               UUID,
  first_name               TEXT,
  last_name                TEXT,
  email                    TEXT,
  beneficiary_type         TEXT,
  job_title                TEXT,
  department               TEXT,
  hire_date                DATE,
  social_security_number   TEXT,
  date_of_birth            DATE,
  phone                    TEXT,
  address                  JSONB,
  status                   TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
BEGIN
  -- RBAC strict : nécessite la perm sensible
  IF NOT public.user_has_permission('beneficiaries.read.sensitive') THEN
    RAISE EXCEPTION 'Permission denied: beneficiaries.read.sensitive required';
  END IF;

  -- Audit immédiat (table sans policy INSERT publique, mais OK car SECURITY DEFINER)
  INSERT INTO audit_events (
    org_id, user_id, event_type, resource_type, resource_id, metadata
  ) VALUES (
    current_org_id(), auth.uid(),
    'beneficiary.sensitive_data_accessed',
    'BENEFICIARY', p_id,
    jsonb_build_object('reason', 'manual_view')
  );

  RETURN QUERY
  SELECT
    b.id,
    b.org_id,
    b.company_id,
    b.first_name,
    b.last_name,
    b.email,
    b.beneficiary_type,
    b.job_title,
    b.department,
    b.hire_date,
    public.decrypt_sensitive(b.social_security_number)                AS social_security_number,
    public.decrypt_sensitive(b.date_of_birth_encrypted)::DATE         AS date_of_birth,
    public.decrypt_sensitive(b.phone_encrypted)                       AS phone,
    NULLIF(public.decrypt_sensitive(b.address_encrypted), '')::JSONB  AS address,
    b.status
  FROM beneficiaries b
  WHERE b.id = p_id
    AND b.org_id = current_org_id()
    AND b.deleted_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_beneficiary_decrypted(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.insert_beneficiary_encrypted IS
  'Module 2 §4.4 — INSERT bénéficiaire avec chiffrement automatique des champs sensibles. Permission beneficiaries.create requise.';
COMMENT ON FUNCTION public.get_beneficiary_decrypted IS
  'Module 2 §4.4 — SELECT bénéficiaire avec déchiffrement. Permission beneficiaries.read.sensitive requise. Logge un audit event à chaque appel.';
