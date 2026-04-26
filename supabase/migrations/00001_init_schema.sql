-- ===========================================================================
-- Capiwise — Equity Platform
-- Migration 00001 : Schéma initial (Module 1 §4)
--
-- Crée TOUTES les tables métier de la spec Foundation, plus les tables
-- référentielles globales et les tables miroir des entités gérées par le
-- moteur Python existant (vesting_schedules, valuation_runs, etc.).
--
-- Conventions :
--   - snake_case partout (tables et colonnes).
--   - Soft delete via deleted_at TIMESTAMPTZ NULL sur toutes les tables métier.
--   - org_id UUID NOT NULL sauf tables référentielles globales.
--   - CREATE TABLE IF NOT EXISTS partout pour pouvoir replay sur une DB
--     contenant déjà les tables du moteur Python (cf. spec §4.4 : « Conservées
--     à l'identique du moteur existant »).
--   - Pas d'ENUM Postgres : TEXT + CHECK pour rester migrable (spec §11).
--   - Indexes en CREATE INDEX IF NOT EXISTS.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- 0. Extensions
-- --------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- pg_cron n'est pas disponible en local par défaut ; activé en prod via
-- l'UI Supabase (Database → Extensions). Les jobs Edge Functions seront
-- déclenchés via Supabase Scheduled Functions à défaut.

-- --------------------------------------------------------------------------
-- 1. Helper : trigger updated_at automatique
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- --------------------------------------------------------------------------
-- 2. Tables référentielles globales (pas d'org_id)
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS permissions_catalog (
  code TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT,
  is_dangerous BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role TEXT NOT NULL,
  permission_code TEXT NOT NULL REFERENCES permissions_catalog(code) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_code)
);

CREATE TABLE IF NOT EXISTS compliance_rules_catalog (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  jurisdiction TEXT NOT NULL DEFAULT 'FR',
  applies_to_plan_types TEXT[],
  category TEXT NOT NULL CHECK (category IN ('ELIGIBILITY', 'TIMING', 'QUANTITY', 'PROCEDURE')),
  default_enforcement TEXT NOT NULL DEFAULT 'soft' CHECK (default_enforcement IN ('soft', 'hard', 'disabled')),
  legal_reference TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS notification_templates (
  code TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('EMAIL', 'IN_APP', 'SMS')),
  locale TEXT NOT NULL DEFAULT 'fr-FR',
  subject TEXT,
  body_template TEXT NOT NULL,
  available_variables JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- --------------------------------------------------------------------------
-- 3. Identité & Organisation
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  legal_name TEXT,
  siren TEXT,
  legal_form TEXT CHECK (legal_form IN ('SAS', 'SA', 'SARL', 'SCA', 'SC', 'EURL', 'OTHER') OR legal_form IS NULL),
  registered_address JSONB,
  default_currency TEXT NOT NULL DEFAULT 'EUR',
  default_locale TEXT NOT NULL DEFAULT 'fr-FR',
  timezone TEXT NOT NULL DEFAULT 'Europe/Paris',
  fiscal_year_end_month SMALLINT NOT NULL DEFAULT 12 CHECK (fiscal_year_end_month BETWEEN 1 AND 12),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  plan_tier TEXT NOT NULL DEFAULT 'STANDARD',
  stripe_customer_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
DROP TRIGGER IF EXISTS set_organizations_updated_at ON organizations;
CREATE TRIGGER set_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  default_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
DROP TRIGGER IF EXISTS set_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER set_user_profiles_updated_at BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  roles TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INVITED', 'SUSPENDED')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  permissions_grant TEXT[] NOT NULL DEFAULT '{}',
  permissions_revoke TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org ON memberships(org_id);
DROP TRIGGER IF EXISTS set_memberships_updated_at ON memberships;
CREATE TRIGGER set_memberships_updated_at BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  roles TEXT[] NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  beneficiary_id UUID,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_invitations_org ON invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);

-- --------------------------------------------------------------------------
-- 4. Sociétés & Bénéficiaires
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  legal_name TEXT,
  siren TEXT,
  legal_form TEXT,
  ticker TEXT,
  isin TEXT,
  country_code TEXT NOT NULL DEFAULT 'FR',
  share_capital NUMERIC,
  share_par_value NUMERIC,
  total_shares_issued BIGINT,
  is_bspce_eligible BOOLEAN NOT NULL DEFAULT false,
  bspce_eligibility_assessed_at DATE,
  bspce_eligibility_data JSONB,
  founded_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_companies_org ON companies(org_id) WHERE deleted_at IS NULL;
DROP TRIGGER IF EXISTS set_companies_updated_at ON companies;
CREATE TRIGGER set_companies_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS beneficiaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  date_of_birth DATE,
  nationality TEXT NOT NULL DEFAULT 'FR',
  tax_residence_country TEXT NOT NULL DEFAULT 'FR',
  social_security_number TEXT,
  beneficiary_type TEXT NOT NULL CHECK (beneficiary_type IN ('EMPLOYEE', 'OFFICER', 'CONSULTANT', 'ADVISOR', 'OTHER')),
  job_title TEXT,
  department TEXT,
  hire_date DATE,
  termination_date DATE,
  termination_reason TEXT,
  address JSONB,
  identity_document_url TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FORMER', 'ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (org_id, email)
);
CREATE INDEX IF NOT EXISTS idx_beneficiaries_org ON beneficiaries(org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_beneficiaries_user ON beneficiaries(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_beneficiaries_status ON beneficiaries(status);
DROP TRIGGER IF EXISTS set_beneficiaries_updated_at ON beneficiaries;
CREATE TRIGGER set_beneficiaries_updated_at BEFORE UPDATE ON beneficiaries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Self-FK invitations.beneficiary_id → beneficiaries.id (créé après beneficiaries)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invitations_beneficiary_id_fkey'
  ) THEN
    ALTER TABLE invitations
      ADD CONSTRAINT invitations_beneficiary_id_fkey
      FOREIGN KEY (beneficiary_id) REFERENCES beneficiaries(id) ON DELETE SET NULL;
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- 5. Tables miroir du moteur Python (schéma minimal pour permettre les FK)
--    Ces tables sont marquées « Conservées à l'identique » par la spec §4.4 ;
--    le moteur Python en prod a son propre schéma plus riche. Ici on crée
--    juste assez pour que les FK depuis awards et valuation_award_results
--    fonctionnent en local.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vesting_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID,
  name TEXT,
  description TEXT,
  is_template BOOLEAN NOT NULL DEFAULT false,
  schedule_type TEXT,
  cliff_months INTEGER,
  total_months INTEGER,
  custom_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vesting_tranches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES vesting_schedules(id) ON DELETE CASCADE,
  tranche_order INTEGER NOT NULL,
  vest_date DATE,
  units_or_pct NUMERIC,
  performance_condition_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS performance_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID,
  name TEXT,
  condition_type TEXT,
  parameters JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hypothesis_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID,
  name TEXT,
  parameters JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS volatility_schemes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID,
  name TEXT,
  scheme_type TEXT,
  parameters JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS simulation_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID,
  name TEXT,
  num_paths INTEGER,
  parameters JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS valuation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT,
  parameters JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS valuation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  valuation_run_id UUID NOT NULL REFERENCES valuation_runs(id) ON DELETE CASCADE,
  fair_value NUMERIC,
  audit_data JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ifrs2_expense_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID,
  award_id UUID,
  total_expense NUMERIC,
  parameters JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ifrs2_expense_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES ifrs2_expense_schedules(id) ON DELETE CASCADE,
  period_start DATE,
  period_end DATE,
  expense_amount NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- 6. Plans
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN (
    'BSPCE', 'AGA', 'STOCK_OPTION', 'BSA', 'RSU', 'PERFORMANCE_SHARE', 'PHANTOM', 'ESOP', 'SAR'
  )),
  settlement_type TEXT NOT NULL DEFAULT 'EQUITY' CHECK (settlement_type IN ('EQUITY', 'CASH')),
  board_date DATE,
  shareholder_meeting_date DATE,
  shareholder_authorization_expires_at DATE,
  grant_date DATE NOT NULL,
  pool_size BIGINT NOT NULL CHECK (pool_size > 0),
  pool_allocated BIGINT NOT NULL DEFAULT 0,
  pool_vested BIGINT NOT NULL DEFAULT 0,
  pool_exercised BIGINT NOT NULL DEFAULT 0,
  pool_cancelled BIGINT NOT NULL DEFAULT 0,
  exercise_price NUMERIC,
  reference_share_price NUMERIC,
  performance_combination_type TEXT NOT NULL DEFAULT 'WEIGHTED',
  performance_evaluation_moment TEXT NOT NULL DEFAULT 'END',
  performance_failure_action TEXT NOT NULL DEFAULT 'FORFEIT',
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED')),
  version INTEGER NOT NULL DEFAULT 1,
  parent_plan_id UUID REFERENCES plans(id) ON DELETE SET NULL,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  plan_rules_template_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_plans_org ON plans(org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
CREATE INDEX IF NOT EXISTS idx_plans_type ON plans(plan_type);
DROP TRIGGER IF EXISTS set_plans_updated_at ON plans;
CREATE TRIGGER set_plans_updated_at BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS early_termination_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  leaver_type TEXT NOT NULL CHECK (leaver_type IN (
    'resignation', 'termination_cause', 'termination_no_cause', 'death',
    'retirement', 'company_sale', 'mutual_agreement', 'end_of_contract'
  )),
  treatment TEXT NOT NULL CHECK (treatment IN (
    'forfeit_all', 'keep_vested', 'pro_rata', 'accelerate', 'full_accelerate'
  )),
  acceleration_months INTEGER,
  exercise_window_days INTEGER,
  custom_logic JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, leaver_type)
);

