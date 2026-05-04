-- =============================================================================
-- Module 12 B1 — Compliance Engine V2 (DB foundation)
-- =============================================================================
--
-- Spec : docs/MODULE_12_COMPLIANCE_ENGINE_V2.md §2 (Modèle de données) + §5.1
-- (Inventaire et seed des definitions).
--
-- Adaptations vs spec (drift DB) :
--   * `orgs(id)`             → `organizations(id)`        (table réelle)
--   * `permissions`          → `permissions_catalog`      (table réelle)
--   * `INSERT permissions(code, label, description)` → `INSERT permissions_catalog(code, category, description)`
--     (pas de colonne `label`, colonne `category` à la place — pattern 'COMPLIANCE')
--   * `role_permissions(role_id, permission_id)` → `role_permissions(role, permission_code)`
--     (FK text-based, pas UUID)
--   * Pas de table `roles` — `role_permissions.role` est juste un text code
--     ('OWNER', 'ADMIN_HR', 'BENEFICIARY', etc.)
--
-- Contenu :
--   1. Table `compliance_rule_definitions` (catalogue maître, seedé)
--   2. Table `compliance_rule_overrides` (config par org, RLS)
--   3. Vue `effective_compliance_rules` (jointure default+override)
--   4. RPC `get_effective_rule(rule_code)` SECURITY DEFINER
--   5. Seed permission `compliance_rules.config.write` (catégorie COMPLIANCE)
--   6. Assign permission au rôle OWNER uniquement
--   7. Seed des 22 rule definitions (V1 inventaire post-Module 11)
--
-- Idempotence : la migration utilise `IF NOT EXISTS` partout + `ON CONFLICT
-- DO NOTHING` sur les seeds. Re-run ne casse rien.

-- =============================================================================
-- 1. Table compliance_rule_definitions
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.compliance_rule_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL CHECK (scope IN (
    'plan', 'award', 'beneficiary', 'valuation',
    'cap_table', 'exercise', 'approval', 'document'
  )),
  severity_default TEXT NOT NULL CHECK (severity_default IN ('error', 'warning')),
  description_fr TEXT NOT NULL,
  description_en TEXT,
  -- params_schema = méta-schéma des params éditables (JSON-Schema simplifié).
  -- Ex: '{"staleDays": {"type": "integer", "min": 30, "max": 365, "default": 90, "label_fr": "..."}}'
  params_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- default_params = valeurs effectives par défaut, mergées avec params_override
  default_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active_by_default BOOLEAN NOT NULL DEFAULT TRUE,
  is_severity_overridable BOOLEAN NOT NULL DEFAULT FALSE,
  cta_url_template TEXT,
  documentation_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_rule_definitions_scope
  ON public.compliance_rule_definitions(scope);

GRANT SELECT ON public.compliance_rule_definitions TO authenticated;

COMMENT ON TABLE public.compliance_rule_definitions IS
  'Module 12 B1 — Catalogue maitre des compliance rules (22 V1). Seede par migration, non modifiable par les users.';

-- =============================================================================
-- 2. Table compliance_rule_overrides
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.compliance_rule_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL REFERENCES public.compliance_rule_definitions(rule_code) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  params_override JSONB NOT NULL DEFAULT '{}'::jsonb,
  severity_override TEXT CHECK (severity_override IN ('error', 'warning')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE (org_id, rule_code)
);

CREATE INDEX IF NOT EXISTS idx_compliance_rule_overrides_org
  ON public.compliance_rule_overrides(org_id);

CREATE INDEX IF NOT EXISTS idx_compliance_rule_overrides_rule
  ON public.compliance_rule_overrides(rule_code);

ALTER TABLE public.compliance_rule_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "compliance_rule_overrides_select_org" ON public.compliance_rule_overrides;
CREATE POLICY "compliance_rule_overrides_select_org"
  ON public.compliance_rule_overrides FOR SELECT
  TO authenticated
  USING (org_id = current_org_id());

DROP POLICY IF EXISTS "compliance_rule_overrides_write_with_perm" ON public.compliance_rule_overrides;
CREATE POLICY "compliance_rule_overrides_write_with_perm"
  ON public.compliance_rule_overrides FOR ALL
  TO authenticated
  USING (
    org_id = current_org_id()
    AND has_permission('compliance_rules.config.write')
  )
  WITH CHECK (
    org_id = current_org_id()
    AND has_permission('compliance_rules.config.write')
  );

