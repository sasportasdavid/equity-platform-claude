-- ============================================================================
-- Module 8 B1 — RLS vesting_events (idempotent, défense en profondeur)
--
-- Recon a confirmé que les 2 policies existent déjà en cloud :
--   - vesting_events_select_admin       (org_id = current_org_id() + perm)
--   - vesting_events_select_beneficiary (is_award_beneficiary(award_id))
--
-- Cette migration les recrée IF NOT EXISTS (no-op si présentes) pour
-- garantir le contrat portal côté local + futurs clones du repo.
--
-- Pas de modification du trigger enforce_beneficiary_self_update : la spec
-- mentionne `tax_residence` mais la DB utilise `tax_residence_country` qui
-- est volontairement BLOQUÉ par le trigger (donnée fiscale critique avec
-- impact paie/impôt — ne doit pas être self-modifiable).
-- ============================================================================

ALTER TABLE public.vesting_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'vesting_events'
       AND policyname = 'vesting_events_select_admin'
  ) THEN
    CREATE POLICY vesting_events_select_admin ON public.vesting_events FOR SELECT
      USING (
        org_id = current_org_id()
        AND has_permission('awards.read.all')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'vesting_events'
       AND policyname = 'vesting_events_select_beneficiary'
  ) THEN
    CREATE POLICY vesting_events_select_beneficiary ON public.vesting_events FOR SELECT
      USING (
        award_id IN (
          SELECT a.id FROM public.awards a
            JOIN public.beneficiaries b ON b.id = a.beneficiary_id
           WHERE b.user_id = auth.uid()
             AND a.deleted_at IS NULL
        )
      );
  END IF;
END $$;
