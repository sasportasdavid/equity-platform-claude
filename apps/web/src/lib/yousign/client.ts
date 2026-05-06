/**
 * Module 6 B3 — Wrapper Yousign API V3.
 *
 * Spec : docs/MODULE_06_DOCUMENT_ENGINE.md §5.3.
 *
 * Toutes les fonctions partagent le helper `yousignFetch` qui injecte
 * l'auth Bearer + Content-Type JSON et lance une erreur verbeuse en cas de
 * !response.ok. Pour les uploads multipart on bypass `yousignFetch` et on
 * fetch directement (sinon Content-Type JSON casse le multipart boundary).
 *
 * Toutes les fonctions sont serverside-only — `process.env` est lu à
 * l'invocation (pas en module-load) pour permettre les tests Vitest qui
 * stubent `process.env` avec `vi.stubEnv`.
 */

type YousignSignatureLevel = 'electronic_signature';
type YousignAuthMode = 'otp_email' | 'otp_sms' | 'no_otp';
type YousignDeliveryMode = 'email';

export type YousignField = {
  document_id: string;
  type: 'signature';
  page: number;
  x: number;
  y: number;
};

export type YousignAddSignerInput = {
  info: {
    first_name: string;
    last_name: string;
    email: string;
    phone_number?: string;
    locale?: string;
  };
  signature_level: YousignSignatureLevel;
  signature_authentication_mode: YousignAuthMode;
  fields?: YousignField[];
};

export type YousignSignatureRequest = {
  id: string;
  status: string;
};

export type YousignSigner = {
  id: string;
  signature_link: string;
};

export type YousignDocument = {
  id: string;
};

/**
 * Bug #4 fix sprint 6 mai 2026 PM — normaliser l'URL base Yousign.
 *
 * Yousign V3 attend `/vN` dans le path (ex: `/v3/signature_requests`). En
 * Vercel prod, `YOUSIGN_API_BASE_URL` était configuré à
 * `https://api-sandbox.yousign.app` (sans `/v3`) → tous les calls retournaient
 * 404 "no Route matched".
 *
 * Plutôt que d'imposer la bonne config (fragile au moindre re-deploy), on
 * normalise côté code :
 *   - strip trailing slash
 *   - si pas de `/vN` détecté en fin → append `/v3` (default V3) + warn
 *   - si `/vN` présent → on garde tel quel (forward-compat /v4, etc.)
 *
 * Le warn aide l'opérateur à fixer la config Vercel pour propreté, mais le
 * système fonctionne quand même.
 */
function yousignBaseUrl(): string {
  const raw = process.env.YOUSIGN_API_BASE_URL;
  if (!raw) throw new Error('YOUSIGN_API_BASE_URL manquant');
  const stripped = raw.replace(/\/+$/, '');
  if (/\/v\d+$/.test(stripped)) return stripped;
  console.warn(
    `[yousign] YOUSIGN_API_BASE_URL "${stripped}" ne contient pas de /vN — fallback /v3 appliqué. ` +
      `Pour supprimer ce warning, configurer en Vercel : ${stripped}/v3`,
  );
  return `${stripped}/v3`;
}

function yousignApiKey(): string {
  const key = process.env.YOUSIGN_API_KEY;
  if (!key) throw new Error('YOUSIGN_API_KEY manquant');
  return key;
}

async function yousignFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${yousignBaseUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${yousignApiKey()}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '<no-body>');
    throw new Error(`Yousign API ${response.status} ${response.statusText} on ${path}: ${text}`);
  }

  // DELETE renvoie souvent 204 No Content — return undefined cast as T
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return (await response.json()) as T;
}

export async function createSignatureRequest(input: {
  name: string;
  delivery_mode?: YousignDeliveryMode;
  ordered_signers?: boolean;
  expiration_date?: string;
}): Promise<YousignSignatureRequest> {
  return yousignFetch<YousignSignatureRequest>('/signature_requests', {
    method: 'POST',
    body: JSON.stringify({ delivery_mode: 'email', ...input }),
  });
}

export async function uploadDocument(
  signatureRequestId: string,
  pdfBuffer: Buffer | Uint8Array,
  filename: string,
): Promise<YousignDocument> {
  const formData = new FormData();
  // Buffer.byteOffset/byteLength : on slice un ArrayBuffer compatible
  const buf =
    pdfBuffer instanceof Uint8Array
      ? pdfBuffer.buffer.slice(pdfBuffer.byteOffset, pdfBuffer.byteOffset + pdfBuffer.byteLength)
      : pdfBuffer;
  formData.append('file', new Blob([buf as ArrayBuffer], { type: 'application/pdf' }), filename);
  formData.append('nature', 'signable_document');

  const response = await fetch(
    `${yousignBaseUrl()}/signature_requests/${signatureRequestId}/documents`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${yousignApiKey()}` },
      body: formData,
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '<no-body>');
    throw new Error(`Yousign upload ${response.status}: ${text}`);
  }
  return (await response.json()) as YousignDocument;
}

export async function addSigner(
  signatureRequestId: string,
  input: YousignAddSignerInput,
): Promise<YousignSigner> {
  return yousignFetch<YousignSigner>(`/signature_requests/${signatureRequestId}/signers`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function activateSignatureRequest(id: string): Promise<{ status: string }> {
  return yousignFetch<{ status: string }>(`/signature_requests/${id}/activate`, {
    method: 'POST',
  });
}

export async function getSignatureRequest(id: string): Promise<unknown> {
  return yousignFetch<unknown>(`/signature_requests/${id}`);
}

export async function downloadSignedDocument(
  signatureRequestId: string,
  documentId: string,
): Promise<Buffer> {
  const response = await fetch(
    `${yousignBaseUrl()}/signature_requests/${signatureRequestId}/documents/${documentId}/download`,
    { headers: { Authorization: `Bearer ${yousignApiKey()}` } },
  );
  if (!response.ok) {
    throw new Error(`Yousign downloadSignedDocument ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function downloadAuditTrail(signatureRequestId: string): Promise<Buffer> {
  const response = await fetch(
    `${yousignBaseUrl()}/signature_requests/${signatureRequestId}/audit_trails/download`,
    { headers: { Authorization: `Bearer ${yousignApiKey()}` } },
  );
  if (!response.ok) {
    throw new Error(`Yousign downloadAuditTrail ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function cancelSignatureRequest(id: string): Promise<void> {
  await yousignFetch<void>(`/signature_requests/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'cancelled_by_admin' }),
  });
}