COMMENT ON TABLE public.compliance_rule_overrides IS
  'Module 12 B1 — Configuration par org des compliance rules (override des seuils + activation/desactivation). RLS perm compliance_rules.config.write.';

-- =============================================================================
-- 3. Vue effective_compliance_rules
-- =============================================================================
--
-- Cross join organizations × definitions LEFT JOIN overrides. Chaque ligne
-- represente la config effective de la rule pour l'org. Le merge JSONB
-- `default_params || params_override` ecrit les params override par-dessus
-- les defaults (Postgres: || sur jsonb fait un merge top-level).

CREATE OR REPLACE VIEW public.effective_compliance_rules AS
SELECT
  o.id AS org_id,
  d.rule_code,
  d.scope,
  d.description_fr,
  d.description_en,
  COALESCE(ovr.is_active, d.is_active_by_default) AS is_active,
  COALESCE(ovr.severity_override, d.severity_default) AS effective_severity,
  d.severity_default,
  d.is_severity_overridable,
  d.default_params || COALESCE(ovr.params_override, '{}'::jsonb) AS effective_params,
  d.params_schema,
  d.default_params,
  d.cta_url_template,
  d.documentation_url,
  ovr.id IS NOT NULL AS is_overridden,
  ovr.notes AS override_notes,
  ovr.params_override,
  ovr.created_at AS override_created_at,
  ovr.created_by AS override_created_by,
  ovr.updated_at AS override_updated_at,
  ovr.updated_by AS override_updated_by
FROM public.organizations o
CROSS JOIN public.compliance_rule_definitions d
LEFT JOIN public.compliance_rule_overrides ovr
  ON ovr.org_id = o.id AND ovr.rule_code = d.rule_code;

GRANT SELECT ON public.effective_compliance_rules TO authenticated;

COMMENT ON VIEW public.effective_compliance_rules IS
  'Module 12 B1 — Config effective merge default + override par org/rule. Pour usage code: filter par org_id = current_org_id() (pas de RLS sur la vue elle-meme, herite de definitions+overrides).';

-- =============================================================================
-- 4. RPC get_effective_rule(rule_code)
-- =============================================================================
--
-- SECURITY DEFINER + STABLE pour permettre l'usage dans les helpers Node
-- (loadEffectiveRule). Filtre implicitement par current_org_id() — pas
-- besoin de passer l'org_id en param.

