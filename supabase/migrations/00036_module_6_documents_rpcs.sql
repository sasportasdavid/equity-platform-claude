-- ============================================================================
-- MODULE 6 B1 — Documents & Signatures RPCs (6)
--
-- 1. create_document_for_award          — INSERT document_instance + audit
-- 2. create_signature_request_full      — INSERT signature_request + signers + audit
-- 3. update_signer_from_webhook         — service_role, called by Edge Function
-- 4. complete_signature_request         — service_role, idempotent
-- 5. cancel_signature_request           — admin authenticated
-- 6. transition_award_to_granted_after_signature — service_role helper hook
--
-- Adaptations vs spec (cf memory/module_6_b1_recon.md) :
--   - permissions Module 1 conservées (documents.send_for_signature pour
--     create+send, documents.void pour cancel) — pas de nouvelles perms
--   - audit_events.user_id (pas actor_id)
--   - content_format='CODE' explicite
-- ============================================================================

-- ----------------------------------------------------------------------------
-- RPC 1 — create_document_for_award
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_document_for_award(
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
  v_org_id UUID := current_org_id();
  v_template document_templates%ROWTYPE;
  v_award awards%ROWTYPE;
  v_document_id UUID;
  v_document_number TEXT;
BEGIN
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT user_has_permission('documents.send_for_signature') THEN
    RAISE EXCEPTION 'Permission denied: documents.send_for_signature';
  END IF;

  SELECT * INTO v_template
    FROM document_templates
   WHERE org_id = v_org_id
     AND code = p_template_code
     AND is_active = true
     AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template % not found or inactive', p_template_code;
  END IF;

  SELECT * INTO v_award FROM awards WHERE id = p_award_id AND org_id = v_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award % not found', p_award_id;
  END IF;

  v_document_number := 'DOC-' || EXTRACT(YEAR FROM now())::TEXT || '-' ||
    LPAD((
      SELECT COUNT(*) + 1
        FROM document_instances
       WHERE org_id = v_org_id
         AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now())
    )::TEXT, 4, '0');

  INSERT INTO document_instances (
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

  INSERT INTO audit_events (
    org_id, user_id, event_type, resource_type, resource_id, metadata
  ) VALUES (
    v_org_id, v_user_id, 'document.generated',
    'document_instance', v_document_id,
    jsonb_build_object(
      'template_code', p_template_code,
      'award_id', p_award_id,
      'document_number', v_document_number,
      'storage_path', p_storage_path
    )
  );

  RETURN v_document_id;
END $$;

GRANT EXECUTE ON FUNCTION create_document_for_award(UUID, TEXT, TEXT, TEXT, BIGINT, JSONB)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- RPC 2 — create_signature_request_full
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_signature_request_full(
  p_document_id UUID,
  p_yousign_procedure_id TEXT,
  p_yousign_environment TEXT,
  p_signing_order TEXT,
  p_expiry_date TIMESTAMPTZ,
  p_signers JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID := current_org_id();
  v_request_id UUID;
  v_signer JSONB;
BEGIN
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT user_has_permission('documents.send_for_signature') THEN
    RAISE EXCEPTION 'Permission denied: documents.send_for_signature';
  END IF;

  INSERT INTO signature_requests (
    org_id, document_id, yousign_procedure_id, yousign_environment,
    signing_order, status, expiry_date, sent_at
  ) VALUES (
    v_org_id, p_document_id, p_yousign_procedure_id, p_yousign_environment,
    p_signing_order, 'SENT', p_expiry_date, now()
  )
  RETURNING id INTO v_request_id;

  FOR v_signer IN SELECT * FROM jsonb_array_elements(p_signers)
  LOOP
    INSERT INTO signers (
      org_id, signature_request_id,
      user_id, beneficiary_id,
      full_name, email, role_in_signature, signing_order,
      status, yousign_signer_id, yousign_sign_url, invited_at
    ) VALUES (
      v_org_id, v_request_id,
      NULLIF(v_signer->>'user_id', '')::UUID,
      NULLIF(v_signer->>'beneficiary_id', '')::UUID,
      v_signer->>'full_name',
      v_signer->>'email',
      v_signer->>'role_in_signature',
      (v_signer->>'signing_order')::INTEGER,
      'SENT',
      v_signer->>'yousign_signer_id',
      v_signer->>'yousign_sign_url',
      now()
    );
  END LOOP;

  UPDATE document_instances
     SET status = 'SENT_FOR_SIGNATURE'
   WHERE id = p_document_id;

  INSERT INTO audit_events (
    org_id, user_id, event_type, resource_type, resource_id, metadata
  ) VALUES (
    v_org_id, v_user_id, 'document.sent_for_signature',
    'signature_request', v_request_id,
    jsonb_build_object(
      'document_id', p_document_id,
      'signers_count', jsonb_array_length(p_signers),
      'yousign_procedure_id', p_yousign_procedure_id
    )
  );

  RETURN v_request_id;
END $$;

GRANT EXECUTE ON FUNCTION create_signature_request_full(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- RPC 3 — update_signer_from_webhook (service_role only)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_signer_from_webhook(
  p_yousign_signer_id TEXT,
  p_event_type TEXT,
  p_metadata JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_signer signers%ROWTYPE;
  v_request_id UUID;
BEGIN
  SELECT * INTO v_signer
    FROM signers
   WHERE yousign_signer_id = p_yousign_signer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Signer not found for yousign_signer_id %', p_yousign_signer_id;
  END IF;

  v_request_id := v_signer.signature_request_id;

  IF p_event_type = 'viewed' THEN
    UPDATE signers
       SET status = 'VIEWED',
           viewed_at = COALESCE(viewed_at, now()),
           ip_address = NULLIF(p_metadata->>'ip_address', '')::INET
     WHERE id = v_signer.id;
  ELSIF p_event_type = 'signed' THEN
    UPDATE signers
       SET status = 'SIGNED',
           signed_at = COALESCE((p_metadata->>'signed_at')::TIMESTAMPTZ, now()),
           ip_address = NULLIF(p_metadata->>'ip_address', '')::INET,
           signature_method = COALESCE(p_metadata->>'signature_method', 'SIMPLE_ELECTRONIC')
     WHERE id = v_signer.id;
  ELSIF p_event_type = 'declined' THEN
    UPDATE signers
       SET status = 'DECLINED',
           decline_reason = p_metadata->>'reason'
     WHERE id = v_signer.id;
  ELSE
    RAISE EXCEPTION 'Unknown event_type %', p_event_type;
  END IF;

  UPDATE signature_requests
     SET webhook_payload_history = webhook_payload_history || jsonb_build_object(
       'event', p_event_type,
       'signer_id', p_yousign_signer_id,
       'received_at', now(),
       'metadata', p_metadata
     )
   WHERE id = v_request_id;

  RETURN v_request_id;
END $$;

GRANT EXECUTE ON FUNCTION update_signer_from_webhook(TEXT, TEXT, JSONB) TO service_role;

-- ----------------------------------------------------------------------------
-- RPC 4 — complete_signature_request (service_role, idempotent)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION complete_signature_request(
  p_request_id UUID,
  p_signed_pdf_storage_path TEXT,
  p_proof_certificate_url TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_request signature_requests%ROWTYPE;
  v_document document_instances%ROWTYPE;
  v_award_id UUID;
BEGIN
  SELECT * INTO v_request FROM signature_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Signature request not found';
  END IF;

  -- Idempotence : si déjà COMPLETED, return NULL sans rien refaire
  IF v_request.status = 'COMPLETED' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_document FROM document_instances WHERE id = v_request.document_id;

  UPDATE signature_requests
     SET status = 'COMPLETED',
         completed_at = now(),
         proof_certificate_url = p_proof_certificate_url
   WHERE id = p_request_id;

  UPDATE document_instances
     SET status = 'SIGNED',
         signed_at = now(),
         signed_pdf_storage_path = p_signed_pdf_storage_path,
         signed_pdf_url = p_signed_pdf_storage_path,
         proof_certificate_url = p_proof_certificate_url
   WHERE id = v_request.document_id;

  IF v_document.related_entity_type = 'AWARD' THEN
    v_award_id := v_document.related_entity_id;
  END IF;

  INSERT INTO audit_events (
    org_id, user_id, event_type, resource_type, resource_id, metadata
  ) VALUES (
    v_request.org_id, NULL, 'document.signed',
    'document_instance', v_document.id,
    jsonb_build_object(
      'signature_request_id', p_request_id,
      'award_id', v_award_id
    )
  );

  RETURN v_award_id;
END $$;

GRANT EXECUTE ON FUNCTION complete_signature_request(UUID, TEXT, TEXT) TO service_role;

-- ----------------------------------------------------------------------------
-- RPC 5 — cancel_signature_request (admin authenticated)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cancel_signature_request(
  p_request_id UUID,
  p_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_org_id UUID := current_org_id();
  v_user_id UUID := auth.uid();
  v_doc_id UUID;
BEGIN
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT user_has_permission('documents.void') THEN
    RAISE EXCEPTION 'Permission denied: documents.void';
  END IF;

  UPDATE signature_requests
     SET status = 'CANCELLED',
         completed_at = now(),
         webhook_payload_history = webhook_payload_history || jsonb_build_object(
           'event', 'cancelled_by_admin',
           'reason', p_reason,
           'received_at', now()
         )
   WHERE id = p_request_id
     AND org_id = v_org_id
     AND status NOT IN ('COMPLETED', 'CANCELLED')
  RETURNING document_id INTO v_doc_id;

  IF v_doc_id IS NULL THEN
    RAISE EXCEPTION 'Cannot cancel : already completed or not found';
  END IF;

  UPDATE signers
     SET status = 'DECLINED',
         decline_reason = 'Cancelled by admin: ' || p_reason
   WHERE signature_request_id = p_request_id
     AND status NOT IN ('SIGNED', 'DECLINED');

  -- Revert document to GENERATED → peut être renvoyé
  UPDATE document_instances
     SET status = 'GENERATED'
   WHERE id = v_doc_id;

  INSERT INTO audit_events (
    org_id, user_id, event_type, resource_type, resource_id, metadata
  ) VALUES (
    v_org_id, v_user_id, 'document.signature_cancelled',
    'signature_request', p_request_id,
    jsonb_build_object('reason', p_reason)
  );

  RETURN p_request_id;
END $$;

GRANT EXECUTE ON FUNCTION cancel_signature_request(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- RPC 6 — transition_award_to_granted_after_signature (service_role helper)
--
-- Helper appelable par le webhook Yousign (Edge Function B5+) après
-- complete_signature_request retourne un award_id. NE remplace pas le
-- transitionAward TS — c'est juste un raccourci SQL utilisé par les
-- contextes service_role qui n'ont pas accès au TS.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION transition_award_to_granted_after_signature(
  p_award_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_award awards%ROWTYPE;
  v_old_status TEXT;
BEGIN
  SELECT * INTO v_award FROM awards WHERE id = p_award_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award % not found', p_award_id;
  END IF;

  v_old_status := v_award.status;

  -- Idempotent : si déjà GRANTED, return sans rien faire
  IF v_award.status = 'GRANTED' THEN
    RETURN p_award_id;
  END IF;

  -- Transition uniquement si en PENDING_SIGNATURE (cohérent state machine)
  IF v_award.status NOT IN ('PENDING_SIGNATURE', 'APPROVED') THEN
    RAISE EXCEPTION 'Cannot transition award % from status % to GRANTED',
      p_award_id, v_award.status;
  END IF;

  UPDATE awards
     SET status = 'GRANTED',
         granted_at = COALESCE(granted_at, now()),
         updated_at = now()
   WHERE id = p_award_id;

  INSERT INTO audit_events (
    org_id, user_id, event_type, resource_type, resource_id, metadata
  ) VALUES (
    v_award.org_id, NULL, 'award.status_changed',
    'AWARD', p_award_id,
    jsonb_build_object(
      'from', v_old_status,
      'to', 'GRANTED',
      'reason', 'Auto-transition after signature completion',
      'source', 'webhook'
    )
  );

  RETURN p_award_id;
END $$;

GRANT EXECUTE ON FUNCTION transition_award_to_granted_after_signature(UUID) TO service_role;
