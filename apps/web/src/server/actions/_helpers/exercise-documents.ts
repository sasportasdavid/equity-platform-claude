import 'server-only';
import { logAuditEvent } from '@/lib/audit';
import { renderPdfFromTemplate } from '@/lib/pdf/render';
import { resolveDocumentTemplate } from '@/lib/pdf/template-resolver';
import type { DocumentContextExercise } from '@/lib/pdf/types';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Module 9 B5 — 2 hooks PDF generators pour le workflow d'exercice.
 *
 * Pattern :
 *  - Idempotent : si le FK doc déjà set sur exercise_request → skip + return
 *    `alreadyExists: true` (pas de re-render, pas de doublon Storage)
 *  - Charge le contexte via RPC `load_exercise_document_context` (C3)
 *  - Render react-pdf via `renderPdfFromTemplate` (C4) avec dispatch type-safe
 *  - Upload Storage `documents` bucket dans `{org_id}/exercises/{exercise_id}/`
 *  - INSERT `document_instances` + UPDATE `exercise_requests.{notification|bulletin}_document_id`
 *  - Audit `exercise.notification_generated` / `exercise.bulletin_generated`
 *
 * Service_role admin client (bypass RLS — context déjà autorisé en amont par
 * Server Action caller).
 */

type DocOk<T> = { ok: true } & T;
type DocErr = { ok: false; error: string };

const DOCUMENTS_BUCKET = 'documents';

type GenerateOk = DocOk<{
  documentId: string;
  alreadyExists: boolean;
  storagePath: string | null;
}>;

type GenerateInput = {
  exerciseRequestId: string;
};

// ---------------------------------------------------------------------------
// Internal : load context via RPC + assemble DocumentContextExercise
// ---------------------------------------------------------------------------

