-- =============================================================================
-- Bug #5bis (sprint 6 mai 2026 PM) — RLS policies INSERT + DELETE pour
-- compliance_alerts.
-- =============================================================================
--
-- Le helper `runComplianceChecks` (Module 3b B7) + `transitionAward` (Module
-- 3b B2) doivent désormais persister les errors bloquantes dans
-- `public.compliance_alerts` pour que :
--   1. L'UI puisse les afficher (composant ComplianceIssuesDialog)
--   2. Le dashboard admin Module 13 puisse retracer les blocages historiques
--   3. Le pattern delete-then-insert reste idempotent quand un user re-tente
--
-- Avant cette migration, seules SELECT + UPDATE étaient policies — INSERT et
-- DELETE étaient implicitement bloqués (RLS enabled sans policies = deny all
-- pour le rôle authenticated, sauf service_role). Les 2 alerts existantes en
-- DB ont été créées via SQL direct admin/seed.
--
-- Politique :
--   - INSERT : autorisé pour tout user authentifié de l'org active. La
--     permission métier (awards.propose, etc.) est gatée côté Server Action
--     qui appelle l'INSERT. RLS vérifie juste l'org match pour éviter les
--     leaks cross-org (cohérent avec Bug #6).
--   - DELETE : restreint aux alerts OPEN de l'org active. Permet l'idempotence
--     (delete-then-insert sur retry) sans permettre d'effacer des alerts
--     déjà ACKNOWLEDGED/RESOLVED/DISMISSED (audit-safe).
-- =============================================================================

ALTER TABLE public.compliance_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compliance_alerts_insert ON public.compliance_alerts;
CREATE POLICY compliance_alerts_insert ON public.compliance_alerts
  FOR INSERT
  TO authenticated
  WITH CHECK (org_id = current_org_id());

DROP POLICY IF EXISTS compliance_alerts_delete ON public.compliance_alerts;
CREATE POLICY compliance_alerts_delete ON public.compliance_alerts
  FOR DELETE
  TO authenticated
  USING (org_id = current_org_id() AND status = 'OPEN');

COMMENT ON POLICY compliance_alerts_insert ON public.compliance_alerts IS
  'Bug #5bis fix sprint 6 mai 2026 PM — autorise les Server Actions (transitionAward, etc.) à persister les hard errors. La permission métier est gatée côté Server Action.';

COMMENT ON POLICY compliance_alerts_delete ON public.compliance_alerts IS
  'Bug #5bis fix sprint 6 mai 2026 PM — autorise idempotence delete-then-insert sur alerts OPEN. Les ACKNOWLEDGED/RESOLVED/DISMISSED sont protégés.';
