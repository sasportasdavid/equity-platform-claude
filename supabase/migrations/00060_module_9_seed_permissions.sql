-- ============================================================
-- Module 9 B1 — Seed permissions Module 9 (10) + role mappings
-- ============================================================

-- Note recon : permissions_catalog a une colonne `category` NOT NULL (UPPERCASE).
-- Catégories existantes : APPROVALS, AUDIT, AWARDS, BENEFICIARIES, CAP_TABLE,
-- COMPANIES, COMPLIANCE, DOCUMENTS, NOTIFICATIONS, ORGANIZATION, PLANS, PORTAL,
-- REPORTS, VALUATIONS. On ajoute EXERCISES + EXERCISE_WORKFLOWS pour Module 9.
INSERT INTO permissions_catalog (code, category, description) VALUES
  ('exercises.request.own',     'EXERCISES',           'Demander un exercice sur ses awards'),
  ('exercises.read.own',        'EXERCISES',           'Voir ses propres exercices'),
  ('exercises.read.all',        'EXERCISES',           'Voir tous les exercices de l''org'),
  ('exercises.approve',         'EXERCISES',           'Approuver une demande d''exercice'),
  ('exercises.cancel.own',      'EXERCISES',           'Annuler sa propre demande PENDING'),
  ('exercises.cancel.any',      'EXERCISES',           'Annuler toute demande de l''org'),
  ('exercises.confirm_payment', 'EXERCISES',           'Confirmer réception paiement'),
  ('exercise_workflows.read',   'EXERCISE_WORKFLOWS',  'Voir les workflows d''exercice'),
  ('exercise_workflows.update', 'EXERCISE_WORKFLOWS',  'Modifier workflow + paliers'),
  ('companies.fmv.update',      'COMPANIES',           'Mettre à jour le FMV de la société')
ON CONFLICT (code) DO NOTHING;

-- Mapping role-permissions
-- BENEFICIARY : self-service exercise + cancel + read own
-- OWNER       : full admin (all reads, cancel.any, confirm_payment, workflows, fmv)
-- ADMIN_HR    : reads + confirm_payment + workflows.read + fmv (delegate du OWNER)
-- AUDITOR     : reads only (compliance)
-- APPROVER    : pas de permission directe (l'approval workflow lui assigne via rôle)

INSERT INTO role_permissions (role, permission_code) VALUES
  ('BENEFICIARY', 'exercises.request.own'),
  ('BENEFICIARY', 'exercises.read.own'),
  ('BENEFICIARY', 'exercises.cancel.own'),
  ('OWNER',       'exercises.read.all'),
  ('OWNER',       'exercises.cancel.any'),
  ('OWNER',       'exercises.confirm_payment'),
  ('OWNER',       'exercise_workflows.read'),
  ('OWNER',       'exercise_workflows.update'),
  ('OWNER',       'companies.fmv.update'),
  ('ADMIN_HR',    'exercises.read.all'),
  ('ADMIN_HR',    'exercises.confirm_payment'),
  ('ADMIN_HR',    'exercise_workflows.read'),
  ('ADMIN_HR',    'companies.fmv.update'),
  ('AUDITOR',     'exercises.read.all'),
  ('AUDITOR',     'exercise_workflows.read')
ON CONFLICT DO NOTHING;
