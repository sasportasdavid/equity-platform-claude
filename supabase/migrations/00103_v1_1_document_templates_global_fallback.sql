-- ============================================================================
-- V1.1 PR #49 — document_templates : fallback GLOBAL (dette #35)
--
-- 1. ALTER `org_id` NULLABLE pour permettre des templates GLOBAL (org_id IS NULL)
--    qui servent de fallback quand une org n'a pas de variante customisée.
--
-- 2. Ajuste RLS Pattern 1 (héritée 00002) :
--      - SELECT : autorisé si (org_id = current_org_id() OR org_id IS NULL)
--                 ET has_permission('documents.read')
--                 → toutes les orgs voient les GLOBAL en lecture
--      - INSERT/UPDATE/DELETE : org_id = current_org_id() ET write perm
--                 → impossible pour les utilisateurs authenticated de
--                   créer/modifier/supprimer un GLOBAL.
--                 service_role bypass tout (seed migration + maintenance V1.X).
--
-- 3. Index partiel `idx_document_templates_global_by_code_category` pour
--    accélérer le fallback (lookup fréquent côté Server Action).
--
-- 4. Met à jour la RPC `create_document_for_award` (00036) pour faire le
--    fallback : SELECT WHERE (org_id = v_org_id OR org_id IS NULL) avec
--    ORDER BY (org_id IS NULL) ASC LIMIT 1 (org-specific gagne).
--
-- 5. Seed 5 templates GLOBAL minimum couvrant les award_kinds beta :
--      - BSPCE_GRANT_LETTER  (BSPCE)
--      - SO_GRANT_LETTER     (STOCK_OPTION)
--      - AGA_GRANT_LETTER    (AGA, AGA_PERFORMANCE)
--      - RSU_GRANT_LETTER    (RSU)               -- NOUVEAU
--      - BSA_GRANT_LETTER    (BSA)               -- NOUVEAU
--
--    Pas de DELETE / UPDATE des rows org-specific existantes : la RPC les
--    privilégie via ORDER BY, donc 0 régression.
--
-- 6. Pattern Mustache documenté côté code (apps/web/src/lib/pdf/templates/)
--    via React PDF — pas de moteur Mustache séparé en V1, les variables sont
--    passées comme props au composant.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Schema : org_id NULLABLE
-- ----------------------------------------------------------------------------

ALTER TABLE public.document_templates
  ALTER COLUMN org_id DROP NOT NULL;

COMMENT ON COLUMN public.document_templates.org_id IS
  'NULL = template GLOBAL (système, fallback inter-orgs). Non-NULL = org-specific (priorité dans les lookups).';

-- ----------------------------------------------------------------------------
-- 2. RLS : SELECT inclut les GLOBAL, write reste org-scoped
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS document_templates_select ON public.document_templates;
CREATE POLICY document_templates_select ON public.document_templates
  FOR SELECT
  TO authenticated
  USING (
    (org_id = public.current_org_id() OR org_id IS NULL)
    AND public.has_permission('documents.read')
  );

DROP POLICY IF EXISTS document_templates_insert ON public.document_templates;
CREATE POLICY document_templates_insert ON public.document_templates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id IS NOT NULL
    AND org_id = public.current_org_id()
    AND public.has_permission('documents.create_template')
  );

DROP POLICY IF EXISTS document_templates_update ON public.document_templates;
CREATE POLICY document_templates_update ON public.document_templates
  FOR UPDATE
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND org_id = public.current_org_id()
    AND public.has_permission('documents.create_template')
  );

DROP POLICY IF EXISTS document_templates_delete ON public.document_templates;
CREATE POLICY document_templates_delete ON public.document_templates
  FOR DELETE
  TO authenticated
  USING (
    org_id IS NOT NULL
    AND org_id = public.current_org_id()
    AND public.has_permission('documents.create_template')
  );

-- ----------------------------------------------------------------------------
-- 3. Index partiel pour le fallback
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_document_templates_global_by_code
  ON public.document_templates (code)
  WHERE org_id IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_document_templates_global_by_category_plan_types
  ON public.document_templates (category)
  WHERE org_id IS NULL AND deleted_at IS NULL;

-- L'unique index uq_document_templates_code (00033) couvre déjà
-- (org_id, code) WHERE deleted_at IS NULL — donc deux GLOBAL avec même code
-- sont rejetés (org_id NULL traité comme valeur dans UNIQUE Postgres).
-- Aucune action requise ici.

