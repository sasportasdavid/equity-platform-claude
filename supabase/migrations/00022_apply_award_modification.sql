-- =============================================================================
-- Module 3b — sous-module B6 : RPC apply_award_modification (IFRS 2.27-28)
-- =============================================================================
--
-- 1 RPC SECURITY DEFINER qui encapsule l'application atomique d'une
-- modification post-grant sur un award. 5 types supportés :
--
--   REPRICING        : changement du strike (exercise_price)
--   EXTENSION        : extension de la fenêtre d'exercice (expiry_date)
--   ACCELERATION     : vesting accéléré de toutes les tranches PENDING
--   ADDITIONAL_GRANT : ajout d'units à l'award (units_granted +=)
--   CANCELLATION     : annulation post-grant (status='CANCELLED',
--                      units_cancelled = units_outstanding pré-update)
--
-- Pour les 4 premiers types : un valuation_run en QUEUED est inséré
-- (le moteur Python le pickera pour calculer le fair value incrémental).
-- Pour CANCELLATION : pas de valuation_run (la charge IFRS 2 restante est
-- comptabilisée immédiatement, calcul Module 11).
--
-- Atomicité : tout est dans la transaction implicite de la function.
-- Si UNE étape échoue, ROLLBACK total.
--
-- Pré-conditions :
--   - User authentifié + org active
--   - Permission `awards.modify`
--   - Award status post-GRANTED (les modifs pré-GRANTED passent par
--     updateAwardDraft, pas par cette RPC)
--   - Award pas déjà CANCELLED/EXPIRED/FORFEITED
--
-- Limitations V1 (à raffiner Module 11) :
--   - ACCELERATION : seulement "all PENDING tranches" (pas de mode
--     tranches spécifiques)
--   - ADDITIONAL_GRANT : bump units_granted, mais pas de matérialisation
--     automatique des nouveaux vesting_events (TODO Module 9)
-- =============================================================================

