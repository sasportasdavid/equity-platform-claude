-- Module 8 B2 — RPC self-update du téléphone bénéficiaire (chiffré)
--
-- Le portail bénéficiaire doit pouvoir mettre à jour son propre numéro de
-- téléphone pendant l'onboarding (étape 2). La colonne `phone_encrypted` est
-- chiffrée via `encrypt_sensitive()` (helper Module 4 + Vault).
--
-- Le trigger `enforce_beneficiary_self_update` n'inclut PAS phone_encrypted
-- dans sa blacklist, donc un UPDATE direct serait techniquement autorisé,
-- MAIS il faudrait que le caller dispose de la clé Vault pour appeler
-- `encrypt_sensitive()`. Cette RPC SECURITY DEFINER encapsule l'opération
-- pour que le bénéficiaire authentifié puisse mettre à jour son phone sans
-- exposer la clé.
--
-- Sécurité :
--   - SECURITY DEFINER (peut lire la clé Vault)
--   - check `auth.uid()` IS NOT NULL
--   - check ownership : un user ne peut mettre à jour QUE son propre phone
--     (resolution beneficiaries.user_id = auth.uid())
--   - p_phone NULL/empty → set phone_encrypted = NULL (suppression)

CREATE OR REPLACE FUNCTION update_beneficiary_self_phone(p_phone TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_beneficiary_id UUID;
  v_encrypted TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Find own beneficiary record
  SELECT id INTO v_beneficiary_id
    FROM beneficiaries
   WHERE user_id = v_user_id
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_beneficiary_id IS NULL THEN
    RAISE EXCEPTION 'No beneficiary record found for current user';
  END IF;

  -- Encrypt (returns NULL si plaintext is NULL or empty)
  v_encrypted := public.encrypt_sensitive(NULLIF(TRIM(p_phone), ''));

  UPDATE beneficiaries
     SET phone_encrypted = v_encrypted,
         updated_at = NOW()
   WHERE id = v_beneficiary_id;
END $$;

GRANT EXECUTE ON FUNCTION update_beneficiary_self_phone(TEXT) TO authenticated;
