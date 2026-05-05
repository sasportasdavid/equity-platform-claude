-- Module 13 V2 PR #42 B1.2 — Hash chain RPC + triggers
--
-- 3 fonctions :
-- - canonical_audit_payload(...)     : payload JSON déterministe (jsonb storage
--                                       sort par longueur+alpha, séparateur ': '/', ')
-- - compute_audit_chain_hash(p_id)   : compute + UPDATE event_hash + previous_hash
-- - verify_audit_chain_integrity(?)  : itère la chaîne par org, recompute, compare
--
-- 3 triggers :
-- - trg_assign_chain_position (BEFORE INSERT) : MAX(chain_position)+1 par org
--                                                avec advisory lock per-org
-- - trg_compute_hash_after_insert (AFTER INSERT) : appelle compute_audit_chain_hash
-- - trg_prevent_chain_update (BEFORE UPDATE)  : immutability sur cols hash + champs
--                                                hashés (genesis NULL→value autorisé)
--
-- search_path inclut `extensions` pour digest() (pgcrypto).
-- Genesis : SHA-256("CAPIWISE_AUDIT_GENESIS_2026_05") — constant inline pour
-- reproductibilité externe (auditeur peut recompute via tout SHA-256 standard).

-- =============================================================================
-- canonical_audit_payload
-- =============================================================================

