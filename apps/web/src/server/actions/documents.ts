'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  cancelSignatureRequestSchema,
  generateAwardDocumentSchema,
  sendDocumentForSignatureSchema,
  voidDocumentSchema,
} from '@equity/shared';
import { transitionAward } from '@/server/actions/awards';
import { logAuditEvent } from '@/lib/audit';
import { requirePermission } from '@/lib/auth/rbac';
import {
  runDocumentGenerationComplianceChecks,
  runDocumentSignatureComplianceChecks,
} from '@/lib/compliance/runChecks';
import type { ComplianceIssue } from '@/lib/compliance/types';
import {
  renderPdfFromTemplate,
  resolveTemplateCodeFromPlanType,
  type TemplateCode,
} from '@/lib/pdf/render';
import type { DocumentContext } from '@/lib/pdf/types';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import * as yousign from '@/lib/yousign/client';

/**
 * Module 6 B2 — Server Actions documents.
 *
 * 5 actions livrées en B2 (les autres en B3 quand on aura Yousign V3) :
 *   1. generateAwardDocument        — render PDF + upload Storage + RPC create
 *   2. regenerateAwardDocument       — archive ancien + génère nouveau
 *   3. getDocumentPreviewUrl         — signed URL Storage 1h
 *   4. listDocumentsForAward         — SELECT joints + signature_requests count
 *   5. voidDocument                  — soft delete document_instance
 *
 * Pattern Result : { ok: true, ... } | { ok: false, error: string, ... }.
 *
 * Permission : 'documents.send_for_signature' (Module 1, recon B1) plutôt
 * que la spec 'documents.generate'. Idem 'documents.void' au lieu de
 * 'documents.cancel_signature'.
 */

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------

type ActionOk<T> = { ok: true } & T;
type ActionError = {
  ok: false;
  error: string;
  validationIssues?: number;
  complianceIssues?: ComplianceIssue[];
  warnings?: ComplianceIssue[];
};
type ActionVoid = { ok: true } | ActionError;

function validationError(err: z.ZodError): ActionError {
  return {
    ok: false,
    error: `Validation échouée : ${err.issues.length} erreur(s)`,
    validationIssues: err.issues.length,
  };
}

const PREVIEW_URL_TTL_SECONDS = 60 * 60; // 1h

// ===========================================================================
// 1. generateAwardDocument
// ===========================================================================

export async function generateAwardDocument(
  input: unknown,
): Promise<
  ActionOk<{ documentId: string; previewUrl: string; warnings: ComplianceIssue[] }> | ActionError
