// ============================================================================
// Capiwise — Edge Function : yousign-webhook
//
// Reçoit les events Yousign V3 (signer_request.viewed/signed/declined +
// signature_request.completed) et met à jour la DB via les RPCs B1.
//
// Vérification HMAC SHA-256 sur le header `x-yousign-signature` (hex digest)
// avec timingSafeEqual pour éviter timing attacks.
//
// Sur signature_request.done : ack 200 immédiat puis processing en background
// via `EdgeRuntime.waitUntil()` (download PDF signé + audit trail depuis
// Yousign API, upload Storage {org}/awards/{signed,proofs}/..., RPCs
// complete_signature_request + transition_award_to_granted_after_signature).
// Pattern requis car Yousign V3 timeout webhook ≈ 5 s alors que le
// processing peut prendre 2-10 s (4 HTTP calls + 2 uploads).
//
// Idempotence : (a) pré-check `status === 'COMPLETED'` ack 200 sous 100 ms
// si Yousign retry, (b) RPCs côté DB ré-entrants (status checks early return).
//
// Déploiement :
//   supabase functions deploy yousign-webhook --no-verify-jwt
//   (pas de JWT auth — l'authenticité est garantie par HMAC)
//
// Variables d'env attendues (Supabase Functions secrets) :
//   - YOUSIGN_API_KEY            (pour download signed pdf + audit trail)
//   - YOUSIGN_API_BASE_URL
//   - YOUSIGN_WEBHOOK_SECRET     (pour vérifier HMAC)
//   - SUPABASE_URL               (auto)
//   - SUPABASE_SERVICE_ROLE_KEY  (auto)
// ============================================================================

// @ts-expect-error — Deno runtime types not available in Node tsc
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.104.1';

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response>): void;
};

// Supabase EF runtime expose `EdgeRuntime.waitUntil(promise)` pour exécuter
// du travail après l'envoi de la réponse HTTP — pattern requis pour les
// webhooks à temps de réponse strict (Yousign V3 ≈ 5 s).
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

type YousignWebhookEvent = {
  event_name: string;
  data: {
    signer?: {
      id: string;
      signed_at?: string;
      decline_reason?: string;
    };
    signature_request?: {
      id: string;
      documents?: Array<{ id: string }>;
    };
    metadata?: {
      ip_address?: string;
    };
  };
};

