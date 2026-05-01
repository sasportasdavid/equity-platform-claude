-- =============================================================================
-- Module 7 B4 — Add COMPLAINED to notifications status CHECK
-- =============================================================================
-- Le webhook Resend émet `email.complained` quand le destinataire signale
-- un email comme spam. La spec §6.1 mappe cet event vers status='COMPLAINED'
-- — mais le check constraint posé en B1 (00043) n'incluait que :
--   ('PENDING','SENDING','SENT','DELIVERED','FAILED','BOUNCED')
--
-- On étend pour supporter ce 7e statut.
-- =============================================================================

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_status_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_status_check
  CHECK (
    status IN ('PENDING','SENDING','SENT','DELIVERED','FAILED','BOUNCED','COMPLAINED')
  );
