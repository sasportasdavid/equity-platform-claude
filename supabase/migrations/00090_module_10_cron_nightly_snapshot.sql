-- =============================================================================
-- Module 10 B6 — Migration 00091 : cron nightly snapshot
-- =============================================================================
--
-- Snapshot automatique pour TOUTES les orgs actives, chaque nuit à 02:00 UTC
-- (= ~03:00-04:00 Paris selon DST). Pattern aligné sur Module 7 cron consumer
-- (00049) — pg_cron + appel direct PL/pgSQL (pas d'EF intermédiaire car
-- materialize_snapshot est purement SQL).
--
-- Pré-requis :
--   - pg_cron activé (Module 2 / Module 7) ✓
--   - materialize_snapshot RPC SECURITY DEFINER ✓ (00087)
--
-- Comportement :
--   - Boucle sur toutes les orgs ayant au moins 1 share_class active
--   - Pour chaque org : appelle materialize_snapshot avec snapshot_type='NIGHTLY'
--   - Capture les exceptions par org (continue sur les autres)
--   - Logue les comptes via NOTICE (visible dans cron.job_run_details)
--
-- Idempotency :
--   - Pas de garde-fou contre 2× snapshots NIGHTLY le même jour. Acceptable V1
--     (le cron tick une fois par jour). Si retrigger manuel, on ajoute une row
--     en plus.
-- =============================================================================

-- 1. Helper : itère sur les orgs et matérialise un snapshot pour chacune.
CREATE OR REPLACE FUNCTION materialize_nightly_snapshots_all_orgs()
RETURNS TABLE (org_id UUID, snapshot_id UUID, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org RECORD;
  v_snapshot_id UUID;
  v_today DATE := CURRENT_DATE;
BEGIN
  FOR v_org IN
    SELECT DISTINCT sc.org_id AS oid
      FROM share_classes sc
     WHERE sc.deactivated_at IS NULL
  LOOP
    BEGIN
      v_snapshot_id := materialize_snapshot(
        p_org_id := v_org.oid,
        p_asof_date := v_today,
        p_snapshot_type := 'NIGHTLY',
        p_triggered_by_round_id := NULL,
        p_label := 'Snapshot automatique ' || to_char(v_today, 'YYYY-MM-DD')
      );
      org_id := v_org.oid;
      snapshot_id := v_snapshot_id;
      error_message := NULL;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      org_id := v_org.oid;
      snapshot_id := NULL;
      error_message := SQLERRM;
      RETURN NEXT;
      RAISE NOTICE 'Nightly snapshot failed for org %: %', v_org.oid, SQLERRM;
    END;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION materialize_nightly_snapshots_all_orgs FROM PUBLIC;
-- Pas de GRANT à authenticated : seul le cron (postgres role) appelle ça.

COMMENT ON FUNCTION materialize_nightly_snapshots_all_orgs IS
  'Module 10 B6 — Boucle sur les orgs et matérialise un snapshot NIGHTLY pour chacune. Appelée par cron nightly à 02:00 UTC. Continue sur erreur par org.';

-- 2. Idempotent : unschedule si déjà existant
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cap-table-nightly-snapshot') THEN
    PERFORM cron.unschedule('cap-table-nightly-snapshot');
  END IF;
END $$;

-- 3. Schedule : 02:00 UTC chaque jour (~03:00 Paris hiver, ~04:00 été)
SELECT cron.schedule(
  'cap-table-nightly-snapshot',
  '0 2 * * *',
  $$
  SELECT count(*) AS rows_processed FROM materialize_nightly_snapshots_all_orgs();
  $$
);
