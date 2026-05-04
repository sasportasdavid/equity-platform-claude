-- =============================================================================
-- Module 12 B3b — Realign DB ↔ code (Option A)
-- =============================================================================
--
-- Spec : docs/MODULE_12_COMPLIANCE_ENGINE_V2.md §5.2 + memory/module_12_b3a_inventory.md.
--
-- Migration corrective qui aligne `compliance_rule_definitions` avec les 23
-- ComplianceRule réellement implémentées en code TypeScript (audité B3a).
--
-- Stratégie :
--   1. DELETE les 20 rules aspirationnelles seedées en B1 mais sans checker
--      code correspondant (4 plan + 5 award + 2 beneficiary + 3 cap_table +
--      3 exercise + 2 approval + 1 document = 20).
--   2. KEEP les 2 rules valuation déjà présentes (overlap parfait DB B1 + code
--      Module 11 B6 + refactor Module 12 B2).
--   3. INSERT les 21 rules code manquantes avec params_schema corrigés
--      (tuning sémantique vs B1) :
--        - award (5)        — BSPCE/AGA/POOL/GRANT
--        - beneficiary (6)  — EMAIL/TAX/HIRE/MANAGER/IBAN/BSPCE_REVERSE
--        - cap_table (4)    — SHARE_CLASS/ROUND/POOL_OVER/ESOP_BEST
--        - document (3)     — FMV/SIGNERS/VOIDED
--        - approval (3)     — WORKFLOW × 3
--   → Final count : 23 rules (21 INSERTs + 2 valuation déjà présentes).
--
-- Safety net B3b :
--   - Vérifié `compliance_rule_overrides` count = 0 cloud avant DELETE
--     (V1 sans UI = pas de risque de cascade).
--   - DELETE WHERE rule_code IN (...) : si un override existait, CASCADE
--     supprimerait via FK. Acceptable V1.
--
-- Adjustments sémantiques vs inventaire B3a (briefing user) :
--   - HIRE_DATE_REASONABLE : maxFutureMonths ajouté (clarifie marge future)
--   - AGA_APPROACHING_CAP : `thresholdPct=85` (% du cap_pct atteint, default
--     85 au lieu du 27% absolu de code — plus user-friendly UI)
--   - GRANT_DATE_RECENT : param renommé en `recentDays` (vs maxDaysAgo)
--   - ROUND_AMOUNT_CONSISTENCY : `toleranceEur=100` (absolu €) au lieu du
--     tolerancePct=1% du code — semantic plus claire pour user
--   - ESOP_PERCENT_BEST_PRACTICE : `maxPct=15` (vs 20 du code) — best practice
--     post-Module 10 B7 retours marché
--   - FMV_RECENT_ENOUGH : `staleDays=90` (vs 12 months du code) + severity
--     remontée à 'error' (FMV > 3 mois bloque génération document)
--   - WORKFLOW_REQUIRED_FOR_AGA : severity 'error' (vs 'warning' code) —
--     plans AGA sans workflow = risque légal sérieux
--   - BSPCE_BENEFICIARY_TYPE_REVERSE : severity 'warning' (vs 'error' code) —
--     pourra rester paramétrable per org (certaines orgs OK pour terminer
--     manuellement les awards plutôt que cancellation auto)
--   - TAX_RESIDENCE_FRANCE_CONSISTENCY : severity 'warning' (vs 'error' code)
--     — incohérence détectable mais pas forcément bloquante (audit warning).
--
-- ⚠️ Ces severity drifts ne cassent PAS le runtime V1 : les checkers code
-- non-valuation ne lisent PAS encore `effectiveSeverityByRule` (refactor B5).
-- Quand B5 wirera ces rules, la severity DB s'appliquera. V1 = aspirationnel
-- pour les UI Module 12.

-- =============================================================================
-- STEP 1 — DELETE 20 rules aspirationnelles
-- =============================================================================