-- --------------------------------------------------------------------------
-- 7. Awards (cœur du système)
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  beneficiary_id UUID NOT NULL REFERENCES beneficiaries(id) ON DELETE RESTRICT,
  award_number TEXT,
  units_granted BIGINT NOT NULL CHECK (units_granted > 0),
  units_vested BIGINT NOT NULL DEFAULT 0,
  units_exercised BIGINT NOT NULL DEFAULT 0,
  units_settled BIGINT NOT NULL DEFAULT 0,
  units_cancelled BIGINT NOT NULL DEFAULT 0,
  units_outstanding BIGINT GENERATED ALWAYS AS
    (units_granted - units_exercised - units_cancelled) STORED,
  exercise_price NUMERIC,
  fair_value_per_unit NUMERIC,
  total_fair_value NUMERIC GENERATED ALWAYS AS
    (units_granted * fair_value_per_unit) STORED,
  grant_date DATE NOT NULL,
  vesting_start_date DATE,
  expiry_date DATE,
  acceptance_deadline DATE,
  accepted_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT', 'PROPOSED', 'PENDING_APPROVAL', 'APPROVED',
    'PENDING_BOARD', 'BOARD_APPROVED', 'PENDING_SIGNATURE',
    'GRANTED', 'VESTING', 'PARTIALLY_VESTED', 'FULLY_VESTED',
    'PARTIALLY_EXERCISED', 'FULLY_EXERCISED',
    'EXPIRED', 'FORFEITED', 'CANCELLED'
  )),
  plan_version INTEGER,
  plan_rules_document_id UUID,
  vesting_schedule_snapshot JSONB,
  performance_conditions_snapshot JSONB,
  leaver_rules_snapshot JSONB,
  is_compliant BOOLEAN NOT NULL DEFAULT true,
  compliance_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  has_modifications BOOLEAN NOT NULL DEFAULT false,
  approval_request_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  granted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_awards_org ON awards(org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_awards_plan ON awards(plan_id);
CREATE INDEX IF NOT EXISTS idx_awards_beneficiary ON awards(beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_awards_status ON awards(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_awards_number
  ON awards(org_id, award_number) WHERE award_number IS NOT NULL;
DROP TRIGGER IF EXISTS set_awards_updated_at ON awards;
CREATE TRIGGER set_awards_updated_at BEFORE UPDATE ON awards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS vesting_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  award_id UUID NOT NULL REFERENCES awards(id) ON DELETE CASCADE,
  tranche_id UUID REFERENCES vesting_tranches(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL,
  effective_date DATE,
  units_to_vest BIGINT NOT NULL,
  units_vested BIGINT NOT NULL DEFAULT 0,
  performance_multiplier NUMERIC NOT NULL DEFAULT 1.0,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'VESTED', 'FORFEITED', 'ACCELERATED', 'DEFERRED'
  )),
  performance_assessed_at TIMESTAMPTZ,
  performance_assessment_data JSONB,
  notification_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vesting_events_award ON vesting_events(award_id);
CREATE INDEX IF NOT EXISTS idx_vesting_events_date ON vesting_events(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_vesting_events_status ON vesting_events(status);
DROP TRIGGER IF EXISTS set_vesting_events_updated_at ON vesting_events;
CREATE TRIGGER set_vesting_events_updated_at BEFORE UPDATE ON vesting_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS award_modifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  award_id UUID NOT NULL REFERENCES awards(id) ON DELETE CASCADE,
  modification_type TEXT NOT NULL CHECK (modification_type IN (
    'REPRICING', 'EXTENSION', 'ACCELERATION', 'ADDITIONAL_GRANT', 'CANCELLATION'
  )),
  effective_date DATE NOT NULL,
  before_snapshot JSONB NOT NULL,
  after_snapshot JSONB NOT NULL,
  incremental_fair_value NUMERIC,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approval_request_id UUID,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_award_modifications_award ON award_modifications(award_id);

CREATE TABLE IF NOT EXISTS exercise_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  award_id UUID NOT NULL REFERENCES awards(id) ON DELETE RESTRICT,
  beneficiary_id UUID NOT NULL REFERENCES beneficiaries(id) ON DELETE RESTRICT,
  request_number TEXT,
  units_to_exercise BIGINT NOT NULL CHECK (units_to_exercise > 0),
  exercise_price_per_unit NUMERIC NOT NULL,
  total_exercise_amount NUMERIC GENERATED ALWAYS AS
    (units_to_exercise * exercise_price_per_unit) STORED,
  fmv_per_unit_at_request NUMERIC,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'
  )),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_reason TEXT,
  payment_received_at TIMESTAMPTZ,
  payment_reference TEXT,
  certificate_issued_at TIMESTAMPTZ,
  certificate_document_id UUID,
  completed_at TIMESTAMPTZ,
  is_within_exercise_window BOOLEAN NOT NULL DEFAULT true,
  compliance_checks JSONB NOT NULL DEFAULT '{}'::jsonb,
  beneficiary_notes TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exercise_requests_award ON exercise_requests(award_id);
CREATE INDEX IF NOT EXISTS idx_exercise_requests_status ON exercise_requests(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_exercise_requests_number
  ON exercise_requests(org_id, request_number) WHERE request_number IS NOT NULL;
DROP TRIGGER IF EXISTS set_exercise_requests_updated_at ON exercise_requests;
CREATE TRIGGER set_exercise_requests_updated_at BEFORE UPDATE ON exercise_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --------------------------------------------------------------------------
-- 8. Workflow d'approbation
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  applies_to TEXT NOT NULL CHECK (applies_to IN (
    'AWARD_GRANT', 'AWARD_MODIFICATION', 'EXERCISE_REQUEST', 'PLAN_CREATION'
  )),
  plan_type_filter TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS set_approval_workflows_updated_at ON approval_workflows;
CREATE TRIGGER set_approval_workflows_updated_at BEFORE UPDATE ON approval_workflows
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS approval_workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES approval_workflows(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  approver_type TEXT NOT NULL CHECK (approver_type IN ('ROLE', 'USER', 'ANY_OF_ROLE', 'ALL_OF_ROLE')),
  approver_role TEXT,
  approver_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'SEQUENTIAL' CHECK (mode IN ('SEQUENTIAL', 'PARALLEL')),
  required_approvals INTEGER NOT NULL DEFAULT 1,
  sla_hours INTEGER,
  auto_escalate_after_hours INTEGER,
  escalate_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (workflow_id, step_order)
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES approval_workflows(id) ON DELETE SET NULL,
  subject_type TEXT NOT NULL,
  subject_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'CANCELLED'
  )),
  current_step_id UUID REFERENCES approval_workflow_steps(id) ON DELETE SET NULL,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  request_message TEXT,
  resolved_at TIMESTAMPTZ,
  resolution TEXT CHECK (resolution IN ('APPROVED', 'REJECTED') OR resolution IS NULL),
  resolution_message TEXT,
  subject_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_requests_subject ON approval_requests(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);
DROP TRIGGER IF EXISTS set_approval_requests_updated_at ON approval_requests;
CREATE TRIGGER set_approval_requests_updated_at BEFORE UPDATE ON approval_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS approval_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  step_id UUID REFERENCES approval_workflow_steps(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('APPROVE', 'REJECT', 'REQUEST_CHANGES', 'DELEGATE', 'COMMENT')),
  comment TEXT,
  delegated_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_approval_actions_request ON approval_actions(request_id);

-- Self-FK awards.approval_request_id → approval_requests.id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'awards_approval_request_id_fkey'
  ) THEN
    ALTER TABLE awards
      ADD CONSTRAINT awards_approval_request_id_fkey
      FOREIGN KEY (approval_request_id) REFERENCES approval_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'award_modifications_approval_request_id_fkey'
  ) THEN
    ALTER TABLE award_modifications
      ADD CONSTRAINT award_modifications_approval_request_id_fkey
      FOREIGN KEY (approval_request_id) REFERENCES approval_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- 9. Documents & Signatures
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN (
    'AWARD_LETTER', 'PLAN_RULES', 'BOARD_RESOLUTION', 'EXERCISE_NOTICE',
    'CERTIFICATE', 'ACCEPTANCE_LETTER'
  )),
  applies_to_plan_types TEXT[],
  content_format TEXT NOT NULL DEFAULT 'TIPTAP_JSON' CHECK (content_format IN ('TIPTAP_JSON', 'MARKDOWN', 'HTML')),
  content JSONB NOT NULL,
  available_variables JSONB,
  version INTEGER NOT NULL DEFAULT 1,
  parent_template_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  signature_workflow JSONB,
  pdf_style JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_document_templates_org ON document_templates(org_id) WHERE deleted_at IS NULL;
