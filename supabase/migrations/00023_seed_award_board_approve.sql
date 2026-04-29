-- =============================================================================
-- Module 3b — sous-module B7 : seed permission `awards.board.approve`
-- =============================================================================
--
-- Permission manquante du seed Module 1/2 (`awards.bulk_import` était bien
-- présente, voir 00005_module_2_extend_permissions.sql + 00006_module_2_role_permissions.sql).
--
-- `awards.board.approve` autorise la transition BOARD_APPROVED dans la state
-- machine (cf. apps/web/src/lib/stateMachines/awardStateMachine.ts).
-- Mappée à OWNER (couvert par le seed `WHERE code NOT IN ...` du 00003) +
-- APPROVER (rôle dédié à l'approbation board en V1).
-- =============================================================================

INSERT INTO permissions_catalog (code, category, description, is_dangerous) VALUES
  ('awards.board.approve', 'AWARDS', 'Approuver une attribution au niveau board', false)
ON CONFLICT (code) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  is_dangerous = EXCLUDED.is_dangerous;

-- OWNER : déjà couvert par le seed `WHERE code NOT IN ('awards.read.own', 'awards.exercise')`
-- du 00003_seed_referentials.sql, mais on re-insère idempotent au cas où.
INSERT INTO role_permissions (role, permission_code) VALUES
  ('OWNER',    'awards.board.approve'),
  ('APPROVER', 'awards.board.approve')
ON CONFLICT DO NOTHING;
