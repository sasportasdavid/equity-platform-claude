-- ============================================================================
-- MODULE 6 B1 — Étendre le CHECK content_format pour accepter 'CODE'
--
-- Découpée du 00033 après détection en cloud : le seed des templates en 00035
-- a planté sur le CHECK Module 1 préexistant qui n'accepte que
-- TIPTAP_JSON/MARKDOWN/HTML. On ajoute 'CODE' pour les templates code-defined
-- V1 (React PDF). V2 éditeur WYSIWYG pourra utiliser TIPTAP_JSON.
--
-- Idempotent via DROP CONSTRAINT IF EXISTS.
-- ============================================================================

ALTER TABLE document_templates
  DROP CONSTRAINT IF EXISTS document_templates_content_format_check;

ALTER TABLE document_templates
  ADD CONSTRAINT document_templates_content_format_check
  CHECK (content_format = ANY (
    ARRAY['TIPTAP_JSON'::text, 'MARKDOWN'::text, 'HTML'::text, 'CODE'::text]
  ));
