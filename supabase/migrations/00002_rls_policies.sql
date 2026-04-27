-- ===========================================================================
-- Capiwise — Equity Platform
-- Migration 00002 : Row-Level Security policies (Module 1 §5)
--
-- Active RLS sur toutes les tables métier et applique les patterns :
--   1. Tables admin org-scoped (plans, templates, workflows, etc.)
--   2. Tables avec accès bénéficiaire (awards, vesting_events, exercise, ...)
--   3. Tables audit immuables (audit_events, operation_log)
--   4. Référentiels globaux (lecture authenticated, écriture service_role only)
--
-- L'org_id actif est lu depuis le JWT via `current_org_id()`. Le custom claim
-- `active_org_id` est injecté par le custom_access_token_hook (migration 00004).
-- ===========================================================================

-- --------------------------------------------------------------------------
-- 1. Helpers
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION current_org_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT NULLIF(auth.jwt() ->> 'active_org_id', '')::UUID
$$;

CREATE OR REPLACE FUNCTION has_permission(perm TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  user_roles TEXT[];
  user_grants TEXT[];
  user_revokes TEXT[];
BEGIN
  IF auth.uid() IS NULL OR current_org_id() IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT roles, permissions_grant, permissions_revoke
    INTO user_roles, user_grants, user_revokes
    FROM memberships
   WHERE org_id = current_org_id()
     AND user_id = auth.uid()
     AND status = 'ACTIVE';

  IF user_roles IS NULL THEN
    RETURN FALSE;
  END IF;

  IF perm = ANY(user_revokes) THEN
    RETURN FALSE;
  END IF;

  IF perm = ANY(user_grants) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM role_permissions
     WHERE role = ANY(user_roles)
       AND permission_code = perm
  );
END;
$$;