DROP TRIGGER IF EXISTS set_document_templates_updated_at ON document_templates;
CREATE TRIGGER set_document_templates_updated_at BEFORE UPDATE ON document_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'document_templates_parent_template_id_fkey'
  ) THEN
    ALTER TABLE document_templates
      ADD CONSTRAINT document_templates_parent_template_id_fkey
      FOREIGN KEY (parent_template_id) REFERENCES document_templates(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'plans_plan_rules_template_id_fkey'
  ) THEN
    ALTER TABLE plans
      ADD CONSTRAINT plans_plan_rules_template_id_fkey
      FOREIGN KEY (plan_rules_template_id) REFERENCES document_templates(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS document_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id UUID REFERENCES document_templates(id) ON DELETE SET NULL,
  template_version INTEGER,
  document_number TEXT,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  related_entity_type TEXT,
  related_entity_id UUID,
  rendered_html TEXT,
  rendered_pdf_url TEXT,
  rendered_pdf_hash TEXT,
  variables_used JSONB,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT', 'GENERATED', 'SENT_FOR_SIGNATURE', 'PARTIALLY_SIGNED',
    'SIGNED', 'ARCHIVED', 'VOIDED'
  )),
  generated_at TIMESTAMPTZ,
  generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  signed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  voided_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_instances_org ON document_instances(org_id);
