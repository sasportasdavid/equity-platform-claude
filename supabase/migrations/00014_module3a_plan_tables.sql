-- =============================================================================
-- Module 3a — sous-module B1 : Tables métier du wizard de création de plan
-- =============================================================================
--
-- Contexte
-- --------
-- Les 9 tables visées par le wizard (plans, vesting_schedules,
-- vesting_tranches, performance_conditions, early_termination_rules,
-- hypothesis_sets, volatility_schemes, simulation_configs, valuation_runs)
-- ont toutes été créées en placeholder dans `00001_init_schema.sql` pour
-- que les FK depuis awards / valuation_award_results compilent. À ce stade,
-- 7 d'entre elles (toutes sauf `plans` et `early_termination_rules`)
-- n'avaient qu'une structure minimale `(id, org_id, name, parameters JSONB)`.
--
-- Cette migration aligne le schéma DB sur le payload émis par le wizard
-- (cf. `packages/shared/src/schemas/plan-wizard.ts`) et la fonction RPC
-- `create_plan_full` spec'ée au §3.1 du Module 3a — sans encore livrer le RPC
-- lui-même (sous-module B2).
--
-- Stratégie
-- ---------
--   * Toutes les tables cibles sont actuellement VIDES → ALTER COLUMN /
--     RENAME COLUMN sans risque de perte de données.
--   * Les renommages alignent les noms SQL placeholder du M1 sur les noms
--     attendus par la spec et le wizard (ex : `vest_date` → `vesting_date`,
--     `schedule_type` → `vesting_type`).
--   * Le catch-all JSONB `parameters` est conservé partout comme escape
--     hatch pour extensibilité future, mais les champs critiques
--     (peers, scales, market params) deviennent des colonnes flat ou
--     JSONB nommées.
--   * RLS : on remplace les policies read-only ouvertes par 4 policies
--     CRUD strictes (Pattern 1 du Module 1 §6.4) — `plans.read` pour
--     SELECT, `plans.create` pour INSERT, `plans.update` pour UPDATE,
--     `plans.delete` pour DELETE. Les templates globaux (`org_id IS NULL`)
--     restent lisibles par tout user authentifié avec `plans.read`.
--   * `vesting_tranches` et `volatility_schemes` n'ont pas d'org_id
--     directement utilisé dans les requêtes wizard — on hérite via FK
--     parent (vesting_schedules / hypothesis_sets) pour conserver l'isolation.
--
-- Idempotence : ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT IF EXISTS,
-- DROP POLICY IF EXISTS, CREATE INDEX IF NOT EXISTS — la migration peut
-- être rejouée sans casse.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Helper : RENAME COLUMN idempotent (PG ≥10)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.safe_rename_column(
  p_table TEXT, p_from TEXT, p_to TEXT
) RETURNS VOID AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_from
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_to
  ) THEN
    EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', p_table, p_from, p_to);
  END IF;
END $$ LANGUAGE plpgsql;

-- =============================================================================
-- 1. plans — ajout compliance_warnings + description
-- =============================================================================

ALTER TABLE plans ADD COLUMN IF NOT EXISTS compliance_warnings JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN plans.compliance_warnings IS
  'Warnings de conformité émis par compliance.warnings au moment du createPlan
   (ex : durées vesting <24m hors AGA, exercise_price 0 hors BSPCE/AGA).
   Format : [{ code, severity, message, details? }]. Voir Module 3a §9.';
COMMENT ON COLUMN plans.description IS
  'Description libre du plan saisie au step 2 du wizard. Max 1000 chars.';

CREATE INDEX IF NOT EXISTS idx_plans_org_status ON plans(org_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_plans_company ON plans(company_id);
CREATE INDEX IF NOT EXISTS idx_plans_parent ON plans(parent_plan_id) WHERE parent_plan_id IS NOT NULL;

-- =============================================================================
-- 2. vesting_schedules — 1 par plan (NULL = template global)
-- =============================================================================

-- Renommage placeholder M1 → nom canonique wizard / spec RPC
SELECT pg_temp.safe_rename_column('vesting_schedules', 'schedule_type', 'vesting_type');

ALTER TABLE vesting_schedules ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id) ON DELETE CASCADE;
ALTER TABLE vesting_schedules ADD COLUMN IF NOT EXISTS single_vesting_date DATE;
ALTER TABLE vesting_schedules ADD COLUMN IF NOT EXISTS cliff_percentage NUMERIC(5,2);
ALTER TABLE vesting_schedules ADD COLUMN IF NOT EXISTS linear_after_cliff BOOLEAN;
ALTER TABLE vesting_schedules ADD COLUMN IF NOT EXISTS frequency TEXT;

