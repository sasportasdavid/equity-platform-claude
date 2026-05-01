-- =============================================================================
-- Module 7 B1 — Seed 6 templates V1 (FR, EMAIL channel)
-- =============================================================================
-- Coexistent avec les 8 templates UPPERCASE Module 1 + 1 lowercase
-- approval_pending IN_APP Module 5 — pas de conflit (codes/channels distincts).
--
-- Idempotent via ON CONFLICT WHERE is_active=true → si déjà seedé,
-- update les champs subject/available_variables/react_email_component
-- (intentionnel : la spec Module 7 est l'autorité).
-- =============================================================================

INSERT INTO public.notification_templates (
  code, channel, locale, subject, body_template,
  available_variables, react_email_component, preview_text, is_active
) VALUES
  (
    'approval_pending',
    'EMAIL',
    'fr-FR',
    'Action requise : approbation d''attribution {{award_number}}',
    'Bonjour, vous avez une décision en attente sur Capiwise.',
    '{"recipient_name":"text","award_number":"text","award_units":"number","award_plan_type":"text","creator_name":"text","app_url":"text","approval_url":"text"}'::jsonb,
    'ApprovalPendingEmail',
    'Une attribution attend votre approbation',
    true
  ),
  (
    'approval_approved',
    'EMAIL',
    'fr-FR',
    'Attribution {{award_number}} approuvée',
    'Bonjour, votre proposition d''attribution a été approuvée.',
    '{"recipient_name":"text","award_number":"text","approver_name":"text","app_url":"text","award_url":"text"}'::jsonb,
    'ApprovalApprovedEmail',
    'Votre proposition a été approuvée',
    true
  ),
  (
    'approval_rejected',
    'EMAIL',
    'fr-FR',
    'Attribution {{award_number}} refusée',
    'Bonjour, votre proposition d''attribution a été refusée.',
    '{"recipient_name":"text","award_number":"text","approver_name":"text","reason":"text","app_url":"text","award_url":"text"}'::jsonb,
    'ApprovalRejectedEmail',
    'Votre proposition a été refusée',
    true
  ),
  (
    'award_granted',
    'EMAIL',
    'fr-FR',
    '{{org_name}} : votre attribution {{plan_type}} est active',
    'Bonjour, votre attribution est désormais active.',
    '{"beneficiary_name":"text","org_name":"text","award_number":"text","plan_type":"text","units":"number","exercise_price":"number","grant_date":"date","portal_url":"text"}'::jsonb,
    'AwardGrantedEmail',
    'Votre attribution est désormais active',
    true
  ),
  (
    'team_member_invite',
    'EMAIL',
    'fr-FR',
    '{{org_name}} : vous êtes invité à rejoindre l''équipe',
    'Bonjour, vous avez été invité par {{inviter_name}}.',
    '{"recipient_name":"text","inviter_name":"text","inviter_email":"text","org_name":"text","accept_url":"text","expires_at_human":"text","custom_message":"text"}'::jsonb,
    'TeamMemberInviteEmail',
    'Invitation à rejoindre une équipe Capiwise',
    true
  ),
  (
    'beneficiary_first_invite',
    'EMAIL',
    'fr-FR',
    '{{org_name}} : consultez votre attribution',
    'Bonjour, {{org_name}} vous invite à consulter votre attribution.',
    '{"beneficiary_name":"text","org_name":"text","accept_url":"text","expires_at_human":"text"}'::jsonb,
    'BeneficiaryFirstInviteEmail',
    'Consultez votre attribution',
    true
  )
-- ON CONFLICT cible le PK composite (code, channel, locale) — garantit
-- l'idempotence : un re-run met à jour les champs subject/body_template/
-- available_variables/react_email_component/preview_text + updated_at.
ON CONFLICT (code, channel, locale) DO UPDATE SET
  subject = EXCLUDED.subject,
  body_template = EXCLUDED.body_template,
  available_variables = EXCLUDED.available_variables,
  react_email_component = EXCLUDED.react_email_component,
  preview_text = EXCLUDED.preview_text,
  updated_at = now();