-- ----------------------------------------------------------------------------
-- 4. Mise à jour RPC create_document_for_award : fallback GLOBAL
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_document_for_award(
  p_award_id UUID,
  p_template_code TEXT,
  p_storage_path TEXT,
  p_pdf_hash TEXT,
  p_file_size_bytes BIGINT,
  p_variables_used JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID := public.current_org_id();
  v_template public.document_templates%ROWTYPE;
  v_award public.awards%ROWTYPE;
  v_document_id UUID;
  v_document_number TEXT;
BEGIN
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.user_has_permission('documents.send_for_signature') THEN
    RAISE EXCEPTION 'Permission denied: documents.send_for_signature';
  END IF;

  -- V1.1 fallback : org-specific d'abord, GLOBAL en repli.
  -- ORDER BY (org_id IS NULL) ASC : FALSE (org-specific) avant TRUE (GLOBAL).
  SELECT * INTO v_template
    FROM public.document_templates
   WHERE (org_id = v_org_id OR org_id IS NULL)
     AND code = p_template_code
     AND is_active = true
     AND deleted_at IS NULL
   ORDER BY (org_id IS NULL) ASC
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TEMPLATE_NOT_FOUND: code=% (no org-specific nor GLOBAL match)', p_template_code;
  END IF;

  SELECT * INTO v_award FROM public.awards WHERE id = p_award_id AND org_id = v_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award % not found', p_award_id;
  END IF;

  v_document_number := 'DOC-' || EXTRACT(YEAR FROM now())::TEXT || '-' ||
    LPAD((
      SELECT COUNT(*) + 1
        FROM public.document_instances
       WHERE org_id = v_org_id
         AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now())
    )::TEXT, 4, '0');

  INSERT INTO public.document_instances (
    org_id, template_id, template_version,
    document_number, category, title,
    related_entity_type, related_entity_id,
    storage_path, storage_bucket, rendered_pdf_hash, file_size_bytes,
    variables_used, status, generated_at, generated_by
  ) VALUES (
    v_org_id, v_template.id, v_template.version,
    v_document_number, v_template.category,
    v_template.name || ' — ' || COALESCE(v_award.award_number, p_award_id::text),
    'AWARD', p_award_id,
    p_storage_path, 'documents', p_pdf_hash, p_file_size_bytes,
    p_variables_used, 'GENERATED', now(), v_user_id
  )
  RETURNING id INTO v_document_id;

  INSERT INTO public.audit_events (
    org_id, user_id, event_type, resource_type, resource_id, metadata
  ) VALUES (
    v_org_id, v_user_id, 'document.generated',
    'document_instance', v_document_id,
    jsonb_build_object(
      'template_code', p_template_code,
      'template_id', v_template.id,
      'template_is_global', v_template.org_id IS NULL,
      'award_id', p_award_id,
      'document_number', v_document_number,
      'storage_path', p_storage_path
    )
  );

  RETURN v_document_id;
END $$;

-- GRANT déjà accordé en 00036, on le ré-applique par sécurité.
GRANT EXECUTE ON FUNCTION public.create_document_for_award(UUID, TEXT, TEXT, TEXT, BIGINT, JSONB)
  TO authenticated;

COMMENT ON FUNCTION public.create_document_for_award(UUID, TEXT, TEXT, TEXT, BIGINT, JSONB) IS
  'V1.1 — INSERT document_instance pour un award. Cherche d''abord un template org-specific, puis fallback GLOBAL (org_id IS NULL). Throw TEMPLATE_NOT_FOUND si aucun match.';

-- ----------------------------------------------------------------------------
-- 5. Seed 5 templates GLOBAL (org_id IS NULL)
-- ----------------------------------------------------------------------------

-- 5.1 BSPCE_GRANT_LETTER (GLOBAL)
INSERT INTO public.document_templates (
  org_id, code, name, description, category, applies_to_plan_types,
  template_engine, content_format, content, available_variables,
  is_active, version, supported_languages
)
SELECT
  NULL,
  'BSPCE_GRANT_LETTER',
  'Lettre d''attribution BSPCE (modèle global)',
  'Modèle GLOBAL — lettre d''attribution de Bons de Souscription de Parts de Créateur d''Entreprise (article 163 bis G du CGI). Sert de fallback quand l''organisation n''a pas de variante customisée.',
  'AWARD_LETTER',
  ARRAY['BSPCE'],
  'REACT_PDF',
  'CODE',
  '{"componentName": "BspceGrantLetterTemplate"}'::jsonb,
  '{"award": ["award_number","grant_date","units_granted","exercise_price","vesting_start_date","expiry_date"], "plan": ["name","plan_type","tax_regime"], "beneficiary": ["full_name","email","tax_residence","address_line_1","postal_code","city","country"], "org": ["name","legal_name","siren","registered_address"], "date": ["today","acceptance_deadline"]}'::jsonb,
  true,
  1,
  ARRAY['fr']
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_templates dt
   WHERE dt.org_id IS NULL
     AND dt.code = 'BSPCE_GRANT_LETTER'
     AND dt.deleted_at IS NULL
);