CREATE INDEX IF NOT EXISTS idx_document_instances_related ON document_instances(related_entity_type, related_entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_instances_number
  ON document_instances(org_id, document_number) WHERE document_number IS NOT NULL;
DROP TRIGGER IF EXISTS set_document_instances_updated_at ON document_instances;
CREATE TRIGGER set_document_instances_updated_at BEFORE UPDATE ON document_instances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'awards_plan_rules_document_id_fkey'
  ) THEN
    ALTER TABLE awards
      ADD CONSTRAINT awards_plan_rules_document_id_fkey
      FOREIGN KEY (plan_rules_document_id) REFERENCES document_instances(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exercise_requests_certificate_document_id_fkey'
  ) THEN
    ALTER TABLE exercise_requests
      ADD CONSTRAINT exercise_requests_certificate_document_id_fkey
      FOREIGN KEY (certificate_document_id) REFERENCES document_instances(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS signature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES document_instances(id) ON DELETE CASCADE,
  yousign_procedure_id TEXT,
  yousign_signature_request_id TEXT,
  status TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN (
    'CREATED', 'SENT', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'DECLINED', 'CANCELLED'
  )),
  expiry_date TIMESTAMPTZ,
  reminder_settings JSONB,
  webhook_payload_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  proof_certificate_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_signature_requests_document ON signature_requests(document_id);
