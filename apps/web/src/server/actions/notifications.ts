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

// ---------------------------------------------------------------------------
// 5. triggerNotificationConsumer — bypass cron pour les tests (sandbox)
// ---------------------------------------------------------------------------

type ConsumerResponse = {
  ok: boolean;
  processed?: number;
  succeeded?: number;
  failed?: number;
  duration_ms?: number;
  error?: string;
};

/**
 * Bypass le cron 1-min : invoke directement l'EF notifications-consumer
 * via le client admin (service_role). Utilisé par la sandbox /dev pour
 * tester le flow sans attendre.
 *
 * Permission `notifications.send` requise (admin only).
 */
export async function triggerNotificationConsumer(): Promise<
  ActionOk<{ result: ConsumerResponse }> | ActionError
> {
  const user = await requirePermission('notifications.send');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.functions.invoke<ConsumerResponse>('notifications-consumer', {
    body: { trigger: 'manual', triggered_by: user.id },
  });

  if (error) {
    return { ok: false, error: `EF invoke failed: ${error.message}` };
  }
  if (!data) {
    return { ok: false, error: 'EF returned no body' };
  }

  return { ok: true, result: data };
}

// ---------------------------------------------------------------------------
// 6. notifyApproversOfPendingApproval — Module 7 B5 hook
// ---------------------------------------------------------------------------

/**
 * Pour chaque APPROVER PENDING d'une approval_request, INSERT une notif
 * EMAIL `approval_pending` PENDING. Le consumer EF (B3) va dépiler et
 * envoyer via Resend.
 *
 * Le RPC Module 5 `start_approval_workflow` insère déjà des notifs IN_APP
 * mais sans subject/body filled (filter consumer EMAIL strict). Ce hook
 * complète avec des notifs EMAIL prêtes à envoyer.
 *
 * Pas de requirePermission : appelé depuis transitionAward(*, 'PROPOSED')
 * dans un context déjà authentifié + autorisé.
 *
 * Fire-and-forget côté caller — toute erreur audit-loggée mais ne bloque
 * pas la transition de l'award.
 */
