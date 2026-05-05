-- Module 13 V2 PR #42 B1.3 — Safety triggers awards/plans/beneficiaries
--
-- Spec §4.3 — catch modifications directes en DB hors Server Actions
-- (CSV import, MCP, service_role bypass).
--
-- Pattern : skip si current_setting('audit.skip_trigger', true) = 'true'
-- (TX-local). Les SAs doivent set ce flag AVANT mutation pour éviter
-- double-logging avec logAuditEvent.
--
-- ⚠️ V1 : triggers créés mais DÉSACTIVÉS par défaut. Activation V1.X
-- conditionnelle au retrofit de logAuditEvent + SAs qui mutent ces tables
-- (cf memo PR #42 §risques #5). Sans retrofit, l'enable causerait des
-- double-logs sur tous les flux SAs existants.

CREATE OR REPLACE FUNCTION public.audit_events_safety_log_modification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_table_label   text := TG_ARGV[0];   -- 'award', 'plan', 'beneficiary'
  v_resource_type text := TG_ARGV[1];   -- 'AWARD', 'PLAN', 'BENEFICIARY'
  v_org_id        uuid;
BEGIN
  -- Skip si SA explicit (TX-local setting)
  IF current_setting('audit.skip_trigger', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Skip si pas de changement effectif
  IF to_jsonb(OLD) IS NOT DISTINCT FROM to_jsonb(NEW) THEN
    RETURN NEW;
  END IF;

  v_org_id := NEW.org_id;
  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.audit_events (
    org_id, event_type, resource_type, resource_id,
    before_state, after_state, metadata
  ) VALUES (
    v_org_id,
    v_table_label || '.modified_via_db_trigger',
    v_resource_type,
    NEW.id,
    to_jsonb(OLD),
    to_jsonb(NEW),
    jsonb_build_object(
      'source', 'db_trigger_safety',
      'table', v_table_label,
      'note', 'Modification directe DB hors Server Action (CSV import / MCP / service_role bypass)'
    )
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.audit_events_safety_log_modification IS
  'Module 13 V2 — Logger de safety pour modifications directes DB hors Server Actions. Skip si TX-local setting audit.skip_trigger=true. Spec §4.3.';

-- Triggers DISABLED par défaut (V1). Activation V1.X après retrofit SAs.

DROP TRIGGER IF EXISTS trg_audit_safety_awards_modified ON public.awards;
CREATE TRIGGER trg_audit_safety_awards_modified
  AFTER UPDATE ON public.awards
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_events_safety_log_modification('award', 'AWARD');
ALTER TABLE public.awards DISABLE TRIGGER trg_audit_safety_awards_modified;

DROP TRIGGER IF EXISTS trg_audit_safety_plans_modified ON public.plans;
CREATE TRIGGER trg_audit_safety_plans_modified
  AFTER UPDATE ON public.plans
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_events_safety_log_modification('plan', 'PLAN');
ALTER TABLE public.plans DISABLE TRIGGER trg_audit_safety_plans_modified;

DROP TRIGGER IF EXISTS trg_audit_safety_beneficiaries_modified ON public.beneficiaries;
CREATE TRIGGER trg_audit_safety_beneficiaries_modified
  AFTER UPDATE ON public.beneficiaries
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_events_safety_log_modification('beneficiary', 'BENEFICIARY');
ALTER TABLE public.beneficiaries DISABLE TRIGGER trg_audit_safety_beneficiaries_modified;
