-- =============================================================================
-- Module 4 — sous-module B1.1 : extend beneficiaries to V1 complet
-- =============================================================================
-- Cf. memory/module_4_b1_recon.md pour les écarts spec vs DB cloud.
--
-- Cette migration :
--   1. ADD COLUMN IF NOT EXISTS pour ~25 nouvelles colonnes (V1 complet)
--   2. Migration des données existantes (status case + tax_resident dérivé)
--   3. CHECK constraint sur status (lowercase)
--   4. 4 indexes
--   5. 3 triggers : audit lifecycle, soft-delete guard, self-update enforcement
--   6. 1 nouvelle RLS policy (beneficiaries_update_self)
--
-- Idempotent : ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
-- DROP TRIGGER IF EXISTS + CREATE, etc.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ADD COLUMN — identité étendue
-- ---------------------------------------------------------------------------
ALTER TABLE beneficiaries
  ADD COLUMN IF NOT EXISTS preferred_name TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT;

-- CHECK séparé pour gender (ALTER + check constraint avec pattern conditionnel
-- — permet NULL et restreint les valeurs sinon)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'beneficiaries_gender_check'
      AND conrelid = 'beneficiaries'::regclass
  ) THEN
    ALTER TABLE beneficiaries
      ADD CONSTRAINT beneficiaries_gender_check
      CHECK (gender IS NULL OR gender IN ('M', 'F', 'X'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. ADD COLUMN — adresse postale structurée (en clair, complète address_encrypted legacy)
-- ---------------------------------------------------------------------------
ALTER TABLE beneficiaries
  ADD COLUMN IF NOT EXISTS address_line_1 TEXT,
  ADD COLUMN IF NOT EXISTS address_line_2 TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'FR';

-- ---------------------------------------------------------------------------
-- 3. ADD COLUMN — fiscalité dérivée (tax_residence_country reste, on ajoute is_tax_resident_france + tax_id)
-- ---------------------------------------------------------------------------
ALTER TABLE beneficiaries
  ADD COLUMN IF NOT EXISTS is_tax_resident_france BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS tax_id TEXT;

-- ---------------------------------------------------------------------------
-- 4. ADD COLUMN — contrat
-- ---------------------------------------------------------------------------
ALTER TABLE beneficiaries
  ADD COLUMN IF NOT EXISTS contract_type TEXT,
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES beneficiaries(id) ON DELETE SET NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'beneficiaries_contract_type_check'
      AND conrelid = 'beneficiaries'::regclass
  ) THEN
    ALTER TABLE beneficiaries
      ADD CONSTRAINT beneficiaries_contract_type_check
      CHECK (
        contract_type IS NULL OR
        contract_type IN ('CDI', 'CDD', 'STAGE', 'ALTERNANCE', 'CONSULTANT', 'MANDATAIRE_SOCIAL', 'AUTRE')
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. ADD COLUMN — banque (pour Module 9 cash-settled)
-- ---------------------------------------------------------------------------
ALTER TABLE beneficiaries
  ADD COLUMN IF NOT EXISTS iban TEXT,
  ADD COLUMN IF NOT EXISTS bic TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_holder_name TEXT;

-- ---------------------------------------------------------------------------
-- 6. ADD COLUMN — invitation
-- ---------------------------------------------------------------------------
ALTER TABLE beneficiaries
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invitation_count INTEGER DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 7. ADD COLUMN — audit lifecycle
-- ---------------------------------------------------------------------------
ALTER TABLE beneficiaries
  ADD COLUMN IF NOT EXISTS lifecycle_changed_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS lifecycle_change_reason TEXT;

-- ---------------------------------------------------------------------------
-- 8. Migration des données existantes — DROP check AVANT UPDATEs
-- ---------------------------------------------------------------------------
-- L'ancien check Module 1 = ('ACTIVE', 'FORMER', 'ARCHIVED'). Il rejette toute
-- valeur lowercase en cours d'UPDATE. On drop d'abord, puis on update, puis on
-- ré-applique le nouveau check Module 4.

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'beneficiaries_status_check'
      AND conrelid = 'beneficiaries'::regclass
  ) THEN
    ALTER TABLE beneficiaries DROP CONSTRAINT beneficiaries_status_check;
  END IF;
END $$;

-- Status migration : ACTIVE→active, ON_LEAVE→on_leave, TERMINATED→terminated.
-- Legacy Module 1 : FORMER/ARCHIVED → terminated (status terminal cohérent).
UPDATE beneficiaries SET status = 'active' WHERE status = 'ACTIVE';
UPDATE beneficiaries SET status = 'on_leave' WHERE status = 'ON_LEAVE';
UPDATE beneficiaries SET status = 'terminated' WHERE status IN ('TERMINATED', 'FORMER', 'ARCHIVED');

-- is_tax_resident_france dérivé de tax_residence_country
UPDATE beneficiaries
   SET is_tax_resident_france = (tax_residence_country = 'FR')
 WHERE is_tax_resident_france IS NULL OR is_tax_resident_france != (tax_residence_country = 'FR');

-- ---------------------------------------------------------------------------
-- 9. Re-CREATE CHECK constraint sur status (Module 4 lowercase enum)
-- ---------------------------------------------------------------------------
ALTER TABLE beneficiaries
  ADD CONSTRAINT beneficiaries_status_check
  CHECK (status IN ('active', 'on_leave', 'terminated'));

-- Update default
ALTER TABLE beneficiaries ALTER COLUMN status SET DEFAULT 'active';

-- ---------------------------------------------------------------------------
-- 10. Indexes (4 nouveaux)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_beneficiaries_status ON beneficiaries(status)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_beneficiaries_tax_resident ON beneficiaries(is_tax_resident_france)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_beneficiaries_manager ON beneficiaries(manager_id);
CREATE INDEX IF NOT EXISTS idx_beneficiaries_contract ON beneficiaries(contract_type)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 11. Trigger — audit lifecycle (BEFORE UPDATE OF status)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION audit_beneficiary_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.lifecycle_changed_at := now();

    INSERT INTO audit_events (org_id, user_id, event_type, resource_type, resource_id, metadata)
    VALUES (
      NEW.org_id,
      auth.uid(),
      'beneficiary.lifecycle_changed',
      'BENEFICIARY',
      NEW.id,
      jsonb_build_object(
        'from', OLD.status,
        'to', NEW.status,
        'reason', NEW.lifecycle_change_reason,
        'termination_date', NEW.termination_date
      )
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_beneficiary_lifecycle ON beneficiaries;
CREATE TRIGGER trg_beneficiary_lifecycle
  BEFORE UPDATE OF status ON beneficiaries
  FOR EACH ROW EXECUTE FUNCTION audit_beneficiary_lifecycle();

-- ---------------------------------------------------------------------------
-- 12. Trigger — empêcher soft-delete si awards actifs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_beneficiary_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_active_count INTEGER;
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    SELECT COUNT(*) INTO v_active_count
      FROM awards
     WHERE beneficiary_id = NEW.id
       AND status NOT IN ('CANCELLED', 'FORFEITED', 'EXPIRED', 'FULLY_EXERCISED')
       AND deleted_at IS NULL;

    IF v_active_count > 0 THEN
      RAISE EXCEPTION
        'Cannot soft-delete beneficiary with % active award(s). Use lifecycle status=''terminated'' instead.',
        v_active_count
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_beneficiary_soft_delete_check ON beneficiaries;
CREATE TRIGGER trg_beneficiary_soft_delete_check
  BEFORE UPDATE OF deleted_at ON beneficiaries
  FOR EACH ROW EXECUTE FUNCTION enforce_beneficiary_soft_delete();

-- ---------------------------------------------------------------------------
-- 13. Trigger — restreindre les colonnes modifiables par le bénéficiaire lui-même
-- ---------------------------------------------------------------------------
-- Si l'acteur n'a PAS la permission `beneficiaries.update`, il agit en tant que
-- bénéficiaire sur son propre row. On limite à quelques champs perso.
CREATE OR REPLACE FUNCTION enforce_beneficiary_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Skip si l'acteur a la permission admin (update full)
  IF user_has_permission('beneficiaries.update') THEN
    RETURN NEW;
  END IF;

  -- Sinon : seuls quelques champs sont modifiables par le bénéficiaire
  IF NEW.status IS DISTINCT FROM OLD.status
    OR NEW.org_id IS DISTINCT FROM OLD.org_id
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.beneficiary_type IS DISTINCT FROM OLD.beneficiary_type
    OR NEW.contract_type IS DISTINCT FROM OLD.contract_type
    OR NEW.tax_residence_country IS DISTINCT FROM OLD.tax_residence_country
    OR NEW.is_tax_resident_france IS DISTINCT FROM OLD.is_tax_resident_france
    OR NEW.hire_date IS DISTINCT FROM OLD.hire_date
    OR NEW.termination_date IS DISTINCT FROM OLD.termination_date
    OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
  THEN
    RAISE EXCEPTION
      'Beneficiary can only update personal details (name, phone, address, banking)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_beneficiary_self_update ON beneficiaries;
CREATE TRIGGER trg_beneficiary_self_update
  BEFORE UPDATE ON beneficiaries
  FOR EACH ROW EXECUTE FUNCTION enforce_beneficiary_self_update();

-- ---------------------------------------------------------------------------
-- 14. RLS — policy pour bénéficiaire UPDATE son propre row
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS beneficiaries_update_self ON beneficiaries;
CREATE POLICY beneficiaries_update_self ON beneficiaries
  FOR UPDATE
  USING (user_id = auth.uid() AND deleted_at IS NULL);

COMMENT ON COLUMN beneficiaries.status IS
  'Module 4 lifecycle : active / on_leave / terminated. Migré depuis ACTIVE majuscule.';
COMMENT ON COLUMN beneficiaries.is_tax_resident_france IS
  'Dérivé de tax_residence_country = ''FR''. Module 4.';
COMMENT ON COLUMN beneficiaries.iban IS
  'V1 stocké en clair. À chiffrer via vault en V2 (Module 9 ou 11).';
