-- ============================================================================
-- MODULE 5 B1 — Seed notification template "approval_pending"
--
-- Découpée du 00031 après détection FK manquante au test C : les RPCs
-- start_approval_workflow / evaluate_approval_request font INSERT dans
-- notifications.template_code qui a une FK vers notification_templates.code.
--
-- V1 = stub IN_APP. Module 7 enrichira (subject Markdown, multi-locale,
-- channel EMAIL via Resend, etc.).
-- ============================================================================

INSERT INTO notification_templates (code, channel, locale, subject, body_template, available_variables, is_active)
VALUES (
  'approval_pending',
  'IN_APP',
  'fr-FR',
  'Approbation requise',
  'Une nouvelle décision est en attente de votre approbation (étape {{step_order}} — {{step_name}}).',
  '{"award_id":"uuid","award_number":"text","step_order":"int","step_name":"text"}'::jsonb,
  true
)
ON CONFLICT (code) DO NOTHING;