> {
  const parsed = generateAwardDocumentSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { awardId, templateCode: explicitCode } = parsed.data;

  const user = await requirePermission('documents.send_for_signature');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  // 1. Charger contexte via RPC
  const { data: ctxRaw, error: ctxErr } = await supabase.rpc('load_award_document_context', {
    p_award_id: awardId,
  });
  if (ctxErr || !ctxRaw) {
    return { ok: false, error: ctxErr?.message ?? 'Award context introuvable' };
  }
  const ctx = ctxRaw as unknown as Omit<DocumentContext, 'generation'>;

  // 2. Résoudre template
  const templateCode: TemplateCode | null =
    explicitCode ?? resolveTemplateCodeFromPlanType(ctx.plan.plan_type);
  if (!templateCode) {
    return {
      ok: false,
      error: `Aucun template V1 pour plan_type=${ctx.plan.plan_type} (BSPCE/AGA/AGA_PERFORMANCE/STOCK_OPTION uniquement)`,
    };
  }

  // 3. Compliance soft (FMV_RECENT_ENOUGH)
  const compliance = await runDocumentGenerationComplianceChecks(
    { awardId, planId: ctx.plan.id },
    null, // V1 : plans.fmv_set_at n'existe pas encore (Module 11)
  );

  // 4. Generate document_number provisoire (sera réutilisé par la RPC)
  const timestamp = Date.now();
  const filename = `${ctx.award.award_number ?? awardId.slice(0, 8)}-${timestamp}.pdf`;
  const storagePath = `${user.activeOrgId}/awards/${awardId}/${filename}`;

  // 5. Render PDF — generation.document_number provisoire (la RPC génère le vrai DOC-YYYY-NNNN)
  const generationProvisional = {
    document_number: `DRAFT-${timestamp}`,
    generated_at: new Date().toISOString(),
  };
  let renderResult;
  try {
    renderResult = await renderPdfFromTemplate(templateCode, {
      ...ctx,
      generation: generationProvisional,
    });
  } catch (e) {
    return {
      ok: false,
      error: `Render PDF échoué : ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }

  // 6. Upload Storage
  const { error: uploadErr } = await supabase.storage
    .from('documents')
    .upload(storagePath, renderResult.buffer, {
      contentType: 'application/pdf',
      upsert: false,
    });
  if (uploadErr) {
    return { ok: false, error: `Upload Storage échoué : ${uploadErr.message}` };
  }

  // 7. Insert via RPC create_document_for_award
  const { data: docId, error: rpcErr } = await supabase.rpc('create_document_for_award', {
    p_award_id: awardId,
    p_template_code: templateCode,
    p_storage_path: storagePath,
    p_pdf_hash: renderResult.hash,
    p_file_size_bytes: renderResult.size,
    p_variables_used: {
      award_number: ctx.award.award_number,
      beneficiary_email: ctx.beneficiary.email,
    } as never,
  });

  if (rpcErr || !docId) {
    // Rollback storage
    await supabase.storage.from('documents').remove([storagePath]);
    return { ok: false, error: rpcErr?.message ?? 'create_document_for_award échoué' };
  }

  // 8. Generate preview signed URL (1h)
  const { data: signedData } = await supabase.storage
    .from('documents')
    .createSignedUrl(storagePath, PREVIEW_URL_TTL_SECONDS);

  revalidatePath(`/dashboard/awards/${awardId}`);

  return {
    ok: true,
    documentId: docId as unknown as string,
    previewUrl: signedData?.signedUrl ?? '',
    warnings: compliance.warnings,
  };
}

// ===========================================================================
// 2. regenerateAwardDocument
// ===========================================================================

export async function regenerateAwardDocument(
  input: unknown,
): Promise<
  ActionOk<{ documentId: string; previewUrl: string; warnings: ComplianceIssue[] }> | ActionError
> {
  const parsed = generateAwardDocumentSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { awardId } = parsed.data;

  const user = await requirePermission('documents.send_for_signature');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  // Archive l'ancien (le plus récent non-VOIDED non-ARCHIVED)
  const { data: existing } = await supabase
    .from('document_instances')
    .select('id')
    .eq('related_entity_type', 'AWARD')
    .eq('related_entity_id', awardId)
    .eq('org_id', user.activeOrgId)
    .not('status', 'in', '(VOIDED,ARCHIVED)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from('document_instances')
      .update({ status: 'ARCHIVED', archived_at: new Date().toISOString() } as never)
      .eq('id', existing.id);
    await logAuditEvent({
      eventType: 'document.regenerated',
      resourceType: 'document_instance',
      resourceId: existing.id,
      metadata: { award_id: awardId, archived_in_favor_of_new: true },
      userId: user.id,
      userEmail: user.email,
      orgId: user.activeOrgId,
    });
  }

  return generateAwardDocument(parsed.data);
}

// ===========================================================================
// 3. getDocumentPreviewUrl
// ===========================================================================

const previewInputSchema = z.object({
  documentId: z.string().uuid(),
  /**
   * B4 — variant à servir :
   *   - 'ORIGINAL' (défaut)  : storage_path (PDF généré, avant signature)
   *   - 'SIGNED'             : signed_pdf_storage_path (après webhook completed)
   *   - 'PROOF'              : proof_certificate_url (audit trail Yousign)
   */
  variant: z.enum(['ORIGINAL', 'SIGNED', 'PROOF']).optional(),
});

export async function getDocumentPreviewUrl(
  input: unknown,
): Promise<ActionOk<{ signedUrl: string; expiresAt: string }> | ActionError> {
  const parsed = previewInputSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { documentId, variant = 'ORIGINAL' } = parsed.data;

  const user = await requirePermission('documents.read');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();
  const { data: doc, error } = await supabase
    .from('document_instances')
    .select(
      'id, storage_path, storage_bucket, signed_pdf_storage_path, proof_certificate_url, status',
    )
    .eq('id', documentId)
    .eq('org_id', user.activeOrgId)
    .maybeSingle();

  if (error || !doc) return { ok: false, error: 'Document introuvable' };

  let path: string | null;
  if (variant === 'SIGNED') path = doc.signed_pdf_storage_path;
  else if (variant === 'PROOF') path = doc.proof_certificate_url;
  else path = doc.storage_path;

  if (!path) {
    return { ok: false, error: `Aucun fichier ${variant} disponible pour ce document` };
  }

  const { data: signedData, error: signErr } = await supabase.storage
    .from(doc.storage_bucket ?? 'documents')
    .createSignedUrl(path, PREVIEW_URL_TTL_SECONDS);

  if (signErr || !signedData?.signedUrl) {
    return { ok: false, error: signErr?.message ?? 'Signed URL échoué' };
  }

  await logAuditEvent({
    eventType: 'document.preview_accessed',
    resourceType: 'document_instance',
    resourceId: documentId,
    metadata: { storage_path: path, variant },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  return {
    ok: true,
    signedUrl: signedData.signedUrl,
    expiresAt: new Date(Date.now() + PREVIEW_URL_TTL_SECONDS * 1000).toISOString(),
  };
}

// ===========================================================================
// 4. listDocumentsForAward
// ===========================================================================

export type DocumentListItem = {
  id: string;
  document_number: string | null;
  status: string;
  generated_at: string | null;
  generated_by: string | null;
  signed_at: string | null;
  storage_path: string | null;
  template_id: string | null;
  template_version: number | null;
  /** Count des signers SIGNED pour le sig_request lié (s'il y en a un). */
  signers_signed_count: number;
  signers_total_count: number;
  signature_request_status: string | null;
};

export async function listDocumentsForAward(awardId: string): Promise<DocumentListItem[]> {
  const user = await requirePermission('documents.read');
  if (!user.activeOrgId) return [];

  const supabase = await createSupabaseServerClient();
  const { data: docs } = await supabase
    .from('document_instances')
    .select(
      'id, document_number, status, generated_at, generated_by, signed_at, storage_path, template_id, template_version',
    )
    .eq('related_entity_type', 'AWARD')
    .eq('related_entity_id', awardId)
    .eq('org_id', user.activeOrgId)
    .order('created_at', { ascending: false });

  const list = (docs ?? []) as Array<{
    id: string;
    document_number: string | null;
    status: string;
    generated_at: string | null;
    generated_by: string | null;
    signed_at: string | null;
    storage_path: string | null;
    template_id: string | null;
    template_version: number | null;
  }>;
  if (list.length === 0) return [];

  // Charger les signature_requests + count signers en batch
  const docIds = list.map((d) => d.id);
  const { data: sigReqs } = await supabase
    .from('signature_requests')
    .select('id, document_id, status')
    .in('document_id', docIds);

  type SigReq = { id: string; document_id: string; status: string };
  const reqByDoc = new Map<string, SigReq>();
  for (const r of (sigReqs ?? []) as SigReq[]) reqByDoc.set(r.document_id, r);

  const reqIds = Array.from(reqByDoc.values()).map((r) => r.id);
  const { data: signers } = reqIds.length
    ? await supabase
        .from('signers')
        .select('signature_request_id, status')
        .in('signature_request_id', reqIds)
    : { data: [] as { signature_request_id: string; status: string }[] };

  const signersCount = new Map<string, { total: number; signed: number }>();
  for (const s of signers ?? []) {
    const cur = signersCount.get(s.signature_request_id) ?? { total: 0, signed: 0 };
    cur.total += 1;
    if (s.status === 'SIGNED') cur.signed += 1;
    signersCount.set(s.signature_request_id, cur);
  }

  return list.map((d) => {
    const req = reqByDoc.get(d.id);
    const counts = req ? signersCount.get(req.id) : null;
    return {
      ...d,
      signers_total_count: counts?.total ?? 0,
      signers_signed_count: counts?.signed ?? 0,
      signature_request_status: req?.status ?? null,
    } satisfies DocumentListItem;
  });
}

// ===========================================================================
// 5. voidDocument
// ===========================================================================

export async function voidDocument(input: unknown): Promise<ActionVoid> {
  const parsed = voidDocumentSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { documentId, reason } = parsed.data;

  const user = await requirePermission('documents.void');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  // Refuser si signature_request IN_PROGRESS / SENT pour ce doc
  const { data: blockingReq } = await supabase
    .from('signature_requests')
    .select('id')
    .eq('document_id', documentId)
    .not('status', 'in', '(COMPLETED,CANCELLED)')
    .maybeSingle();
  if (blockingReq) {
    return {
      ok: false,
      error: "Impossible de voider : un signature_request actif existe. Cancel d'abord.",
    };
  }

  const { error } = await supabase
    .from('document_instances')
    .update({
      status: 'VOIDED',
      voided_at: new Date().toISOString(),
      voided_reason: reason,
    } as never)
    .eq('id', documentId)
    .eq('org_id', user.activeOrgId);
  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    eventType: 'document.voided',
    resourceType: 'document_instance',
    resourceId: documentId,
    metadata: { reason },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  return { ok: true };
}

// ===========================================================================
// 6. sendDocumentForSignature (B3)
// ===========================================================================

function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0]!, last_name: parts[0]! };
  return { first_name: parts[0]!, last_name: parts.slice(1).join(' ') };
}

export async function sendDocumentForSignature(input: unknown): Promise<
  | ActionOk<{
      signatureRequestId: string;
      yousignProcedureId: string;
      signers: Array<{ email: string; signUrl: string }>;
    }>
  | ActionError
> {
  const parsed = sendDocumentForSignatureSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { documentId, signers, signingOrder, expiryDays } = parsed.data;

  const user = await requirePermission('documents.send_for_signature');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  // 1. Charger document_instance + storage_path + status
  const { data: doc, error: docErr } = await supabase
    .from('document_instances')
    .select(
      'id, status, storage_path, storage_bucket, document_number, related_entity_type, related_entity_id',
    )
    .eq('id', documentId)
    .eq('org_id', user.activeOrgId)
    .maybeSingle();
  if (docErr || !doc) return { ok: false, error: 'Document introuvable' };
  if (!doc.storage_path) return { ok: false, error: "Document sans PDF (DRAFT) — render d'abord" };

  // 2. Compliance V1 hard checks (SIGNERS_COMPLETE_INFO + DOCUMENT_NOT_VOIDED)
  const compliance = await runDocumentSignatureComplianceChecks({
    documentId,
    documentStatus: doc.status,
    signers: signers.map((s) => ({ email: s.email, fullName: s.fullName })),
  });
  if (compliance.errors.length > 0) {
    return {
      ok: false,
      error: `Compliance bloque l'envoi : ${compliance.errors[0]!.message}`,
      complianceIssues: compliance.errors,
    };
  }

  // 3. Download PDF buffer depuis Storage
  const { data: pdfBlob, error: dlErr } = await supabase.storage
    .from(doc.storage_bucket ?? 'documents')
    .download(doc.storage_path);
  if (dlErr || !pdfBlob) {
    return { ok: false, error: dlErr?.message ?? 'Download PDF Storage échoué' };
  }
  const pdfBuffer = Buffer.from(await pdfBlob.arrayBuffer());

  const yousignEnv = process.env.YOUSIGN_ENVIRONMENT ?? 'sandbox';
  const expiryDate = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString();

  // 4. Yousign : create signature request
  let sigReq: { id: string };
  let yousignDocId: string;
  try {
    sigReq = await yousign.createSignatureRequest({
      name: `Signature ${doc.document_number ?? doc.id.slice(0, 8)}`,
      delivery_mode: 'email',
      ordered_signers: signingOrder === 'SEQUENTIAL',
      expiration_date: expiryDate,
    });

    // 5. Upload PDF
    const filename = `${doc.document_number ?? 'document'}.pdf`;
    const yDoc = await yousign.uploadDocument(sigReq.id, pdfBuffer, filename);
    yousignDocId = yDoc.id;
  } catch (e) {
    await logAuditEvent({
      eventType: 'document.send_signature_failed',
      resourceType: 'document_instance',
      resourceId: documentId,
      metadata: {
        stage: 'create_or_upload',
        error: e instanceof Error ? e.message : 'unknown',
      },
      userId: user.id,
      userEmail: user.email,
      orgId: user.activeOrgId,
    });
    return {
      ok: false,
      error: `Yousign create/upload échoué : ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }

  // 6. Add signers (un par un, avec field signature dernière page)
  type DbSignerRow = {
    user_id: string | null;
    beneficiary_id: string | null;
    full_name: string;
    email: string;
    role_in_signature: string;
    signing_order: number;
    yousign_signer_id: string;
    yousign_sign_url: string;
  };
  const dbSigners: DbSignerRow[] = [];

  for (const s of signers) {
    const { first_name, last_name } = splitName(s.fullName);
    try {
      const ySigner = await yousign.addSigner(sigReq.id, {
        info: {
          first_name,
          last_name,
          email: s.email,
          phone_number: s.phone,
          locale: 'fr',
        },
        signature_level: 'electronic_signature',
        signature_authentication_mode: 'otp_email',
        fields: [
          {
            document_id: yousignDocId,
            type: 'signature',
            page: -1,
            x: 100,
            y: 100,
          },
        ],
      });
      dbSigners.push({
        user_id: s.userId ?? null,
        beneficiary_id: s.beneficiaryId ?? null,
        full_name: s.fullName,
        email: s.email,
        role_in_signature: s.type,
        signing_order: s.signingOrder,
        yousign_signer_id: ySigner.id,
        yousign_sign_url: ySigner.signature_link,
      });
    } catch (e) {
      await logAuditEvent({
        eventType: 'document.send_signature_failed',
        resourceType: 'document_instance',
        resourceId: documentId,
        metadata: {
          stage: 'add_signer',
          yousign_procedure_id: sigReq.id,
          signer_email: s.email,
          error: e instanceof Error ? e.message : 'unknown',
        },
        userId: user.id,
        userEmail: user.email,
        orgId: user.activeOrgId,
      });
      return {
        ok: false,
        error: `Yousign addSigner échoué pour ${s.email} : ${e instanceof Error ? e.message : 'unknown'}`,
      };
    }
  }

  // 7. Activate (Yousign envoie les emails)
  try {
    await yousign.activateSignatureRequest(sigReq.id);
  } catch (e) {
    await logAuditEvent({
      eventType: 'document.send_signature_failed',
      resourceType: 'document_instance',
      resourceId: documentId,
      metadata: {
        stage: 'activate',
        yousign_procedure_id: sigReq.id,
        error: e instanceof Error ? e.message : 'unknown',
      },
      userId: user.id,
      userEmail: user.email,
      orgId: user.activeOrgId,
    });
    return {
      ok: false,
      error: `Yousign activate échoué : ${e instanceof Error ? e.message : 'unknown'}`,
    };
  }

  // 8. RPC create_signature_request_full (insert DB)
  const { data: requestId, error: rpcErr } = await supabase.rpc('create_signature_request_full', {
    p_document_id: documentId,
    p_yousign_procedure_id: sigReq.id,
    p_yousign_environment: yousignEnv,
    p_signing_order: signingOrder,
    p_expiry_date: expiryDate,
    p_signers: dbSigners as never,
  });
  if (rpcErr || !requestId) {
    // critique : sig request existe chez Yousign mais pas en DB
    await logAuditEvent({
      eventType: 'document.send_signature_failed',
      resourceType: 'document_instance',
      resourceId: documentId,
      metadata: {
        stage: 'rpc_create_signature_request_full',
        yousign_procedure_id: sigReq.id,
        critical: true,
        error: rpcErr?.message ?? 'no requestId',
      },
      userId: user.id,
      userEmail: user.email,
      orgId: user.activeOrgId,
    });
    return {
      ok: false,
      error: `RPC create_signature_request_full échoué : ${rpcErr?.message ?? 'no requestId'} (sig req ${sigReq.id} orpheline chez Yousign — cleanup manuel)`,
    };
  }

  // 9. Si award lié : transition PENDING_SIGNATURE (skipApprovalHook pour pas re-déclencher workflow)
  if (doc.related_entity_type === 'AWARD' && doc.related_entity_id) {
    await transitionAward({
      awardId: doc.related_entity_id,
      toStatus: 'PENDING_SIGNATURE',
      reason: 'Document envoyé pour signature',
      skipApprovalHook: true,
    });
  }

  revalidatePath(`/dashboard/awards/${doc.related_entity_id ?? ''}`);

  return {
    ok: true,
    signatureRequestId: requestId as unknown as string,
    yousignProcedureId: sigReq.id,
    signers: dbSigners.map((s) => ({ email: s.email, signUrl: s.yousign_sign_url })),
  };
}

// ===========================================================================
// 7. cancelSignatureRequest (B3)
// ===========================================================================

export async function cancelSignatureRequest(input: unknown): Promise<ActionVoid> {
  const parsed = cancelSignatureRequestSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { requestId, reason } = parsed.data;

  const user = await requirePermission('documents.void');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();

  const { data: req, error: reqErr } = await supabase
    .from('signature_requests')
    .select('id, yousign_procedure_id, status')
    .eq('id', requestId)
    .eq('org_id', user.activeOrgId)
    .maybeSingle();
  if (reqErr || !req) return { ok: false, error: 'Signature request introuvable' };
  if (req.status === 'COMPLETED' || req.status === 'CANCELLED') {
    return { ok: false, error: `Signature request déjà ${req.status} — pas annulable` };
  }

  // Yousign cancel best-effort (si Yousign down, on continue côté DB)
  if (!req.yousign_procedure_id) {
    return { ok: false, error: 'Signature request sans yousign_procedure_id' };
  }
  try {
    await yousign.cancelSignatureRequest(req.yousign_procedure_id);
  } catch (e) {
    await logAuditEvent({
      eventType: 'document.signature_cancel_yousign_failed',
      resourceType: 'signature_request',
      resourceId: requestId,
      metadata: {
        yousign_procedure_id: req.yousign_procedure_id,
        error: e instanceof Error ? e.message : 'unknown',
      },
      userId: user.id,
      userEmail: user.email,
      orgId: user.activeOrgId,
    });
    // on continue : le DB doit refléter l'intention de cancel
  }

  const { error: rpcErr } = await supabase.rpc('cancel_signature_request', {
    p_request_id: requestId,
    p_reason: reason,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };

  return { ok: true };
}

// ===========================================================================
// 8. getSignatureRequestStatus (B3)
// ===========================================================================

export type SignatureRequestStatus = {
  id: string;
  status: string;
  yousignProcedureId: string | null;
  documentId: string;
  documentStatus: string | null;
  awardId: string | null;
  expiryDate: string | null;
  sentAt: string | null;
  completedAt: string | null;
  signers: Array<{
    id: string;
    fullName: string;
    email: string;
    role: string;
    order: number;
    status: string;
    viewedAt: string | null;
    signedAt: string | null;
    signUrl: string | null;
  }>;
};

const statusInputSchema = z.object({ requestId: z.string().uuid() });

export async function getSignatureRequestStatus(
  input: unknown,
): Promise<ActionOk<{ request: SignatureRequestStatus }> | ActionError> {
  const parsed = statusInputSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const user = await requirePermission('documents.read');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();
  const { data: req, error } = await supabase
    .from('signature_requests')
    .select(
      `id, status, yousign_procedure_id, document_id, expiry_date, sent_at, completed_at,
       document_instances:document_id ( status, related_entity_id, related_entity_type ),
       signers ( id, full_name, email, role_in_signature, signing_order, status, viewed_at, signed_at, yousign_sign_url )`,
    )
    .eq('id', parsed.data.requestId)
    .eq('org_id', user.activeOrgId)
    .maybeSingle();

  if (error || !req) return { ok: false, error: 'Signature request introuvable' };

  type DocJoin = {
    status: string | null;
    related_entity_id: string | null;
    related_entity_type: string | null;
  };
  type SignerJoin = {
    id: string;
    full_name: string;
    email: string;
    role_in_signature: string;
    signing_order: number;
    status: string;
    viewed_at: string | null;
    signed_at: string | null;
    yousign_sign_url: string | null;
  };
  const doc = (
    Array.isArray(req.document_instances) ? req.document_instances[0] : req.document_instances
  ) as DocJoin | null;
  const signersList = (req.signers ?? []) as SignerJoin[];

  return {
    ok: true,
    request: {
      id: req.id,
      status: req.status,
      yousignProcedureId: req.yousign_procedure_id,
      documentId: req.document_id,
      documentStatus: doc?.status ?? null,
      awardId: doc?.related_entity_type === 'AWARD' ? (doc?.related_entity_id ?? null) : null,
      expiryDate: req.expiry_date,
      sentAt: req.sent_at,
      completedAt: req.completed_at,
      signers: signersList
        .sort((a, b) => a.signing_order - b.signing_order)
        .map((s) => ({
          id: s.id,
          fullName: s.full_name,
          email: s.email,
          role: s.role_in_signature,
          order: s.signing_order,
          status: s.status,
          viewedAt: s.viewed_at,
          signedAt: s.signed_at,
          signUrl: s.yousign_sign_url,
        })),
    },
  };
}
