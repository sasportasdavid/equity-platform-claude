-- ============================================================
-- Module 9 B1 — Seed compliance rules pour EXERCISE_REQUEST
-- ============================================================
--
-- 6 rules (5 hard + 1 soft) à raise lors de `request_exercise`.
--
-- Adaptation recon : `compliance_rules_catalog` n'a PAS de colonnes
-- `applies_to`/`enforcement` (spec v1) mais : `name`, `jurisdiction`,
-- `applies_to_plan_types[]`, `category`, `default_enforcement`,
-- `legal_reference`, `is_active`. Mapping retenu :
--   - category : ELIGIBILITY | PROCEDURE | QUANTITY | TIMING (existing)
--   - default_enforcement : 'hard' | 'soft'
--   - applies_to_plan_types : ['BSPCE','STOCK_OPTION','BSA'] (les 3 exercisables)
--   - jurisdiction : 'FR'

INSERT INTO compliance_rules_catalog (
  code, name, description,
  jurisdiction, applies_to_plan_types, category, default_enforcement, is_active
) VALUES
  ('EXERCISE_AWARD_GRANTED',
   'Award status exerçable',
   'L''award doit être GRANTED/VESTING/PARTIALLY_VESTED/FULLY_VESTED/PARTIALLY_EXERCISED avant exercise',
   'FR', ARRAY['BSPCE','STOCK_OPTION','BSA'], 'ELIGIBILITY', 'hard', true),

  ('EXERCISE_PROFILE_COMPLETE',
   'Profil bénéficiaire complet',
   'first_name, last_name, tax_residence_country, address_line_1, country tous non NULL',
   'FR', ARRAY['BSPCE','STOCK_OPTION','BSA'], 'PROCEDURE', 'hard', true),

  ('EXERCISE_UNITS_AVAILABLE',
   'Unités disponibles à l''exercice',
   'units_to_exercise <= units_vested - units_exercised (avec fallback snapshot V1)',
   'FR', ARRAY['BSPCE','STOCK_OPTION','BSA'], 'QUANTITY', 'hard', true),

  ('EXERCISE_NOT_EXPIRED',
   'Award non expiré',
   'Award expiry_date dans le futur (CURRENT_DATE)',
   'FR', ARRAY['BSPCE','STOCK_OPTION','BSA'], 'TIMING', 'hard', true),

  ('EXERCISE_PLAN_TYPE_EXERCISABLE',
   'Type de plan exerçable',
   'Plan type doit être BSPCE/STOCK_OPTION/BSA (AGA = pas d''exercise, juste acquisition)',
   'FR', ARRAY['BSPCE','STOCK_OPTION','BSA','AGA'], 'ELIGIBILITY', 'hard', true),

  ('EXERCISE_PAYMENT_DELAY_30D',
   'Paiement attendu sous 30 jours',
   'Paiement attendu sous 30 jours après approval (soft warning)',
   'FR', ARRAY['BSPCE','STOCK_OPTION','BSA'], 'TIMING', 'soft', true)

ON CONFLICT (code) DO NOTHING;
