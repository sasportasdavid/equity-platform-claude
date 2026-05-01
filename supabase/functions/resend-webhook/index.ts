// ============================================================================
// Capiwise — Edge Function : resend-webhook (Module 7 B4)
//
// Reçoit les events Resend (email.delivered/bounced/complained/failed/...)
// et met à jour `notifications` selon le mapping de la spec §6.1.
//
// Pattern v6 (Module 6 yousign-webhook db00559) :
//  - Vérification HMAC svix au début (lib svix)
//  - Pré-check idempotence (SELECT status WHERE resend_email_id|provider_message_id)
//  - Ack 200 immédiat sous 100 ms
//  - UPDATE en background via EdgeRuntime.waitUntil(promise)
//
// Resend webhook timeout est strict (~5-10 s). Le pré-check + ack 200
// garantit qu'on n'atteint jamais le timeout. Les UPDATEs sont rapides
// — le background reste cohérent avec yousign-webhook v6.
//
// Lookup notifications : on essaie d'abord `resend_email_id` (Module 7 B3
// queue pattern) puis fallback `provider_message_id` (Module 2 immediate
// send pattern). Garantit backwards compat avec sendEmail<K> Module 2.
//
// Auth : svix-signature (pas de JWT). Déployée avec verify_jwt=false —
// l'authenticité est garantie par HMAC svix.
//
// Variables env (Supabase Functions secrets) :
//   - RESEND_WEBHOOK_SECRET   (whsec_xxx fourni par Resend Dashboard)
//   - SUPABASE_URL            (auto)
//   - SUPABASE_SERVICE_ROLE_KEY (auto)
//
// Configuration Resend Dashboard (à faire APRÈS deploy) :
//   1. Resend Dashboard → Webhooks → Add Endpoint
//   2. URL : https://ytlfnxcrclugrsbvqdkb.supabase.co/functions/v1/resend-webhook
//   3. Events : email.delivered, email.bounced, email.complained, email.failed
//      (V2 : email.opened, email.clicked, email.delivery_delayed)
//   4. Save → copy le signing secret (whsec_xxx)
//   5. supabase secrets set --project-ref ytlfnxcrclugrsbvqdkb \
//        RESEND_WEBHOOK_SECRET=whsec_xxx
//   6. (optional) re-deploy EF pour picker la nouvelle env var
// ============================================================================

// @ts-expect-error — Deno runtime types not available in Node tsc
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.104.1';
// @ts-expect-error — Deno runtime types not available in Node tsc
import { Webhook } from 'https://esm.sh/svix@1.45.1';

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response>): void;
};

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

type ResendWebhookPayload = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    created_at?: string;
    bounce?: { message?: string; subType?: string };
    failed?: { reason?: string };
    tags?: Record<string, string> | Array<{ name: string; value: string }>;
  };
};

type NotificationUpdate = {
  status?: 'DELIVERED' | 'BOUNCED' | 'COMPLAINED' | 'FAILED';
  delivered_at?: string;
  failed_at?: string;
  failure_reason?: string;
};

type ClassifyResult =
  | { kind: 'apply'; updates: NotificationUpdate }
  | { kind: 'ignore'; reason: string };