DO $$ BEGIN
  ALTER TABLE vesting_schedules DROP CONSTRAINT IF EXISTS vesting_schedules_vesting_type_check;
  ALTER TABLE vesting_schedules ADD CONSTRAINT vesting_schedules_vesting_type_check
    CHECK (vesting_type IS NULL OR vesting_type IN ('single', 'tranches', 'cliff_linear'));

  ALTER TABLE vesting_schedules DROP CONSTRAINT IF EXISTS vesting_schedules_frequency_check;
  ALTER TABLE vesting_schedules ADD CONSTRAINT vesting_schedules_frequency_check
    CHECK (frequency IS NULL OR frequency IN ('monthly', 'quarterly', 'annually'));

  ALTER TABLE vesting_schedules DROP CONSTRAINT IF EXISTS vesting_schedules_cliff_pct_check;
  ALTER TABLE vesting_schedules ADD CONSTRAINT vesting_schedules_cliff_pct_check
    CHECK (cliff_percentage IS NULL OR (cliff_percentage >= 0 AND cliff_percentage <= 100));
END $$;

CREATE INDEX IF NOT EXISTS idx_vesting_schedules_plan ON vesting_schedules(plan_id) WHERE plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vesting_schedules_org ON vesting_schedules(org_id);
-- 1 schedule par plan max
CREATE UNIQUE INDEX IF NOT EXISTS uq_vesting_schedules_plan ON vesting_schedules(plan_id) WHERE plan_id IS NOT NULL;

COMMENT ON COLUMN vesting_schedules.plan_id IS
  'NULL = template réutilisable (org-scoped via org_id). NOT NULL = vesting attaché à un plan unique (UNIQUE).';

-- =============================================================================
-- 3. vesting_tranches — N par schedule (mode `tranches` uniquement)
-- =============================================================================

-- Aligner les noms de colonnes sur la spec RPC + wizard Zod
SELECT pg_temp.safe_rename_column('vesting_tranches', 'vest_date', 'vesting_date');
SELECT pg_temp.safe_rename_column('vesting_tranches', 'units_or_pct', 'percentage_of_award');
SELECT pg_temp.safe_rename_column('vesting_tranches', 'tranche_order', 'sort_order');

-- Les tranches du wizard ont des champs requis (date + pct), promote NOT NULL
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='vesting_tranches'
       AND column_name='vesting_date' AND is_nullable='YES'
  ) THEN
    ALTER TABLE vesting_tranches ALTER COLUMN vesting_date SET NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='vesting_tranches'
       AND column_name='percentage_of_award' AND is_nullable='YES'
  ) THEN
    ALTER TABLE vesting_tranches ALTER COLUMN percentage_of_award SET NOT NULL;
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE vesting_tranches DROP CONSTRAINT IF EXISTS vesting_tranches_pct_check;
  ALTER TABLE vesting_tranches ADD CONSTRAINT vesting_tranches_pct_check
    CHECK (percentage_of_award >= 0 AND percentage_of_award <= 100);
END $$;

CREATE INDEX IF NOT EXISTS idx_vesting_tranches_schedule ON vesting_tranches(schedule_id, sort_order);

-- =============================================================================
-- 4. performance_conditions — N par plan (Step 4 du wizard)
-- =============================================================================

ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id) ON DELETE CASCADE;
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS metric TEXT;
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS weight NUMERIC(5,2);
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS enable_partial_scoring BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS performance_start_date DATE;
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS performance_end_date DATE;

-- Branche NON_MARKET
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS target_value TEXT;
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS target_unit TEXT;
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS comparison_operator TEXT;
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS threshold_min NUMERIC(7,2);
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS threshold_max NUMERIC(7,2);

-- Branche MARKET
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS market_metric_type TEXT;
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS reference_index TEXT;
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS reference_index_display_name TEXT;
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS comparison_method TEXT;
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS measurement_period_years NUMERIC(5,2);
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS start_price_method TEXT;
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS start_fixed_price NUMERIC(15,4);
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS start_averaging_days INTEGER;
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS end_price_method TEXT;
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS end_fixed_price NUMERIC(15,4);
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS end_averaging_days INTEGER;

