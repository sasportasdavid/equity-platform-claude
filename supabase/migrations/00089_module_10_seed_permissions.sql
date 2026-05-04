-- =============================================================================
-- Module 10 B1 — Migration 00089 : seed permissions Module 10
-- =============================================================================
--
-- Role mappings ajustés vs spec §2.10 — cf chat user erratum Q4 :
--   - OWNER         : write complète (cap_table / share_classes / funding_rounds / scenarios / snapshots / import)
--   - ADMIN_HR      : read.all + scenarios.read/create/run_montecarlo + share_classes.read + funding_rounds.read
--                     PAS funding_rounds.create (acte engageant — OWNER only V1)
--                     PAS scenarios.delete (OWNER only)
--   - APPROVER      : read.all + funding_rounds.read (Module 5 workflow context)
--   - AUDITOR       : read.all + share_classes.read + funding_rounds.read
--   - BENEFICIARY   : read.own
--
-- Reference : docs/MODULE_10_CAP_TABLE.md §2.10
-- =============================================================================

-- 1. Insert permissions catalog (idempotent ON CONFLICT)
INSERT INTO permissions_catalog (code, category, description, is_dangerous) VALUES
  -- Cap table reads
  ('cap_table.read.all', 'cap_table', 'Voir toute la cap table de son org', FALSE),
  ('cap_table.read.own', 'cap_table', 'Voir ses propres positions (BENEFICIARY)', FALSE),
  ('cap_table.import_csv', 'cap_table', 'Importer un cap table historique CSV', TRUE),

  -- Share classes
  ('share_classes.read', 'share_classes', 'Voir les classes d''actions', FALSE),
  ('share_classes.create', 'share_classes', 'Créer une classe d''actions', TRUE),
  ('share_classes.update', 'share_classes', 'Modifier une classe d''actions', TRUE),
  ('share_classes.deactivate', 'share_classes', 'Désactiver une classe d''actions', TRUE),

  -- Funding rounds
  ('funding_rounds.read', 'funding_rounds', 'Voir les levées', FALSE),
  ('funding_rounds.create', 'funding_rounds', 'Créer une levée (atomique)', TRUE),
  ('funding_rounds.cancel', 'funding_rounds', 'Annuler une levée DRAFT', TRUE),

  -- Dilution scenarios
  ('dilution_scenarios.read', 'dilution_scenarios', 'Voir les scénarios partagés ou ses propres scénarios', FALSE),
  ('dilution_scenarios.create', 'dilution_scenarios', 'Créer un scénario de dilution', FALSE),
  ('dilution_scenarios.run_montecarlo', 'dilution_scenarios', 'Lancer une simulation Monte Carlo de sortie', FALSE),
  ('dilution_scenarios.delete', 'dilution_scenarios', 'Supprimer un scénario', TRUE),

  -- Snapshots
  ('cap_table_snapshots.create', 'cap_table_snapshots', 'Créer un snapshot manuel ou auto', FALSE)

ON CONFLICT (code) DO NOTHING;

-- 2. OWNER : tout
INSERT INTO role_permissions (role, permission_code) VALUES
  ('OWNER', 'cap_table.read.all'),
  ('OWNER', 'cap_table.read.own'),
  ('OWNER', 'cap_table.import_csv'),
  ('OWNER', 'share_classes.read'),
  ('OWNER', 'share_classes.create'),
  ('OWNER', 'share_classes.update'),
  ('OWNER', 'share_classes.deactivate'),
  ('OWNER', 'funding_rounds.read'),
  ('OWNER', 'funding_rounds.create'),
  ('OWNER', 'funding_rounds.cancel'),
  ('OWNER', 'dilution_scenarios.read'),
  ('OWNER', 'dilution_scenarios.create'),
  ('OWNER', 'dilution_scenarios.run_montecarlo'),
  ('OWNER', 'dilution_scenarios.delete'),
  ('OWNER', 'cap_table_snapshots.create')
ON CONFLICT (role, permission_code) DO NOTHING;

-- 3. ADMIN_HR : reads + scenarios CRUD-create-run, no write critique
INSERT INTO role_permissions (role, permission_code) VALUES
  ('ADMIN_HR', 'cap_table.read.all'),
  ('ADMIN_HR', 'share_classes.read'),
  ('ADMIN_HR', 'funding_rounds.read'),
  ('ADMIN_HR', 'dilution_scenarios.read'),
  ('ADMIN_HR', 'dilution_scenarios.create'),
  ('ADMIN_HR', 'dilution_scenarios.run_montecarlo')
ON CONFLICT (role, permission_code) DO NOTHING;

-- 4. APPROVER : read pour valider via Module 5 workflow
INSERT INTO role_permissions (role, permission_code) VALUES
  ('APPROVER', 'cap_table.read.all'),
  ('APPROVER', 'funding_rounds.read')
ON CONFLICT (role, permission_code) DO NOTHING;

-- 5. AUDITOR : read total cohérent CAC
INSERT INTO role_permissions (role, permission_code) VALUES
  ('AUDITOR', 'cap_table.read.all'),
  ('AUDITOR', 'share_classes.read'),
  ('AUDITOR', 'funding_rounds.read')
ON CONFLICT (role, permission_code) DO NOTHING;

-- 6. BENEFICIARY : ses propres positions seulement
INSERT INTO role_permissions (role, permission_code) VALUES
  ('BENEFICIARY', 'cap_table.read.own')
ON CONFLICT (role, permission_code) DO NOTHING;

COMMENT ON TABLE permissions_catalog IS
  COALESCE(obj_description('public.permissions_catalog'::regclass), '') ||
  ' Module 10 (00089) : 15 nouvelles permissions cap_table / share_classes / funding_rounds / dilution_scenarios / cap_table_snapshots.';
