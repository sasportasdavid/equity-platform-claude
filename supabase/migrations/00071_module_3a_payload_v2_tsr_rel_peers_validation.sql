-- =============================================================================
-- Migration 00051 — TSR_REL_PEERS : market data validation + audit
-- =============================================================================
--
-- Contexte : audit V8 du moteur Python (memory/payload_python_audit_v8.md)
-- a révélé deux problèmes pour TSR_REL_PEERS :
--   1. Les peers Capiwise utilisent s0/volatility/correlationWithMain
--      mais Pydantic exige S0/sigma/correlation strict → 422 si on envoie
--      le payload sans mapping (fixé dans buildPythonPayload.ts v2)
--   2. Si les peers n'ont pas de s0/volatility (cas legacy / données live
--      pas fetchées), le mapping crashe "Peer X : s0 manquant"
--
-- Cette migration ajoute :
--   - Une fonction de validation utilisée par les RPCs d'insert/update
--     pour bloquer la sauvegarde de peers sans s0/volatility
--   - Une compliance rule MARKET_DATA_REQUIRED activée pour les conditions
--     TSR_REL_INDEX et TSR_REL_PEERS sans données live
--
-- Note : on ne peut pas mettre de NOT NULL sur les sub-paths d'un JSONB,
-- d'où la fonction de validation appelée par les RPCs.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fonction de validation des peers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION validate_peer_group_market_data(peers JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  peer JSONB;
  peer_ticker TEXT;
  peer_s0 NUMERIC;
  peer_volatility NUMERIC;
  peer_correlation NUMERIC;
BEGIN
  IF peers IS NULL OR jsonb_array_length(peers) = 0 THEN
    -- Pas de peers à valider, OK
    RETURN TRUE;
  END IF;

  FOR peer IN SELECT jsonb_array_elements(peers) LOOP
    peer_ticker := COALESCE(peer->>'ticker', peer->>'id', '?');
    peer_s0 := NULLIF(peer->>'s0', '')::NUMERIC;
    peer_volatility := NULLIF(peer->>'volatility', '')::NUMERIC;
    peer_correlation := NULLIF(peer->>'correlationWithMain', '')::NUMERIC;

    IF peer_s0 IS NULL OR peer_s0 <= 0 THEN
      RAISE EXCEPTION 'Peer %: s0 manquant ou invalide (%). Saisir S0 manuellement ou attendre fetchMarketData (Module 3a §5.2).', peer_ticker, peer_s0
        USING ERRCODE = 'check_violation';
    END IF;

    IF peer_volatility IS NULL OR peer_volatility <= 0 OR peer_volatility > 5 THEN
      RAISE EXCEPTION 'Peer %: volatility manquante ou hors borne [0, 5] (%). Saisir σ manuellement.', peer_ticker, peer_volatility
        USING ERRCODE = 'check_violation';
    END IF;

    -- correlationWithMain optionnel : moteur fallback à 0.5
    IF peer_correlation IS NOT NULL AND (peer_correlation < -1 OR peer_correlation > 1) THEN
      RAISE EXCEPTION 'Peer %: correlationWithMain hors borne [-1, 1] (%)', peer_ticker, peer_correlation
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION validate_peer_group_market_data IS
  'Valide qu''un tableau de peers JSONB a tous les fields requis par le moteur '
  'Python V8 (Pydantic strict). À appeler dans les RPCs upsert_performance_condition '
  'avant insert/update. Throw avec ERRCODE=check_violation si invalide.';

-- ---------------------------------------------------------------------------
-- 2. Validation au niveau des weighted_peer_groups (récursive)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION validate_weighted_peer_groups_market_data(wpgs JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  grp JSONB;
  grp_name TEXT;
  grp_peers JSONB;
BEGIN
  IF wpgs IS NULL OR jsonb_array_length(wpgs) = 0 THEN
    RETURN TRUE;
  END IF;

  FOR grp IN SELECT jsonb_array_elements(wpgs) LOOP
    grp_name := COALESCE(grp->>'name', grp->>'id', '?');
    grp_peers := grp->'peers';

    IF grp_peers IS NULL OR jsonb_array_length(grp_peers) = 0 THEN
      RAISE EXCEPTION 'Weighted peer group %: aucun peer dans le groupe', grp_name
        USING ERRCODE = 'check_violation';
    END IF;

    -- Délégation à validate_peer_group_market_data pour les peers du groupe
    PERFORM validate_peer_group_market_data(grp_peers);
  END LOOP;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION validate_weighted_peer_groups_market_data IS
  'Valide qu''une liste de weighted_peer_groups JSONB a tous les peers correctement '
  'fournis avec s0/volatility (et correlationWithMain optionnel). Délégué à '
  'validate_peer_group_market_data pour chaque groupe.';

-- ---------------------------------------------------------------------------
-- 3. Trigger BEFORE INSERT/UPDATE sur performance_conditions
--
-- Idée : valider automatiquement les peer_group / weighted_peer_groups au
-- moment de la sauvegarde, sans avoir à modifier les RPCs existants.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION enforce_perf_condition_market_data()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- TSR_REL_PEERS : valider les peers (s0/volatility OBLIGATOIRES)
  IF NEW.market_metric_type = 'TSR_REL_PEERS' THEN
    IF NEW.weighted_peer_groups IS NOT NULL AND jsonb_array_length(NEW.weighted_peer_groups) > 0 THEN
      PERFORM validate_weighted_peer_groups_market_data(NEW.weighted_peer_groups);
    ELSIF NEW.peer_group IS NOT NULL AND jsonb_array_length(NEW.peer_group) > 0 THEN
      PERFORM validate_peer_group_market_data(NEW.peer_group);
    ELSE
      RAISE EXCEPTION 'TSR_REL_PEERS condition sans aucun peer (peer_group et weighted_peer_groups vides)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- TSR_REL_INDEX : warning si pas de market data (NON-bloquant en V1, on
  -- veut juste tracer dans audit_events. Bloquant en V2 quand fetchMarketData
  -- sera branché et qu'on pourra forcer le pattern propre).
  IF NEW.market_metric_type = 'TSR_REL_INDEX' THEN
    IF NEW.reference_index_s0 IS NULL OR NEW.reference_index_sigma IS NULL THEN
      RAISE WARNING 'TSR_REL_INDEX %: market data incomplète (s0=%, sigma=%). '
        'Le moteur Python fallback à 100/0.20/0.5 → résultats Monte Carlo silencieusement faux. '
        'Saisir les valeurs manuellement ou attendre fetchMarketData (Module 3a §5.2).',
        COALESCE(NEW.reference_index, '?'), NEW.reference_index_s0, NEW.reference_index_sigma;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_perf_condition_market_data ON performance_conditions;
CREATE TRIGGER trg_enforce_perf_condition_market_data
  BEFORE INSERT OR UPDATE ON performance_conditions
  FOR EACH ROW
  EXECUTE FUNCTION enforce_perf_condition_market_data();

COMMENT ON TRIGGER trg_enforce_perf_condition_market_data ON performance_conditions IS
  'Valide automatiquement les market data au moment de l''insert/update. '
  'TSR_REL_PEERS : bloquant si peers sans s0/volatility (= ERRCODE check_violation). '
  'TSR_REL_INDEX : warning seulement (compatibilité avec données legacy).';