-- JSONB nommés (peers + acquisition scale)
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS peer_group JSONB;
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS weighted_peer_groups JSONB;
ALTER TABLE performance_conditions ADD COLUMN IF NOT EXISTS acquisition_scale JSONB;

DO $$ BEGIN
  ALTER TABLE performance_conditions DROP CONSTRAINT IF EXISTS pc_condition_type_check;
  ALTER TABLE performance_conditions ADD CONSTRAINT pc_condition_type_check
    CHECK (condition_type IS NULL OR condition_type IN ('MARKET','NON_MARKET','SERVICE'));

  ALTER TABLE performance_conditions DROP CONSTRAINT IF EXISTS pc_category_check;
  ALTER TABLE performance_conditions ADD CONSTRAINT pc_category_check
    CHECK (category IS NULL OR category IN ('FINANCIAL','PRODUCT','OPERATIONAL','STRATEGIC','ESG'));

  ALTER TABLE performance_conditions DROP CONSTRAINT IF EXISTS pc_metric_check;
  ALTER TABLE performance_conditions ADD CONSTRAINT pc_metric_check
    CHECK (metric IS NULL OR metric IN
      ('EBITDA','REVENUE','NET_INCOME','USERS','ARR','NPS','ESG_SCORE','CARBON','CUSTOM'));

  ALTER TABLE performance_conditions DROP CONSTRAINT IF EXISTS pc_market_metric_check;
  ALTER TABLE performance_conditions ADD CONSTRAINT pc_market_metric_check
    CHECK (market_metric_type IS NULL OR market_metric_type IN
      ('SHARE_PRICE','TSR_ABS','TSR_REL_INDEX','TSR_REL_PEERS'));

  ALTER TABLE performance_conditions DROP CONSTRAINT IF EXISTS pc_comparison_operator_check;
  ALTER TABLE performance_conditions ADD CONSTRAINT pc_comparison_operator_check
    CHECK (comparison_operator IS NULL OR comparison_operator IN ('>=','<=','>','<','=','!='));

  ALTER TABLE performance_conditions DROP CONSTRAINT IF EXISTS pc_comparison_method_check;
  ALTER TABLE performance_conditions ADD CONSTRAINT pc_comparison_method_check
    CHECK (comparison_method IS NULL OR comparison_method IN ('WEIGHTED_AVERAGE','MEDIAN','RANKING'));

  ALTER TABLE performance_conditions DROP CONSTRAINT IF EXISTS pc_start_price_method_check;
  ALTER TABLE performance_conditions ADD CONSTRAINT pc_start_price_method_check
    CHECK (start_price_method IS NULL OR start_price_method IN ('SPOT','FIXED','AVERAGE'));

  ALTER TABLE performance_conditions DROP CONSTRAINT IF EXISTS pc_end_price_method_check;
  ALTER TABLE performance_conditions ADD CONSTRAINT pc_end_price_method_check
    CHECK (end_price_method IS NULL OR end_price_method IN ('SPOT','FIXED','AVERAGE'));

  ALTER TABLE performance_conditions DROP CONSTRAINT IF EXISTS pc_weight_check;
  ALTER TABLE performance_conditions ADD CONSTRAINT pc_weight_check
    CHECK (weight IS NULL OR (weight >= 0 AND weight <= 100));
END $$;

CREATE INDEX IF NOT EXISTS idx_perf_conditions_plan ON performance_conditions(plan_id);
CREATE INDEX IF NOT EXISTS idx_perf_conditions_org ON performance_conditions(org_id);
CREATE INDEX IF NOT EXISTS idx_perf_conditions_type ON performance_conditions(condition_type) WHERE condition_type IS NOT NULL;

COMMENT ON COLUMN performance_conditions.peer_group IS
  'Liste plate de peer companies (mode TSR_REL_PEERS sans groupes pondérés).
   Format : [{ id, name, ticker, weight?, s0?, volatility?, correlationWithMain?,
   volatilityOverride?, correlationOverride? }]. Max 30 peers (cf. PLAN_WIZARD_LIMITS).';

COMMENT ON COLUMN performance_conditions.weighted_peer_groups IS
  'Groupes hiérarchiques de peers pondérés (mode TSR_REL_PEERS avec groupes).
   Format : [{ id, name, weight, peers: [<peer>] }]. Mutuellement exclusif
   avec peer_group : si weighted_peer_groups est défini, peer_group doit être NULL.';

