-- =============================================================================
-- Module 7 B1 — Seed permissions notifications.* + notification_templates.*
-- =============================================================================
-- 6 permissions + role mappings selon §1.2 spec MODULE_07.
-- Aucune permission notifications.* n'existait avant (recon B1 confirmée).
-- =============================================================================

INSERT INTO public.permissions_catalog (code, category, description) VALUES
  ('notifications.read.all', 'NOTIFICATIONS', 'Voir toutes les notifications de l''organisation'),
  ('notifications.read.own', 'NOTIFICATIONS', 'Voir ses propres notifications'),
  ('notifications.send', 'NOTIFICATIONS', 'Insérer une notification manuelle'),
  ('notifications.cancel', 'NOTIFICATIONS', 'Annuler une notification PENDING'),
  ('notification_templates.read', 'NOTIFICATIONS', 'Lire le catalogue de templates'),
  ('notification_templates.update', 'NOTIFICATIONS', 'Modifier un template')
ON CONFLICT (code) DO NOTHING;

-- Mapping role-permissions (§1.2 spec)
INSERT INTO public.role_permissions (role, permission_code) VALUES
  ('OWNER', 'notifications.read.all'),
  ('OWNER', 'notifications.send'),
  ('OWNER', 'notifications.cancel'),
  ('OWNER', 'notification_templates.read'),
  ('OWNER', 'notification_templates.update'),
  ('ADMIN_HR', 'notifications.read.all'),
  ('ADMIN_HR', 'notifications.send'),
  ('ADMIN_HR', 'notification_templates.read'),
  ('AUDITOR', 'notifications.read.all'),
  ('AUDITOR', 'notification_templates.read'),
  ('APPROVER', 'notifications.read.own'),
  ('BENEFICIARY', 'notifications.read.own')
ON CONFLICT DO NOTHING;