CREATE OR REPLACE FUNCTION is_award_beneficiary(award_id_param UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM awards a
      JOIN beneficiaries b ON b.id = a.beneficiary_id
     WHERE a.id = award_id_param
       AND b.user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION is_org_member(org_id_param UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships
     WHERE org_id = org_id_param
       AND user_id = auth.uid()
       AND status = 'ACTIVE'
  )
$$;

GRANT EXECUTE ON FUNCTION current_org_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION has_permission(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_award_beneficiary(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_org_member(UUID) TO authenticated, anon;

-- --------------------------------------------------------------------------
-- 2. Pattern 4 — Référentiels globaux (lecture par tout authenticated)
-- --------------------------------------------------------------------------

ALTER TABLE permissions_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS permissions_catalog_select ON permissions_catalog;
CREATE POLICY permissions_catalog_select ON permissions_catalog
  FOR SELECT TO authenticated USING (true);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_permissions_select ON role_permissions;
CREATE POLICY role_permissions_select ON role_permissions
  FOR SELECT TO authenticated USING (true);

ALTER TABLE compliance_rules_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compliance_rules_catalog_select ON compliance_rules_catalog;
CREATE POLICY compliance_rules_catalog_select ON compliance_rules_catalog
  FOR SELECT TO authenticated USING (true);

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_templates_select ON notification_templates;
CREATE POLICY notification_templates_select ON notification_templates
  FOR SELECT TO authenticated USING (true);

-- --------------------------------------------------------------------------
-- 3. Identité — organizations, user_profiles, memberships, invitations
-- --------------------------------------------------------------------------

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orgs_select_member ON organizations;
CREATE POLICY orgs_select_member ON organizations FOR SELECT
  TO authenticated USING (is_org_member(id) AND deleted_at IS NULL);
DROP POLICY IF EXISTS orgs_update_owner ON organizations;
CREATE POLICY orgs_update_owner ON organizations FOR UPDATE
  TO authenticated USING (id = current_org_id() AND has_permission('org.manage_settings'));

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_profiles_select_self ON user_profiles;
CREATE POLICY user_profiles_select_self ON user_profiles FOR SELECT
  TO authenticated USING (id = auth.uid());
DROP POLICY IF EXISTS user_profiles_select_org_member ON user_profiles;
CREATE POLICY user_profiles_select_org_member ON user_profiles FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM memberships m1
       JOIN memberships m2 ON m2.user_id = user_profiles.id
       WHERE m1.user_id = auth.uid()
         AND m1.org_id = m2.org_id
         AND m1.status = 'ACTIVE'
    )
  );
DROP POLICY IF EXISTS user_profiles_update_self ON user_profiles;
CREATE POLICY user_profiles_update_self ON user_profiles FOR UPDATE
  TO authenticated USING (id = auth.uid());
DROP POLICY IF EXISTS user_profiles_insert_self ON user_profiles;
CREATE POLICY user_profiles_insert_self ON user_profiles FOR INSERT
  TO authenticated WITH CHECK (id = auth.uid());

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memberships_select_self ON memberships;
CREATE POLICY memberships_select_self ON memberships FOR SELECT
  TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS memberships_select_org ON memberships;
CREATE POLICY memberships_select_org ON memberships FOR SELECT
  TO authenticated USING (org_id = current_org_id() AND has_permission('org.manage_members'));
DROP POLICY IF EXISTS memberships_insert ON memberships;
CREATE POLICY memberships_insert ON memberships FOR INSERT
  TO authenticated WITH CHECK (org_id = current_org_id() AND has_permission('org.manage_members'));
DROP POLICY IF EXISTS memberships_update ON memberships;
CREATE POLICY memberships_update ON memberships FOR UPDATE
  TO authenticated USING (org_id = current_org_id() AND has_permission('org.manage_members'));
DROP POLICY IF EXISTS memberships_delete ON memberships;
CREATE POLICY memberships_delete ON memberships FOR DELETE
  TO authenticated USING (org_id = current_org_id() AND has_permission('org.manage_members'));

ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invitations_org ON invitations;
CREATE POLICY invitations_org ON invitations FOR ALL
  TO authenticated
  USING (org_id = current_org_id() AND has_permission('org.manage_members'))
  WITH CHECK (org_id = current_org_id() AND has_permission('org.manage_members'));

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS api_keys_org ON api_keys;
CREATE POLICY api_keys_org ON api_keys FOR ALL
  TO authenticated
  USING (org_id = current_org_id() AND has_permission('org.manage_settings'))
  WITH CHECK (org_id = current_org_id() AND has_permission('org.manage_settings'));

-- --------------------------------------------------------------------------
-- 4. Pattern 1 — Tables admin org-scoped
--    (companies, plans, early_termination_rules, document_templates,
--     approval_workflows, approval_workflow_steps, compliance_rules_config,
--     cap_table_scenarios, reports, feature_flags)
-- --------------------------------------------------------------------------

DO $$
DECLARE
  rel_name TEXT;
  read_perm TEXT;
  write_perm TEXT;
BEGIN
  FOR rel_name, read_perm, write_perm IN VALUES
    ('companies',                 'beneficiaries.read',          'org.manage_settings'),
    ('plans',                     'plans.read',                  'plans.create'),
    ('early_termination_rules',   'plans.read',                  'plans.update'),
    ('document_templates',        'documents.read',              'documents.create_template'),
    ('approval_workflows',        'approvals.read',              'org.manage_settings'),
    ('compliance_rules_config',   'compliance.read',             'compliance.configure_rules'),
    ('cap_table_scenarios',       'captable.read',               'captable.simulate'),
    ('reports',                   'reports.read',                'reports.generate'),
    ('feature_flags',             'org.manage_settings',         'org.manage_settings')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', rel_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON %I', rel_name, rel_name);
    EXECUTE format(
      'CREATE POLICY %I_select ON %I FOR SELECT TO authenticated USING (org_id = current_org_id() AND has_permission(%L))',
      rel_name, rel_name, read_perm
    );
    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON %I', rel_name, rel_name);
    EXECUTE format(
      'CREATE POLICY %I_insert ON %I FOR INSERT TO authenticated WITH CHECK (org_id = current_org_id() AND has_permission(%L))',
      rel_name, rel_name, write_perm
    );
    EXECUTE format('DROP POLICY IF EXISTS %I_update ON %I', rel_name, rel_name);
    EXECUTE format(
      'CREATE POLICY %I_update ON %I FOR UPDATE TO authenticated USING (org_id = current_org_id() AND has_permission(%L))',
      rel_name, rel_name, write_perm
    );
    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON %I', rel_name, rel_name);
    EXECUTE format(
      'CREATE POLICY %I_delete ON %I FOR DELETE TO authenticated USING (org_id = current_org_id() AND has_permission(%L))',
      rel_name, rel_name, write_perm
    );
  END LOOP;