COMMENT ON COLUMN performance_conditions.acquisition_scale IS
  'Échelle d''acquisition (% du target → % de droits acquis). Discriminé sur
   `mode` : { mode: "CURVE", points: [{threshold, acquisition, label?}] }
   ou { mode: "TIERS", tiers: [{min, max, acquisition, label?}] }.';

-- =============================================================================
-- 5. early_termination_rules — déjà OK structurellement, on durcit les CHECK
-- =============================================================================

DO $$ BEGIN
  ALTER TABLE early_termination_rules DROP CONSTRAINT IF EXISTS etr_exercise_window_check;
  ALTER TABLE early_termination_rules ADD CONSTRAINT etr_exercise_window_check
    CHECK (exercise_window_days IS NULL OR (exercise_window_days >= 0 AND exercise_window_days <= 3650));

  ALTER TABLE early_termination_rules DROP CONSTRAINT IF EXISTS etr_acceleration_check;
  ALTER TABLE early_termination_rules ADD CONSTRAINT etr_acceleration_check
    CHECK (acceleration_months IS NULL OR (acceleration_months >= 0 AND acceleration_months <= 60));
END $$;

CREATE INDEX IF NOT EXISTS idx_etr_plan ON early_termination_rules(plan_id);
CREATE INDEX IF NOT EXISTS idx_etr_org ON early_termination_rules(org_id);

-- =============================================================================
-- 6. hypothesis_sets — 1 par plan (Step 6 du wizard)
-- =============================================================================

ALTER TABLE hypothesis_sets ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id) ON DELETE CASCADE;
ALTER TABLE hypothesis_sets ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
ALTER TABLE hypothesis_sets ADD COLUMN IF NOT EXISTS as_of_date DATE;

-- Champs spec RPC create_plan_full
ALTER TABLE hypothesis_sets ADD COLUMN IF NOT EXISTS s0 NUMERIC(15,4);
ALTER TABLE hypothesis_sets ADD COLUMN IF NOT EXISTS rate_flat NUMERIC(6,3);
ALTER TABLE hypothesis_sets ADD COLUMN IF NOT EXISTS dividend_yield NUMERIC(6,3);
ALTER TABLE hypothesis_sets ADD COLUMN IF NOT EXISTS vol_method TEXT;
ALTER TABLE hypothesis_sets ADD COLUMN IF NOT EXISTS ticker_override TEXT;
ALTER TABLE hypothesis_sets ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE hypothesis_sets ADD COLUMN IF NOT EXISTS multi_asset_params JSONB;

-- Champs additionnels du wizard (volatilité avancée, dividende, modèle)
ALTER TABLE hypothesis_sets ADD COLUMN IF NOT EXISTS volatility NUMERIC(6,2);
ALTER TABLE hypothesis_sets ADD COLUMN IF NOT EXISTS volatility_price_type TEXT;
ALTER TABLE hypothesis_sets ADD COLUMN IF NOT EXISTS volatility_winsorizing_pct NUMERIC(5,2);
ALTER TABLE hypothesis_sets ADD COLUMN IF NOT EXISTS dividend_input_mode TEXT;
ALTER TABLE hypothesis_sets ADD COLUMN IF NOT EXISTS dividend_amount NUMERIC(15,4);
ALTER TABLE hypothesis_sets ADD COLUMN IF NOT EXISTS lookback_days INTEGER;
ALTER TABLE hypothesis_sets ADD COLUMN IF NOT EXISTS correlation_override NUMERIC(4,3);
ALTER TABLE hypothesis_sets ADD COLUMN IF NOT EXISTS model_choice TEXT;
ALTER TABLE hypothesis_sets ADD COLUMN IF NOT EXISTS underlying_model TEXT;
ALTER TABLE hypothesis_sets ADD COLUMN IF NOT EXISTS time_horizon_years NUMERIC(5,2);

