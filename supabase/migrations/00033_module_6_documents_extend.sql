-- ============================================================================
-- MODULE 6 B1 — Documents schema extend (ADD-only)
--
-- Stratégie : ALTER TABLE ADD COLUMN IF NOT EXISTS uniquement. Préserve les
-- colonnes Module 1 + RLS policies + triggers existants (cf
-- memory/module_6_b1_recon.md).
--
-- Tables touchées :
--   - document_templates : ADD code, template_engine, supported_languages +
--                          UNIQUE INDEX (org_id, code)
--   - document_instances : ADD storage_path, storage_bucket, file_size_bytes,
--                          signed_pdf_url, signed_pdf_storage_path,
--                          proof_certificate_url + 2 indexes
--   - signature_requests : ADD yousign_environment, yousign_workflow_status,
--                          signing_order + 2 indexes
--   - signers : 2 indexes (table déjà complète)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. document_templates : extend
-- ----------------------------------------------------------------------------

ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS template_engine TEXT NOT NULL DEFAULT 'REACT_PDF'
    CHECK (template_engine IN ('REACT_PDF', 'TIPTAP', 'HTML', 'MARKDOWN')),
  ADD COLUMN IF NOT EXISTS supported_languages TEXT[] DEFAULT ARRAY['fr'];

-- Note : le CHECK content_format est étendu pour accepter 'CODE' dans
-- la migration 00037 (split du seed templates car le seed avait planté
-- au premier apply sur le CHECK Module 1 pré-existant).

CREATE UNIQUE INDEX IF NOT EXISTS uq_document_templates_code
  ON document_templates(org_id, code)
  WHERE deleted_at IS NULL AND code IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. document_instances : extend
-- ----------------------------------------------------------------------------

ALTER TABLE document_instances
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT DEFAULT 'documents',
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS signed_pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS signed_pdf_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS proof_certificate_url TEXT;

CREATE INDEX IF NOT EXISTS idx_document_instances_award
  ON document_instances(related_entity_type, related_entity_id);

CREATE INDEX IF NOT EXISTS idx_document_instances_status
  ON document_instances(status) WHERE status != 'ARCHIVED';

-- ----------------------------------------------------------------------------
-- 3. signature_requests : extend
-- ----------------------------------------------------------------------------

ALTER TABLE signature_requests
  ADD COLUMN IF NOT EXISTS yousign_environment TEXT DEFAULT 'sandbox'
    CHECK (yousign_environment IN ('sandbox', 'production')),
  ADD COLUMN IF NOT EXISTS yousign_workflow_status TEXT,
  ADD COLUMN IF NOT EXISTS signing_order TEXT DEFAULT 'SEQUENTIAL'
    CHECK (signing_order IN ('SEQUENTIAL', 'PARALLEL'));

CREATE INDEX IF NOT EXISTS idx_signature_requests_status
  ON signature_requests(status) WHERE status NOT IN ('COMPLETED', 'CANCELLED');

CREATE INDEX IF NOT EXISTS idx_signature_requests_yousign
  ON signature_requests(yousign_procedure_id)
  WHERE yousign_procedure_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. signers : indexes (schema déjà complet Module 1)
-- ----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_signers_request
  ON signers(signature_request_id);

CREATE INDEX IF NOT EXISTS idx_signers_yousign
  ON signers(yousign_signer_id)
  WHERE yousign_signer_id IS NOT NULL;