END $$;

-- approval_workflow_steps n'a pas de colonne org_id (rattaché au workflow).
-- Policies dédiées avec héritage via workflow_id.
ALTER TABLE approval_workflow_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approval_workflow_steps_select ON approval_workflow_steps;
CREATE POLICY approval_workflow_steps_select ON approval_workflow_steps FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM approval_workflows w
       WHERE w.id = approval_workflow_steps.workflow_id
         AND w.org_id = current_org_id()
         AND has_permission('approvals.read')
    )
  );
DROP POLICY IF EXISTS approval_workflow_steps_write ON approval_workflow_steps;
CREATE POLICY approval_workflow_steps_write ON approval_workflow_steps FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM approval_workflows w
       WHERE w.id = approval_workflow_steps.workflow_id
         AND w.org_id = current_org_id()
         AND has_permission('org.manage_settings')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM approval_workflows w
       WHERE w.id = approval_workflow_steps.workflow_id
         AND w.org_id = current_org_id()
         AND has_permission('org.manage_settings')
    )
  );

-- --------------------------------------------------------------------------
-- 5. Pattern 2 — Tables avec accès bénéficiaire
-- --------------------------------------------------------------------------

ALTER TABLE beneficiaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS beneficiaries_select_admin ON beneficiaries;
CREATE POLICY beneficiaries_select_admin ON beneficiaries FOR SELECT
  TO authenticated USING (
    org_id = current_org_id()
    AND deleted_at IS NULL
    AND has_permission('beneficiaries.read')
  );
DROP POLICY IF EXISTS beneficiaries_select_self ON beneficiaries;
CREATE POLICY beneficiaries_select_self ON beneficiaries FOR SELECT
  TO authenticated USING (user_id = auth.uid() AND deleted_at IS NULL);
DROP POLICY IF EXISTS beneficiaries_insert ON beneficiaries;
CREATE POLICY beneficiaries_insert ON beneficiaries FOR INSERT
  TO authenticated WITH CHECK (
    org_id = current_org_id() AND has_permission('beneficiaries.create')
  );
DROP POLICY IF EXISTS beneficiaries_update ON beneficiaries;
CREATE POLICY beneficiaries_update ON beneficiaries FOR UPDATE
  TO authenticated USING (
    org_id = current_org_id() AND has_permission('beneficiaries.update')
  );

ALTER TABLE awards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS awards_select_admin ON awards;
CREATE POLICY awards_select_admin ON awards FOR SELECT
  TO authenticated USING (
    org_id = current_org_id()
    AND deleted_at IS NULL
    AND has_permission('awards.read.all')
  );