DELETE FROM public.compliance_rule_definitions
WHERE rule_code IN (
  -- plan (4) : pas de planRules.ts en code
  'PLAN_VESTING_SCHEDULE_VALID',
  'PLAN_DRAFT_HAS_REQUIRED_FIELDS',
  'PLAN_PUBLISH_REQUIRES_VALUATION',
  'PLAN_TYPE_FRENCH_REQUIRES_AGREEMENT',
  -- award (5) : pas de checkers code (les awardRules.ts du repo sont d'autres codes)
  'AWARD_UNITS_POSITIVE',
  'AWARD_BENEFICIARY_ACTIVE',
  'AWARD_GRANT_DATE_VALID',
  'AWARD_DRAFT_TO_PROPOSED_VALIDATION',
  'AWARD_PROPOSED_TO_GRANTED_REQUIRES_APPROVAL',
  -- beneficiary (2) : pas de checkers code (les beneficiaryRules.ts du repo sont d'autres codes)
  'BENEFICIARY_TAX_PROFILE_REQUIRED',
  'BENEFICIARY_TERMINATION_HAS_DATE',
  -- cap_table (3) : pas de checkers code
  'DILUTION_THRESHOLD_WARNING',
  'POOL_DEPLETION_WARNING',
  'SHAREHOLDER_AGREEMENT_VIOLATION',
  -- exercise (3) : invariants en PL/pgSQL côté DB (RAISE EXCEPTION dans request_exercise RPC)
  'EXERCISE_WINDOW_VALID',
  'EXERCISE_AVAILABLE_UNITS',
  'EXERCISE_TAX_WITHHOLDING_OK',
  -- approval (2) : pas de checkers code
  'APPROVAL_QUORUM_REQUIRED',
  'APPROVAL_DUAL_SIGNATURE',
  -- document (1) : pas de checker code
  'DOCUMENT_TEMPLATE_REQUIRED'
);

-- =============================================================================
-- STEP 2 — INSERT 21 rules code-aligned
-- =============================================================================
-- Ordre : award (5) → beneficiary (6) → cap_table (4) → document (3) → approval (3)
-- Les 2 valuation existent déjà depuis B1, ON CONFLICT DO NOTHING en sécurité.

-- ----- award (5) ----------------------------------------------------------
INSERT INTO public.compliance_rule_definitions
  (rule_code, scope, severity_default, description_fr, params_schema, default_params, cta_url_template)
VALUES
  ('BSPCE_BENEFICIARY_TYPE', 'award', 'error',
   'Plans BSPCE reserves aux salaries et mandataires sociaux (loi francaise CGI art. 163 bis G)',
   '{}'::jsonb, '{}'::jsonb, '/dashboard/awards/{awardId}'),
  ('AGA_30_PERCENT_CAP', 'award', 'error',
   'Plans AGA limites a X% du capital social (loi francaise default 30%)',
   '{"capPct":{"type":"number","min":1,"max":100,"default":30,"label_fr":"Plafond AGA (%)"}}'::jsonb,
   '{"capPct":30}'::jsonb,
   '/dashboard/awards/{awardId}'),
  ('AGA_APPROACHING_CAP', 'award', 'warning',
   'Alerte avant atteinte du plafond AGA (% du cap atteint)',
   '{"thresholdPct":{"type":"number","min":50,"max":99,"default":85,"label_fr":"Seuil alerte (% du cap)"}}'::jsonb,
   '{"thresholdPct":85}'::jsonb,
   '/dashboard/awards/{awardId}'),
  ('POOL_AVAILABLE', 'award', 'error',
   'Awards limites aux unites disponibles dans le pool ESOP du plan',
   '{}'::jsonb, '{}'::jsonb, '/dashboard/cap-table'),
  ('GRANT_DATE_RECENT', 'award', 'warning',
   'Alerte si grant_date trop ancienne (anti-backdating)',
   '{"recentDays":{"type":"integer","min":1,"max":365,"default":30,"label_fr":"Seuil anciennete (jours)"}}'::jsonb,
   '{"recentDays":30}'::jsonb,
   '/dashboard/awards/{awardId}');

-- ----- beneficiary (6) ----------------------------------------------------
INSERT INTO public.compliance_rule_definitions
  (rule_code, scope, severity_default, description_fr, params_schema, default_params, cta_url_template)
VALUES
  ('EMAIL_UNIQUE_IN_ORG', 'beneficiary', 'error',
   'L''email du beneficiaire doit etre unique dans l''organisation',
   '{}'::jsonb, '{}'::jsonb, '/dashboard/beneficiaries'),
  ('TAX_RESIDENCE_FRANCE_CONSISTENCY', 'beneficiary', 'warning',
   'Coherence : tax_residence != FR doit avoir isTaxResidentFrance=false',
   '{}'::jsonb, '{}'::jsonb, '/dashboard/beneficiaries/{beneficiaryId}'),
  ('HIRE_DATE_REASONABLE', 'beneficiary', 'warning',
   'Date d''embauche dans une plage raisonnable (annee min + marge future)',
   '{"minYear":{"type":"integer","min":1900,"max":1999,"default":1900,"label_fr":"Annee minimum"},"maxFutureMonths":{"type":"integer","min":0,"max":24,"default":3,"label_fr":"Marge future (mois)"}}'::jsonb,
   '{"minYear":1900,"maxFutureMonths":3}'::jsonb,
   '/dashboard/beneficiaries/{beneficiaryId}'),
  ('MANAGER_NOT_SELF', 'beneficiary', 'error',
   'manager_id ne peut pas pointer vers le beneficiaire lui-meme',
   '{}'::jsonb, '{}'::jsonb, '/dashboard/beneficiaries/{beneficiaryId}'),
  ('IBAN_FORMAT', 'beneficiary', 'warning',
   'IBAN format basique : 2 lettres pays + 2 chiffres + alphanumerique',
   '{}'::jsonb, '{}'::jsonb, '/dashboard/beneficiaries/{beneficiaryId}'),
  ('BSPCE_BENEFICIARY_TYPE_REVERSE', 'beneficiary', 'warning',
   'Empeche de changer un beneficiaire en CONSULTANT/EXTERNAL s''il a des awards BSPCE actifs',
   '{}'::jsonb, '{}'::jsonb, '/dashboard/beneficiaries/{beneficiaryId}');

-- ----- cap_table (4) ------------------------------------------------------
INSERT INTO public.compliance_rule_definitions
  (rule_code, scope, severity_default, description_fr, params_schema, default_params, cta_url_template)
VALUES
  ('SHARE_CLASS_CODE_UNIQUE', 'cap_table', 'error',
   'Code de classe d''actions unique par organisation',
   '{}'::jsonb, '{}'::jsonb, '/dashboard/cap-table'),
  ('ROUND_AMOUNT_CONSISTENCY', 'cap_table', 'warning',
   'Coherence : sum(investor.amount) approx amount_raised (tolerance EUR)',
   '{"toleranceEur":{"type":"number","min":0,"max":10000,"default":100,"label_fr":"Tolerance (EUR)"}}'::jsonb,
   '{"toleranceEur":100}'::jsonb,
   '/dashboard/cap-table/rounds'),
  ('POOL_OVER_ALLOCATION', 'cap_table', 'error',
   'Pool ESOP : poolTotalUnits doit etre > 0 (sanity check)',
   '{}'::jsonb, '{}'::jsonb, '/dashboard/cap-table'),
  ('ESOP_PERCENT_BEST_PRACTICE', 'cap_table', 'warning',
   'Pool ESOP recommande entre minPct% et maxPct% du capital pre-pool',
   '{"minPct":{"type":"number","min":1,"max":50,"default":5,"label_fr":"Plancher (%)"},"maxPct":{"type":"number","min":1,"max":50,"default":15,"label_fr":"Plafond (%)"}}'::jsonb,
   '{"minPct":5,"maxPct":15}'::jsonb,
   '/dashboard/cap-table');

-- ----- document (3) -------------------------------------------------------
INSERT INTO public.compliance_rule_definitions
  (rule_code, scope, severity_default, description_fr, params_schema, default_params, cta_url_template)
VALUES
  ('FMV_RECENT_ENOUGH', 'document', 'error',
   'Document doit referencer une FMV recente (seuil peremption en jours)',
   '{"staleDays":{"type":"integer","min":30,"max":365,"default":90,"label_fr":"Seuil peremption FMV (jours)"}}'::jsonb,
   '{"staleDays":90}'::jsonb,
   '/dashboard/documents/{documentId}'),
  ('SIGNERS_COMPLETE_INFO', 'document', 'error',
   'Chaque signataire doit avoir un email et un nom complet renseignes',
   '{}'::jsonb, '{}'::jsonb, '/dashboard/documents/{documentId}'),
  ('DOCUMENT_NOT_VOIDED', 'document', 'error',
   'Un document VOIDED ne peut pas etre envoye pour signature',
   '{}'::jsonb, '{}'::jsonb, '/dashboard/documents/{documentId}');

-- ----- approval (3) -------------------------------------------------------
INSERT INTO public.compliance_rule_definitions
  (rule_code, scope, severity_default, description_fr, params_schema, default_params, cta_url_template)
VALUES
  ('WORKFLOW_REQUIRED_FOR_AGA', 'approval', 'error',
   'Plans AGA doivent avoir un workflow d''approbation configure (loi francaise)',
   '{}'::jsonb, '{}'::jsonb, '/dashboard/settings/approvals'),
  ('NO_SELF_APPROVAL', 'approval', 'error',
   'Un user ne peut pas approuver un award qu''il a lui-meme cree',
   '{}'::jsonb, '{}'::jsonb, '/dashboard/approvals'),
  ('WORKFLOW_HAS_VALID_STEPS', 'approval', 'error',
   'Chaque step d''approval workflow doit avoir au moins 1 approbateur resolvable',
   '{}'::jsonb, '{}'::jsonb, '/dashboard/settings/approvals');

-- =============================================================================
-- STEP 3 — Verification post-apply (count expected = 23)
-- =============================================================================
-- Run manuellement apres apply :
--   SELECT scope, count(*) FROM compliance_rule_definitions GROUP BY scope ORDER BY scope;
-- Expected:
--   approval: 3, award: 5, beneficiary: 6, cap_table: 4, document: 3, valuation: 2
--   Total = 23
