-- =============================================================================
-- Migration 00108 : Settings + Workflows de signature (A + C)
-- =============================================================================
--
-- Demande user 2026-05-19 : "lance a + c. l'experience utilisateur doit etre
-- excellente". 2 layers de paramétrage :
--
--   A — Defaults org (1 row par org) : délai expiration, ordre signature,
--       cosignataire obligatoire, jours avant rappel.
--   C — Workflows signature par plan_type/template_code (multiple par org) :
--       signataires définis (BENEFICIARY + ROLE + USER), ordre, expiration
--       custom. Override les defaults A.
--
-- Resolution cascade au moment de sendForSignature :
--   1. Workflow signature matching le plan_type / template_code → override
--   2. Defaults org A → fallback
--   3. Override ad-hoc dans la modale envoi (Layer 3, déjà existant)
--
-- Pattern aligné avec approval_workflows (Module 5) :
--   - auto-seed à la création d'org
--   - is_default avec contrainte UNIQUE partielle
--   - is_active + deleted_at
--   - applies_to_* arrays au lieu de single value
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. signature_settings — Layer A (defaults org)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.signature_settings (
  org_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  default_expiry_days INTEGER NOT NULL DEFAULT 14
    CHECK (default_expiry_days BETWEEN 1 AND 90),
  default_signing_order TEXT NOT NULL DEFAULT 'SEQUENTIAL'
    CHECK (default_signing_order IN ('SEQUENTIAL', 'PARALLEL')),
  require_owner_cosigner BOOLEAN NOT NULL DEFAULT false,
  reminder_days INTEGER NOT NULL DEFAULT 3
    CHECK (reminder_days BETWEEN 0 AND 30),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE public.signature_settings IS
  'Module Signature (V1.X) — Layer A : defaults org pour les envois Yousign. 1 row par org_id. Auto-seed à la création d''org via trigger.';

ALTER TABLE public.signature_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY signature_settings_select ON public.signature_settings
  FOR SELECT TO authenticated
  USING (org_id = current_org_id());

CREATE POLICY signature_settings_modify ON public.signature_settings
  FOR ALL TO authenticated
  USING (org_id = current_org_id() AND user_has_permission('org.manage_settings'))
  WITH CHECK (org_id = current_org_id() AND user_has_permission('org.manage_settings'));

-- ---------------------------------------------------------------------------
-- 2. signature_workflows — Layer C (workflows par plan_type/template)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.signature_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  -- Filtres : matchent sur plan_type OR template_code
  applies_to_plan_types TEXT[] NOT NULL DEFAULT '{}',
  applies_to_template_codes TEXT[] NOT NULL DEFAULT '{}',
  -- Override des defaults A pour ce workflow
  expiry_days INTEGER NOT NULL DEFAULT 14
    CHECK (expiry_days BETWEEN 1 AND 90),
  signing_order TEXT NOT NULL DEFAULT 'SEQUENTIAL'
    CHECK (signing_order IN ('SEQUENTIAL', 'PARALLEL')),
  reminder_days INTEGER NOT NULL DEFAULT 3
    CHECK (reminder_days BETWEEN 0 AND 30),
  -- Flags
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_signature_workflows_org ON public.signature_workflows(org_id)
  WHERE deleted_at IS NULL;

-- Contrainte : 1 seul default actif par org (analogue approvals 00107)
CREATE UNIQUE INDEX uq_signature_workflow_default_per_org
  ON public.signature_workflows (org_id)
  WHERE is_default = true AND is_active = true AND deleted_at IS NULL;

COMMENT ON TABLE public.signature_workflows IS
  'Module Signature (V1.X) — Layer C : workflows par plan_type/template_code. Override les defaults A. Cascade resolution lors de sendForSignature.';

ALTER TABLE public.signature_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY signature_workflows_select ON public.signature_workflows
  FOR SELECT TO authenticated
  USING (org_id = current_org_id() AND deleted_at IS NULL);

CREATE POLICY signature_workflows_modify ON public.signature_workflows
  FOR ALL TO authenticated
  USING (org_id = current_org_id() AND user_has_permission('org.manage_settings'))
  WITH CHECK (org_id = current_org_id() AND user_has_permission('org.manage_settings'));

-- ---------------------------------------------------------------------------
-- 3. signature_workflow_signers — signataires définis par workflow
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.signature_workflow_signers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.signature_workflows(id) ON DELETE CASCADE,
  signer_order INTEGER NOT NULL CHECK (signer_order >= 1),
  -- 3 types de signataires :
  --  BENEFICIARY : le bénéficiaire de l'award (résolu via award.beneficiary_id)
  --  ROLE : tout user actif avec ce rôle dans l'org (résolu via memberships)
  --  USER : user spécifique (id figé)
  signer_type TEXT NOT NULL CHECK (signer_type IN ('BENEFICIARY', 'ROLE', 'USER')),
  signer_role TEXT,
  signer_user_id UUID REFERENCES auth.users(id),
  is_required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workflow_id, signer_order)
);

