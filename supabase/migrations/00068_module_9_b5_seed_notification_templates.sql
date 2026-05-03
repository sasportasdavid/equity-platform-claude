-- ============================================================================
-- Module 9 B5 — Seed 5 templates EMAIL exercise V1
-- ============================================================================
--
-- 5 templates EMAIL fr-FR pour le workflow d'exercice. ON CONFLICT idempotent
-- sur PK composite (code, channel, locale) — un re-run met à jour subject /
-- body_template / available_variables / react_email_component / preview_text.
--
-- 1. exercise_request_submitted          — admin (ADMIN_HR/OWNER) après portal
-- 2. exercise_request_approved           — bénéficiaire après decision finale APPROVED
-- 3. exercise_request_rejected           — bénéficiaire après decision finale REJECTED
-- 4. exercise_payment_confirmed          — bénéficiaire après confirm_exercise_payment
-- 5. exercise_request_cancelled_by_admin — bénéficiaire après adminCancelExercise
--
-- Pas de IN_APP V1 (channel EMAIL only). Les composants React vivent dans
-- apps/web/src/lib/resend/templates/Exercise*.tsx (livrés C2).
-- ============================================================================

INSERT INTO public.notification_templates (
  code, channel, locale, subject, body_template,
  available_variables, react_email_component, preview_text, is_active
) VALUES
  (
    'exercise_request_submitted',
    'EMAIL',
    'fr-FR',
    'Nouvelle demande d''exercice {{request_number}} — {{beneficiary_name}}',
    'Une nouvelle demande d''exercice a été soumise.',
    '{"recipient_name":"text","request_number":"text","beneficiary_name":"text","award_number":"text","plan_type":"text","units":"number","total_cost":"number","requested_at":"date","approval_url":"text","app_url":"text"}'::jsonb,
    'ExerciseRequestSubmittedEmail',
    'Une demande d''exercice attend votre approbation',
    true
  ),
  (
    'exercise_request_approved',
    'EMAIL',
    'fr-FR',
    'Votre demande d''exercice {{request_number}} a été approuvée',
    'Votre demande a été approuvée. Vous pouvez maintenant procéder au virement.',
    '{"recipient_name":"text","request_number":"text","units":"number","plan_type":"text","strike_price":"number","total_cost":"number","bank_iban":"text","bank_bic":"text","bank_name":"text","org_name":"text","payment_deadline_days":"number","exercise_url":"text","app_url":"text"}'::jsonb,
    'ExerciseRequestApprovedEmail',
    'Votre demande d''exercice est approuvée — virement requis',
    true
  ),
  (
    'exercise_request_rejected',
    'EMAIL',
    'fr-FR',
    'Votre demande d''exercice {{request_number}} a été refusée',
    'Votre demande d''exercice a été refusée.',
    '{"recipient_name":"text","request_number":"text","award_number":"text","approver_name":"text","reason":"text","exercise_url":"text","app_url":"text"}'::jsonb,
    'ExerciseRequestRejectedEmail',
    'Votre demande d''exercice a été refusée',
    true
  ),
  (
    'exercise_payment_confirmed',
    'EMAIL',
    'fr-FR',
    'Paiement reçu — vos {{units}} {{plan_type}} sont exercés',
    'Votre paiement a été reçu. Vous êtes désormais actionnaire.',
    '{"recipient_name":"text","request_number":"text","units":"number","plan_type":"text","total_amount":"number","payment_reference":"text","org_name":"text","exercise_url":"text","award_url":"text","app_url":"text"}'::jsonb,
    'ExercisePaymentConfirmedEmail',
    'Votre paiement est reçu — vous êtes actionnaire',
    true
  ),
  (
    'exercise_request_cancelled_by_admin',
    'EMAIL',
    'fr-FR',
    'Votre demande d''exercice {{request_number}} a été annulée',
    'Votre demande d''exercice a été annulée par un administrateur.',
    '{"recipient_name":"text","request_number":"text","award_number":"text","admin_name":"text","reason":"text","award_url":"text","app_url":"text"}'::jsonb,
    'ExerciseRequestCancelledByAdminEmail',
    'Votre demande d''exercice a été annulée',
    true
  )
ON CONFLICT (code, channel, locale) DO UPDATE SET
  subject = EXCLUDED.subject,
  body_template = EXCLUDED.body_template,
  available_variables = EXCLUDED.available_variables,
  react_email_component = EXCLUDED.react_email_component,
  preview_text = EXCLUDED.preview_text,
  updated_at = now();
