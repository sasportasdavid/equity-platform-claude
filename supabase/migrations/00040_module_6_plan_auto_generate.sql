-- =============================================================================
-- Module 6 B5 — Plan auto-generate document flag
-- =============================================================================
-- Ajoute un opt-in par plan pour générer automatiquement le document
-- d'attribution quand un award sur ce plan passe en APPROVED via le
-- workflow d'approbation Module 5.
--
-- Default false en V1 pour éviter le spam de docs lors du backfill admin.
-- L'admin doit explicitement opt-in dans le wizard de création de plan.
--
-- Pas de changement de comportement existant : tant que le flag reste
-- false, le hook approveDecision (Module 5) ne tente aucune génération.
-- =============================================================================

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS auto_generate_document BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN plans.auto_generate_document IS
  'Si true, génère automatiquement le document d''attribution quand un award sur ce plan passe en APPROVED (workflow Module 5). Sinon, l''admin doit générer manuellement depuis l''UI. Default false (V1).';
