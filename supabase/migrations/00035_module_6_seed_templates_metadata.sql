-- ============================================================================
-- MODULE 6 B1 — Seed 3 templates V1 (BSPCE, AGA, Stock Options)
--
-- Métadonnées uniquement : le code React PDF vit dans
-- apps/web/src/lib/pdf/templates/ (livré en B2).
--
-- Note : content_format='CODE' (override default Module 1 'TIPTAP_JSON')
-- pour distinguer les templates code-defined V1 des futurs templates
-- éditables WYSIWYG V2.
-- ============================================================================

-- BSPCE_GRANT_LETTER
INSERT INTO document_templates (
  org_id, code, name, description, category, applies_to_plan_types,
  template_engine, content_format, content, available_variables,
  is_active, version, supported_languages
)
SELECT
  o.id,
  'BSPCE_GRANT_LETTER',
  'Lettre d''attribution BSPCE',
  'Document légal d''attribution de Bons de Souscription de Parts de Créateur d''Entreprise',
  'AWARD_LETTER',
  ARRAY['BSPCE'],
  'REACT_PDF',
  'CODE',
  '{"componentName": "BspceGrantLetterTemplate"}'::jsonb,
  '{"award": ["award_number","grant_date","units_granted","exercise_price"], "plan": ["name","plan_type"], "beneficiary": ["full_name","email","tax_residence"], "org": ["name","legal_name","siren","registered_address"]}'::jsonb,
  true,
  1,
  ARRAY['fr']
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM document_templates dt
   WHERE dt.org_id = o.id
     AND dt.code = 'BSPCE_GRANT_LETTER'
     AND dt.deleted_at IS NULL
);

-- AGA_GRANT_LETTER
INSERT INTO document_templates (
  org_id, code, name, description, category, applies_to_plan_types,
  template_engine, content_format, content, available_variables,
  is_active, version, supported_languages
)
SELECT
  o.id,
  'AGA_GRANT_LETTER',
  'Lettre d''attribution AGA',
  'Document légal d''attribution d''Actions Gratuites',
  'AWARD_LETTER',
  ARRAY['AGA', 'AGA_PERFORMANCE'],
  'REACT_PDF',
  'CODE',
  '{"componentName": "AgaGrantLetterTemplate"}'::jsonb,
  '{"award": ["award_number","grant_date","units_granted"], "plan": ["name","plan_type","vesting_schedule"], "beneficiary": ["full_name","email","tax_residence"], "org": ["name","legal_name","siren","registered_address"]}'::jsonb,
  true,
  1,
  ARRAY['fr']
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM document_templates dt
   WHERE dt.org_id = o.id
     AND dt.code = 'AGA_GRANT_LETTER'
     AND dt.deleted_at IS NULL
);

-- SO_GRANT_LETTER (stock options, bilingue)
INSERT INTO document_templates (
  org_id, code, name, description, category, applies_to_plan_types,
  template_engine, content_format, content, available_variables,
  is_active, version, supported_languages
)
SELECT
  o.id,
  'SO_GRANT_LETTER',
  'Stock Option Grant Letter',
  'Stock Option Grant Agreement',
  'AWARD_LETTER',
  ARRAY['STOCK_OPTION'],
  'REACT_PDF',
  'CODE',
  '{"componentName": "StockOptionGrantLetterTemplate"}'::jsonb,
  '{"award": ["award_number","grant_date","units_granted","exercise_price"], "plan": ["name","plan_type"], "beneficiary": ["full_name","email","tax_residence"], "org": ["name","legal_name","registered_address"]}'::jsonb,
  true,
  1,
  ARRAY['fr', 'en']
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM document_templates dt
   WHERE dt.org_id = o.id
     AND dt.code = 'SO_GRANT_LETTER'
     AND dt.deleted_at IS NULL
);