CREATE OR REPLACE FUNCTION apply_award_modification(
  p_award_id          UUID,
  p_modification_type TEXT,
  p_changes           JSONB,
  p_reason            TEXT,
  p_effective_date    DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id          UUID := auth.uid();
  v_org_id           UUID := current_org_id();
  v_award            awards%ROWTYPE;
  v_before           JSONB;
  v_after            JSONB;
  v_modification_id  UUID;
  v_valuation_run_id UUID;
  v_requires_reval   BOOLEAN := p_modification_type IN
    ('REPRICING', 'EXTENSION', 'ACCELERATION', 'ADDITIONAL_GRANT');
  v_units_added      BIGINT;
  v_pool_remaining   BIGINT;
  v_new_strike       NUMERIC;
  v_new_expiry       DATE;
  v_accelerated      INTEGER;
BEGIN
  -- Auth + org + permission
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié ou org active manquante';
  END IF;

  IF NOT user_has_permission('awards.modify') THEN
    RAISE EXCEPTION 'Permission denied : awards.modify requise';
  END IF;

  IF p_modification_type NOT IN
    ('REPRICING', 'EXTENSION', 'ACCELERATION', 'ADDITIONAL_GRANT', 'CANCELLATION') THEN
    RAISE EXCEPTION 'Type modification invalide : %', p_modification_type;
  END IF;

  -- Lock + load award
  SELECT * INTO v_award
    FROM awards
    WHERE id = p_award_id AND org_id = v_org_id AND deleted_at IS NULL
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award introuvable ou non accessible : %', p_award_id;
  END IF;

  -- Pré-conditions sur le statut
  IF v_award.status IN ('DRAFT', 'PROPOSED', 'PENDING_APPROVAL', 'APPROVED',
                         'PENDING_BOARD', 'BOARD_APPROVED', 'PENDING_SIGNATURE') THEN
    RAISE EXCEPTION
      'Award status % : modification IFRS 2 non applicable (utilisez updateAwardDraft pré-GRANTED)',
      v_award.status;
  END IF;

  IF v_award.status IN ('CANCELLED', 'EXPIRED', 'FORFEITED') THEN
    RAISE EXCEPTION 'Award status % : modification non possible sur award terminé', v_award.status;
  END IF;

  -- Snapshot before (à figer AVANT l'update)
  v_before := to_jsonb(v_award);

  -- Dispatch sur le type
  CASE p_modification_type

    WHEN 'REPRICING' THEN
      v_new_strike := (p_changes->>'exercisePrice')::NUMERIC;
      IF v_new_strike IS NULL OR v_new_strike < 0 THEN
        RAISE EXCEPTION 'REPRICING : exercisePrice (numeric ≥ 0) requis dans changes';
      END IF;
      UPDATE awards SET exercise_price = v_new_strike, updated_at = now()
        WHERE id = p_award_id;

    WHEN 'EXTENSION' THEN
      v_new_expiry := (p_changes->>'expiryDate')::DATE;
      IF v_new_expiry IS NULL THEN
        RAISE EXCEPTION 'EXTENSION : expiryDate (YYYY-MM-DD) requise dans changes';
      END IF;
      IF v_award.expiry_date IS NOT NULL AND v_new_expiry <= v_award.expiry_date THEN
        RAISE EXCEPTION 'EXTENSION : nouvelle expiry_date doit être > ancienne (% > %)',
          v_new_expiry, v_award.expiry_date;
      END IF;
      UPDATE awards SET expiry_date = v_new_expiry, updated_at = now()
        WHERE id = p_award_id;

    WHEN 'ACCELERATION' THEN
      -- Force VESTED toutes les tranches PENDING de l'award
      UPDATE vesting_events
        SET status = 'ACCELERATED',
            effective_date = p_effective_date,
            units_vested = units_to_vest
        WHERE award_id = p_award_id AND status = 'PENDING';
      GET DIAGNOSTICS v_accelerated = ROW_COUNT;

      -- Recompute units_vested = SUM des units_to_vest sur tranches VESTED/ACCELERATED
      UPDATE awards SET
        units_vested = (
          SELECT COALESCE(SUM(units_to_vest), 0)::BIGINT
            FROM vesting_events
            WHERE award_id = p_award_id
              AND status IN ('VESTED', 'ACCELERATED')
        ),
        status = CASE
          WHEN units_granted = (
            SELECT COALESCE(SUM(units_to_vest), 0)::BIGINT
              FROM vesting_events
              WHERE award_id = p_award_id
                AND status IN ('VESTED', 'ACCELERATED')
          ) THEN 'FULLY_VESTED'
          ELSE 'PARTIALLY_VESTED'
        END,
        updated_at = now()
      WHERE id = p_award_id;

    WHEN 'ADDITIONAL_GRANT' THEN
      v_units_added := (p_changes->>'unitsAdded')::BIGINT;
      IF v_units_added IS NULL OR v_units_added <= 0 THEN
        RAISE EXCEPTION 'ADDITIONAL_GRANT : unitsAdded (BIGINT > 0) requis dans changes';
      END IF;

      -- Vérifier le pool restant
      SELECT (pool_size - pool_allocated) INTO v_pool_remaining
        FROM plans WHERE id = v_award.plan_id;
      IF v_pool_remaining < v_units_added THEN
        RAISE EXCEPTION 'ADDITIONAL_GRANT : pool insuffisant (restant=% < demandé=%)',
          v_pool_remaining, v_units_added;
      END IF;

      UPDATE awards SET
        units_granted = units_granted + v_units_added,
        updated_at = now()
      WHERE id = p_award_id;

      -- NOTE V1 : pas de matérialisation des nouveaux vesting_events ici.
      -- À faire en Module 9 (exercise lifecycle) ou via un materialize_vesting_events
      -- étendu qui sait gérer les ADDITIONAL_GRANT.

    WHEN 'CANCELLATION' THEN
      -- Comptabilise units_outstanding restantes en cancelled, marque CANCELLED.
      -- units_outstanding est GENERATED, on ne peut pas l'écrire directement —
      -- on bump units_cancelled de la diff.
      UPDATE awards SET
        units_cancelled = units_cancelled + v_award.units_outstanding,
        status = 'CANCELLED',
        cancelled_at = now(),
        cancellation_reason = COALESCE(p_reason, 'IFRS 2 cancellation post-grant'),
        updated_at = now()
      WHERE id = p_award_id;

  END CASE;

  -- Snapshot after (re-SELECT pour avoir l'état post-update)
  SELECT to_jsonb(a.*) INTO v_after FROM awards a WHERE a.id = p_award_id;

  -- Insert award_modifications
  INSERT INTO award_modifications (
    org_id, award_id, modification_type, effective_date,
    before_snapshot, after_snapshot, reason, approved_by, approved_at
  ) VALUES (
    v_org_id, p_award_id, p_modification_type, p_effective_date,
    v_before, v_after, p_reason, v_user_id, now()
  )
  RETURNING id INTO v_modification_id;

  -- Flag has_modifications
  UPDATE awards SET has_modifications = true WHERE id = p_award_id;

  -- Trigger valuation_run si applicable
  IF v_requires_reval THEN
    INSERT INTO valuation_runs (org_id, triggered_by, status, parameters)
    VALUES (
      v_org_id, v_user_id, 'QUEUED',
      jsonb_build_object(
        'plan_id', v_award.plan_id,
        'award_id', p_award_id,
        'modification_id', v_modification_id,
        'modification_type', p_modification_type,
        'reason', 'ifrs2_modification_revaluation'
      )
    )
    RETURNING id INTO v_valuation_run_id;
  END IF;

  -- Audit
  INSERT INTO audit_events (org_id, user_id, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id, v_user_id, 'award.modified', 'AWARD', p_award_id,
    jsonb_build_object(
      'modification_id', v_modification_id,
      'modification_type', p_modification_type,
      'changes', p_changes,
      'reason', p_reason,
      'effective_date', p_effective_date,
      'valuation_run_id', v_valuation_run_id,
      'requires_revaluation', v_requires_reval
    )
  );

  RETURN jsonb_build_object(
    'modification_id', v_modification_id,
    'valuation_run_id', v_valuation_run_id
  );
END $$;

GRANT EXECUTE ON FUNCTION apply_award_modification(UUID, TEXT, JSONB, TEXT, DATE) TO authenticated;

COMMENT ON FUNCTION apply_award_modification(UUID, TEXT, JSONB, TEXT, DATE) IS
  'Module 3b B6 — Applique atomiquement une modification IFRS 2.27-28 sur un award post-GRANTED. 5 types : REPRICING / EXTENSION / ACCELERATION / ADDITIONAL_GRANT / CANCELLATION. Insère award_modifications + valuation_run (sauf CANCELLATION) + audit_event.';