DO $$ BEGIN
  ALTER TABLE hypothesis_sets DROP CONSTRAINT IF EXISTS hs_currency_check;
  ALTER TABLE hypothesis_sets ADD CONSTRAINT hs_currency_check
    CHECK (currency IS NULL OR currency IN ('EUR','USD','GBP','CHF'));

  ALTER TABLE hypothesis_sets DROP CONSTRAINT IF EXISTS hs_vol_method_check;
  ALTER TABLE hypothesis_sets ADD CONSTRAINT hs_vol_method_check
    CHECK (vol_method IS NULL OR vol_method IN ('MANUAL','HISTORICAL','IMPLIED','MIXED'));

  ALTER TABLE hypothesis_sets DROP CONSTRAINT IF EXISTS hs_model_choice_check;
  ALTER TABLE hypothesis_sets ADD CONSTRAINT hs_model_choice_check
    CHECK (model_choice IS NULL OR model_choice IN ('auto','black_scholes','monte_carlo'));

  ALTER TABLE hypothesis_sets DROP CONSTRAINT IF EXISTS hs_underlying_model_check;
  ALTER TABLE hypothesis_sets ADD CONSTRAINT hs_underlying_model_check
    CHECK (underlying_model IS NULL OR underlying_model IN ('GBM','HESTON','JUMP_DIFFUSION'));

  ALTER TABLE hypothesis_sets DROP CONSTRAINT IF EXISTS hs_volatility_price_type_check;
  ALTER TABLE hypothesis_sets ADD CONSTRAINT hs_volatility_price_type_check
    CHECK (volatility_price_type IS NULL OR volatility_price_type IN ('CLOSE','OPEN'));

  ALTER TABLE hypothesis_sets DROP CONSTRAINT IF EXISTS hs_dividend_input_mode_check;
  ALTER TABLE hypothesis_sets ADD CONSTRAINT hs_dividend_input_mode_check
    CHECK (dividend_input_mode IS NULL OR dividend_input_mode IN ('percent','amount'));
END $$;

CREATE INDEX IF NOT EXISTS idx_hypothesis_sets_plan ON hypothesis_sets(plan_id) WHERE plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hypothesis_sets_org ON hypothesis_sets(org_id);
CREATE INDEX IF NOT EXISTS idx_hypothesis_sets_company ON hypothesis_sets(company_id) WHERE company_id IS NOT NULL;

COMMENT ON COLUMN hypothesis_sets.s0 IS
  'Prix sous-jacent à la date de valuation (équivalent `underlyingPrice`
   côté wizard). NUMERIC(15,4) pour supporter les prix d''actions exotiques.';

COMMENT ON COLUMN hypothesis_sets.multi_asset_params IS
  'Paramètres multi-asset pour modèles corrélés (ex : pricing TSR_REL_PEERS
   avec corrélations explicites entre underlying et peers). Format libre
   géré par le moteur Python — voir Module 3a §4.';

-- =============================================================================
-- 7. volatility_schemes — 1 par hypothesis_set
-- =============================================================================

-- Renommer placeholder M1 (`scheme_type`) → `method` pour aligner spec RPC
SELECT pg_temp.safe_rename_column('volatility_schemes', 'scheme_type', 'method');

ALTER TABLE volatility_schemes ADD COLUMN IF NOT EXISTS hypothesis_set_id UUID REFERENCES hypothesis_sets(id) ON DELETE CASCADE;
ALTER TABLE volatility_schemes ADD COLUMN IF NOT EXISTS annualized_sigma NUMERIC(8,4);
ALTER TABLE volatility_schemes ADD COLUMN IF NOT EXISTS lookback_period_days INTEGER;
ALTER TABLE volatility_schemes ADD COLUMN IF NOT EXISTS heston_params JSONB;
ALTER TABLE volatility_schemes ADD COLUMN IF NOT EXISTS jump_params JSONB;

DO $$ BEGIN
  ALTER TABLE volatility_schemes DROP CONSTRAINT IF EXISTS vs_method_check;
  ALTER TABLE volatility_schemes ADD CONSTRAINT vs_method_check
    CHECK (method IS NULL OR method IN ('MANUAL','HISTORICAL','IMPLIED','MIXED'));
END $$;

CREATE INDEX IF NOT EXISTS idx_volatility_schemes_hset ON volatility_schemes(hypothesis_set_id) WHERE hypothesis_set_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_volatility_schemes_org ON volatility_schemes(org_id);

COMMENT ON COLUMN volatility_schemes.heston_params IS
  'Paramètres du modèle Heston (volatilité stochastique) :
   { v0, kappa, theta, xi, rho }. NULL si scheme=GBM ou JUMP_DIFFUSION.';

COMMENT ON COLUMN volatility_schemes.jump_params IS
  'Paramètres du modèle Jump Diffusion (Merton) :
   { lambda, muJ, sigmaJ }. NULL si scheme=GBM ou HESTON.';

