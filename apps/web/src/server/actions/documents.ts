'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { generateAwardDocumentSchema, voidDocumentSchema } from '@equity/shared';
import { logAuditEvent } from '@/lib/audit';
import { requirePermission } from '@/lib/auth/rbac';
import { runDocumentGenerationComplianceChecks } from '@/lib/compliance/runChecks';
import type { ComplianceIssue } from '@/lib/compliance/types';
import {
  renderPdfFromTemplate,
  resolveTemplateCodeFromPlanType,
  type TemplateCode,
} from '@/lib/pdf/render';
import type { DocumentContext } from '@/lib/pdf/types';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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

const previewInputSchema = z.object({ documentId: z.string().uuid() });

export async function getDocumentPreviewUrl(
  input: unknown,
): Promise<ActionOk<{ signedUrl: string; expiresAt: string }> | ActionError> {
  const parsed = previewInputSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { documentId } = parsed.data;

  const user = await requirePermission('documents.read');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const supabase = await createSupabaseServerClient();
  const { data: doc, error } = await supabase
    .from('document_instances')
    .select('id, storage_path, storage_bucket, status')
    .eq('id', documentId)
    .eq('org_id', user.activeOrgId)
    .maybeSingle();

  if (error || !doc) return { ok: false, error: 'Document introuvable' };
  if (!doc.storage_path) {
    return { ok: false, error: 'Aucun fichier PDF lié à ce document (DRAFT non rendered ?)' };
  }

  const { data: signedData, error: signErr } = await supabase.storage
    .from(doc.storage_bucket ?? 'documents')
    .createSignedUrl(doc.storage_path, PREVIEW_URL_TTL_SECONDS);

  if (signErr || !signedData?.signedUrl) {
    return { ok: false, error: signErr?.message ?? 'Signed URL échoué' };
  }

  await logAuditEvent({
    eventType: 'document.preview_accessed',
    resourceType: 'document_instance',
    resourceId: documentId,
    metadata: { storage_path: doc.storage_path },
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
