-- =============================================================================
-- Module 4 — sous-module B1.4 : seed 3 nouvelles permissions beneficiaries.*
-- =============================================================================
-- Cf. memory/module_4_b1_recon.md : 6/9 permissions déjà seedées en Module 2/3b.
-- Manquantes :
--   - beneficiaries.lifecycle    → OWNER, ADMIN_HR
--   - beneficiaries.bulk_import  → OWNER, ADMIN_HR
--   - beneficiaries.export       → OWNER, ADMIN_HR, AUDITOR (Module 13 préemptif)
--
-- Skip beneficiaries.read.all et .read.own — pas en V1 (différé Module 8 portail).
-- Idempotent (ON CONFLICT DO NOTHING).
-- =============================================================================

INSERT INTO permissions_catalog (code, category, description, is_dangerous) VALUES
  ('beneficiaries.lifecycle',   'BENEFICIARIES', 'Transitionner le statut bénéficiaire (active/on_leave/terminated)', false),
  ('beneficiaries.bulk_import', 'BENEFICIARIES', 'Importer un CSV de bénéficiaires (max 500 rows)', true),
  ('beneficiaries.export',      'BENEFICIARIES', 'Exporter la liste bénéficiaires en CSV', false)
ON CONFLICT (code) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  is_dangerous = EXCLUDED.is_dangerous;

INSERT INTO role_permissions (role, permission_code) VALUES
  ('OWNER',    'beneficiaries.lifecycle'),
  ('ADMIN_HR', 'beneficiaries.lifecycle'),
  ('OWNER',    'beneficiaries.bulk_import'),
  ('ADMIN_HR', 'beneficiaries.bulk_import'),
  ('OWNER',    'beneficiaries.export'),
  ('ADMIN_HR', 'beneficiaries.export'),
  ('AUDITOR',  'beneficiaries.export')
ON CONFLICT DO NOTHING;
