// ============================================================================
// Capiwise — Edge Function : notifications-consumer
//
// Trigger toutes les minutes par pg_cron (`notifications-consumer-tick`).
// Dépile les notifications PENDING EMAIL via la RPC `lock_pending_notifications`
// (FOR UPDATE SKIP LOCKED, batch 50), envoie via Resend API REST (fetch
// direct, pas de SDK), puis UPDATE status SENT/FAILED + resend_email_id.
//
// Pattern queue producer/consumer :
// - Module 5/6 hooks ou Server Action insertManualNotification → INSERT PENDING
// - Cette EF dépile et envoie. État intermédiaire SENDING garanti par la RPC.
//
// Auth : Bearer service_role (depuis vault.decrypted_secrets côté pg_cron).
// La EF est deployée avec verify_jwt=true et le cron passe le service_role.
//
// Erreur Resend :
// - 4xx (validation, mauvais email) → status='FAILED' permanent (pas retry).
//   retry_count est incrémenté pour traçabilité mais le filter
//   retry_count<5 dans la RPC sera atteint rapidement.
// - 5xx ou network → status='PENDING' + retry_count++. Sera repickup au
//   tick suivant. Max 5 retries avant l'arrêt définitif.
//
// Concurrency : Promise.allSettled sur chunks de 10 (anti-flood Resend API
// + anti-saturation EF).
//
// Déploiement :
//   supabase functions deploy notifications-consumer --linked
//
// Env vars (Supabase Functions secrets) :
//   - RESEND_API_KEY
//   - RESEND_FROM_EMAIL
//   - RESEND_FROM_NAME (optional, default 'Capiwise')
//   - RESEND_REPLY_TO  (optional, fallback = from)
//   - SUPABASE_URL                (auto)
//   - SUPABASE_SERVICE_ROLE_KEY   (auto)
// ============================================================================

// @ts-expect-error — Deno runtime types not available in Node tsc
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.104.1';

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response>): void;
};

type NotificationRow = {
  id: string;
  org_id: string | null;
  template_code: string | null;
  recipient_email: string | null;
  subject: string | null;
  body: string | null;
  retry_count: number;
};

type SendResult = {
  notificationId: string;
  ok: boolean;
  resendId?: string;
  errorMessage?: string;
  permanent?: boolean;
};

const CHUNK_SIZE = 10;
const RESEND_API_URL = 'https://api.resend.com/emails';

async function sendViaResend(args: {
  apiKey: string;
  from: string;
  replyTo: string | null;
  to: string;
  subject: string;
  html: string;
  tags: Array<{ name: string; value: string }>;
}): Promise<{ id?: string; status: number; errorMessage?: string }> {
  const body: Record<string, unknown> = {
    from: args.from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    tags: args.tags,
  };
  if (args.replyTo) body.reply_to = args.replyTo;

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const status = res.status;
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* ignore parse error */
  }

  if (status >= 200 && status < 300) {
    const data = json as { id?: string };
    return { id: data?.id, status };
  }
  const errMsg = ((json as { message?: string })?.message ?? `HTTP ${status}`) as string;
  return { status, errorMessage: errMsg };
}