export async function notifyApproversOfPendingApproval(input: {
  requestId: string;
  awardId: string;
  appUrl: string;
}): Promise<ActionOk<{ created: number }> | ActionError> {
  const admin = getSupabaseAdminClient();

  // Charge l'award + plan + creator pour les variables du template
  const { data: award, error: awardErr } = await admin
    .from('awards')
    .select('id, award_number, units_granted, org_id, plan_id, created_by')
    .eq('id', input.awardId)
    .maybeSingle();

  if (awardErr || !award) {
    return { ok: false, error: awardErr?.message ?? 'Award introuvable' };
  }

  const [planRes, creatorRes, decisionsRes] = await Promise.all([
    admin.from('plans').select('plan_type').eq('id', award.plan_id).maybeSingle(),
    award.created_by
      ? admin.from('user_profiles').select('id, full_name').eq('id', award.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from('approval_decisions')
      .select('approver_user_id')
      .eq('request_id', input.requestId)
      .eq('status', 'PENDING'),
  ]);

  const planType = planRes.data?.plan_type ?? 'Plan';
  const creatorName = creatorRes.data?.full_name ?? 'Un administrateur';
  const approverIds = (decisionsRes.data ?? [])
    .map((d) => d.approver_user_id)
    .filter((x): x is string => !!x);

  if (approverIds.length === 0) {
    return { ok: true, created: 0 };
  }

  // Resolve emails des approvers via auth.users (service_role)
  const approvers: Array<{ id: string; email: string; fullName: string | null }> = [];
  for (const userId of approverIds) {
    const { data: u } = await admin.auth.admin.getUserById(userId);
    if (u?.user?.email) {
      approvers.push({
        id: userId,
        email: u.user.email,
        fullName: (u.user.user_metadata as { full_name?: string } | null)?.full_name ?? null,
      });
    }
  }

  // Insert 1 notif PENDING par approver
  let created = 0;
  for (const approver of approvers) {
    const res = await insertNotificationWithRender({
      orgId: award.org_id,
      templateCode: 'approval_pending',
      channel: 'EMAIL',
      recipientEmail: approver.email,
      userId: approver.id,
      relatedEntityType: 'approval_request',
      relatedEntityId: input.requestId,
      variables: {
        recipientName: approver.fullName ?? 'Approbateur',
        awardNumber: award.award_number ?? award.id.slice(0, 8),
        awardUnits: Number(award.units_granted ?? 0),
        awardPlanType: planType,
        creatorName,
        appUrl: input.appUrl,
        approvalUrl: `${input.appUrl}/dashboard/approvals/${input.requestId}`,
      },
    });
    if (res.ok) created += 1;
    else {
      console.error(
        `[notifyApproversOfPendingApproval] insert failed for ${approver.email}: ${res.error}`,
      );
    }
  }

  return { ok: true, created };
}

// ---------------------------------------------------------------------------
// 7. notifyCreatorOfApprovalDecision — Module 7 B5 hook
// ---------------------------------------------------------------------------

/**
 * Quand un workflow d'approbation est résolu (APPROVED ou REJECTED final),
 * notifier le creator de l'award via email approval_approved ou
 * approval_rejected.
 *
 * Pas de requirePermission : appelé depuis recordDecisionInternal après
 * la résolution du workflow.
 */
export async function notifyCreatorOfApprovalDecision(input: {
  awardId: string;
  decision: 'APPROVED' | 'REJECTED';
  approverUserId: string;
  reason: string | null;
  appUrl: string;
}): Promise<ActionOk<{ notificationId: string | null }> | ActionError> {
  const admin = getSupabaseAdminClient();

  const { data: award, error: awardErr } = await admin
    .from('awards')
    .select('id, award_number, org_id, created_by')
    .eq('id', input.awardId)
    .maybeSingle();

  if (awardErr || !award || !award.created_by) {
    return { ok: true, notificationId: null }; // pas de creator → skip silently
  }

  const [creatorRes, approverRes] = await Promise.all([
    admin.auth.admin.getUserById(award.created_by),
    admin.auth.admin.getUserById(input.approverUserId),
  ]);

  const creatorEmail = creatorRes.data?.user?.email;
  const creatorName =
    (creatorRes.data?.user?.user_metadata as { full_name?: string } | null)?.full_name ??
    'Créateur';
  const approverName =
    (approverRes.data?.user?.user_metadata as { full_name?: string } | null)?.full_name ??
    approverRes.data?.user?.email ??
    'Approbateur';

  if (!creatorEmail) {
    return { ok: true, notificationId: null };
  }

  const templateCode = input.decision === 'APPROVED' ? 'approval_approved' : 'approval_rejected';
  const variables: Record<string, unknown> = {
    recipientName: creatorName,
    awardNumber: award.award_number ?? award.id.slice(0, 8),
    approverName,
    appUrl: input.appUrl,
    awardUrl: `${input.appUrl}/dashboard/awards/${input.awardId}`,
  };
  if (input.decision === 'REJECTED') {
    variables.reason = input.reason ?? 'Aucune raison fournie';
  }

  const res = await insertNotificationWithRender({
    orgId: award.org_id,
    templateCode,
    channel: 'EMAIL',
    recipientEmail: creatorEmail,
    userId: award.created_by,
    relatedEntityType: 'award',
    relatedEntityId: input.awardId,
    variables,
  });

  if (!res.ok) {
    return { ok: false, error: res.error };
  }
  return { ok: true, notificationId: res.notificationId };
}

// ---------------------------------------------------------------------------
// 8. renderPendingNotificationsBatch — fill orphan PENDING en lot
// ---------------------------------------------------------------------------

/**
 * Pour les notifs PENDING insérées sans subject/body (ex: Module 5 RPC
 * IN_APP qui ne peuvent pas render React), fill subject/body via
 * renderAndFillNotification. Limité à `batchSize` rows par appel.
 *
 * Ciblé via la sandbox /dev/notifications + admin panel.
 */
export async function renderPendingNotificationsBatch(input: {
  batchSize?: number;
}): Promise<ActionOk<{ filled: number; failed: number }> | ActionError> {
  const user = await requirePermission('notifications.send');
  if (!user.activeOrgId) return { ok: false, error: 'Organisation active manquante' };

  const limit = Math.min(input.batchSize ?? 20, 100);
  const admin = getSupabaseAdminClient();
  const { data: orphans, error } = await admin
    .from('notifications')
    .select('id')
    .eq('org_id', user.activeOrgId)
    .eq('status', 'PENDING')
    .is('subject', null)
    .limit(limit);

  if (error) return { ok: false, error: error.message };

  let filled = 0;
  let failed = 0;
  for (const notif of orphans ?? []) {
    const res = await renderAndFillNotification({ notificationId: notif.id });
    if (res.ok) filled += 1;
    else failed += 1;
  }
  return { ok: true, filled, failed };
}
