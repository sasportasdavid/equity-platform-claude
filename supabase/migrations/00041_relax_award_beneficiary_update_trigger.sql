-- =============================================================================
-- PR #9 Bug #35 — Relax enforce_award_beneficiary_update trigger
-- =============================================================================
-- Le trigger original (Module 1, migration 00002) gatait l'UPDATE d'un award
-- sur la permission UNIQUE `awards.update`. Conséquence : tout admin qui
-- n'avait PAS cette perm spécifique (APPROVER avec `awards.approve`,
-- MANAGER avec `awards.modify`, etc.) se voyait bloqué dès que l'UPDATE
-- touchait un champ sensible (typiquement `status` lors d'un workflow
-- d'approbation).
--
-- Symptôme rapporté : Bug #34 — APPROVER click "Approuver" → silent fail
-- côté UI car le UPDATE awards.status='APPROVED' déclenché par
-- transitionAward était rejeté par le trigger, et le résultat ignoré
-- dans recordDecisionInternal.
--
-- Nouveau modèle (structurel, pas une whitelist de permissions à
-- maintenir) :
--   1. Bypass si pas de contexte JWT (service_role, Edge Function,
--      SECURITY DEFINER call sans session) — c'est de la défense en
--      profondeur côté DB, le RBAC est déjà appliqué côté Server Action.
--   2. Bypass si auth.uid() est null (cas exceptionnel idem).
--   3. Lookup dans `beneficiaries` : l'user CALLER est-il le bénéficiaire
--      de cet award ? Si NON → c'est un admin/approver/manager → autoriser
--      tout (le RBAC côté Server Action a déjà filtré qui peut quoi).
--   4. Si OUI (user = beneficiary self via Module 8 Beneficiary Portal) :
--      restreindre aux seuls champs qu'un bénéficiaire peut légitimement
--      modifier sur son propre award. V1 : `accepted_at` uniquement.
--
-- Cette logique remplace une whitelist de permissions par une vérification
-- de propriété (ownership) qui ne nécessite pas de maintenance quand on
-- ajoute/retire des permissions admin (awards.approve, .modify, .cancel,
-- .propose, .board.approve, etc.).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_award_beneficiary_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id              UUID;
  v_jwt_claims           TEXT;
  v_is_beneficiary_self  BOOLEAN;
BEGIN
  -- 1. Bypass : pas de contexte JWT (service_role / Edge Function / SQL Editor sans session)
  v_jwt_claims := current_setting('request.jwt.claims', true);
  IF v_jwt_claims IS NULL OR v_jwt_claims = '' OR v_jwt_claims = '{}' THEN
    RETURN NEW;
  END IF;

  -- 2. Bypass : auth.uid() null (cas exceptionnel)
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 3. Lookup ownership : le caller est-il le bénéficiaire de CET award ?
  SELECT EXISTS (
    SELECT 1
      FROM public.beneficiaries
     WHERE id = NEW.beneficiary_id
       AND user_id = v_user_id
  ) INTO v_is_beneficiary_self;

  -- 4a. Pas le bénéficiaire → admin/approver/manager → autoriser
  --     (RBAC déjà appliqué côté Server Action via requirePermission)
  IF NOT v_is_beneficiary_self THEN
    RETURN NEW;
  END IF;

  -- 4b. Bénéficiaire self → restreindre aux champs safe.
  --     V1 = accepted_at est le seul champ qu'un bénéficiaire peut modifier
  --     sur son propre award (Module 8 Beneficiary Portal usage). Tout le
  --     reste = blocage explicite.
  -- NOTE : `units_outstanding` et `total_fair_value` sont des GENERATED
  -- ALWAYS columns. Dans un BEFORE trigger, leur NEW value est NULL alors
  -- que OLD contient la valeur précédente — `IS DISTINCT FROM` retourne
  -- TRUE par construction. On les exclut volontairement de la blacklist
  -- car elles ne sont pas user-modifiables de toute façon.
  IF NEW.units_granted IS DISTINCT FROM OLD.units_granted
     OR NEW.units_vested IS DISTINCT FROM OLD.units_vested
     OR NEW.units_exercised IS DISTINCT FROM OLD.units_exercised
     OR NEW.units_settled IS DISTINCT FROM OLD.units_settled
     OR NEW.units_cancelled IS DISTINCT FROM OLD.units_cancelled
     OR NEW.exercise_price IS DISTINCT FROM OLD.exercise_price
     OR NEW.fair_value_per_unit IS DISTINCT FROM OLD.fair_value_per_unit
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
     OR NEW.beneficiary_id IS DISTINCT FROM OLD.beneficiary_id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.grant_date IS DISTINCT FROM OLD.grant_date
     OR NEW.vesting_start_date IS DISTINCT FROM OLD.vesting_start_date
     OR NEW.expiry_date IS DISTINCT FROM OLD.expiry_date
     OR NEW.acceptance_deadline IS DISTINCT FROM OLD.acceptance_deadline
     OR NEW.award_number IS DISTINCT FROM OLD.award_number
     OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
  THEN
    RAISE EXCEPTION 'Beneficiary can only set accepted_at on their own awards';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_award_beneficiary_update() IS
  'PR #9 Bug #35 : ownership-based check (admin vs beneficiary self) au lieu de la whitelist de permissions awards.update originale (Module 1 00002). Permet désormais à APPROVER/MANAGER/etc de UPDATE awards via leurs Server Actions sans devoir multiplier les CHECK.';