CREATE OR REPLACE FUNCTION public.canonical_audit_payload(
  p_id            uuid,
  p_org_id        uuid,
  p_user_id       uuid,
  p_user_email    text,
  p_event_type    text,
  p_resource_type text,
  p_resource_id   uuid,
  p_before_state  jsonb,
  p_after_state   jsonb,
  p_metadata      jsonb,
  p_occurred_at   timestamptz
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'after_state',    coalesce(p_after_state, 'null'::jsonb),
    'before_state',   coalesce(p_before_state, 'null'::jsonb),
    'event_type',     p_event_type,
    'id',             p_id::text,
    'metadata',       coalesce(p_metadata, '{}'::jsonb),
    'occurred_at',    to_char(p_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'org_id',         coalesce(p_org_id::text, ''),
    'resource_id',    coalesce(p_resource_id::text, ''),
    'resource_type',  coalesce(p_resource_type, ''),
    'user_email',     coalesce(p_user_email, ''),
    'user_id',        coalesce(p_user_id::text, '')
  )::text
$$;

COMMENT ON FUNCTION public.canonical_audit_payload IS
  'Module 13 V2 — Payload canonical JSON pour hash chain. Keys triées par longueur+alpha (jsonb storage Postgres). Format de occurred_at : ISO 8601 UTC avec ms (déterministe vs ::text qui dépend du DateStyle session).';

-- =============================================================================
-- compute_audit_chain_hash
-- =============================================================================

CREATE OR REPLACE FUNCTION public.compute_audit_chain_hash(
  p_event_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_event       public.audit_events;
  v_previous_hash text;
  v_payload     text;
  v_hash        text;
  v_genesis     constant text := encode(digest('CAPIWISE_AUDIT_GENESIS_2026_05', 'sha256'), 'hex');
BEGIN
  SELECT * INTO v_event FROM public.audit_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'audit_event % not found', p_event_id;
  END IF;
  IF v_event.chain_position IS NULL THEN
    RAISE EXCEPTION 'audit_event % has no chain_position (pré-Module 13)', p_event_id;
  END IF;

  IF v_event.chain_position > 1 THEN
    SELECT event_hash INTO v_previous_hash
    FROM public.audit_events
    WHERE org_id = v_event.org_id AND chain_position = v_event.chain_position - 1;
  ELSE
    v_previous_hash := NULL;
  END IF;

  v_payload := public.canonical_audit_payload(
    v_event.id, v_event.org_id, v_event.user_id, v_event.user_email,
    v_event.event_type, v_event.resource_type, v_event.resource_id,
    v_event.before_state, v_event.after_state, v_event.metadata, v_event.occurred_at
  );

  v_hash := encode(
    digest(v_payload || coalesce(v_previous_hash, v_genesis), 'sha256'),
    'hex'
  );

  UPDATE public.audit_events
  SET event_hash    = v_hash,
      previous_hash = v_previous_hash
  WHERE id = p_event_id;

  RETURN v_hash;
END;
$$;

COMMENT ON FUNCTION public.compute_audit_chain_hash IS
  'Module 13 V2 — Calcule et persiste event_hash + previous_hash pour un audit_event déjà inséré (avec chain_position assigné). Appelé par le trigger AFTER INSERT et lors du recompute V1.X.';

-- =============================================================================
-- verify_audit_chain_integrity
-- =============================================================================

DROP FUNCTION IF EXISTS public.verify_audit_chain_integrity(uuid);

CREATE OR REPLACE FUNCTION public.verify_audit_chain_integrity(
  p_org_id uuid DEFAULT NULL
)
RETURNS TABLE (
  out_org_id          uuid,
  out_total_events    bigint,
  out_verified_events bigint,
  out_broken_at       bigint,
  out_broken_event_id uuid,
  out_is_intact       boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_org           uuid;
  v_event         public.audit_events;
  v_prev_hash     text;
  v_genesis       constant text := encode(digest('CAPIWISE_AUDIT_GENESIS_2026_05', 'sha256'), 'hex');
  v_payload       text;
  v_recomputed    text;
  v_total         bigint;
  v_verified      bigint;
  v_broken_at     bigint;
  v_broken_id     uuid;
BEGIN
  FOR v_org IN
    SELECT DISTINCT ae.org_id
    FROM public.audit_events ae
    WHERE ae.chain_position IS NOT NULL
      AND (p_org_id IS NULL OR ae.org_id = p_org_id)
  LOOP
    v_total := 0;
    v_verified := 0;
    v_broken_at := NULL;
    v_broken_id := NULL;
    v_prev_hash := NULL;

    FOR v_event IN
      SELECT * FROM public.audit_events ae
      WHERE ae.org_id = v_org AND ae.chain_position IS NOT NULL
      ORDER BY ae.chain_position
    LOOP
      v_total := v_total + 1;
      v_payload := public.canonical_audit_payload(
        v_event.id, v_event.org_id, v_event.user_id, v_event.user_email,
        v_event.event_type, v_event.resource_type, v_event.resource_id,
        v_event.before_state, v_event.after_state, v_event.metadata, v_event.occurred_at
      );
      v_recomputed := encode(digest(v_payload || coalesce(v_prev_hash, v_genesis), 'sha256'), 'hex');

      IF v_event.event_hash IS NOT DISTINCT FROM v_recomputed
         AND v_event.previous_hash IS NOT DISTINCT FROM v_prev_hash
      THEN
        v_verified := v_verified + 1;
        v_prev_hash := v_event.event_hash;
      ELSE
        v_broken_at := v_event.chain_position;
        v_broken_id := v_event.id;
        EXIT;
      END IF;
    END LOOP;

    out_org_id := v_org;
    out_total_events := v_total;
    out_verified_events := v_verified;
    out_broken_at := v_broken_at;
    out_broken_event_id := v_broken_id;
    out_is_intact := (v_broken_at IS NULL);
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;

COMMENT ON FUNCTION public.verify_audit_chain_integrity IS
  'Module 13 V2 — Vérifie l''intégrité de la hash chain (par org si p_org_id fourni, toutes orgs sinon). Retourne par org : total/verified/broken_at/broken_id/is_intact.';

-- =============================================================================
-- TRIGGER 1 — BEFORE INSERT : assigne chain_position avec advisory lock per-org
-- =============================================================================

CREATE OR REPLACE FUNCTION public.audit_events_assign_chain_position()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max_pos bigint;
BEGIN
  -- Mark-and-sweep V1 : si org_id NULL, on skip le chaining (events système hors-org).
  IF NEW.org_id IS NULL THEN
    NEW.chain_position := NULL;
    RETURN NEW;
  END IF;

  -- Si chain_position est explicitement fourni (cas import / backfill manuel V1.X),
  -- on respecte le caller.
  IF NEW.chain_position IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Advisory lock per-org pour éviter race condition (2 INSERT simultanés
  -- → MAX(chain_position) lit la même valeur → collision UNIQUE).
  -- pg_advisory_xact_lock libère automatiquement à la fin de la transaction.
  PERFORM pg_advisory_xact_lock(hashtext('audit_chain:' || NEW.org_id::text));

  SELECT COALESCE(MAX(chain_position), 0) + 1 INTO v_max_pos
  FROM public.audit_events
  WHERE org_id = NEW.org_id AND chain_position IS NOT NULL;

  NEW.chain_position := v_max_pos;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_events_assign_chain_position ON public.audit_events;
CREATE TRIGGER trg_audit_events_assign_chain_position
  BEFORE INSERT ON public.audit_events
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_events_assign_chain_position();

-- =============================================================================
-- TRIGGER 2 — AFTER INSERT : compute hash via RPC
-- =============================================================================

CREATE OR REPLACE FUNCTION public.audit_events_compute_hash_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NEW.chain_position IS NOT NULL THEN
    PERFORM public.compute_audit_chain_hash(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_events_compute_hash_after_insert ON public.audit_events;
CREATE TRIGGER trg_audit_events_compute_hash_after_insert
  AFTER INSERT ON public.audit_events
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_events_compute_hash_after_insert();

-- =============================================================================
-- TRIGGER 3 — BEFORE UPDATE : immutability sur cols hash + champs hashés
-- Autorise NULL → first value (compute_audit_chain_hash depuis AFTER INSERT)
-- mais bloque toute modif ultérieure.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.audit_events_prevent_chain_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.event_hash IS NOT NULL AND NEW.event_hash IS DISTINCT FROM OLD.event_hash THEN
    RAISE EXCEPTION 'audit_events.event_hash is immutable (id=%)', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.previous_hash IS NOT NULL AND NEW.previous_hash IS DISTINCT FROM OLD.previous_hash THEN
    RAISE EXCEPTION 'audit_events.previous_hash is immutable (id=%)', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.chain_position IS NOT NULL AND NEW.chain_position IS DISTINCT FROM OLD.chain_position THEN
    RAISE EXCEPTION 'audit_events.chain_position is immutable (id=%)', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  -- Bloquer modif des champs hashés (sinon le hash devient invalide)
  IF OLD.event_hash IS NOT NULL THEN
    IF NEW.event_type   IS DISTINCT FROM OLD.event_type   OR
       NEW.org_id       IS DISTINCT FROM OLD.org_id       OR
       NEW.user_id      IS DISTINCT FROM OLD.user_id      OR
       NEW.user_email   IS DISTINCT FROM OLD.user_email   OR
       NEW.resource_type IS DISTINCT FROM OLD.resource_type OR
       NEW.resource_id  IS DISTINCT FROM OLD.resource_id  OR
       NEW.before_state IS DISTINCT FROM OLD.before_state OR
       NEW.after_state  IS DISTINCT FROM OLD.after_state  OR
       NEW.metadata     IS DISTINCT FROM OLD.metadata     OR
       NEW.occurred_at  IS DISTINCT FROM OLD.occurred_at
    THEN
      RAISE EXCEPTION 'audit_events fields are immutable once chained (id=%)', NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_events_prevent_chain_update ON public.audit_events;
CREATE TRIGGER trg_audit_events_prevent_chain_update
  BEFORE UPDATE ON public.audit_events
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_events_prevent_chain_update();