-- 5.2 SO_GRANT_LETTER (GLOBAL)
INSERT INTO public.document_templates (
  org_id, code, name, description, category, applies_to_plan_types,
  template_engine, content_format, content, available_variables,
  is_active, version, supported_languages
)
SELECT
  NULL,
  'SO_GRANT_LETTER',
  'Stock Option Grant Letter (global template)',
  'GLOBAL template — stock option grant agreement. Used as fallback when the org has no customized variant.',
  'AWARD_LETTER',
  ARRAY['STOCK_OPTION'],
  'REACT_PDF',
  'CODE',
  '{"componentName": "StockOptionGrantLetterTemplate"}'::jsonb,
  '{"award": ["award_number","grant_date","units_granted","exercise_price","vesting_start_date","expiry_date"], "plan": ["name","plan_type"], "beneficiary": ["full_name","email","tax_residence","address_line_1","postal_code","city","country"], "org": ["name","legal_name","registered_address"], "date": ["today","acceptance_deadline"]}'::jsonb,
  true,
  1,
  ARRAY['fr', 'en']
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_templates dt
   WHERE dt.org_id IS NULL
     AND dt.code = 'SO_GRANT_LETTER'
     AND dt.deleted_at IS NULL
);

-- 5.3 AGA_GRANT_LETTER (GLOBAL)
INSERT INTO public.document_templates (
  org_id, code, name, description, category, applies_to_plan_types,
  template_engine, content_format, content, available_variables,
  is_active, version, supported_languages
)
SELECT
  NULL,
  'AGA_GRANT_LETTER',
  'Lettre d''attribution AGA (modèle global)',
  'Modèle GLOBAL — lettre d''attribution d''Actions Gratuites (et AGA performance). Sert de fallback quand l''organisation n''a pas de variante customisée.',
  'AWARD_LETTER',
  ARRAY['AGA', 'AGA_PERFORMANCE'],
  'REACT_PDF',
  'CODE',
  '{"componentName": "AgaGrantLetterTemplate"}'::jsonb,
  '{"award": ["award_number","grant_date","units_granted","vesting_start_date"], "plan": ["name","plan_type","vesting_schedule","tax_regime"], "beneficiary": ["full_name","email","tax_residence","address_line_1","postal_code","city","country"], "org": ["name","legal_name","siren","registered_address"], "date": ["today","acceptance_deadline"]}'::jsonb,
  true,
  1,
  ARRAY['fr']
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_templates dt
   WHERE dt.org_id IS NULL
     AND dt.code = 'AGA_GRANT_LETTER'
     AND dt.deleted_at IS NULL
);

-- 5.4 RSU_GRANT_LETTER (GLOBAL — NOUVEAU)
-- Réutilise AgaGrantLetterTemplate (RSU et AGA partagent la mécanique :
-- attribution gratuite d'unités/actions vesting puis livraison).
INSERT INTO public.document_templates (
  org_id, code, name, description, category, applies_to_plan_types,
  template_engine, content_format, content, available_variables,
  is_active, version, supported_languages
)
SELECT
  NULL,
  'RSU_GRANT_LETTER',
  'Lettre d''attribution RSU (modèle global)',
  'Modèle GLOBAL — Restricted Stock Units. Réutilise le composant AGA en V1.1 (mécanique similaire : attribution gratuite avec vesting). Sert de fallback inter-orgs.',
  'AWARD_LETTER',
  ARRAY['RSU'],
  'REACT_PDF',
  'CODE',
  '{"componentName": "AgaGrantLetterTemplate"}'::jsonb,
  '{"award": ["award_number","grant_date","units_granted","vesting_start_date"], "plan": ["name","plan_type","vesting_schedule"], "beneficiary": ["full_name","email","tax_residence","address_line_1","postal_code","city","country"], "org": ["name","legal_name","siren","registered_address"], "date": ["today","acceptance_deadline"]}'::jsonb,
  true,
  1,
  ARRAY['fr']
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_templates dt
   WHERE dt.org_id IS NULL
     AND dt.code = 'RSU_GRANT_LETTER'
     AND dt.deleted_at IS NULL
);

-- 5.5 BSA_GRANT_LETTER (GLOBAL — NOUVEAU)
-- Réutilise StockOptionGrantLetterTemplate (BSA = bon de souscription
-- d'actions, mécanique de warrant similaire au stock option).
INSERT INTO public.document_templates (
  org_id, code, name, description, category, applies_to_plan_types,
  template_engine, content_format, content, available_variables,
  is_active, version, supported_languages
)
SELECT
  NULL,
  'BSA_GRANT_LETTER',
  'Lettre d''attribution BSA (modèle global)',
  'Modèle GLOBAL — Bon de Souscription d''Actions. Réutilise le composant Stock Option en V1.1 (mécanique de warrant identique). Sert de fallback inter-orgs.',
  'AWARD_LETTER',
  ARRAY['BSA'],
  'REACT_PDF',
  'CODE',
  '{"componentName": "StockOptionGrantLetterTemplate"}'::jsonb,
  '{"award": ["award_number","grant_date","units_granted","exercise_price","vesting_start_date","expiry_date"], "plan": ["name","plan_type"], "beneficiary": ["full_name","email","tax_residence","address_line_1","postal_code","city","country"], "org": ["name","legal_name","siren","registered_address"], "date": ["today","acceptance_deadline"]}'::jsonb,
  true,
  1,
  ARRAY['fr']
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_templates dt
   WHERE dt.org_id IS NULL
     AND dt.code = 'BSA_GRANT_LETTER'
     AND dt.deleted_at IS NULL
);
