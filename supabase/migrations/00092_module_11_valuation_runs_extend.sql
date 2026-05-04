-- Module 11 B5 — Extension `valuation_runs` pour pages prod + replay.
--
-- Briefing : docs/MODULE_11_IFRS2_VALUATION_VIZ.md §4.2.
--
-- Stratégie ADD-only (pas de rename, pas de drop) :
--   * `input_hash`              : signature payload (déterministe) pour dédup
--                                 + replay reproductible + audit.
--   * `includes_visualization`  : flag rapide pour filtrer côté UI les runs
--                                 qui ont un payload Monte Carlo complet
--                                 (paths_sample, convergence, histogram).
--   * `run_type`                : typage de l'origine (manual UI, cron, hook
--                                 modification, replay UI). Aide reporting +
--                                 cleanup éventuel (ex: garder uniquement
--                                 les MANUAL pour audit IFRS 2).
--
-- Colonnes déjà présentes (pas re-créées) :
--   * `engine_version`  (Module 3a B5)
--   * `triggered_by`    (FK auth.users, on garde ce nom historique — pas
--                        de duplication avec triggered_by_user_id).
--
-- Backfill stratégique :
--   * `run_type='MANUAL'` pour les runs existants (default explicit + pour
--     les rows pré-migration, on UPDATE).
--   * `includes_visualization=FALSE` par défaut. Un job V1.5+ pourra
--     re-flagger en analysant `response_received->'visualization'`.

-- 1. Extensions colonnes
ALTER TABLE public.valuation_runs
  ADD COLUMN IF NOT EXISTS input_hash TEXT,
  ADD COLUMN IF NOT EXISTS includes_visualization BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS run_type TEXT NOT NULL DEFAULT 'MANUAL';

-- 2. CHECK constraint sur run_type (pattern Module 6/9)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.valuation_runs'::regclass
      AND conname = 'valuation_runs_run_type_check'
  ) THEN
    ALTER TABLE public.valuation_runs
      ADD CONSTRAINT valuation_runs_run_type_check
      CHECK (run_type IN (
        'MANUAL',
        'CRON_MONTHLY',
        'CRON_STALE_REFRESH',
        'TRIGGERED_BY_MODIFICATION',
        'REPLAY'
      ));
  END IF;
END $$;

-- 3. Backfill run_type pour les rows pré-migration (defensive — DEFAULT
-- s'applique aux INSERTs nouveaux, mais on s'assure qu'il n'y a pas de
-- NULL résiduel sur les rows déjà existantes).
UPDATE public.valuation_runs
SET run_type = 'MANUAL'
WHERE run_type IS NULL;

-- 4. Index pour récupérer le dernier run par plan (pages prod / "latest valuation")
CREATE INDEX IF NOT EXISTS idx_valuation_runs_plan_latest
  ON public.valuation_runs (plan_id, completed_at DESC NULLS LAST)
  WHERE status = 'DONE';

-- 5. Vue helper "latest valuation per plan" (DONE only).
-- Lecture simple côté SAs sans fenêtres complexes.
CREATE OR REPLACE VIEW public.latest_valuation_per_plan AS
SELECT DISTINCT ON (plan_id)
  id,
  plan_id,
  org_id,
  status,
  pricer_used,
  engine_version,
  input_hash,
  includes_visualization,
  run_type,
  triggered_by,
  results_json,
  parameters,
  completed_at,
  created_at
FROM public.valuation_runs
WHERE status = 'DONE' AND plan_id IS NOT NULL
ORDER BY plan_id, completed_at DESC NULLS LAST, created_at DESC;

COMMENT ON VIEW public.latest_valuation_per_plan IS
  'Module 11 B5 — Dernier run DONE par plan. Utilisé par /dashboard/plans/[id]/valuation pour afficher la valorisation courante (1 ligne par plan).';

COMMENT ON COLUMN public.valuation_runs.input_hash IS
  'Module 11 B5 — Hash SHA-256 hex du payload normalisé envoyé au moteur Python. Permet dédup + replay reproductible. NULL pour les runs pré-migration.';

COMMENT ON COLUMN public.valuation_runs.includes_visualization IS
  'Module 11 B5 — TRUE si le payload demandé incluait include_visualization=true ET que la response Python contient bien paths_sample/convergence/histogram. Permet de router vers le viewer Monte Carlo plutôt qu''un affichage simple FV.';

COMMENT ON COLUMN public.valuation_runs.run_type IS
  'Module 11 B5 — Origine du run : MANUAL (UI), CRON_MONTHLY (job mensuel), CRON_STALE_REFRESH (refresh des plans inactifs), TRIGGERED_BY_MODIFICATION (hook IFRS 2.27-28 award_modifications), REPLAY (re-run depuis l''UI sans re-saisir les inputs).';