async function loadContext(
  exerciseRequestId: string,
  documentNumber: string,
): Promise<DocumentContextExercise | null> {
  const admin = getSupabaseAdminClient();
  const { data: ctx, error } = await admin.rpc('load_exercise_document_context', {
    p_exercise_request_id: exerciseRequestId,
  });
  if (error || !ctx) return null;

  return {
    ...(ctx as unknown as Omit<DocumentContextExercise, 'generation'>),
    generation: {
      document_number: documentNumber,
      generated_at: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------------------
// Internal : INSERT document_instances + UPDATE exercise_requests FK
// ---------------------------------------------------------------------------

async function persistDocument(params: {
  orgId: string;
  exerciseRequestId: string;
  templateCode: 'EXERCISE_NOTIFICATION' | 'SUBSCRIPTION_BULLETIN';
  category: 'EXERCISE_NOTICE' | 'CERTIFICATE';
  documentNumber: string;
  storagePath: string;
  pdfHash: string;
  size: number;
  fkColumn: 'notification_document_id' | 'bulletin_document_id';
}): Promise<{ ok: true; documentId: string } | DocErr> {
  const admin = getSupabaseAdminClient();

  // INSERT document_instance directement (pas de RPC create_document_for_exercise
  // dédié V1 — le RPC M6 create_document_for_award est award-specific).
  // V1.1 PR #49 : lookup avec fallback GLOBAL (org-specific d'abord, puis
  // org_id IS NULL en repli). Si rien trouvé, on continue avec template_id NULL
  // (le document_instance est créé sans FK template — best-effort historique).
  const tpl = await resolveDocumentTemplate(admin, {
    orgId: params.orgId,
    code: params.templateCode,
  });

  const { data: doc, error: insErr } = await admin
    .from('document_instances')
    .insert({
      org_id: params.orgId,
      template_id: tpl?.id ?? null,
      template_version: tpl?.version ?? null,
      document_number: params.documentNumber,
      category: params.category,
      title:
        params.templateCode === 'EXERCISE_NOTIFICATION'
          ? `Notification d'exercice ${params.documentNumber}`
          : `Bulletin de souscription ${params.documentNumber}`,
      related_entity_type: 'EXERCISE_REQUEST',
      related_entity_id: params.exerciseRequestId,
      status: 'GENERATED',
      generated_at: new Date().toISOString(),
      rendered_pdf_url: params.storagePath,
      rendered_pdf_hash: params.pdfHash,
    } as never)
    .select('id')
    .single();

  if (insErr || !doc) {
    return { ok: false, error: insErr?.message ?? 'INSERT document_instance échoué' };
  }

  const { error: updErr } = await admin
    .from('exercise_requests')
    .update({ [params.fkColumn]: doc.id, updated_at: new Date().toISOString() } as never)
    .eq('id', params.exerciseRequestId);

  if (updErr) {
    return { ok: false, error: `UPDATE exercise FK échoué : ${updErr.message}` };
  }

  return { ok: true, documentId: doc.id };
}

// ---------------------------------------------------------------------------
// 1. generateExerciseNotification
// ---------------------------------------------------------------------------

/**
 * Génère le PDF EXERCISE_NOTIFICATION post-APPROVED. Idempotent : si l'exercise
 * a déjà notification_document_id, return `alreadyExists: true` sans re-render.
 *
 * Throw possible si le plan est AGA (assertExercisableType dans le template) —
 * propagé en `ok: false`.
 */
export async function generateExerciseNotification(
  input: GenerateInput,
): Promise<GenerateOk | DocErr> {
  const admin = getSupabaseAdminClient();

  // Step 1 : idempotence guard
  const { data: existing } = await admin
    .from('exercise_requests')
    .select('id, org_id, notification_document_id, request_number')
    .eq('id', input.exerciseRequestId)
    .maybeSingle();

  if (!existing) return { ok: false, error: 'Exercise request introuvable' };

  if (existing.notification_document_id) {
    return {
      ok: true,
      documentId: existing.notification_document_id,
      alreadyExists: true,
      storagePath: null,
    };
  }

  const documentNumber = `NOTIF-${existing.request_number ?? input.exerciseRequestId.slice(0, 8)}`;

  // Step 2 : context
  const ctx = await loadContext(input.exerciseRequestId, documentNumber);
  if (!ctx) return { ok: false, error: 'load_exercise_document_context returned null' };

  // Step 3 : render (assertExercisableType throw catché ici)
  let renderResult;
  try {
    renderResult = await renderPdfFromTemplate('EXERCISE_NOTIFICATION', ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'render failed';
    return { ok: false, error: `Render PDF échoué : ${msg}` };
  }

  // Step 4 : upload Storage
  const filename = `${documentNumber}-${Date.now()}.pdf`;
  const storagePath = `${existing.org_id}/exercises/${input.exerciseRequestId}/${filename}`;

  const { error: uploadErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, renderResult.buffer, {
      contentType: 'application/pdf',
      upsert: false,
    });
  if (uploadErr) {
    return { ok: false, error: `Upload Storage échoué : ${uploadErr.message}` };
  }

  // Step 5 : INSERT + UPDATE FK
  const persistRes = await persistDocument({
    orgId: existing.org_id,
    exerciseRequestId: input.exerciseRequestId,
    templateCode: 'EXERCISE_NOTIFICATION',
    category: 'EXERCISE_NOTICE',
    documentNumber,
    storagePath,
    pdfHash: renderResult.hash,
    size: renderResult.size,
    fkColumn: 'notification_document_id',
  });
  if (!persistRes.ok) {
    // Rollback Storage
    await admin.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
    return persistRes;
  }

  // Step 6 : audit
  await logAuditEvent({
    eventType: 'exercise.notification_generated',
    resourceType: 'exercise_request',
    resourceId: input.exerciseRequestId,
    orgId: existing.org_id,
    metadata: {
      document_instance_id: persistRes.documentId,
      document_number: documentNumber,
      storage_path: storagePath,
      size_bytes: renderResult.size,
    },
  });

  return {
    ok: true,
    documentId: persistRes.documentId,
    alreadyExists: false,
    storagePath,
  };
}

// ---------------------------------------------------------------------------
// 2. generateSubscriptionBulletin
// ---------------------------------------------------------------------------

/**
 * Génère le PDF SUBSCRIPTION_BULLETIN post-COMPLETED (paiement confirmé).
 * Idempotent via bulletin_document_id.
 */
export async function generateSubscriptionBulletin(
  input: GenerateInput,
): Promise<GenerateOk | DocErr> {
  const admin = getSupabaseAdminClient();

  const { data: existing } = await admin
    .from('exercise_requests')
    .select('id, org_id, bulletin_document_id, request_number')
    .eq('id', input.exerciseRequestId)
    .maybeSingle();

  if (!existing) return { ok: false, error: 'Exercise request introuvable' };

  if (existing.bulletin_document_id) {
    return {
      ok: true,
      documentId: existing.bulletin_document_id,
      alreadyExists: true,
      storagePath: null,
    };
  }

  const documentNumber = `BULLETIN-${existing.request_number ?? input.exerciseRequestId.slice(0, 8)}`;

  const ctx = await loadContext(input.exerciseRequestId, documentNumber);
  if (!ctx) return { ok: false, error: 'load_exercise_document_context returned null' };

  let renderResult;
  try {
    renderResult = await renderPdfFromTemplate('SUBSCRIPTION_BULLETIN', ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'render failed';
    return { ok: false, error: `Render PDF échoué : ${msg}` };
  }

  const filename = `${documentNumber}-${Date.now()}.pdf`;
  const storagePath = `${existing.org_id}/exercises/${input.exerciseRequestId}/${filename}`;

  const { error: uploadErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, renderResult.buffer, {
      contentType: 'application/pdf',
      upsert: false,
    });
  if (uploadErr) {
    return { ok: false, error: `Upload Storage échoué : ${uploadErr.message}` };
  }

  const persistRes = await persistDocument({
    orgId: existing.org_id,
    exerciseRequestId: input.exerciseRequestId,
    templateCode: 'SUBSCRIPTION_BULLETIN',
    category: 'CERTIFICATE',
    documentNumber,
    storagePath,
    pdfHash: renderResult.hash,
    size: renderResult.size,
    fkColumn: 'bulletin_document_id',
  });
  if (!persistRes.ok) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
    return persistRes;
  }

  await logAuditEvent({
    eventType: 'exercise.bulletin_generated',
    resourceType: 'exercise_request',
    resourceId: input.exerciseRequestId,
    orgId: existing.org_id,
    metadata: {
      document_instance_id: persistRes.documentId,
      document_number: documentNumber,
      storage_path: storagePath,
      size_bytes: renderResult.size,
    },
  });

  return {
    ok: true,
    documentId: persistRes.documentId,
    alreadyExists: false,
    storagePath,
  };
}