-- =============================================================================
-- 8. simulation_configs — 1 par hypothesis_set (Monte Carlo Black-Scholes/Heston)
-- =============================================================================

ALTER TABLE simulation_configs ADD COLUMN IF NOT EXISTS hypothesis_set_id UUID REFERENCES hypothesis_sets(id) ON DELETE CASCADE;
ALTER TABLE simulation_configs ADD COLUMN IF NOT EXISTS pricer_type TEXT;
ALTER TABLE simulation_configs ADD COLUMN IF NOT EXISTS effective_model TEXT;
ALTER TABLE simulation_configs ADD COLUMN IF NOT EXISTS underlying_model TEXT;
ALTER TABLE simulation_configs ADD COLUMN IF NOT EXISTS steps_per_year INTEGER;
ALTER TABLE simulation_configs ADD COLUMN IF NOT EXISTS time_horizon_years NUMERIC(5,2);
ALTER TABLE simulation_configs ADD COLUMN IF NOT EXISTS antithetic_variates BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE simulation_configs ADD COLUMN IF NOT EXISTS heston_params JSONB;
ALTER TABLE simulation_configs ADD COLUMN IF NOT EXISTS jump_params JSONB;

DO $$ BEGIN
  ALTER TABLE simulation_configs DROP CONSTRAINT IF EXISTS sc_steps_per_year_check;
  ALTER TABLE simulation_configs ADD CONSTRAINT sc_steps_per_year_check
    CHECK (steps_per_year IS NULL OR steps_per_year IN (12, 52, 252));

  ALTER TABLE simulation_configs DROP CONSTRAINT IF EXISTS sc_underlying_model_check;
  ALTER TABLE simulation_configs ADD CONSTRAINT sc_underlying_model_check
    CHECK (underlying_model IS NULL OR underlying_model IN ('GBM','HESTON','JUMP_DIFFUSION'));

  ALTER TABLE simulation_configs DROP CONSTRAINT IF EXISTS sc_pricer_type_check;
  ALTER TABLE simulation_configs ADD CONSTRAINT sc_pricer_type_check
    CHECK (pricer_type IS NULL OR pricer_type IN ('black_scholes','monte_carlo','auto'));

  ALTER TABLE simulation_configs DROP CONSTRAINT IF EXISTS sc_num_paths_check;
  ALTER TABLE simulation_configs ADD CONSTRAINT sc_num_paths_check
    CHECK (num_paths IS NULL OR (num_paths >= 1000 AND num_paths <= 1000000));
END $$;

CREATE INDEX IF NOT EXISTS idx_simulation_configs_hset ON simulation_configs(hypothesis_set_id) WHERE hypothesis_set_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_simulation_configs_org ON simulation_configs(org_id);

-- =============================================================================
-- 9. valuation_runs — exécutions du moteur Python (1 par run, N par plan)
-- =============================================================================

ALTER TABLE valuation_runs ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id) ON DELETE CASCADE;
ALTER TABLE valuation_runs ADD COLUMN IF NOT EXISTS simulation_config_id UUID REFERENCES simulation_configs(id) ON DELETE SET NULL;
ALTER TABLE valuation_runs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE valuation_runs ADD COLUMN IF NOT EXISTS results_json JSONB;

DO $$ BEGIN
  ALTER TABLE valuation_runs DROP CONSTRAINT IF EXISTS vr_status_check;
  ALTER TABLE valuation_runs ADD CONSTRAINT vr_status_check
    CHECK (status IS NULL OR status IN ('pending','running','completed','failed'));
END $$;

CREATE INDEX IF NOT EXISTS idx_valuation_runs_plan ON valuation_runs(plan_id);
CREATE INDEX IF NOT EXISTS idx_valuation_runs_org ON valuation_runs(org_id);
CREATE INDEX IF NOT EXISTS idx_valuation_runs_pending ON valuation_runs(status, created_at)
  WHERE status IN ('pending','running');

COMMENT ON COLUMN valuation_runs.results_json IS
  'Sortie brute du moteur Python (fair_value, IC, paths_used, decomposition,
   audit_data, …). Format géré par l''Edge Function proxy — voir Module 3a §4.1.';

-- =============================================================================
-- 10. RLS — full CRUD policies (Pattern 1) sur les helper tables
-- -----------------------------------------------------------------------------
-- Avant : SELECT-only ouvert à tout user (org_id NULL OR mon org).
-- Après : SELECT respect des templates globaux (org_id NULL) + plans.read,
--         INSERT/UPDATE/DELETE strictement org-scoped + perm appropriée.
-- =============================================================================

