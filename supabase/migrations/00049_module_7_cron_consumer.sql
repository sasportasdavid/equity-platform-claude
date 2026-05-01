-- =============================================================================
-- Module 7 B3 — Schedule cron `notifications-consumer-tick`
-- =============================================================================
-- Trigger l'EF `notifications-consumer` toutes les minutes via pg_cron +
-- net.http_post. L'EF fait le travail (lock batch via RPC + Resend send +
-- UPDATE status).
--
-- Pré-requis (B3 setup) :
--   1. EF `notifications-consumer` deployée (verify_jwt=true)
--   2. Vault secret `service_role_key` créé (via bootstrap_service_role_vault_secret
--      one-shot helper, drop après usage)
--   3. pg_cron + pg_net extensions actives (B1 migration 00047)
--
-- Si le cron tick avant que la setup soit complète, le SELECT
-- vault.decrypted_secrets retourne NULL → Bearer 'null' → EF répond 401 →
-- le cron run échoue silencieusement (visible dans cron.job_run_details).
-- C'est tolérable : aucune notif perdue, le tick suivant retry.
-- =============================================================================

-- Idempotent : unschedule si déjà existant (au cas où on rejoue la migration)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notifications-consumer-tick') THEN
    PERFORM cron.unschedule('notifications-consumer-tick');
  END IF;
END $$;

SELECT cron.schedule(
  'notifications-consumer-tick',
  '* * * * *',  -- chaque minute (granularité minimum pg_cron Supabase)
  $$
  SELECT net.http_post(
    url := 'https://ytlfnxcrclugrsbvqdkb.supabase.co/functions/v1/notifications-consumer',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
          FROM vault.decrypted_secrets
         WHERE name = 'service_role_key'
      )
    ),
    body := jsonb_build_object('trigger', 'cron')
  );
  $$
);
