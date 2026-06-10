-- ============================================================
-- Rate limiting partagé (audit 2026-06-10, P1) — store Postgres
-- ============================================================
--
-- Le rate limiter V1 était in-memory (Map JS, scope process) → inopérant en
-- serverless Vercel (compteur par lambda, perdu au cold start). On ajoute un
-- store Postgres partagé entre toutes les instances, via une RPC atomique
-- (fenêtre fixe). Appelée exclusivement par le client admin (service_role)
-- côté Server Action → la table n'est exposée ni à anon ni à authenticated.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start TIMESTAMPTZ NOT NULL
);

-- RLS + verrouillage total : seul service_role (bypass) y accède.
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_counters FROM anon, authenticated;

COMMENT ON TABLE public.rate_limit_counters IS
  'Compteurs de rate limiting (fenêtre fixe). Accès service_role uniquement via RPC rate_limit_hit. Audit 2026-06-10 P1.';

-- ============================================================
-- rate_limit_hit : enregistre une tentative et renvoie la décision (atomique).
-- ============================================================
CREATE OR REPLACE FUNCTION public.rate_limit_hit(
  p_key TEXT,
  p_limit INTEGER,
  p_window_ms BIGINT
)
RETURNS TABLE(allowed BOOLEAN, remaining INTEGER, retry_after_ms BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_window INTERVAL := (p_window_ms::text || ' milliseconds')::interval;
  v_count INTEGER;
  v_start TIMESTAMPTZ;
BEGIN
  INSERT INTO public.rate_limit_counters AS c (key, count, window_start)
  VALUES (p_key, 1, v_now)
  ON CONFLICT (key) DO UPDATE
    SET count = CASE WHEN c.window_start + v_window <= v_now THEN 1
                     ELSE c.count + 1 END,
        window_start = CASE WHEN c.window_start + v_window <= v_now THEN v_now
                            ELSE c.window_start END
  RETURNING c.count, c.window_start INTO v_count, v_start;

  allowed := v_count <= p_limit;
  remaining := GREATEST(0, p_limit - v_count);
  retry_after_ms := CASE
    WHEN allowed THEN 0
    ELSE GREATEST(0, (EXTRACT(EPOCH FROM (v_start + v_window - v_now)) * 1000))::bigint
  END;
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION public.rate_limit_hit(TEXT, INTEGER, BIGINT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(TEXT, INTEGER, BIGINT) TO service_role;

COMMENT ON FUNCTION public.rate_limit_hit IS
  'Fixed-window rate limit atomique. Appelée par le client admin (service_role). Audit 2026-06-10 P1.';
