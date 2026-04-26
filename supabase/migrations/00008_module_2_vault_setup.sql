-- ===========================================================================
-- Capiwise — Equity Platform
-- Migration 00008 : Supabase Vault — clé + helpers de chiffrement (Module 2 §4)
--
-- Vault (extension `supabase_vault` schema `vault`) est déjà installé sur
-- l'instance prod (vérifié via list_extensions). On crée :
--   1. Une clé `beneficiary_encryption_key` (256 bits aléatoires)
--      stockée chiffrée dans vault.secrets, déchiffrée à la volée via
--      vault.decrypted_secrets
--   2. encrypt_sensitive(plaintext) → base64(pgp_sym_encrypt(...))
--   3. decrypt_sensitive(ciphertext) → texte original (NULL si erreur)
--
-- Les fonctions sont SECURITY DEFINER avec search_path explicit (public,
-- vault, extensions) pour que pgp_sym_encrypt/decrypt (dans `extensions`)
-- et vault.decrypted_secrets soient résolues correctement.
--
-- ⚠️ IMPORTANT — perte de la clé Vault = données chiffrées irrécupérables.
-- Procédure de backup : voir Module 2 §4.7 (à documenter).
-- ===========================================================================

-- --------------------------------------------------------------------------
-- 1. Création idempotente de la clé Vault
-- --------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.secrets WHERE name = 'beneficiary_encryption_key'
  ) THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'beneficiary_encryption_key',
      'Capiwise — clé symétrique AES-256 pour chiffrer les données sensibles bénéficiaires (NSS, DOB, téléphone, adresse). Module 2 §4.2.'
    );
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- 2. encrypt_sensitive(plaintext)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.encrypt_sensitive(plaintext TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  v_key TEXT;
BEGIN
  IF plaintext IS NULL OR plaintext = '' THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'beneficiary_encryption_key'
   LIMIT 1;

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Encryption key beneficiary_encryption_key not found in Vault';
  END IF;

  RETURN encode(
    pgp_sym_encrypt(plaintext, v_key, 'cipher-algo=aes256'),
    'base64'
  );
END;
$$;

-- --------------------------------------------------------------------------
-- 3. decrypt_sensitive(ciphertext)
--    Retourne NULL si l'entrée est vide OU si le déchiffrement échoue
--    (clé tournée, données corrompues). Ne lève jamais d'exception
--    pour ne pas casser un SELECT qui touche plusieurs lignes.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decrypt_sensitive(ciphertext TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault, extensions
AS $$
DECLARE
  v_key TEXT;
BEGIN
  IF ciphertext IS NULL OR ciphertext = '' THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
   WHERE name = 'beneficiary_encryption_key'
   LIMIT 1;

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Encryption key beneficiary_encryption_key not found in Vault';
  END IF;

  RETURN pgp_sym_decrypt(decode(ciphertext, 'base64'), v_key);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- --------------------------------------------------------------------------
-- 4. Permissions d'exécution
-- --------------------------------------------------------------------------
-- encrypt/decrypt ne doivent JAMAIS être appelables depuis un client
-- (anon ou authenticated). On laisse uniquement service_role + l'usage
-- via les RPC métier (insert_beneficiary_encrypted, get_beneficiary_decrypted)
-- qui seront créées en migration 00009.
REVOKE EXECUTE ON FUNCTION public.encrypt_sensitive(TEXT) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.decrypt_sensitive(TEXT) FROM authenticated, anon, public;

GRANT EXECUTE ON FUNCTION public.encrypt_sensitive(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_sensitive(TEXT) TO service_role;

COMMENT ON FUNCTION public.encrypt_sensitive(TEXT) IS
  'Module 2 §4.3 — chiffre AES-256 via Vault. Service_role only.';
COMMENT ON FUNCTION public.decrypt_sensitive(TEXT) IS
  'Module 2 §4.3 — déchiffre AES-256 via Vault. Service_role only. Renvoie NULL en cas d''erreur (clé tournée, données corrompues).';
