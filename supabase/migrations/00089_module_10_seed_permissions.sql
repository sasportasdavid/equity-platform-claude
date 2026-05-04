-- =============================================================================
-- Module 10 B1 — Migration 00089 : seed permissions Module 10 (namespace captable.*)
-- =============================================================================
--
-- Aligne le seed sur le namespace captable.* (Module 1 + Module 10 cohérents)
-- + has_permission() (pattern dominant repo).
--
-- 4 permissions M1 legacy (`captable.read`, `.export`, `.simulate`, `.edit`)
-- restent en place — utilisées dans packages/shared/src/constants/{permissions,
-- roles}.ts. Pas de DELETE pour ne pas casser les imports TS. Cleanup en
-- chore-PR séparée V2 (cf memory/module_10_recon.md).
--
-- 13 nouvelles permissions Module 10 :
--
--   captable.read.all                   (= legacy captable.read mais plus précis,
--                                          pour distinguer read.own)
--   captable.read.own                   (BENEFICIARY voit ses positions)
--   captable.share_class.create
--   captable.share_class.update
--   captable.share_class.deactivate
--   captable.round.read
--   captable.round.create
--   captable.round.cancel
--   captable.scenario.read
--   captable.scenario.create
--   captable.scenario.run_montecarlo
--   captable.scenario.delete
--   captable.snapshot.create
--   captable.import
--
-- Role mappings — Q4 ajusté chat user :
--   - OWNER       : write complète
--   - ADMIN_HR    : reads + scenarios.create/run/read (pas write critique)
--   - APPROVER    : read.all + round.read (Module 5 workflow)
--   - AUDITOR     : read.all + share_class/round.read (cohérent CAC)
--   - BENEFICIARY : read.own
--
-- Reference : docs/MODULE_10_CAP_TABLE.md §2.10 (erratum namespace).
-- =============================================================================

-- 1. Insert nouvelles permissions catalog (idempotent ON CONFLICT)
INSERT INTO permissions_catalog (code, category, description, is_dangerous) VALUES
  -- Lecture cap table
  ('captable.read.all', 'CAP_TABLE', 'Voir toute la cap table de son org', FALSE),
  ('captable.read.own', 'CAP_TABLE', 'Voir ses propres positions (BENEFICIARY)', FALSE),

  -- Share classes
  ('captable.share_class.create', 'CAP_TABLE', 'Creer une classe d''actions', TRUE),
  ('captable.share_class.update', 'CAP_TABLE', 'Modifier une classe d''actions', TRUE),
  ('captable.share_class.deactivate', 'CAP_TABLE', 'Desactiver (soft-delete) une classe d''actions', TRUE),

  -- Funding rounds
  ('captable.round.read', 'CAP_TABLE', 'Voir les levees', FALSE),
  ('captable.round.create', 'CAP_TABLE', 'Creer une levee (atomique)', TRUE),
  ('captable.round.cancel', 'CAP_TABLE', 'Annuler une levee DRAFT', TRUE),

  -- Dilution scenarios
  ('captable.scenario.read', 'CAP_TABLE', 'Voir les scenarios partages ou ses propres scenarios', FALSE),
  ('captable.scenario.create', 'CAP_TABLE', 'Creer un scenario de dilution', FALSE),
  ('captable.scenario.run_montecarlo', 'CAP_TABLE', 'Lancer une simulation Monte Carlo de sortie', FALSE),
  ('captable.scenario.delete', 'CAP_TABLE', 'Supprimer un scenario', TRUE),

  -- Snapshots
  ('captable.snapshot.create', 'CAP_TABLE', 'Creer un snapshot (manuel ou auto post-round)', FALSE),

  -- Import
  ('captable.import', 'CAP_TABLE', 'Importer un cap table historique CSV', TRUE)

ON CONFLICT (code) DO NOTHING;

-- 2. OWNER : tout (13 nouvelles permissions Module 10)
INSERT INTO role_permissions (role, permission_code) VALUES
  ('OWNER', 'captable.read.all'),
  ('OWNER', 'captable.read.own'),
  ('OWNER', 'captable.share_class.create'),
  ('OWNER', 'captable.share_class.update'),
  ('OWNER', 'captable.share_class.deactivate'),
  ('OWNER', 'captable.round.read'),
  ('OWNER', 'captable.round.create'),
  ('OWNER', 'captable.round.cancel'),
  ('OWNER', 'captable.scenario.read'),
  ('OWNER', 'captable.scenario.create'),
  ('OWNER', 'captable.scenario.run_montecarlo'),
  ('OWNER', 'captable.scenario.delete'),
  ('OWNER', 'captable.snapshot.create'),
  ('OWNER', 'captable.import')
ON CONFLICT (role, permission_code) DO NOTHING;

-- 3. ADMIN_HR : reads + scenarios CRUD-create-run, no write critique
INSERT INTO role_permissions (role, permission_code) VALUES
  ('ADMIN_HR', 'captable.read.all'),
  ('ADMIN_HR', 'captable.share_class.create'),
  ('ADMIN_HR', 'captable.round.read'),
  ('ADMIN_HR', 'captable.scenario.read'),
  ('ADMIN_HR', 'captable.scenario.create'),
  ('ADMIN_HR', 'captable.scenario.run_montecarlo')
ON CONFLICT (role, permission_code) DO NOTHING;

-- 4. APPROVER : read.all + round.read (pour valider via Module 5 workflow)
INSERT INTO role_permissions (role, permission_code) VALUES
  ('APPROVER', 'captable.read.all'),
  ('APPROVER', 'captable.round.read')
ON CONFLICT (role, permission_code) DO NOTHING;

-- 5. AUDITOR : read total cohérent CAC
INSERT INTO role_permissions (role, permission_code) VALUES
  ('AUDITOR', 'captable.read.all'),
  ('AUDITOR', 'captable.round.read'),
  ('AUDITOR', 'captable.scenario.read')
ON CONFLICT (role, permission_code) DO NOTHING;

-- 6. BENEFICIARY : ses propres positions seulement
INSERT INTO role_permissions (role, permission_code) VALUES
  ('BENEFICIARY', 'captable.read.own')
ON CONFLICT (role, permission_code) DO NOTHING;

COMMENT ON TABLE permissions_catalog IS
  COALESCE(obj_description('public.permissions_catalog'::regclass), '') ||
  ' Module 10 (00089) : 14 nouvelles permissions captable.* (read/write/scenarios/snapshots/import). 4 perms legacy M1 (captable.read/.export/.simulate/.edit) gardees pour TS imports.';
