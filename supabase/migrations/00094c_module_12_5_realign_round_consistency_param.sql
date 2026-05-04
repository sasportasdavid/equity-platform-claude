-- Migration 00094c — Module 12.5 B3
-- Realign params_schema for ROUND_AMOUNT_CONSISTENCY (toleranceEur → tolerancePct)
--
-- Decision V1.X (validated 2026-05-04) : tolerance absolue en € ne scale pas
-- avec la taille du round. 1 % relatif (default) plus robuste pour rounds de
-- 1k€ à 100M€.
--
-- Safety check pré-apply : 0 overrides existants pour ROUND_AMOUNT_CONSISTENCY
-- (V1, aucune org en prod n'a encore configuré la rule via UI Module 12).
-- Aucune data migration des overrides nécessaire.
--
-- Note FMV_RECENT_ENOUGH : la DB a déjà `staleDays=90` (default seedé en
-- 00094b). Pas de UPDATE DB nécessaire — on aligne le code sur le naming DB
-- (refactor `maxMonths` → `staleDays` côté checker TS).

UPDATE public.compliance_rule_definitions
SET
  params_schema = '{"tolerancePct":{"type":"number","min":0,"max":50,"default":1,"label_fr":"Tolérance (%)"}}'::jsonb,
  default_params = '{"tolerancePct":1}'::jsonb
WHERE rule_code = 'ROUND_AMOUNT_CONSISTENCY';
