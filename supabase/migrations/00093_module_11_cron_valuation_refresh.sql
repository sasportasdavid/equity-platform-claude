-- Module 11 B6 — Cron mensuel refresh des valuations stale (>90j).
--
-- Stratégie : pour chaque plan dont la dernière valuation DONE date de plus
-- de 90 jours, on insère un nouveau valuation_run en QUEUED avec
-- run_type='CRON_STALE_REFRESH'. La consumption sera assurée par un appel
-- ultérieur à compute-valuation EF (V1.5+ — pour V1, le cron INSERT seul,
-- la consommation est triggée manuellement ou via le bouton UI).
--
-- Note V1 : la fonction se contente d'insérer des QUEUED. La triggering
-- de l'EF compute-valuation depuis le cron est volontairement DEFERRED
-- car (a) elle nécessite pg_net.http_post qui require le service_role_key
-- en Vault, (b) coûteuse en CPU pour le moteur Python — un humain doit
-- pouvoir batcher manuellement. Cf doc Module 11 §5.
--
-- Si pg_cron n'est pas disponible OU si MCP apply_migration refuse le
-- statement cron.schedule, le cron schedule est skipped (V1.5). Cf
-- memory/module_11_b6_skipped_cron.md (créé le cas échéant).

-- =============================================================================
-- 1. Function helper : refresh_stale_valuations_all_orgs()
-- =============================================================================

CREATE OR REPLACE FUNCTION public.refresh_stale_valuations_all_orgs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_runs_inserted int := 0;
  v_plan record;
  v_now timestamptz := now();
BEGIN
  -- Pour chaque plan actif (non soft-deleted) sans valuation DONE récente,
  -- on insère un nouveau valuation_run en QUEUED + run_type=CRON_STALE_REFRESH.
  --
  -- Ordre d'insertion : plans sans valuation (lvp NULL) en premier, puis par
  -- ancienneté decroissante de la dernière valuation.
  FOR v_plan IN
    SELECT p.id AS plan_id, p.org_id
    FROM public.plans p
    LEFT JOIN public.latest_valuation_per_plan lvp ON lvp.plan_id = p.id
    WHERE p.deleted_at IS NULL
      AND (
        lvp.completed_at IS NULL
        OR lvp.completed_at < v_now - interval '90 days'
      )
    ORDER BY lvp.completed_at NULLS FIRST, p.id
  LOOP
    -- Skip si un run QUEUED/RUNNING existe déjà pour ce plan (idempotent)
    IF EXISTS (
      SELECT 1 FROM public.valuation_runs
      WHERE plan_id = v_plan.plan_id
        AND status IN ('QUEUED', 'RUNNING')
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.valuation_runs (
      plan_id,
      org_id,
      status,
      run_type,
      includes_visualization,
      created_at
    ) VALUES (
      v_plan.plan_id,
      v_plan.org_id,
      'QUEUED',
      'CRON_STALE_REFRESH',
      false,  -- pas de viz pour les runs cron (audit only)
      v_now
    );
    v_runs_inserted := v_runs_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'runs_inserted', v_runs_inserted,
    'executed_at', v_now
  );
END;
$$;

COMMENT ON FUNCTION public.refresh_stale_valuations_all_orgs() IS
  'Module 11 B6 — Insère un valuation_run QUEUED pour chaque plan dont la dernière valuation DONE date de plus de 90 jours. Idempotent : skip si un QUEUED/RUNNING existe déjà.';

-- Service role peut exécuter (cron + admin)
GRANT EXECUTE ON FUNCTION public.refresh_stale_valuations_all_orgs() TO postgres, service_role;

-- =============================================================================
-- 2. pg_cron schedule mensuel (1er du mois à 03:00 UTC)
-- =============================================================================
--
-- Note : ce statement peut échouer si l'extension pg_cron n'est pas dans le
-- search_path (cron schema absent). Dans ce cas, on commente ce bloc et on
-- documente le skip dans memory/module_11_b6_skipped_cron.md pour V1.5.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule l'éventuel job existant (idempotent re-run de la migration)
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname = 'valuation-monthly-refresh';

    PERFORM cron.schedule(
      'valuation-monthly-refresh',
      '0 3 1 * *',  -- 1er du mois à 03:00 UTC
      $cron$ SELECT public.refresh_stale_valuations_all_orgs(); $cron$
    );
  END IF;
END $$;
