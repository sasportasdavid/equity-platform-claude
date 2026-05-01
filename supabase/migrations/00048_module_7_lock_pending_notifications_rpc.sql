-- =============================================================================
-- Module 7 B1 — RPC lock_pending_notifications (consumer pattern)
-- =============================================================================
-- Pattern producer/consumer pour l'EF `notifications-consumer` (B3) :
-- - SELECT FOR UPDATE SKIP LOCKED → garantit qu'aucun autre worker
--   concurrent ne pickup les mêmes rows
-- - Marque les rows en SENDING (état intermédiaire ajouté en 00043)
-- - Filtre channel='EMAIL' (Module 7 V1 = email only ; IN_APP/SMS différé)
-- - Filtre subject IS NOT NULL et body IS NOT NULL (notif déjà rendered)
-- - Filtre retry_count < 5 (anti-loop sur erreurs persistantes)
-- - Order by created_at (FIFO)
-- - Batch size paramétrable (default 50, ajustable selon throughput EF)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.lock_pending_notifications(
  p_batch_size INTEGER DEFAULT 50
)
RETURNS SETOF public.notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
    UPDATE public.notifications
       SET status = 'SENDING',
           last_retry_at = now(),
           updated_at = now()
     WHERE id IN (
       SELECT id FROM public.notifications
        WHERE status = 'PENDING'
          AND channel = 'EMAIL'
          AND recipient_email IS NOT NULL
          AND subject IS NOT NULL
          AND body IS NOT NULL
          AND retry_count < 5
        ORDER BY created_at
        LIMIT p_batch_size
        FOR UPDATE SKIP LOCKED
     )
     RETURNING *;
END $$;

COMMENT ON FUNCTION public.lock_pending_notifications(INTEGER) IS
  'Module 7 B1 — Consumer pattern : pickup PENDING EMAIL rendered + retry_count < 5, marque SENDING via FOR UPDATE SKIP LOCKED. Appelé par l''EF notifications-consumer.';

GRANT EXECUTE ON FUNCTION public.lock_pending_notifications(INTEGER) TO service_role;