async function verifyHmac(body: string, signatureHex: string, secret: string): Promise<boolean> {
  if (!signatureHex || signatureHex.length === 0) return false;

  const keyData = new TextEncoder().encode(secret);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(body));
  const expectedHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Yousign envoie parfois "sha256=<hex>" — on tolère le préfixe
  const provided = signatureHex.startsWith('sha256=') ? signatureHex.slice(7) : signatureHex;

  return timingSafeEqual(provided, expectedHex);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const webhookSecret = Deno.env.get('YOUSIGN_WEBHOOK_SECRET');
  if (!webhookSecret) {
    console.error('[yousign-webhook] YOUSIGN_WEBHOOK_SECRET not configured');
    return new Response('Webhook secret not configured', { status: 500 });
  }

  const rawBody = await req.text();
  // Yousign V3 envoie le HMAC dans `X-Yousign-Signature-256` (sha256=<hex>).
  // On garde le fallback sur l'ancien `x-yousign-signature` pour compat.
  const signatureHeader =
    req.headers.get('x-yousign-signature-256') ??
    req.headers.get('X-Yousign-Signature-256') ??
    req.headers.get('x-yousign-signature') ??
    req.headers.get('X-Yousign-Signature') ??
    '';

  // Debug : log des headers Yousign si signature absente (utile pour diag config)
  if (!signatureHeader) {
    const yousignHeaders = Array.from(req.headers.entries())
      .filter(([k]) => k.toLowerCase().startsWith('x-yousign'))
      .map(([k, v]) => `${k}=${v.slice(0, 12)}…`)
      .join(', ');
    console.warn(
      `[yousign-webhook] No HMAC signature header found. Yousign headers: ${yousignHeaders || 'NONE'}`,
    );
  }

  const isValid = await verifyHmac(rawBody, signatureHeader, webhookSecret);
  if (!isValid) {
    console.warn(
      `[yousign-webhook] Invalid HMAC signature (header_len=${signatureHeader.length}, body_len=${rawBody.length})`,
    );
    return new Response('Invalid signature', { status: 401 });
  }

  let payload: YousignWebhookEvent;
  try {
    payload = JSON.parse(rawBody) as YousignWebhookEvent;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const eventName = payload.event_name;
  console.log(`[yousign-webhook] Received event: ${eventName}`);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    // Yousign V3 event names :
    //   signer.link_opened       (was: signer_request.viewed)
    //   signer.done              (was: signer_request.signed)
    //   signer.declined          (was: signer_request.declined)
    //   signature_request.done   (was: signature_request.completed)
    //   signer.notified, signature_request.activated, etc. → ignored
    if (eventName === 'signer.link_opened' || eventName === 'signer_request.viewed') {
      const signerId = payload.data.signer?.id;
      if (!signerId) return new Response('Missing signer.id', { status: 400 });
      const { error } = await supabase.rpc('update_signer_from_webhook', {
        p_yousign_signer_id: signerId,
        p_event_type: 'viewed',
        p_metadata: { ip_address: payload.data.metadata?.ip_address ?? null },
      });
      if (error) throw error;
    } else if (eventName === 'signer.done' || eventName === 'signer_request.signed') {
      const signerId = payload.data.signer?.id;
      if (!signerId) return new Response('Missing signer.id', { status: 400 });
      const { error } = await supabase.rpc('update_signer_from_webhook', {
        p_yousign_signer_id: signerId,
        p_event_type: 'signed',
        p_metadata: {
          signed_at: payload.data.signer?.signed_at ?? null,
          ip_address: payload.data.metadata?.ip_address ?? null,
          signature_method: 'SIMPLE_ELECTRONIC',
        },
      });
      if (error) throw error;
    } else if (eventName === 'signer.declined' || eventName === 'signer_request.declined') {
      const signerId = payload.data.signer?.id;
      if (!signerId) return new Response('Missing signer.id', { status: 400 });
      const { error } = await supabase.rpc('update_signer_from_webhook', {
        p_yousign_signer_id: signerId,
        p_event_type: 'declined',
        p_metadata: { reason: payload.data.signer?.decline_reason ?? null },
      });
      if (error) throw error;
    } else if (
      eventName === 'signature_request.done' ||
      eventName === 'signature_request.completed'
    ) {
      const sigRequestId = payload.data.signature_request?.id;
      if (!sigRequestId) return new Response('Missing signature_request.id', { status: 400 });

      // Pré-check rapide d'idempotence : si on lit déjà COMPLETED en DB
      // (Yousign retry après timeout, ou double envoi), on ack en < 100 ms.
      const { data: dbRequest, error: dbErr } = await supabase
        .from('signature_requests')
        .select('id, document_id, org_id, status')
        .eq('yousign_procedure_id', sigRequestId)
        .maybeSingle();

      if (dbErr || !dbRequest) {
        console.warn(`[yousign-webhook] Signature request ${sigRequestId} not found in DB`);
        return new Response('Signature request not found', { status: 404 });
      }

      if (dbRequest.status === 'COMPLETED') {
        console.log(`[yousign-webhook] Already completed, skipping (idempotent)`);
        return new Response(JSON.stringify({ ok: true, skipped: 'already_completed' }), {
          status: 200,
        });
      }

      // Pattern webhook : on déclenche le traitement lourd en background
      // (download PDF + audit trail + 2 uploads Storage + 2 RPCs ≈ 2-10 s)
      // pour ack 200 sous 5 s — au-delà, Yousign timeout et retry, ce qui
      // produit des doublons côté Storage et des "400 timeout" côté Dashboard.
      const requestSnapshot = {
        id: dbRequest.id,
        document_id: dbRequest.document_id,
        org_id: dbRequest.org_id,
      };
      const payloadDocumentId = payload.data.signature_request?.documents?.[0]?.id ?? null;

      const processCompletion = async () => {
        try {
          const yousignBase = Deno.env.get('YOUSIGN_API_BASE_URL') ?? '';
          const yousignKey = Deno.env.get('YOUSIGN_API_KEY') ?? '';

          // Yousign V3 webhook payload n'inclut PAS signature_request.documents.
          // Fetch via API en fallback.
          let documentId = payloadDocumentId;
          if (!documentId) {
            const docsRes = await fetch(
              `${yousignBase}/signature_requests/${sigRequestId}/documents`,
              { headers: { Authorization: `Bearer ${yousignKey}` } },
            );
            if (!docsRes.ok) {
              throw new Error(`Yousign list documents failed: ${docsRes.status}`);
            }
            const docsJson = (await docsRes.json()) as
              | Array<{ id: string }>
              | { data?: Array<{ id: string }> };
            const docs = Array.isArray(docsJson) ? docsJson : (docsJson.data ?? []);
            documentId = docs[0]?.id ?? null;
          }
          if (!documentId) {
            console.error(`[yousign-webhook][bg] No documents for sig req ${sigRequestId}`);
            return;
          }

          const signedRes = await fetch(
            `${yousignBase}/signature_requests/${sigRequestId}/documents/${documentId}/download`,
            { headers: { Authorization: `Bearer ${yousignKey}` } },
          );
          if (!signedRes.ok) {
            throw new Error(`Yousign download signed PDF failed: ${signedRes.status}`);
          }
          const signedPdfBuffer = new Uint8Array(await signedRes.arrayBuffer());

          const auditRes = await fetch(
            `${yousignBase}/signature_requests/${sigRequestId}/audit_trails/download`,
            { headers: { Authorization: `Bearer ${yousignKey}` } },
          );
          if (!auditRes.ok) {
            throw new Error(`Yousign download audit trail failed: ${auditRes.status}`);
          }
          const auditTrailBuffer = new Uint8Array(await auditRes.arrayBuffer());

          const signedPath = `${requestSnapshot.org_id}/awards/signed/${requestSnapshot.document_id}.pdf`;
          const proofPath = `${requestSnapshot.org_id}/awards/proofs/${requestSnapshot.document_id}_proof.pdf`;

          const { error: upSignedErr } = await supabase.storage
            .from('documents')
            .upload(signedPath, signedPdfBuffer, {
              contentType: 'application/pdf',
              upsert: true,
            });
          if (upSignedErr) throw upSignedErr;

          const { error: upProofErr } = await supabase.storage
            .from('documents')
            .upload(proofPath, auditTrailBuffer, {
              contentType: 'application/pdf',
              upsert: true,
            });
          if (upProofErr) throw upProofErr;

          const { data: awardId, error: completeErr } = await supabase.rpc(
            'complete_signature_request',
            {
              p_request_id: requestSnapshot.id,
              p_signed_pdf_storage_path: signedPath,
              p_proof_certificate_url: proofPath,
            },
          );
          if (completeErr) throw completeErr;

          if (awardId) {
            const { error: transErr } = await supabase.rpc(
              'transition_award_to_granted_after_signature',
              {
                p_award_id: awardId,
                p_signature_request_id: requestSnapshot.id,
              },
            );
            if (transErr) {
              console.error(`[yousign-webhook][bg] Award transition failed: ${transErr.message}`);
            }
          }
          console.log(`[yousign-webhook][bg] Completion done for ${sigRequestId}`);
        } catch (bgErr) {
          const msg = bgErr instanceof Error ? bgErr.message : 'unknown';
          console.error(`[yousign-webhook][bg] Failed for ${sigRequestId}: ${msg}`);
        }
      };

      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
        EdgeRuntime.waitUntil(processCompletion());
      } else {
        // Local dev fallback (deno run) — pas d'EdgeRuntime → process inline.
        await processCompletion();
      }

      return new Response(JSON.stringify({ ok: true, processing: 'background' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    } else {
      // Event ignoré (mais 200 pour que Yousign ne retente pas)
      console.log(`[yousign-webhook] Event ${eventName} ignored`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    console.error(`[yousign-webhook] Error processing ${eventName}: ${message}`);
    return new Response(JSON.stringify({ error: message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
