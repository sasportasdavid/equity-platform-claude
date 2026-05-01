'use server';

import { z } from 'zod';
import {
  cancelPendingNotificationSchema,
  insertManualNotificationSchema,
  insertNotificationWithRenderSchema,
  renderAndFillNotificationSchema,
  type Module7TemplateCode,
} from '@equity/shared';
import { logAuditEvent } from '@/lib/audit';
import { requirePermission } from '@/lib/auth/rbac';
import { renderEmailTemplate } from '@/lib/resend/render';
import type { TemplateMap } from '@/lib/resend/templates';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Module 7 B2 — Server Actions notifications (queue pattern).
 *
 * Pattern : on INSERT en `PENDING` avec subject + body déjà rendered.
 * Le consumer EF (B3) dépile via `lock_pending_notifications` RPC et
 * appelle Resend `client.emails.send(...)` directement (sans re-render).
 *
 * 4 actions :
 *  1. insertNotificationWithRender   — interne (Module 5/6 hooks)
 *  2. renderAndFillNotification      — re-render notif déjà insérée vide
 *  3. insertManualNotification       — admin panel exposé (perm check)
 *  4. cancelPendingNotification      — admin annule notif PENDING
 *
 * IMPORTANT : `insertNotificationWithRender` ne fait PAS de
 * `requirePermission` — appelée depuis SECURITY DEFINER context (Module 5
 * hook RPC ou hook Module 6 post-signature). La variante exposée
 * `insertManualNotification` ajoute la perm check.
 */

// ---------------------------------------------------------------------------
// Result helpers
// ---------------------------------------------------------------------------
type ActionOk<T> = { ok: true } & T;
type ActionError = { ok: false; error: string; validationIssues?: number };
type ActionVoid = { ok: true } | ActionError;

function validationError(err: z.ZodError): ActionError {
  return {
    ok: false,
    error: `Validation échouée : ${err.issues.length} erreur(s)`,
    validationIssues: err.issues.length,
  };
}

// ---------------------------------------------------------------------------
// 1. insertNotificationWithRender (internal — pas de perm check)
// ---------------------------------------------------------------------------

export async function insertNotificationWithRender(
  input: unknown,
): Promise<ActionOk<{ notificationId: string }> | ActionError> {
  const parsed = insertNotificationWithRenderSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const data = parsed.data;

  // Render template → subject + html + text
  let rendered;
  try {
    // Cast variables → TemplateMap[code]. Le schéma ne valide pas la
    // shape des variables (z.record(unknown)) — la responsabilité de
    // matcher le contrat du composant React est sur le caller.
    rendered = await renderEmailTemplate(
      data.templateCode,
      data.variables as TemplateMap[Module7TemplateCode],
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'render failed';
    return { ok: false, error: `Render template échoué : ${msg}` };
  }

  // INSERT via service_role (bypass RLS — on est dans un context interne)
  const admin = getSupabaseAdminClient();
  const { data: row, error } = await admin
    .from('notifications')
    .insert({
      org_id: data.orgId,
      user_id: data.userId ?? null,
      beneficiary_id: data.beneficiaryId ?? null,
      template_code: data.templateCode,
      channel: data.channel,
      recipient_email: data.recipientEmail ?? null,
      subject: rendered.subject,
      body: rendered.html,
      variables_used: data.variables as never,
      status: 'PENDING',
      provider: 'RESEND',
      related_entity_type: data.relatedEntityType ?? null,
      related_entity_id: data.relatedEntityId ?? null,
    })
    .select('id')
    .single();

  if (error || !row) {
    return { ok: false, error: error?.message ?? 'Insert notification échoué' };
  }
  return { ok: true, notificationId: row.id };
}

// ---------------------------------------------------------------------------
// 2. renderAndFillNotification — re-render notif déjà inserted vide
// ---------------------------------------------------------------------------

export async function renderAndFillNotification(input: unknown): Promise<ActionVoid> {
  const parsed = renderAndFillNotificationSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { notificationId } = parsed.data;

  const admin = getSupabaseAdminClient();
  const { data: notif, error: notifErr } = await admin
    .from('notifications')
    .select('id, template_code, channel, status, variables_used')
    .eq('id', notificationId)
    .maybeSingle();

  if (notifErr || !notif) {
    return { ok: false, error: notifErr?.message ?? 'Notification introuvable' };
  }
  if (notif.status !== 'PENDING') {
    return { ok: false, error: `Notification statut=${notif.status} (attendu: PENDING)` };
  }
  if (!notif.template_code) {
    return { ok: false, error: 'template_code manquant sur la notification' };
  }

  let rendered;
  try {
    rendered = await renderEmailTemplate(
      notif.template_code as Module7TemplateCode,
      (notif.variables_used ?? {}) as TemplateMap[Module7TemplateCode],
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'render failed';
    return { ok: false, error: `Render template échoué : ${msg}` };
  }

  const { error: updErr } = await admin
    .from('notifications')
    .update({
      subject: rendered.subject,
      body: rendered.html,
      updated_at: new Date().toISOString(),
    })
    .eq('id', notificationId);

  if (updErr) return { ok: false, error: updErr.message };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 3. insertManualNotification — admin exposed Server Action
// ---------------------------------------------------------------------------

export async function insertManualNotification(
  input: unknown,
): Promise<ActionOk<{ notificationId: string }> | ActionError> {
  const parsed = insertManualNotificationSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  const user = await requirePermission('notifications.send');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };
  if (parsed.data.orgId !== user.activeOrgId) {
    return { ok: false, error: 'orgId mismatch avec org active' };
  }

  const result = await insertNotificationWithRender(parsed.data);
  if (!result.ok) return result;

  await logAuditEvent({
    eventType: 'notification.manual_created',
    resourceType: 'NOTIFICATION',
    resourceId: result.notificationId,
    metadata: {
      template_code: parsed.data.templateCode,
      channel: parsed.data.channel,
      recipient_email: parsed.data.recipientEmail,
    },
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  return result;
}

// ---------------------------------------------------------------------------
// 4. cancelPendingNotification — admin annule
// ---------------------------------------------------------------------------

export async function cancelPendingNotification(input: unknown): Promise<ActionVoid> {
  const parsed = cancelPendingNotificationSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  const { notificationId } = parsed.data;

  const user = await requirePermission('notifications.cancel');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const admin = getSupabaseAdminClient();
  const { data: notif } = await admin
    .from('notifications')
    .select('id, status, org_id')
    .eq('id', notificationId)
    .maybeSingle();

  if (!notif) return { ok: false, error: 'Notification introuvable' };
  if (notif.org_id !== user.activeOrgId) {
    return { ok: false, error: 'Notification appartient à une autre org' };
  }
  if (notif.status !== 'PENDING') {
    return { ok: false, error: `Notification statut=${notif.status}, seul PENDING annulable` };
  }

  const { error: updErr } = await admin
    .from('notifications')
    .update({
      status: 'FAILED',
      failed_at: new Date().toISOString(),
      failure_reason: 'Annulée manuellement par admin',
      updated_at: new Date().toISOString(),
    })
    .eq('id', notificationId);

  if (updErr) return { ok: false, error: updErr.message };

  await logAuditEvent({
    eventType: 'notification.cancelled',
    resourceType: 'NOTIFICATION',
    resourceId: notificationId,
    userId: user.id,
    userEmail: user.email,
    orgId: user.activeOrgId,
  });

  return { ok: true };
}