CREATE OR REPLACE FUNCTION public.get_effective_rule(p_rule_code TEXT)
RETURNS TABLE (
  rule_code TEXT,
  scope TEXT,
  is_active BOOLEAN,
  effective_severity TEXT,
  effective_params JSONB,
  cta_url_template TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    e.rule_code, e.scope, e.is_active, e.effective_severity,
    e.effective_params, e.cta_url_template
  FROM public.effective_compliance_rules e
  WHERE e.org_id = current_org_id()
    AND e.rule_code = p_rule_code;
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_rule(TEXT) TO authenticated;

COMMENT ON FUNCTION public.get_effective_rule(TEXT) IS
  'Module 12 B1 — Lecture rapide config effective pour une rule donnee, filtree par current_org_id().';

-- =============================================================================
-- 5. Permission compliance_rules.config.write + assign OWNER
-- =============================================================================

INSERT INTO public.permissions_catalog (code, category, description)
VALUES (
  'compliance_rules.config.write',
  'COMPLIANCE',
  'Configurer les regles compliance (seuils + activation par org)'
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_code)
VALUES ('OWNER', 'compliance_rules.config.write')
ON CONFLICT (role, permission_code) DO NOTHING;

-- =============================================================================
-- 6. Seed des 22 rule definitions
-- =============================================================================
--
-- Source : MODULE_12 §5.1. Toutes utilisent ON CONFLICT DO NOTHING pour
-- l'idempotence — re-run de la migration ne casse pas les seeds existants.

-- ------- Plan (4) -------
INSERT INTO public.compliance_rule_definitions
  (rule_code, scope, severity_default, description_fr, params_schema, default_params, cta_url_template)
VALUES
  ('PLAN_VESTING_SCHEDULE_VALID', 'plan', 'error',
   'Le vesting schedule doit sommer a 100% et avoir au moins 1 tranche',
   '{}'::jsonb, '{}'::jsonb, NULL),
  ('PLAN_DRAFT_HAS_REQUIRED_FIELDS', 'plan', 'error',
   'Avant publication, plan doit avoir name, type, total_units, vesting_schedule',
   '{}'::jsonb, '{}'::jsonb, NULL),
  ('PLAN_PUBLISH_REQUIRES_VALUATION', 'plan', 'error',
   'Plan ne peut passer DRAFT->PUBLISHED sans valuation_run SUCCESS recent',
   '{"staleDays": {"type": "integer", "min": 30, "max": 365, "default": 90, "label_fr": "Seuil peremption (jours)"}}'::jsonb,
   '{"staleDays": 90}'::jsonb,
   '/dashboard/plans/{planId}/valuations'),
  ('PLAN_TYPE_FRENCH_REQUIRES_AGREEMENT', 'plan', 'warning',
   'Plans BSPCE/AGA en France necessitent une assemblee generale',
   '{}'::jsonb, '{}'::jsonb, NULL)
ON CONFLICT (rule_code) DO NOTHING;

-- ------- Award (5) -------
INSERT INTO public.compliance_rule_definitions
  (rule_code, scope, severity_default, description_fr, params_schema, default_params, cta_url_template)
VALUES
  ('AWARD_UNITS_POSITIVE', 'award', 'error',
   'units_granted > 0 obligatoire',
   '{}'::jsonb, '{}'::jsonb, NULL),
  ('AWARD_BENEFICIARY_ACTIVE', 'award', 'error',
   'Le beneficiaire doit etre ACTIVE (pas TERMINATED)',
   '{}'::jsonb, '{}'::jsonb, NULL),
  ('AWARD_GRANT_DATE_VALID', 'award', 'error',
   'grant_date doit etre dans le passe ou aujourd''hui',
   '{}'::jsonb, '{}'::jsonb, NULL),
  ('AWARD_DRAFT_TO_PROPOSED_VALIDATION', 'award', 'error',
   'Transition DRAFT->PROPOSED necessite plan PUBLISHED + beneficiary ACTIVE + valuation OK',
   '{"staleDays": {"type": "integer", "min": 30, "max": 365, "default": 90, "label_fr": "Seuil peremption valuation (jours)"}}'::jsonb,
   '{"staleDays": 90}'::jsonb,
   '/dashboard/plans/{planId}/valuations'),
  ('AWARD_PROPOSED_TO_GRANTED_REQUIRES_APPROVAL', 'award', 'error',
   'Transition PROPOSED->GRANTED necessite approval workflow valide',
   '{}'::jsonb, '{}'::jsonb, NULL)
ON CONFLICT (rule_code) DO NOTHING;

-- ------- Beneficiary (2) -------
INSERT INTO public.compliance_rule_definitions
  (rule_code, scope, severity_default, description_fr, params_schema, default_params, cta_url_template)
VALUES
  ('BENEFICIARY_TAX_PROFILE_REQUIRED', 'beneficiary', 'warning',
   'Profile fiscal manquant peut bloquer l''exercice plus tard',
   '{}'::jsonb, '{}'::jsonb, NULL),
  ('BENEFICIARY_TERMINATION_HAS_DATE', 'beneficiary', 'error',
   'Si status = TERMINATED, termination_date obligatoire',
   '{}'::jsonb, '{}'::jsonb, NULL)
ON CONFLICT (rule_code) DO NOTHING;

-- ------- Valuation (2) — livrees Module 11 B6 -------
INSERT INTO public.compliance_rule_definitions
  (rule_code, scope, severity_default, description_fr, params_schema, default_params, cta_url_template)
VALUES
  ('VALUATION_STALE_BLOCKING', 'valuation', 'error',
   'Valorisation IFRS 2 datee de moins de N jours obligatoire',
   '{"staleDays": {"type": "integer", "min": 30, "max": 365, "default": 90, "label_fr": "Seuil peremption (jours)"}}'::jsonb,
   '{"staleDays": 90}'::jsonb,
   '/dashboard/plans/{planId}/valuations'),
  ('FMV_DEVIATION_WARNING', 'valuation', 'warning',
   'Alerte si derniere FMV differe de >X% vs valorisation precedente',
   '{"deviationPct": {"type": "integer", "min": 5, "max": 100, "default": 20, "label_fr": "Seuil deviation (%)"}}'::jsonb,
   '{"deviationPct": 20}'::jsonb,
   NULL)
ON CONFLICT (rule_code) DO NOTHING;

-- ------- Cap Table (3) — livrees Module 10 B7 -------
INSERT INTO public.compliance_rule_definitions
  (rule_code, scope, severity_default, description_fr, params_schema, default_params, cta_url_template)
VALUES
  ('DILUTION_THRESHOLD_WARNING', 'cap_table', 'warning',
   'Si nouvelle emission > X% de la cap table -> warning',
   '{"dilutionPct": {"type": "number", "min": 1, "max": 50, "default": 15, "label_fr": "Seuil dilution (%)"}}'::jsonb,
   '{"dilutionPct": 15}'::jsonb,
   NULL),
  ('POOL_DEPLETION_WARNING', 'cap_table', 'warning',
   'Si pool ESOP utilise > X% -> alerte',
   '{"poolUsagePct": {"type": "integer", "min": 50, "max": 100, "default": 80, "label_fr": "Seuil utilisation pool (%)"}}'::jsonb,
   '{"poolUsagePct": 80}'::jsonb,
   NULL),
  ('SHAREHOLDER_AGREEMENT_VIOLATION', 'cap_table', 'error',
   'Emission > seuil pacte d''actionnaires sans approval',
   '{"agreementThreshold": {"type": "number", "min": 0.01, "max": 100, "default": 5, "label_fr": "Seuil pacte (%)"}}'::jsonb,
   '{"agreementThreshold": 5}'::jsonb,
   NULL)
ON CONFLICT (rule_code) DO NOTHING;

-- ------- Exercise (3) — livrees Module 9 -------
INSERT INTO public.compliance_rule_definitions
  (rule_code, scope, severity_default, description_fr, params_schema, default_params, cta_url_template)
VALUES
  ('EXERCISE_WINDOW_VALID', 'exercise', 'error',
   'exercise_date dans la fenetre d''exercice du plan',
   '{}'::jsonb, '{}'::jsonb, NULL),
  ('EXERCISE_AVAILABLE_UNITS', 'exercise', 'error',
   'units_exercised <= units_vested - units_already_exercised',
   '{}'::jsonb, '{}'::jsonb, NULL),
  ('EXERCISE_TAX_WITHHOLDING_OK', 'exercise', 'warning',
   'Si tax withholding requis et pas configure -> warning',
   '{}'::jsonb, '{}'::jsonb, NULL)
ON CONFLICT (rule_code) DO NOTHING;

-- ------- Approval (2) — livrees Module 5 -------
INSERT INTO public.compliance_rule_definitions
  (rule_code, scope, severity_default, description_fr, params_schema, default_params, cta_url_template)
VALUES
  ('APPROVAL_QUORUM_REQUIRED', 'approval', 'error',
   'Approval doit avoir N approbateurs minimum',
   '{"minApprovers": {"type": "integer", "min": 1, "max": 10, "default": 2, "label_fr": "Approbateurs minimum"}}'::jsonb,
   '{"minApprovers": 2}'::jsonb,
   NULL),
  ('APPROVAL_DUAL_SIGNATURE', 'approval', 'warning',
   'Plans > X EUR exigent 2 signatures distinctes',
   '{"amountThreshold": {"type": "integer", "min": 10000, "max": 10000000, "default": 500000, "label_fr": "Seuil double signature (EUR)"}}'::jsonb,
   '{"amountThreshold": 500000}'::jsonb,
   NULL)
ON CONFLICT (rule_code) DO NOTHING;

-- ------- Document (1) — livree Module 6 -------
INSERT INTO public.compliance_rule_definitions
  (rule_code, scope, severity_default, description_fr, params_schema, default_params, cta_url_template)
VALUES
  ('DOCUMENT_TEMPLATE_REQUIRED', 'document', 'error',
   'Award PROPOSED necessite document genere depuis template',
   '{}'::jsonb, '{}'::jsonb, NULL)
ON CONFLICT (rule_code) DO NOTHING;
