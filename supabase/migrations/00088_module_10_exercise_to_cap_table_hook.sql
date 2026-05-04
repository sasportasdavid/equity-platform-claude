-- =============================================================================
-- Module 10 B1 — Migration 00088 : hook exercise → cap_table
-- =============================================================================
--
-- Trigger AFTER UPDATE exercise_requests : quand status passe à COMPLETED,
-- créer la position dans cap_table_positions (source EXERCISE_EMISSION).
--
-- Reference : docs/MODULE_10_CAP_TABLE.md §2.9
--
-- ⚠️ Erratum spec : la spec utilise NEW.status = 'FULLY_PAID' or l'enum
-- réel exercise_requests est 'PENDING / APPROVED / SIGNED / COMPLETED /
-- REJECTED / CANCELLED' (cf migration 00056). Status terminal de paiement
-- = 'COMPLETED'. Corrigé ici.
--
-- ⚠️ Piège #1 du chat user : si share_classes COMMON absente, le hook
-- doit logger un WARNING + RETURN NEW (pas RAISE EXCEPTION) — sinon il
-- casse le flux Module 9 en cloud. Tested explicitement.
-- =============================================================================

CREATE OR REPLACE FUNCTION on_exercise_payment_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_award RECORD;
  v_common_class_id UUID;
  v_beneficiary_name TEXT;
BEGIN
  -- Trigger uniquement sur transition COMPLETED (pas idempotent — plusieurs
  -- updates COMPLETED → COMPLETED ne créent pas de doublon car OLD.status
  -- est déjà COMPLETED → IF false).
  IF NEW.status = 'COMPLETED' AND COALESCE(OLD.status, '') != 'COMPLETED' THEN

    -- Charger l'award + plan + org
    SELECT a.id AS award_id, a.beneficiary_id, a.org_id
    INTO v_award
    FROM awards a
    WHERE a.id = NEW.award_id;

    IF v_award IS NULL THEN
      RAISE WARNING 'Module 10 hook: award % not found for exercise %, skipping cap_table emission',
        NEW.award_id, NEW.id;
      RETURN NEW;
    END IF;

    -- Trouver la COMMON class de l'org
    SELECT id INTO v_common_class_id
    FROM share_classes
    WHERE org_id = v_award.org_id
      AND class_type = 'COMMON'
      AND is_active = TRUE
    ORDER BY created_at ASC
    LIMIT 1;

    -- ⚠️ Piège #1 : si pas de COMMON class, log warning + RETURN NEW
    -- (ne PAS raise — sinon casse le flux Module 9)
    IF v_common_class_id IS NULL THEN
      RAISE WARNING 'Module 10 hook: no COMMON share_class for org %, exercise emission skipped (exercise_id=%, award_id=%)',
        v_award.org_id, NEW.id, NEW.award_id;
      RETURN NEW;
    END IF;

    -- Charger le nom du bénéficiaire pour la dénormalisation
    SELECT COALESCE(b.first_name || ' ' || b.last_name, 'Beneficiary')
    INTO v_beneficiary_name
    FROM beneficiaries b
    WHERE b.id = v_award.beneficiary_id;

    -- Émission de la position
    INSERT INTO cap_table_positions (
      org_id, stakeholder_type, stakeholder_id, stakeholder_name,
      share_class_id, units, source, source_id,
      acquired_at, cost_basis_per_unit, created_by
    ) VALUES (
      v_award.org_id,
      'BENEFICIARY',
      v_award.beneficiary_id,
      v_beneficiary_name,
      v_common_class_id,
      NEW.units_to_exercise::numeric,
      'EXERCISE_EMISSION',
      NEW.id,
      CURRENT_DATE,
      NEW.exercise_price_per_unit,
      auth.uid()
    );

    -- Audit event
    INSERT INTO audit_events (org_id, user_id, event_type, resource_type, resource_id, metadata)
    VALUES (
      v_award.org_id,
      auth.uid(),
      'cap_table.position_emitted',
      'exercise_requests',
      NEW.id,
      jsonb_build_object(
        'units', NEW.units_to_exercise,
        'beneficiary_id', v_award.beneficiary_id,
        'award_id', v_award.award_id,
        'share_class_id', v_common_class_id,
        'source', 'EXERCISE_EMISSION'
      )
    );
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trigger_exercise_to_cap_table ON exercise_requests;
CREATE TRIGGER trigger_exercise_to_cap_table
  AFTER UPDATE ON exercise_requests
  FOR EACH ROW
  EXECUTE FUNCTION on_exercise_payment_confirmed();

COMMENT ON FUNCTION on_exercise_payment_confirmed IS
  'Module 10 B1 — Hook exercise_requests.status = COMPLETED → INSERT cap_table_positions (EXERCISE_EMISSION). Pas RAISE si pas de COMMON class (warn + skip pour ne pas casser Module 9). Pas SECURITY DEFINER (trigger se rattache au caller du UPDATE — qui a déjà la permission via Module 9).';
