-- ===========================================================================
-- Capiwise — Equity Platform
-- Migration 00011 : pg_cron jobs (Module 2 §9)
--
-- Active l'extension pg_cron (disponible sur Supabase) et crée 2 jobs :
--   1. expire-invitations         — quotidien 02:00 UTC
--      Passe en EXPIRED toutes les invitations PENDING dont la date
--      d'expiration est dépassée, avec audit_event par invitation.
--   2. cleanup-old-notifications  — hebdomadaire dim 03:00 UTC
--      Supprime les notifications terminées (DELIVERED/FAILED/BOUNCED)
--      de plus de 90 jours.
--
-- Inspecter les jobs après application :
--   SELECT * FROM cron.job;
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
-- ===========================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'expire-invitations',
  '0 2 * * *',
  $$
    WITH expired AS (
      UPDATE invitations
         SET status = 'EXPIRED'
       WHERE status = 'PENDING'
         AND expires_at < now()
       RETURNING id, org_id, email
    )
    INSERT INTO audit_events (org_id, event_type, resource_type, resource_id, metadata)
    SELECT org_id, 'invitation.expired', 'INVITATION', id, jsonb_build_object('email', email)
      FROM expired;
  $$
);

SELECT cron.schedule(
  'cleanup-old-notifications',
  '0 3 * * 0',
  $$
    DELETE FROM notifications
     WHERE created_at < now() - interval '90 days'
       AND status IN ('DELIVERED', 'FAILED', 'BOUNCED');
  $$
);
