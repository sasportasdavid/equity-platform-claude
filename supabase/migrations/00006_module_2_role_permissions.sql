-- ===========================================================================
-- Capiwise — Equity Platform
-- Migration 00006 : Mapping rôles → nouvelles permissions Module 2 (§3.2)
--
-- Stratégie additive uniquement (ON CONFLICT DO NOTHING) : on ajoute
-- les mappings pour les 20 codes introduits par 00005, on ne révoque
-- jamais ce que Module 1 a déjà accordé.
--
-- Si la spec Module 2 est plus restrictive que Module 1 sur certains
-- rôles (ex : ADMIN_HR n'a pas awards.cancel/modify dans M2 mais l'a
-- dans M1), on garde la version M1 — restrictive < permissive en
-- compatibilité ascendante. Le retrait éventuel se fera via une
-- migration explicite ultérieure si besoin.
-- ===========================================================================

-- OWNER : super-admin, doit avoir TOUTES les permissions du catalogue.
-- (Module 1 excluait awards.read.own / awards.exercise qui sont des
-- perms bénéficiaire ; Module 2 §3.2 dit "tout" → on les ajoute.)
INSERT INTO role_permissions (role, permission_code)
SELECT 'OWNER', code FROM permissions_catalog
ON CONFLICT DO NOTHING;

-- ADMIN_HR : voir org, gérer companies, données sensibles bénéficiaires,
-- inviter au portail, import massif, simulation captable, export valuations,
-- acquittement compliance.
INSERT INTO role_permissions (role, permission_code) VALUES
  ('ADMIN_HR', 'org.view'),
  ('ADMIN_HR', 'companies.create'),
  ('ADMIN_HR', 'companies.read'),
  ('ADMIN_HR', 'companies.update'),
  ('ADMIN_HR', 'beneficiaries.read.sensitive'),
  ('ADMIN_HR', 'beneficiaries.invite'),
  ('ADMIN_HR', 'awards.bulk_import'),
  ('ADMIN_HR', 'captable.simulate'),
  ('ADMIN_HR', 'valuations.export'),
  ('ADMIN_HR', 'compliance.acknowledge')
ON CONFLICT DO NOTHING;

-- APPROVER : voir org, approuver awards directement, acte d'approbation
-- (alias .act), accès lecture audit pour vérifier le contexte.
INSERT INTO role_permissions (role, permission_code) VALUES
  ('APPROVER', 'org.view'),
  ('APPROVER', 'awards.approve'),
  ('APPROVER', 'approvals.act'),
  ('APPROVER', 'audit.read')
ON CONFLICT DO NOTHING;

-- AUDITOR : voir org, exporter valuations.
INSERT INTO role_permissions (role, permission_code) VALUES
  ('AUDITOR', 'org.view'),
  ('AUDITOR', 'valuations.export')
ON CONFLICT DO NOTHING;

-- BENEFICIARY : nouvel alias pour ses propres documents (le code applicatif
-- migrera de documents.read vers documents.read.own au fil du module 6).
INSERT INTO role_permissions (role, permission_code) VALUES
  ('BENEFICIARY', 'documents.read.own')
ON CONFLICT DO NOTHING;
