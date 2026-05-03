-- ============================================================
-- Module 9 B1 — Companies FMV + Organizations bank coordinates
-- ============================================================
--
-- Adaptation recon : la spec demandait juste "companies FMV + founded_at +
-- bspce_first_grant_date". Recon a montré :
--   1. `companies.founded_date` existe déjà (Module 1) — on NE l'ajoute PAS
--      en doublon. Les lectures/calculs utiliseront `founded_date`.
--   2. `organizations` n'a aucune colonne bancaire alors que B5 va générer
--      des bulletins de souscription avec coordonnées de virement → ajouté
--      ici pour éviter une migration B5 séparée (cohérence DDL).

-- 1. companies — FMV manuelle (admin update) + ancienneté BSPCE
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS last_known_fmv_per_share NUMERIC,
  ADD COLUMN IF NOT EXISTS fmv_as_of_date DATE,
  ADD COLUMN IF NOT EXISTS fmv_source TEXT,
  -- 'MANUAL' | 'LAST_VALUATION' | 'EXTERNAL'
  ADD COLUMN IF NOT EXISTS fmv_notes TEXT,
  ADD COLUMN IF NOT EXISTS fmv_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fmv_updated_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS bspce_first_grant_date DATE;

COMMENT ON COLUMN companies.last_known_fmv_per_share IS
  'Module 9 — FMV par action utilisée pour le snapshot exercise_requests.fmv_per_unit_at_request';
COMMENT ON COLUMN companies.fmv_source IS
  'MANUAL (saisi admin) | LAST_VALUATION (depuis valuation_runs Module 3a) | EXTERNAL';
COMMENT ON COLUMN companies.bspce_first_grant_date IS
  'Module 9 — date du premier grant BSPCE. Sert au calcul ancienneté article 163 bis G';

-- Note : `founded_date` est utilisé pour l'ancienneté société (V1 simplifié).
-- La règle exacte article 163 bis G nécessite des checks plus précis (V2).

-- 2. organizations — coordonnées bancaires pour bulletin de souscription B5
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS bank_iban TEXT,
  ADD COLUMN IF NOT EXISTS bank_bic TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT;

COMMENT ON COLUMN organizations.bank_iban IS
  'Module 9 B5 — IBAN destinataire pour les paiements d''exercice (bulletin de souscription)';