// NOTE : duplicaté de packages/shared/src/notifications/resend-event-classifier.ts
// pour que la EF Deno reste 100% standalone (pas d'import workspace côté Deno).
// La version shared/ est la source de vérité testée — tenir les 2 en sync.
function classifyResendEvent(
  eventType: string,
  eventData: ResendWebhookPayload['data'] | null | undefined,
): ClassifyResult {
  switch (eventType) {
    case 'email.delivered':
      return {
        kind: 'apply',
        updates: {
          status: 'DELIVERED',
          delivered_at: eventData?.created_at ?? new Date().toISOString(),
        },
      };
    case 'email.bounced':
      return {
        kind: 'apply',
        updates: {
          status: 'BOUNCED',
          failed_at: new Date().toISOString(),
          failure_reason: `Bounced: ${eventData?.bounce?.message ?? 'unknown bounce reason'}`,
        },
      };
    case 'email.complained':
      return {
        kind: 'apply',
        updates: {
          status: 'COMPLAINED',
          failed_at: new Date().toISOString(),
          failure_reason: 'Spam complaint received from recipient',
        },
      };
    case 'email.failed':
      return {
        kind: 'apply',
        updates: {
          status: 'FAILED',
          failed_at: new Date().toISOString(),
          failure_reason: `Resend failed: ${eventData?.failed?.reason ?? 'unknown'}`,
        },
      };
    case 'email.delivery_delayed':
      return { kind: 'ignore', reason: 'transient delay (waiting final event)' };
    case 'email.opened':
    case 'email.clicked':
    case 'email.sent':
      return { kind: 'ignore', reason: 'V2 analytics (not tracked V1)' };
    default:
      return { kind: 'ignore', reason: `unknown event type: ${eventType}` };
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET');
  if (!webhookSecret) {
    console.error('[resend-webhook] RESEND_WEBHOOK_SECRET not configured');
    return new Response('Webhook secret not configured', { status: 500 });
  }

  const rawBody = await req.text();
  const headers = Object.fromEntries(req.headers.entries());

  // 1. Verify svix HMAC
  let payload: ResendWebhookPayload;
  try {
    const wh = new Webhook(webhookSecret);
    payload = wh.verify(rawBody, headers) as ResendWebhookPayload;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.warn(`[resend-webhook] svix verification failed: ${msg}`);
    return new Response('Invalid signature', { status: 401 });
  }

  const eventType = payload.type;
  const emailId = payload.data?.email_id;
  console.log(`[resend-webhook] Received ${eventType} for email_id=${emailId ?? 'NONE'}`);

  if (!emailId) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no email_id' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Classify event → updates ou ignore
  const classification = classifyResendEvent(eventType, payload.data);
  if (classification.kind === 'ignore') {
    console.log(`[resend-webhook] Ignoring event: ${classification.reason}`);
    return new Response(
      JSON.stringify({ ok: true, ignored: true, reason: classification.reason }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 3. Lookup notification (resend_email_id en priorité, fallback provider_message_id)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: notif, error: lookupErr } = await supabase
    .from('notifications')
    .select('id, status')
    .or(`resend_email_id.eq.${emailId},provider_message_id.eq.${emailId}`)
    .maybeSingle();

  if (lookupErr) {
    console.error(`[resend-webhook] DB lookup failed: ${lookupErr.message}`);
    return new Response(JSON.stringify({ ok: false, error: lookupErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!notif) {
    console.warn(`[resend-webhook] Notification not found for resend_email_id ${emailId}`);
    return new Response(JSON.stringify({ ok: true, skipped: 'notification_not_found' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Idempotence : si déjà à l'état cible, ack sans rien faire
  if (notif.status === classification.updates.status) {
    console.log(`[resend-webhook] Already ${notif.status}, idempotent skip`);
    return new Response(JSON.stringify({ ok: true, skipped: 'already_in_target_status' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 4. Ack 200 immédiat + UPDATE background (pattern v6)
  const notificationId = notif.id;
  const updates = classification.updates;
  const tags = payload.data?.tags ?? null;

  const processUpdate = async () => {
    try {
      const patch: Record<string, unknown> = {
        ...updates,
        updated_at: new Date().toISOString(),
        // On garde la dernière payload Resend pour debug/audit
        resend_response: { event: eventType, tags, ...updates } as never,
      };
      const { error: updErr } = await supabase
        .from('notifications')
        .update(patch)
        .eq('id', notificationId);
      if (updErr) {
        console.error(`[resend-webhook][bg] update ${notificationId} failed: ${updErr.message}`);
        return;
      }
      console.log(
        `[resend-webhook][bg] Updated ${notificationId} → status=${updates.status} (event=${eventType})`,
      );
    } catch (bgErr) {
      const msg = bgErr instanceof Error ? bgErr.message : 'unknown';
      console.error(`[resend-webhook][bg] Failed for ${notificationId}: ${msg}`);
    }
  };

  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    EdgeRuntime.waitUntil(processUpdate());
  } else {
    // Local dev fallback (deno run sans EdgeRuntime) — process inline
    await processUpdate();
  }

  return new Response(JSON.stringify({ ok: true, processing: 'background', event: eventType }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