DROP POLICY IF EXISTS awards_select_beneficiary ON awards;
CREATE POLICY awards_select_beneficiary ON awards FOR SELECT
  TO authenticated USING (
    deleted_at IS NULL
    AND beneficiary_id IN (SELECT id FROM beneficiaries WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS awards_insert ON awards;
CREATE POLICY awards_insert ON awards FOR INSERT
  TO authenticated WITH CHECK (
    org_id = current_org_id() AND has_permission('awards.propose')
  );
DROP POLICY IF EXISTS awards_update_admin ON awards;
CREATE POLICY awards_update_admin ON awards FOR UPDATE
  TO authenticated USING (
    org_id = current_org_id() AND has_permission('awards.update')
  );
DROP POLICY IF EXISTS awards_update_beneficiary_accept ON awards;
CREATE POLICY awards_update_beneficiary_accept ON awards FOR UPDATE
  TO authenticated USING (
    beneficiary_id IN (SELECT id FROM beneficiaries WHERE user_id = auth.uid())
    AND status IN ('PENDING_SIGNATURE', 'GRANTED')
  );

-- Trigger : un bénéficiaire ne peut modifier que `accepted_at` sur SES awards.
-- Si l'utilisateur est admin (a awards.update) le trigger se contente de noop.
CREATE OR REPLACE FUNCTION enforce_award_beneficiary_update()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NOT has_permission('awards.update') THEN
    IF NEW.units_granted IS DISTINCT FROM OLD.units_granted
       OR NEW.units_vested IS DISTINCT FROM OLD.units_vested
       OR NEW.units_exercised IS DISTINCT FROM OLD.units_exercised
       OR NEW.units_settled IS DISTINCT FROM OLD.units_settled
       OR NEW.units_cancelled IS DISTINCT FROM OLD.units_cancelled
       OR NEW.exercise_price IS DISTINCT FROM OLD.exercise_price
       OR NEW.fair_value_per_unit IS DISTINCT FROM OLD.fair_value_per_unit
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
       OR NEW.beneficiary_id IS DISTINCT FROM OLD.beneficiary_id
       OR NEW.org_id IS DISTINCT FROM OLD.org_id
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
    THEN
      RAISE EXCEPTION 'Beneficiary can only set accepted_at on their own awards';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS award_beneficiary_update_check ON awards;
CREATE TRIGGER award_beneficiary_update_check
  BEFORE UPDATE ON awards
  FOR EACH ROW EXECUTE FUNCTION enforce_award_beneficiary_update();

ALTER TABLE vesting_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vesting_events_select_admin ON vesting_events;
CREATE POLICY vesting_events_select_admin ON vesting_events FOR SELECT
  TO authenticated USING (org_id = current_org_id() AND has_permission('awards.read.all'));
DROP POLICY IF EXISTS vesting_events_select_beneficiary ON vesting_events;
CREATE POLICY vesting_events_select_beneficiary ON vesting_events FOR SELECT
  TO authenticated USING (is_award_beneficiary(award_id));

ALTER TABLE award_modifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS award_modifications_select_admin ON award_modifications;
CREATE POLICY award_modifications_select_admin ON award_modifications FOR SELECT
  TO authenticated USING (org_id = current_org_id() AND has_permission('awards.read.all'));
DROP POLICY IF EXISTS award_modifications_select_beneficiary ON award_modifications;
CREATE POLICY award_modifications_select_beneficiary ON award_modifications FOR SELECT
  TO authenticated USING (is_award_beneficiary(award_id));
DROP POLICY IF EXISTS award_modifications_insert ON award_modifications;
CREATE POLICY award_modifications_insert ON award_modifications FOR INSERT
  TO authenticated WITH CHECK (org_id = current_org_id() AND has_permission('awards.modify'));

ALTER TABLE exercise_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exercise_requests_select_admin ON exercise_requests;
CREATE POLICY exercise_requests_select_admin ON exercise_requests FOR SELECT
  TO authenticated USING (org_id = current_org_id() AND has_permission('awards.read.all'));
DROP POLICY IF EXISTS exercise_requests_select_beneficiary ON exercise_requests;
CREATE POLICY exercise_requests_select_beneficiary ON exercise_requests FOR SELECT
  TO authenticated USING (
    beneficiary_id IN (SELECT id FROM beneficiaries WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS exercise_requests_insert_beneficiary ON exercise_requests;
CREATE POLICY exercise_requests_insert_beneficiary ON exercise_requests FOR INSERT
  TO authenticated WITH CHECK (
    has_permission('awards.exercise')
    AND beneficiary_id IN (SELECT id FROM beneficiaries WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS exercise_requests_update_admin ON exercise_requests;
CREATE POLICY exercise_requests_update_admin ON exercise_requests FOR UPDATE
  TO authenticated USING (org_id = current_org_id() AND has_permission('approvals.approve'));

-- --------------------------------------------------------------------------
-- 6. Documents & signatures (admin + bénéficiaire pour ses propres docs)
-- --------------------------------------------------------------------------

ALTER TABLE document_instances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_instances_select_admin ON document_instances;
CREATE POLICY document_instances_select_admin ON document_instances FOR SELECT
  TO authenticated USING (org_id = current_org_id() AND has_permission('documents.read'));
DROP POLICY IF EXISTS document_instances_select_signer ON document_instances;
CREATE POLICY document_instances_select_signer ON document_instances FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM signers s
       WHERE s.signature_request_id IN (
         SELECT id FROM signature_requests WHERE document_id = document_instances.id
       )
       AND (s.user_id = auth.uid()
            OR s.beneficiary_id IN (SELECT id FROM beneficiaries WHERE user_id = auth.uid()))
    )
  );
DROP POLICY IF EXISTS document_instances_insert ON document_instances;
CREATE POLICY document_instances_insert ON document_instances FOR INSERT
  TO authenticated WITH CHECK (
    org_id = current_org_id() AND has_permission('documents.send_for_signature')
  );

ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS signature_requests_select ON signature_requests;
CREATE POLICY signature_requests_select ON signature_requests FOR SELECT
  TO authenticated USING (
    (org_id = current_org_id() AND has_permission('documents.read'))
    OR EXISTS (
      SELECT 1 FROM signers s
       WHERE s.signature_request_id = signature_requests.id
         AND (s.user_id = auth.uid()
              OR s.beneficiary_id IN (SELECT id FROM beneficiaries WHERE user_id = auth.uid()))
    )
  );

ALTER TABLE signers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS signers_select ON signers;
CREATE POLICY signers_select ON signers FOR SELECT
  TO authenticated USING (
    (org_id = current_org_id() AND has_permission('documents.read'))
    OR user_id = auth.uid()
    OR beneficiary_id IN (SELECT id FROM beneficiaries WHERE user_id = auth.uid())
  );

-- --------------------------------------------------------------------------
-- 7. Approvals (admin & approver)
-- --------------------------------------------------------------------------

ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approval_requests_select ON approval_requests;
CREATE POLICY approval_requests_select ON approval_requests FOR SELECT
  TO authenticated USING (org_id = current_org_id() AND has_permission('approvals.read'));
DROP POLICY IF EXISTS approval_requests_insert ON approval_requests;
CREATE POLICY approval_requests_insert ON approval_requests FOR INSERT
  TO authenticated WITH CHECK (org_id = current_org_id() AND has_permission('approvals.read'));
DROP POLICY IF EXISTS approval_requests_update ON approval_requests;
CREATE POLICY approval_requests_update ON approval_requests FOR UPDATE
  TO authenticated USING (org_id = current_org_id() AND has_permission('approvals.approve'));

ALTER TABLE approval_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approval_actions_select ON approval_actions;
CREATE POLICY approval_actions_select ON approval_actions FOR SELECT
  TO authenticated USING (org_id = current_org_id() AND has_permission('approvals.read'));
DROP POLICY IF EXISTS approval_actions_insert_self ON approval_actions;
CREATE POLICY approval_actions_insert_self ON approval_actions FOR INSERT
  TO authenticated WITH CHECK (
    org_id = current_org_id()
    AND user_id = auth.uid()
    AND has_permission('approvals.approve')
  );

-- --------------------------------------------------------------------------
-- 8. Cap table & valuations (org-scoped admin)
-- --------------------------------------------------------------------------

ALTER TABLE securities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS securities_select ON securities;
CREATE POLICY securities_select ON securities FOR SELECT
  TO authenticated USING (org_id = current_org_id() AND has_permission('captable.read'));
DROP POLICY IF EXISTS securities_insert ON securities;
CREATE POLICY securities_insert ON securities FOR INSERT
  TO authenticated WITH CHECK (org_id = current_org_id() AND has_permission('captable.simulate'));
DROP POLICY IF EXISTS securities_update ON securities;
CREATE POLICY securities_update ON securities FOR UPDATE
  TO authenticated USING (org_id = current_org_id() AND has_permission('captable.simulate'));

ALTER TABLE cap_table_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cap_table_snapshots_select ON cap_table_snapshots;
CREATE POLICY cap_table_snapshots_select ON cap_table_snapshots FOR SELECT
  TO authenticated USING (org_id = current_org_id() AND has_permission('captable.read'));

ALTER TABLE valuation_award_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS valuation_award_results_select_admin ON valuation_award_results;
CREATE POLICY valuation_award_results_select_admin ON valuation_award_results FOR SELECT
  TO authenticated USING (org_id = current_org_id() AND has_permission('valuations.read'));
DROP POLICY IF EXISTS valuation_award_results_select_beneficiary ON valuation_award_results;
CREATE POLICY valuation_award_results_select_beneficiary ON valuation_award_results FOR SELECT
  TO authenticated USING (is_award_beneficiary(award_id));

-- --------------------------------------------------------------------------
-- 9. Compliance alerts (lecture admin)
-- --------------------------------------------------------------------------

ALTER TABLE compliance_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compliance_alerts_select ON compliance_alerts;
CREATE POLICY compliance_alerts_select ON compliance_alerts FOR SELECT
  TO authenticated USING (org_id = current_org_id() AND has_permission('compliance.read'));
DROP POLICY IF EXISTS compliance_alerts_update ON compliance_alerts;
CREATE POLICY compliance_alerts_update ON compliance_alerts FOR UPDATE
  TO authenticated USING (
    org_id = current_org_id() AND has_permission('compliance.acknowledge_alert')
  );

-- --------------------------------------------------------------------------
-- 10. Notifications (lecture self + admin)
-- --------------------------------------------------------------------------

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_select_self ON notifications;
CREATE POLICY notifications_select_self ON notifications FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR beneficiary_id IN (SELECT id FROM beneficiaries WHERE user_id = auth.uid())
  );
DROP POLICY IF EXISTS notifications_update_read ON notifications;
CREATE POLICY notifications_update_read ON notifications FOR UPDATE
  TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- --------------------------------------------------------------------------
-- 11. Pattern 3 — Audit immuable & operation_log
--    SELECT autorisé selon permission ; INSERT/UPDATE/DELETE interdits via API
--    publique (seul le service_role bypassera la RLS).
-- --------------------------------------------------------------------------

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_events_select ON audit_events;
CREATE POLICY audit_events_select ON audit_events FOR SELECT
  TO authenticated USING (org_id = current_org_id() AND has_permission('audit.read'));
-- Pas de policy INSERT/UPDATE/DELETE → bloqué pour authenticated/anon.

ALTER TABLE operation_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS operation_log_select ON operation_log;
CREATE POLICY operation_log_select ON operation_log FOR SELECT
  TO authenticated USING (org_id = current_org_id() AND has_permission('audit.read'));

-- --------------------------------------------------------------------------
-- 12. Tables miroir Python (vesting_schedules, etc.) — RLS permissive
--     (lecture si org_id correspond, sinon NULL = donnée globale visible)
-- --------------------------------------------------------------------------

DO $$
DECLARE
  rel_name TEXT;
BEGIN
  FOR rel_name IN VALUES
    ('vesting_schedules'),
    ('performance_conditions'),
    ('hypothesis_sets'),
    ('volatility_schemes'),
    ('simulation_configs'),
    ('valuation_runs'),
    ('ifrs2_expense_schedules')
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', rel_name);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON %I', rel_name, rel_name);
    EXECUTE format(
      'CREATE POLICY %I_select ON %I FOR SELECT TO authenticated USING (org_id IS NULL OR org_id = current_org_id())',
      rel_name, rel_name
    );
  END LOOP;
END $$;

-- vesting_tranches : héritage du schedule
ALTER TABLE vesting_tranches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vesting_tranches_select ON vesting_tranches;
CREATE POLICY vesting_tranches_select ON vesting_tranches FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM vesting_schedules vs
       WHERE vs.id = vesting_tranches.schedule_id
         AND (vs.org_id IS NULL OR vs.org_id = current_org_id())
    )
  );

-- valuation_results : héritage du run
ALTER TABLE valuation_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS valuation_results_select ON valuation_results;
CREATE POLICY valuation_results_select ON valuation_results FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM valuation_runs vr
       WHERE vr.id = valuation_results.valuation_run_id
         AND (vr.org_id IS NULL OR vr.org_id = current_org_id())
    )
  );

-- ifrs2_expense_periods : héritage du schedule
ALTER TABLE ifrs2_expense_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ifrs2_expense_periods_select ON ifrs2_expense_periods;
CREATE POLICY ifrs2_expense_periods_select ON ifrs2_expense_periods FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM ifrs2_expense_schedules s
       WHERE s.id = ifrs2_expense_periods.schedule_id
         AND (s.org_id IS NULL OR s.org_id = current_org_id())
    )
  );

-- ===========================================================================
-- Fin de la migration 00002 — RLS policies
-- ===========================================================================
