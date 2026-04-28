-- =============================================================================
-- Module 3a — sous-module B5.0 : alignement schémas valuation_* + ifrs2_*
-- =============================================================================
--
-- Drift constaté entre la spec MODULE_03A_PLANS §4.1 et les schémas livrés
-- en 00001 (placeholder M1) :
--
--   valuation_runs    : manque pricer_used, engine_version, finished_at
--                       (on a `completed_at`, sémantiquement équivalent —
--                       on rename pour aligner sur la spec).
--   valuation_results : minimal (id, valuation_run_id, fair_value, audit_data,
--                       computed_at). La spec écrit fair_value_per_instrument,
--                       fair_value_total, std_error, ci95_low, ci95_high,
--                       distribution_stats (JSONB), sensitivities (JSONB),
--                       market_data_snapshot (JSONB).
--   ifrs2_expense_schedules : lié à `award_id` au lieu de `valuation_run_id`
--                             ou `plan_id` — incohérent avec le flow B5
--                             (un plan peut avoir N runs avant d'avoir des
--                             awards individuels). On ajoute valuation_run_id
--                             et plan_id, on relax award_id NULLABLE.
--
-- Tables sont vides (vérifié) → ALTER COLUMN sans risque.
-- =============================================================================

-- 1. valuation_runs : ajout pricer_used + engine_version
ALTER TABLE valuation_runs ADD COLUMN IF NOT EXISTS pricer_used TEXT;
ALTER TABLE valuation_runs ADD COLUMN IF NOT EXISTS engine_version TEXT;

DO $$ BEGIN
  ALTER TABLE valuation_runs DROP CONSTRAINT IF EXISTS vr_pricer_used_check;
  ALTER TABLE valuation_runs ADD CONSTRAINT vr_pricer_used_check
    CHECK (pricer_used IS NULL OR pricer_used IN
      ('BLACK_SCHOLES', 'MONTE_CARLO', 'MONTE_CARLO_MULTI_TRANCHE', 'HYBRID_V8'));
END $$;

COMMENT ON COLUMN valuation_runs.pricer_used IS
  'Algorithme effectivement utilisé par le moteur Python — choisi
   automatiquement selon shouldUseMonteCarlo (cf. buildPythonPayload).
   BLACK_SCHOLES pour les options simples, MONTE_CARLO_MULTI_TRANCHE pour
   plans à conditions MARKET ou multi-tranches, HYBRID_V8 = défaut moteur V8.';

COMMENT ON COLUMN valuation_runs.engine_version IS
  'Version du moteur Python qui a produit ce run (ex : V8, V8.1).
   Permet le replay déterministe + audit RGPD/IFRS 2.';

-- 2. valuation_results : enrichissement vers spec §4.1
ALTER TABLE valuation_results ADD COLUMN IF NOT EXISTS org_id UUID;
ALTER TABLE valuation_results ADD COLUMN IF NOT EXISTS fair_value_per_instrument NUMERIC(15,6);
ALTER TABLE valuation_results ADD COLUMN IF NOT EXISTS fair_value_total NUMERIC(18,2);
ALTER TABLE valuation_results ADD COLUMN IF NOT EXISTS std_error NUMERIC(15,6);
ALTER TABLE valuation_results ADD COLUMN IF NOT EXISTS ci95_low NUMERIC(15,6);
ALTER TABLE valuation_results ADD COLUMN IF NOT EXISTS ci95_high NUMERIC(15,6);
ALTER TABLE valuation_results ADD COLUMN IF NOT EXISTS distribution_stats JSONB;
ALTER TABLE valuation_results ADD COLUMN IF NOT EXISTS sensitivities JSONB;
ALTER TABLE valuation_results ADD COLUMN IF NOT EXISTS market_data_snapshot JSONB;

CREATE INDEX IF NOT EXISTS idx_valuation_results_run ON valuation_results(valuation_run_id);
CREATE INDEX IF NOT EXISTS idx_valuation_results_org ON valuation_results(org_id);