CREATE INDEX IF NOT EXISTS idx_signature_requests_yousign ON signature_requests(yousign_procedure_id);

CREATE TABLE IF NOT EXISTS signers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  signature_request_id UUID NOT NULL REFERENCES signature_requests(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  beneficiary_id UUID REFERENCES beneficiaries(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role_in_signature TEXT CHECK (role_in_signature IN (
    'BENEFICIARY', 'COMPANY_REPRESENTATIVE', 'BOARD_MEMBER', 'WITNESS'
  )),
  signing_order INTEGER,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'VIEWED', 'SIGNED', 'DECLINED')),
  yousign_signer_id TEXT,
  yousign_sign_url TEXT,
  invited_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  decline_reason TEXT,
  ip_address INET,
  signature_method TEXT CHECK (signature_method IN ('SIMPLE_ELECTRONIC', 'ADVANCED_ELECTRONIC', 'QUALIFIED') OR signature_method IS NULL),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_signers_request ON signers(signature_request_id);

-- --------------------------------------------------------------------------
-- 10. Cap table
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS securities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  security_type TEXT NOT NULL,
  series_name TEXT,
  issuance_date DATE,
  total_units BIGINT NOT NULL,
  par_value NUMERIC,
  issue_price NUMERIC,
  holder_type TEXT NOT NULL CHECK (holder_type IN (
    'INDIVIDUAL', 'COMPANY', 'FUND', 'BENEFICIARY_VIA_AWARD'
  )),
  holder_beneficiary_id UUID REFERENCES beneficiaries(id) ON DELETE SET NULL,
  holder_name TEXT,
  holder_legal_id TEXT,
  source_award_id UUID REFERENCES awards(id) ON DELETE SET NULL,
  source_round_id UUID,
  liquidation_preference_multiple NUMERIC,
  liquidation_preference_type TEXT CHECK (
    liquidation_preference_type IN ('NON_PARTICIPATING', 'PARTICIPATING', 'CAPPED')
    OR liquidation_preference_type IS NULL
  ),
  conversion_ratio NUMERIC NOT NULL DEFAULT 1.0,
  anti_dilution_type TEXT CHECK (
    anti_dilution_type IN ('NONE', 'FULL_RATCHET', 'BROAD_BASED', 'NARROW_BASED')
    OR anti_dilution_type IS NULL
  ),
  status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'CONVERTED', 'CANCELLED', 'REPURCHASED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_securities_org ON securities(org_id);