CREATE INDEX idx_signature_workflow_signers_wf
  ON public.signature_workflow_signers(workflow_id);

-- Check : signer_role requis si type=ROLE, signer_user_id requis si type=USER
ALTER TABLE public.signature_workflow_signers
  ADD CONSTRAINT chk_signer_type_consistent
  CHECK (
    (signer_type = 'BENEFICIARY' AND signer_role IS NULL AND signer_user_id IS NULL)
    OR (signer_type = 'ROLE' AND signer_role IS NOT NULL AND signer_user_id IS NULL)
    OR (signer_type = 'USER' AND signer_role IS NULL AND signer_user_id IS NOT NULL)
  );

COMMENT ON TABLE public.signature_workflow_signers IS
  'Module Signature (V1.X) — Signataires définis par signature_workflow. 3 types : BENEFICIARY (= award.beneficiary), ROLE (= role match), USER (= user_id figé).';

ALTER TABLE public.signature_workflow_signers ENABLE ROW LEVEL SECURITY;

CREATE POLICY signature_workflow_signers_select ON public.signature_workflow_signers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.signature_workflows w
    WHERE w.id = workflow_id AND w.org_id = current_org_id() AND w.deleted_at IS NULL
  ));

CREATE POLICY signature_workflow_signers_modify ON public.signature_workflow_signers
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.signature_workflows w
    WHERE w.id = workflow_id
      AND w.org_id = current_org_id()
      AND user_has_permission('org.manage_settings')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.signature_workflows w
    WHERE w.id = workflow_id
      AND w.org_id = current_org_id()
      AND user_has_permission('org.manage_settings')
  ));

-- ---------------------------------------------------------------------------
-- 4. Auto-seed à la création d'org (helper RPC + trigger)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.seed_signature_settings_for_org(p_org_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing UUID;
BEGIN
  -- Idempotent : si déjà créé, return l'org_id existant
  SELECT org_id INTO v_existing FROM signature_settings WHERE org_id = p_org_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO signature_settings (org_id, default_expiry_days, default_signing_order, require_owner_cosigner, reminder_days)
  VALUES (p_org_id, 14, 'SEQUENTIAL', false, 3);

  RETURN p_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_signature_settings_for_org(UUID) TO service_role;

COMMENT ON FUNCTION public.seed_signature_settings_for_org(UUID) IS
  'Module Signature V1.X — Auto-seed defaults org. Idempotent. À appeler dans createOrganization Server Action.';

-- ---------------------------------------------------------------------------
-- 5. Backfill : seed pour les orgs existantes (toutes les orgs sans settings)
-- ---------------------------------------------------------------------------

INSERT INTO public.signature_settings (org_id)
SELECT o.id
FROM public.organizations o
LEFT JOIN public.signature_settings s ON s.org_id = o.id
WHERE s.org_id IS NULL
  AND o.deleted_at IS NULL;