COMMENT ON COLUMN valuation_results.fair_value_per_instrument IS
  'Juste valeur d''UN instrument (= 1 BSPCE / 1 AGA / 1 stock-option) à la date
   de mesure. Pour le total IFRS 2 : multiplier par pool_allocated. NUMERIC(15,6)
   pour les prix exotiques (ex : start-up à 0.001 € — le strike s''écrit en
   millièmes d''euro).';

COMMENT ON COLUMN valuation_results.fair_value_total IS
  'fair_value_per_instrument × pool_allocated (au moment du run). Persisté
   pour ne pas recalculer à chaque lecture. Si pool_allocated bouge après
   le run, ce champ devient stale (déclencher un nouveau run pour rafraîchir).';

COMMENT ON COLUMN valuation_results.distribution_stats IS
  'JSONB { debug_paths?, vesting_probability, audit_trail, tranche_details,
   condition_breakdown }. Audit trail = trace complète du calcul Monte Carlo
   pour la conformité IFRS 2 + le replay déterministe (seed=42 fixé).';

COMMENT ON COLUMN valuation_results.sensitivities IS
  'JSONB { delta, gamma, vega, theta, rho } — Greeks calculés par bumping.
   Utilisé par le rapport IFRS 2 pour la sensitivity table (impact ±10 % S0,
   ±20 % vol, etc.).';

COMMENT ON COLUMN valuation_results.market_data_snapshot IS
  'Snapshot des inputs marché au moment du run (S0, taux, vol, dividend yield,
   prix peers/index). Permet de re-comparer ultérieurement sans dépendre
   d''Yahoo / EODHD qui peuvent changer leurs cotations historiques.';

-- 3. ifrs2_expense_schedules : pivot d'award_id vers valuation_run_id
ALTER TABLE ifrs2_expense_schedules ADD COLUMN IF NOT EXISTS valuation_run_id UUID
  REFERENCES valuation_runs(id) ON DELETE CASCADE;
ALTER TABLE ifrs2_expense_schedules ADD COLUMN IF NOT EXISTS plan_id UUID
  REFERENCES plans(id) ON DELETE CASCADE;

DO $$ BEGIN
  -- award_id devient NULLABLE (sera utilisé en Module 3b quand on
  -- calculera les charges par award individuel). Pour B5, le calendrier
  -- est par PLAN (somme de tous les awards qui en bénéficient).
  ALTER TABLE ifrs2_expense_schedules ALTER COLUMN award_id DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN
  NULL; -- déjà nullable
END $$;

CREATE INDEX IF NOT EXISTS idx_ifrs2_schedules_run ON ifrs2_expense_schedules(valuation_run_id);
CREATE INDEX IF NOT EXISTS idx_ifrs2_schedules_plan ON ifrs2_expense_schedules(plan_id);

COMMENT ON COLUMN ifrs2_expense_schedules.valuation_run_id IS
  'Run de valorisation d''où provient ce calendrier de charges. NULL pour
   les calendriers historiques importés (Module 14). NOT NULL en pratique
   pour les calendriers générés par compute-ifrs2-expense (B5).';

COMMENT ON COLUMN ifrs2_expense_schedules.plan_id IS
  'Plan auquel s''applique le calendrier. Granularité plan en B5 (somme
   par plan), granularité award en Module 3b (un calendrier par grant
   individuel).';

-- 4. RLS — étendre les policies existantes pour couvrir org_id sur les
-- valuation_results (maintenant qu'on l'a ajouté). Pattern 1 standard.

ALTER TABLE valuation_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS valuation_results_select ON valuation_results;
CREATE POLICY valuation_results_select ON valuation_results FOR SELECT
  TO authenticated USING (
    org_id IS NULL OR (org_id = current_org_id() AND has_permission('plans.read'))
  );

DROP POLICY IF EXISTS valuation_results_insert ON valuation_results;
CREATE POLICY valuation_results_insert ON valuation_results FOR INSERT
  TO authenticated WITH CHECK (
    org_id = current_org_id() AND has_permission('plans.update')
  );

-- 5. Realtime publication — activer la diffusion REALTIME sur valuation_runs
-- pour que useValuationRunStatus(runId) reçoive les UPDATE en live (QUEUED →
-- RUNNING → DONE/ERROR).
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE valuation_runs;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- déjà publié
END $$;