DO $$
DECLARE rel_name TEXT;
BEGIN
  FOR rel_name IN VALUES
    ('vesting_schedules'),
    ('performance_conditions'),
    ('hypothesis_sets'),
    ('volatility_schemes'),
    ('simulation_configs'),
    ('valuation_runs')
  LOOP
    -- Reset all policies to start clean (idempotent)
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON %I', rel_name, rel_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON %I', rel_name, rel_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_update ON %I', rel_name, rel_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON %I', rel_name, rel_name);

    EXECUTE format(
      $sql$CREATE POLICY %I_select ON %I FOR SELECT TO authenticated
            USING (org_id IS NULL OR (org_id = current_org_id() AND has_permission('plans.read')))$sql$,
      rel_name, rel_name
    );
    EXECUTE format(
      $sql$CREATE POLICY %I_insert ON %I FOR INSERT TO authenticated
            WITH CHECK (org_id = current_org_id() AND has_permission('plans.create'))$sql$,
      rel_name, rel_name
    );
    EXECUTE format(
      $sql$CREATE POLICY %I_update ON %I FOR UPDATE TO authenticated
            USING (org_id = current_org_id() AND has_permission('plans.update'))
            WITH CHECK (org_id = current_org_id() AND has_permission('plans.update'))$sql$,
      rel_name, rel_name
    );
    EXECUTE format(
      $sql$CREATE POLICY %I_delete ON %I FOR DELETE TO authenticated
            USING (org_id = current_org_id() AND has_permission('plans.delete'))$sql$,
      rel_name, rel_name
    );
  END LOOP;
END $$;

-- vesting_tranches : pas d'org_id, héritage RLS via vesting_schedules
ALTER TABLE vesting_tranches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vesting_tranches_select ON vesting_tranches;
CREATE POLICY vesting_tranches_select ON vesting_tranches FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vesting_schedules vs
       WHERE vs.id = vesting_tranches.schedule_id
         AND (vs.org_id IS NULL OR (vs.org_id = current_org_id() AND has_permission('plans.read')))
    )
  );

DROP POLICY IF EXISTS vesting_tranches_insert ON vesting_tranches;
CREATE POLICY vesting_tranches_insert ON vesting_tranches FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vesting_schedules vs
       WHERE vs.id = vesting_tranches.schedule_id
         AND vs.org_id = current_org_id()
         AND has_permission('plans.create')
    )
  );

DROP POLICY IF EXISTS vesting_tranches_update ON vesting_tranches;
CREATE POLICY vesting_tranches_update ON vesting_tranches FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vesting_schedules vs
       WHERE vs.id = vesting_tranches.schedule_id
         AND vs.org_id = current_org_id()
         AND has_permission('plans.update')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vesting_schedules vs
       WHERE vs.id = vesting_tranches.schedule_id
         AND vs.org_id = current_org_id()
         AND has_permission('plans.update')
    )
  );

DROP POLICY IF EXISTS vesting_tranches_delete ON vesting_tranches;
CREATE POLICY vesting_tranches_delete ON vesting_tranches FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM vesting_schedules vs
       WHERE vs.id = vesting_tranches.schedule_id
         AND vs.org_id = current_org_id()
         AND has_permission('plans.delete')
    )
  );

-- =============================================================================
-- 11. Trigger updated_at pour les tables modifiables
-- =============================================================================
-- Note : `set_updated_at()` est défini dans 00001 et déjà attaché à plans.
-- On l'ajoute aux tables wizard qui ont une vie d'édition (vesting, conditions,
-- hypothesis, leavers). Les valuation_runs sont append-only → pas de trigger.

DO $$
DECLARE rel_name TEXT;
BEGIN
  FOR rel_name IN VALUES
    ('vesting_schedules'),
    ('performance_conditions'),
    ('hypothesis_sets'),
    ('volatility_schemes'),
    ('simulation_configs')
  LOOP
    -- Ajoute updated_at si absent
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()',
      rel_name
    );
    EXECUTE format('DROP TRIGGER IF EXISTS set_%I_updated_at ON %I', rel_name, rel_name);
    EXECUTE format(
      'CREATE TRIGGER set_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      rel_name, rel_name
    );
  END LOOP;
END $$;