CREATE INDEX IF NOT EXISTS idx_securities_company ON securities(company_id);
CREATE INDEX IF NOT EXISTS idx_securities_holder ON securities(holder_beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_securities_source_award ON securities(source_award_id);

CREATE TABLE IF NOT EXISTS cap_table_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('AUTO_DAILY', 'MANUAL', 'EVENT', 'SCENARIO')),
  trigger_event TEXT,
  data JSONB NOT NULL,
  total_shares_outstanding BIGINT,
  total_shares_fully_diluted BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_captable_snapshots_company_date ON cap_table_snapshots(company_id, snapshot_date DESC);

CREATE TABLE IF NOT EXISTS cap_table_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  base_snapshot_id UUID REFERENCES cap_table_snapshots(id) ON DELETE SET NULL,
  assumptions JSONB NOT NULL,
  computed_data JSONB,
  computed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_archived BOOLEAN NOT NULL DEFAULT false
);

-- --------------------------------------------------------------------------
-- 11. Valorisation IFRS 2 (extension du moteur Python)
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS valuation_award_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  valuation_run_id UUID NOT NULL REFERENCES valuation_runs(id) ON DELETE CASCADE,
  award_id UUID NOT NULL REFERENCES awards(id) ON DELETE CASCADE,
  fair_value_per_unit NUMERIC NOT NULL,
  total_fair_value NUMERIC NOT NULL,
  vesting_probability NUMERIC,
  audit_data JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_valuation_award_results_award ON valuation_award_results(award_id);
