// ============================================================================
// Capiwise — Edge Function : resend-webhook
//
// Reçoit les événements de delivery de Resend (svix) et met à jour la table
// `notifications` (status, delivered_at, failure_reason).
//
// Vérification de signature : Svix HMAC-SHA256 (cf. https://docs.svix.com/
// receiving/verifying-payloads/how-manual). On contrôle 3 headers :
//   - svix-id        unique message id
//   - svix-timestamp epoch seconds (rejeté si > 5 min de skew)
//   - svix-signature liste de signatures versionnées (v1,XXXXX v1,YYYYY)
//
// Déploiement : `supabase functions deploy resend-webhook --no-verify-jwt`
// (le webhook arrive en anon — on contrôle l'authenticité via la signature).
//
// Variables d'env attendues (Supabase Functions secrets) :
//   - RESEND_WEBHOOK_SECRET  (commence par `whsec_`)
//   - SUPABASE_URL           (auto-injecté par le runtime)
//   - SUPABASE_SERVICE_ROLE_KEY (auto-injecté)
// ============================================================================

// @ts-expect-error — Deno runtime types not available in Node tsc
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.104.1';

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response>): void;
};

const TOLERANCE_SECONDS = 5 * 60;

type ResendEvent = {
  type: string;
  data: {
    email_id?: string;
    bounce?: { reason?: string };
    [key: string]: unknown;
  };
  created_at?: string;
};

async function verifySvixSignature(
  body: string,
  headers: Headers,
  secret: string,
): Promise<boolean> {
  const svixId = headers.get('svix-id');
  const svixTimestamp = headers.get('svix-timestamp');
  const svixSignature = headers.get('svix-signature');

  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const ts = parseInt(svixTimestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > TOLERANCE_SECONDS) return false;

  // Le secret arrive en base "whsec_BASE64KEY" — on extrait la partie base64
  const secretKey = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const keyBytes = Uint8Array.from(atob(secretKey), (c) => c.charCodeAt(0));

  const signedContent = `${svixId}.${svixTimestamp}.${body}`;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuffer = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    new TextEncoder().encode(signedContent),
  );
  const expected = btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));

  // svix-signature = "v1,xxx v1,yyy" — chaque entrée est "version,base64sig"
  const candidates = svixSignature
    .split(' ')
    .map((s) => s.split(',', 2))
    .filter(([v]) => v === 'v1')
    .map(([, sig]) => sig);

  return candidates.some((sig) => timingSafeEqual(sig, expected));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET');
  if (!secret) {
    return new Response('Webhook secret not configured', { status: 500 });
  }

  const rawBody = await req.text();
  const isValid = await verifySvixSignature(rawBody, req.headers, secret);
  if (!isValid) {
    return new Response('Invalid signature', { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(rawBody) as ResendEvent;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const messageId = event.data?.email_id;
  if (!messageId) {
    return new Response('OK (no email_id)', { status: 200 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = {
    provider_response: event.data,
  };

  switch (event.type) {
    case 'email.sent':
      update.status = 'SENT';
      update.sent_at = nowIso;
      break;
    case 'email.delivered':
      update.status = 'DELIVERED';
      update.delivered_at = nowIso;
      break;
    case 'email.bounced':
    case 'email.delivery_delayed':
      update.status = 'BOUNCED';
      update.failed_at = nowIso;
      update.failure_reason = event.data?.bounce?.reason ?? event.type;
      break;
    case 'email.complained':
    case 'email.failed':
      update.status = 'FAILED';
      update.failed_at = nowIso;
      update.failure_reason = event.type;
      break;
    case 'email.opened':
    case 'email.clicked':
      // Trackés mais ne changent pas le status fonctionnel
      update.provider_response = event.data;
      break;
    default:
      // Event inconnu — on stocke la trace mais on ne touche pas le status
      update.provider_response = event.data;
  }

  const { error } = await supabase
    .from('notifications')
    .update(update)
    .eq('provider_message_id', messageId);

  if (error) {
    console.error('[resend-webhook] update failed', error);
    return new Response('DB update failed', { status: 500 });
  }

  return new Response('OK', { status: 200 });
});
