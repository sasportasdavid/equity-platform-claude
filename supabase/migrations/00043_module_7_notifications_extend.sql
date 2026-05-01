-- =============================================================================
-- Module 7 B1 — Notifications schema finalization
-- =============================================================================
-- Étend les tables `notifications` et `notification_templates` (Module 1
-- préfigurées) avec les champs Resend tracking + react-email rendering.
-- Étend le check status pour inclure SENDING (état intermédiaire pour le
-- pattern FOR UPDATE SKIP LOCKED du consumer EF).
-- Ajoute la policy INSERT manquante sur notifications (besoin
-- `notifications.send` permission).
-- Cleanup des PENDING orphelines legacy Module 5 (subject/body NULL,
-- jamais consommées par un consumer car n'existait pas).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. notifications : extend pour Resend tracking
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS resend_email_id TEXT,
  ADD COLUMN IF NOT EXISTS resend_response JSONB,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON COLUMN public.notifications.resend_email_id IS
  'ID retourné par l''API Resend POST /emails. Indexé pour lookup webhook.';
COMMENT ON COLUMN public.notifications.retry_count IS
  'Nombre de tentatives d''envoi (max 5 dans lock_pending_notifications RPC).';

-- ---------------------------------------------------------------------------
-- 2. status CHECK : ajoute SENDING (intermédiaire FOR UPDATE SKIP LOCKED)
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_status_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_status_check
  CHECK (status IN ('PENDING','SENDING','SENT','DELIVERED','FAILED','BOUNCED'));

-- ---------------------------------------------------------------------------
-- 3. Indexes (consumer + webhook + IN_APP recipient feed)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notifications_pending_email
  ON public.notifications(status, channel, created_at)
  WHERE status = 'PENDING' AND channel = 'EMAIL';

CREATE INDEX IF NOT EXISTS idx_notifications_resend_id
  ON public.notifications(resend_email_id)
  WHERE resend_email_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON public.notifications(user_id, created_at)
  WHERE channel = 'IN_APP';

-- ---------------------------------------------------------------------------
-- 4. notification_templates : extend pour react-email rendering
-- ---------------------------------------------------------------------------
-- (Le PK composite est posé séparément en 00044 — il nécessite de DROP
-- la FK notifications.template_code et le PK Module 1 sur code seul.)
ALTER TABLE public.notification_templates
  ADD COLUMN IF NOT EXISTS react_email_component TEXT,
  ADD COLUMN IF NOT EXISTS plain_text_template TEXT,
  ADD COLUMN IF NOT EXISTS preview_text TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON COLUMN public.notification_templates.react_email_component IS
  'Nom du composant React-Email (ex: ApprovalPendingEmail). Le renderer le mappe vers le composant dans @/lib/email/templates/.';

-- ---------------------------------------------------------------------------
-- 5. RLS INSERT policy (manquante — Module 1 a SELECT/UPDATE only)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS notifications_insert_admin ON public.notifications;
CREATE POLICY notifications_insert_admin ON public.notifications
  FOR INSERT
  WITH CHECK (
    org_id = current_org_id()
    AND user_has_permission('notifications.send')
  );

-- ---------------------------------------------------------------------------
-- 6. Cleanup PENDING orphelines legacy (Module 5 IN_APP sans subject/body)
-- ---------------------------------------------------------------------------
-- Marque FAILED-legacy les notifications PENDING qui n'ont jamais été
-- rendered (subject OR body NULL). Évite qu'elles polluent le consumer
-- (même si le filtre EMAIL les écarterait déjà) ou une future UI IN_APP.
UPDATE public.notifications
   SET status = 'FAILED',
       failed_at = COALESCE(failed_at, now()),
       failure_reason = 'Legacy notification from Module 5 (pre-Module 7) — auto-marked FAILED at B1 cleanup'
 WHERE status = 'PENDING'
   AND (subject IS NULL OR body IS NULL);