CREATE INDEX IF NOT EXISTS idx_valuation_award_results_run ON valuation_award_results(valuation_run_id);

-- Extension de ifrs2_expense_schedules : ajout de award_id (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ifrs2_expense_schedules_award_id_fkey'
  ) THEN
    ALTER TABLE ifrs2_expense_schedules
      ADD CONSTRAINT ifrs2_expense_schedules_award_id_fkey
      FOREIGN KEY (award_id) REFERENCES awards(id) ON DELETE SET NULL;
  END IF;
END $$;

-- --------------------------------------------------------------------------
-- 12. Conformité
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS compliance_rules_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL REFERENCES compliance_rules_catalog(code) ON DELETE CASCADE,
  enforcement TEXT NOT NULL CHECK (enforcement IN ('soft', 'hard', 'disabled')),
  custom_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (org_id, rule_code)
);
DROP TRIGGER IF EXISTS set_compliance_rules_config_updated_at ON compliance_rules_config;
CREATE TRIGGER set_compliance_rules_config_updated_at BEFORE UPDATE ON compliance_rules_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS compliance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARNING', 'ERROR')),
  subject_type TEXT NOT NULL,
  subject_id UUID NOT NULL,
  message TEXT NOT NULL,
  details JSONB,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED')),
  acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_open ON compliance_alerts(status) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_compliance_alerts_subject ON compliance_alerts(subject_type, subject_id);

-- --------------------------------------------------------------------------
-- 13. Notifications & audit
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  beneficiary_id UUID REFERENCES beneficiaries(id) ON DELETE CASCADE,
  template_code TEXT REFERENCES notification_templates(code) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('EMAIL', 'IN_APP', 'SMS')),
  recipient_email TEXT,
  recipient_phone TEXT,
  subject TEXT,
  body TEXT,
  variables_used JSONB,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED'
  )),
  provider TEXT CHECK (provider IN ('RESEND', 'TWILIO') OR provider IS NULL),
  provider_message_id TEXT,
  provider_response JSONB,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  read_at TIMESTAMPTZ,
  related_entity_type TEXT,
  related_entity_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at) WHERE channel = 'IN_APP';
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  event_type TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  before_state JSONB,
  after_state JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  request_id TEXT,
  api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_events_org_time ON audit_events(org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_user ON audit_events(user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS operation_log (
  idempotency_key UUID PRIMARY KEY,
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  operation TEXT NOT NULL,
  request_payload JSONB,
  response_payload JSONB,
  response_status INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_operation_log_org_time ON operation_log(org_id, created_at DESC);

-- --------------------------------------------------------------------------
-- 14. Reporting & feature flags
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL CHECK (report_type IN (
    'IFRS2_QUARTERLY', 'IFRS2_ANNUAL', 'DSN_EXPORT',
    'AUDITOR_PACKAGE', 'CAP_TABLE', 'EXERCISE_HISTORY'
  )),
  period_start DATE,
  period_end DATE,
  parameters JSONB,
  output_format TEXT CHECK (output_format IN ('PDF', 'XLSX', 'CSV', 'JSON') OR output_format IS NULL),
  output_url TEXT,
  output_hash TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'GENERATING', 'COMPLETED', 'FAILED'
  )),
  error_message TEXT,
  generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reports_org ON reports(org_id);

CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  flag_code TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  config JSONB,
  UNIQUE (org_id, flag_code)
);

-- ===========================================================================
-- Fin de la migration 00001 — Schéma initial
-- ===========================================================================
