-- ============================================================================
-- MODULE 5 B1 — Seed permission approvals.attach
--
-- Recon a montré que 5 permissions approvals.* existent déjà (Module 1) :
--   - approvals.read       (OWNER, ADMIN_HR, APPROVER, AUDITOR)
--   - approvals.act        (OWNER, APPROVER)
--   - approvals.approve    (OWNER, APPROVER)
--   - approvals.reject     (OWNER, APPROVER)
--   - approvals.configure  (OWNER)
--   - approvals.delegate   (OWNER, APPROVER)
--
-- Manque approvals.attach (créer + attacher un workflow à un plan / définir
-- le default org). Mappée sur OWNER + ADMIN_HR.
-- ============================================================================

INSERT INTO permissions_catalog (code, category, description, is_dangerous)
VALUES (
  'approvals.attach',
  'approvals',
  'Attacher un workflow à un plan ou le définir comme default org',
  false
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role, permission_code) VALUES
  ('OWNER', 'approvals.attach'),
  ('ADMIN_HR', 'approvals.attach')
ON CONFLICT (role, permission_code) DO NOTHING;
