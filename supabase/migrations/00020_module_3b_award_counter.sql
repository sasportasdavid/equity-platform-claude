-- =============================================================================
-- Module 3b — sous-module B1.1 : compteur AWD-YYYY-NNNN + triggers awards
-- =============================================================================
--
-- Crée :
--   1. Table `award_number_counters` (1 row par org) — atomicité via
--      PRIMARY KEY org_id + INSERT ON CONFLICT
--   2. RPC `next_award_number(p_org_id)` — atomique, reset annuel auto
--   3. Colonne `plans.locked_at` (ALTER ADD IF NOT EXISTS)
--   4. Trigger `lock_plan_on_award_proposal()` + `trg_award_lock_plan`
--      → lock le plan dès qu'un award passe en PROPOSED+
--   5. Trigger `enforce_award_pool_consistency()` + `trg_award_pool_check`
--      → refuse award qui dépasse pool (sauf DRAFT et CANCELLED/FORFEITED)
--
-- Convention numérotation : AWD-{year}-{NNNN} (4 chiffres, lpad zero).
-- Reset annuel : si current_year change, le compteur repart à 1 pour
-- l'année courante. Conséquence : un award en 2027 sera AWD-2027-0001
-- même si 2026 a fini à AWD-2026-9999.
--
-- Cf. recon B1 : memory/module_3b_b1_recon.md.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table compteur per-org
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS award_number_counters (
  org_id        UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  current_year  INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now())::INTEGER,
  current_seq   INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE award_number_counters ENABLE ROW LEVEL SECURITY;

-- Lecture restreinte à l'org active (cohérence ; en pratique le user
-- ne lit jamais ce compteur directement, c'est la RPC qui le manipule
-- via SECURITY DEFINER).
DROP POLICY IF EXISTS award_number_counters_select ON award_number_counters;
CREATE POLICY award_number_counters_select ON award_number_counters
  FOR SELECT USING (org_id = current_org_id());

-- Pas de policy INSERT/UPDATE/DELETE — seul `next_award_number()` (DEFINER)
-- écrit. Toute écriture user-side est bloquée par RLS.

COMMENT ON TABLE award_number_counters IS
  'Module 3b B1 — compteur per-org pour numérotation atomique AWD-YYYY-NNNN. Manipulé exclusivement par next_award_number().';

-- ---------------------------------------------------------------------------
-- 2. RPC next_award_number — atomique avec UPSERT
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION next_award_number(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
  v_seq  INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id requis';
  END IF;

  -- INSERT atomique avec reset annuel sur ON CONFLICT.
  INSERT INTO award_number_counters (org_id, current_year, current_seq)
  VALUES (p_org_id, v_year, 1)
  ON CONFLICT (org_id) DO UPDATE
    SET current_year = v_year,
        current_seq  = CASE
          WHEN award_number_counters.current_year = v_year
            THEN award_number_counters.current_seq + 1
          ELSE 1
        END,
        updated_at   = now()
  RETURNING current_seq INTO v_seq;

  RETURN format('AWD-%s-%s', v_year, lpad(v_seq::TEXT, 4, '0'));
END $$;

GRANT EXECUTE ON FUNCTION next_award_number(UUID) TO authenticated;

COMMENT ON FUNCTION next_award_number(UUID) IS
  'Module 3b B1 — Génère un award_number atomique au format AWD-YYYY-NNNN. Reset annuel automatique. Cf. server/actions/awards.ts (à venir B2).';

-- ---------------------------------------------------------------------------
-- 3. plans.locked_at (utilisé par le trigger lock + audit IFRS 2)
-- ---------------------------------------------------------------------------

ALTER TABLE plans ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

COMMENT ON COLUMN plans.locked_at IS
  'Module 3b B1 — Timestamp du verrouillage du plan (premier award PROPOSED+ ou lockPlan() manuel). NULL si is_locked=false.';

-- ---------------------------------------------------------------------------
-- 4. Trigger lock_plan_on_award_proposal
-- ---------------------------------------------------------------------------
-- Quand un award passe DRAFT/CANCELLED → autre status, on lock le plan
-- parent. Garantit qu'un plan ne peut plus être édité dès qu'un award est
-- en circuit d'approbation.

CREATE OR REPLACE FUNCTION lock_plan_on_award_proposal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Si le NEW.status passe à PROPOSED ou plus avancé (= sort de DRAFT/CANCELLED)
  IF NEW.status NOT IN ('DRAFT', 'CANCELLED')
     AND (OLD.status IS NULL OR OLD.status IN ('DRAFT', 'CANCELLED'))
  THEN
    UPDATE plans
       SET is_locked = true,
           locked_at = COALESCE(locked_at, now()),
           updated_at = now()
     WHERE id = NEW.plan_id
       AND is_locked = false;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_award_lock_plan ON awards;
CREATE TRIGGER trg_award_lock_plan
  AFTER INSERT OR UPDATE OF status ON awards
  FOR EACH ROW EXECUTE FUNCTION lock_plan_on_award_proposal();

COMMENT ON FUNCTION lock_plan_on_award_proposal() IS
  'Module 3b B1 — Trigger AFTER awards : lock le plan parent dès qu''un award sort de DRAFT/CANCELLED. Garantit l''immutabilité structurelle pour audit IFRS 2.';

-- ---------------------------------------------------------------------------
-- 5. Trigger enforce_award_pool_consistency
-- ---------------------------------------------------------------------------
-- Vérifie qu'un award ne dépasse pas le pool restant du plan. Skip pour
-- DRAFT (l'utilisateur peut saisir librement) ; le check kick au PROPOSED.

CREATE OR REPLACE FUNCTION enforce_award_pool_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_pool_size     BIGINT;
  v_total_granted BIGINT;
BEGIN
  -- Skip pour DRAFT — autorise les drafts > pool, ils seront bloqués au PROPOSED
  IF NEW.status = 'DRAFT' THEN
    RETURN NEW;
  END IF;

  SELECT pool_size INTO v_pool_size
    FROM plans
   WHERE id = NEW.plan_id;

  IF v_pool_size IS NULL THEN
    RAISE EXCEPTION 'Plan % introuvable', NEW.plan_id;
  END IF;

  -- Total alloué (hors CANCELLED/FORFEITED/DRAFT, hors le row courant si UPDATE)
  SELECT COALESCE(SUM(units_granted), 0) INTO v_total_granted
    FROM awards
   WHERE plan_id = NEW.plan_id
     AND status NOT IN ('CANCELLED', 'FORFEITED', 'DRAFT')
     AND deleted_at IS NULL
     AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);

  IF v_total_granted + NEW.units_granted > v_pool_size THEN
    RAISE EXCEPTION 'Pool exceeded: requesting % units but pool has only % remaining (% allocated of % total)',
      NEW.units_granted,
      v_pool_size - v_total_granted,
      v_total_granted,
      v_pool_size
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_award_pool_check ON awards;
CREATE TRIGGER trg_award_pool_check
  BEFORE INSERT OR UPDATE OF units_granted, status ON awards
  FOR EACH ROW EXECUTE FUNCTION enforce_award_pool_consistency();

COMMENT ON FUNCTION enforce_award_pool_consistency() IS
  'Module 3b B1 — Trigger BEFORE awards : vérifie que la somme units_granted (hors DRAFT/CANCELLED/FORFEITED) ne dépasse pas plans.pool_size. Skip pour DRAFT pour autoriser la saisie initiale.';