function isPermanentResendError(status: number): boolean {
  // 4xx (sauf 408 Request Timeout, 425 Too Early, 429 Rate Limited) =
  // erreur permanente côté Resend (validation, bad recipient, etc.)
  if (status === 408 || status === 425 || status === 429) return false;
  return status >= 400 && status < 500;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const startTs = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL');
  const fromName = Deno.env.get('RESEND_FROM_NAME') ?? 'Capiwise';
  const replyTo = Deno.env.get('RESEND_REPLY_TO') ?? null;

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !fromEmail) {
    console.error('[notifications-consumer] Missing required env vars');
    return new Response(JSON.stringify({ ok: false, error: 'env vars missing' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const fromHeader = `${fromName} <${fromEmail}>`;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Lock batch via RPC
  const { data: locked, error: lockErr } = await supabase.rpc('lock_pending_notifications', {
    p_batch_size: 50,
  });
  if (lockErr) {
    console.error(`[notifications-consumer] lock_pending_notifications failed: ${lockErr.message}`);
    return new Response(JSON.stringify({ ok: false, error: lockErr.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const notifications = (locked ?? []) as NotificationRow[];
  console.log(`[notifications-consumer] Locked ${notifications.length} notifications`);

  if (notifications.length === 0) {
    return new Response(
      JSON.stringify({
        ok: true,
        processed: 0,
        succeeded: 0,
        failed: 0,
        duration_ms: Date.now() - startTs,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // 2. Process in chunks of CHUNK_SIZE
  const results: SendResult[] = [];
  for (let i = 0; i < notifications.length; i += CHUNK_SIZE) {
    const chunk = notifications.slice(i, i + CHUNK_SIZE);
    const chunkResults = await Promise.allSettled(
      chunk.map(async (notif): Promise<SendResult> => {
        if (!notif.recipient_email || !notif.subject || !notif.body) {
          return {
            notificationId: notif.id,
            ok: false,
            permanent: true,
            errorMessage: 'recipient_email/subject/body missing (race condition with rendering)',
          };
        }
        try {
          const resp = await sendViaResend({
            apiKey: resendApiKey,
            from: fromHeader,
            replyTo,
            to: notif.recipient_email,
            subject: notif.subject,
            html: notif.body,
            tags: [
              { name: 'template', value: notif.template_code ?? 'unknown' },
              ...(notif.org_id ? [{ name: 'org_id', value: notif.org_id }] : []),
            ],
          });
          if (resp.id) {
            return { notificationId: notif.id, ok: true, resendId: resp.id };
          }
          return {
            notificationId: notif.id,
            ok: false,
            permanent: isPermanentResendError(resp.status),
            errorMessage: resp.errorMessage ?? `HTTP ${resp.status}`,
          };
        } catch (err) {
          // Network / timeout = transient, retry au prochain tick
          const msg = err instanceof Error ? err.message : 'unknown network error';
          return { notificationId: notif.id, ok: false, permanent: false, errorMessage: msg };
        }
      }),
    );

    for (const r of chunkResults) {
      if (r.status === 'fulfilled') {
        results.push(r.value);
      } else {
        // Should not happen — we always resolve in the inner async fn.
        results.push({
          notificationId: 'unknown',
          ok: false,
          permanent: false,
          errorMessage: String(r.reason),
        });
      }
    }
  }

  // 3. UPDATE en DB selon le résultat de chaque send
  await Promise.allSettled(
    results.map(async (r) => {
      const notif = notifications.find((n) => n.id === r.notificationId);
      if (r.ok) {
        const { error } = await supabase
          .from('notifications')
          .update({
            status: 'SENT',
            sent_at: new Date().toISOString(),
            resend_email_id: r.resendId ?? null,
            resend_response: { id: r.resendId } as never,
            updated_at: new Date().toISOString(),
          })
          .eq('id', r.notificationId);
        if (error)
          console.error(`[consumer] update SENT ${r.notificationId} failed: ${error.message}`);
        else console.log(`[consumer] Sent ${r.notificationId} ok (resend_id=${r.resendId})`);
      } else if (r.permanent) {
        const { error } = await supabase
          .from('notifications')
          .update({
            status: 'FAILED',
            failed_at: new Date().toISOString(),
            failure_reason: r.errorMessage ?? 'unknown',
            retry_count: (notif?.retry_count ?? 0) + 1,
            resend_response: { error: r.errorMessage } as never,
            updated_at: new Date().toISOString(),
          })
          .eq('id', r.notificationId);
        if (error)
          console.error(`[consumer] update FAILED ${r.notificationId} failed: ${error.message}`);
        else console.log(`[consumer] Failed ${r.notificationId} permanent: ${r.errorMessage}`);
      } else {
        // Transient : remet PENDING + retry_count++
        const { error } = await supabase
          .from('notifications')
          .update({
            status: 'PENDING',
            retry_count: (notif?.retry_count ?? 0) + 1,
            failure_reason: r.errorMessage ?? 'transient',
            updated_at: new Date().toISOString(),
          })
          .eq('id', r.notificationId);
        if (error)
          console.error(
            `[consumer] update PENDING-retry ${r.notificationId} failed: ${error.message}`,
          );
        else
          console.log(
            `[consumer] Failed ${r.notificationId} transient (retry next tick): ${r.errorMessage}`,
          );
      }
    }),
  );

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;

  return new Response(
    JSON.stringify({
      ok: true,
      processed: results.length,
      succeeded,
      failed,
      duration_ms: Date.now() - startTs,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
