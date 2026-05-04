-- =============================================================================
-- Module 11 B2 — Migration 00091 : extend award_modifications pour audit
-- du calcul incremental_fair_value (résolution dette #11).
-- =============================================================================
--
-- Ajout de 3 colonnes audit IFRS 2.27-28 sur les modifications d'awards :
--   - valuation_pre_modification  : FV/unit avant la modification (snapshot
--     du plan source à la date de modification)
--   - valuation_post_modification : FV/unit après la modification (avec les
--     new_plan_terms appliqués)
--   - valuation_computed_at       : timestamp du calcul (réf moteur version
--     dans audit_events)
--
-- La colonne `incremental_fair_value` existe déjà depuis Module 3b B6
-- (delta * units_outstanding stocké en numeric). Module 11 B2 livre le
-- calcul effectif via Server Action `computeIncrementalFairValue`.
--
-- Idempotent (ADD COLUMN IF NOT EXISTS) — safe to re-apply.
-- =============================================================================

ALTER TABLE award_modifications
  ADD COLUMN IF NOT EXISTS valuation_pre_modification numeric,
  ADD COLUMN IF NOT EXISTS valuation_post_modification numeric,
  ADD COLUMN IF NOT EXISTS valuation_computed_at timestamp with time zone;

COMMENT ON COLUMN award_modifications.valuation_pre_modification IS
  'Module 11 B2 — fair_value_per_unit calculé sur le plan AVANT modification (audit IFRS 2.27-28).';

COMMENT ON COLUMN award_modifications.valuation_post_modification IS
  'Module 11 B2 — fair_value_per_unit calculé sur le plan APRÈS modification (avec new_plan_terms appliqués).';

COMMENT ON COLUMN award_modifications.valuation_computed_at IS
  'Module 11 B2 — timestamp du calcul des valuations pré/post. Référence engine_version dans audit_events `award_modifications.incremental_fv_computed`.';
