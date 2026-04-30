-- ============================================================================
-- MODULE 6 B1 — Storage bucket 'documents' + RLS policies
--
-- Path pattern attendu côté TS : {org_id}/awards/{award_id}/{filename}.pdf
-- → storage.foldername(name)[1]::uuid = current_org_id() pour cohérence
-- multi-tenant (lecture/écriture limitées à l'org courante).
--
-- Permissions utilisées (Module 1 existantes, cf recon) :
--   - INSERT : documents.send_for_signature (couvre create + send V1)
--   - DELETE : documents.void
-- ============================================================================

-- 1. Bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false, -- privé : URLs signées uniquement
  52428800, -- 50 MB max par fichier
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- 2. RLS policies storage.objects pour le bucket 'documents'
--    Drop si déjà créé (idempotence cloud), puis recréer.

DROP POLICY IF EXISTS documents_storage_select ON storage.objects;
CREATE POLICY documents_storage_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1]::uuid = current_org_id()
  );

DROP POLICY IF EXISTS documents_storage_insert ON storage.objects;
CREATE POLICY documents_storage_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND has_permission('documents.send_for_signature')
    AND (storage.foldername(name))[1]::uuid = current_org_id()
  );

DROP POLICY IF EXISTS documents_storage_delete ON storage.objects;
CREATE POLICY documents_storage_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents'
    AND has_permission('documents.void')
    AND (storage.foldername(name))[1]::uuid = current_org_id()
  );
