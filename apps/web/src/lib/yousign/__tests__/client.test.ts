import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activateSignatureRequest,
  addSigner,
  cancelSignatureRequest,
  createSignatureRequest,
  downloadAuditTrail,
  downloadSignedDocument,
  getSignatureRequest,
  uploadDocument,
} from '../client';

const BASE = 'https://api-sandbox.yousign.app/v3';
const KEY = 'test-key-abc';

const okJson = (body: unknown, status = 200) =>
  ({
    ok: true,
    status,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
    arrayBuffer: async () => new ArrayBuffer(0),
  }) as unknown as Response;

const okBuffer = (bytes: Uint8Array) =>
  ({
    ok: true,
    status: 200,
    statusText: 'OK',
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  }) as unknown as Response;

const errorResponse = (status: number, body: string) =>
  ({
    ok: false,
    status,
    statusText: 'Error',
    text: async () => body,
  }) as unknown as Response;

describe('yousign client', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv('YOUSIGN_API_BASE_URL', BASE);
    vi.stubEnv('YOUSIGN_API_KEY', KEY);
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('createSignatureRequest POSTs JSON with bearer + injects delivery_mode email', async () => {
    fetchSpy.mockResolvedValueOnce(okJson({ id: 'sigreq_123', status: 'draft' }));
    const out = await createSignatureRequest({ name: 'Test', ordered_signers: true });
    expect(out).toEqual({ id: 'sigreq_123', status: 'draft' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(`${BASE}/signature_requests`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body as string);
    expect(body.delivery_mode).toBe('email');
    expect(body.name).toBe('Test');
    expect(body.ordered_signers).toBe(true);
  });

  it('uploadDocument sends multipart FormData (no JSON content-type) with nature signable_document', async () => {
    fetchSpy.mockResolvedValueOnce(okJson({ id: 'doc_456' }));
    const buffer = Buffer.from('%PDF-1.4 mock');
    const out = await uploadDocument('sigreq_123', buffer, 'test.pdf');
    expect(out).toEqual({ id: 'doc_456' });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(`${BASE}/signature_requests/sigreq_123/documents`);
    expect(init.body).toBeInstanceOf(FormData);
    const fd = init.body as FormData;
    expect(fd.get('nature')).toBe('signable_document');
    expect(fd.get('file')).toBeInstanceOf(Blob);
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('addSigner posts info + auth mode otp_email + signature_link returned', async () => {
    fetchSpy.mockResolvedValueOnce(
      okJson({ id: 'signer_789', signature_link: 'https://yousign.app/sign/xyz' }),
    );
    const out = await addSigner('sigreq_123', {
      info: { first_name: 'Alice', last_name: 'Doe', email: 'alice@test.com', locale: 'fr' },
      signature_level: 'electronic_signature',
      signature_authentication_mode: 'otp_email',
    });
    expect(out.id).toBe('signer_789');
    expect(out.signature_link).toContain('yousign.app');
    const body = JSON.parse(fetchSpy.mock.calls[0]![1].body as string);
    expect(body.signature_authentication_mode).toBe('otp_email');
    expect(body.info.email).toBe('alice@test.com');
  });

  it('activateSignatureRequest POSTs to /activate', async () => {
    fetchSpy.mockResolvedValueOnce(okJson({ status: 'ongoing' }));
    const out = await activateSignatureRequest('sigreq_123');
    expect(out).toEqual({ status: 'ongoing' });
    expect(fetchSpy.mock.calls[0]![0]).toBe(`${BASE}/signature_requests/sigreq_123/activate`);
    expect(fetchSpy.mock.calls[0]![1].method).toBe('POST');
  });

  it('getSignatureRequest GETs the resource', async () => {
    fetchSpy.mockResolvedValueOnce(okJson({ id: 'sigreq_123', status: 'done' }));
    const out = await getSignatureRequest('sigreq_123');
    expect(out).toEqual({ id: 'sigreq_123', status: 'done' });
    expect(fetchSpy.mock.calls[0]![1]?.method).toBeUndefined();
  });

  it('cancelSignatureRequest POSTs /cancel + handles 204', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 204,
      statusText: 'No Content',
      text: async () => '',
    } as unknown as Response);
    await expect(cancelSignatureRequest('sigreq_123')).resolves.toBeUndefined();
    expect(fetchSpy.mock.calls[0]![0]).toBe(`${BASE}/signature_requests/sigreq_123/cancel`);
    expect(fetchSpy.mock.calls[0]![1].method).toBe('POST');
  });

  it('downloadSignedDocument returns a Buffer from the binary response', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    fetchSpy.mockResolvedValueOnce(okBuffer(bytes));
    const out = await downloadSignedDocument('sigreq_123', 'doc_456');
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.length).toBe(5);
    expect(out[0]).toBe(1);
  });

  it('downloadAuditTrail returns a Buffer', async () => {
    const bytes = new Uint8Array([9, 8, 7]);
    fetchSpy.mockResolvedValueOnce(okBuffer(bytes));
    const out = await downloadAuditTrail('sigreq_123');
    expect(out.length).toBe(3);
    expect(out[2]).toBe(7);
  });

  it('throws verbose error on 401 Unauthorized', async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(401, '{"detail":"Invalid token"}'));
    await expect(createSignatureRequest({ name: 'x' })).rejects.toThrow(/401[\s\S]*Invalid token/);
  });

  it('throws on network failure (fetch rejects)', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(activateSignatureRequest('sigreq_123')).rejects.toThrow(/ECONNREFUSED/);
  });

  it('throws if YOUSIGN_API_BASE_URL is missing', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('YOUSIGN_API_KEY', KEY);
    await expect(createSignatureRequest({ name: 'x' })).rejects.toThrow(
      /YOUSIGN_API_BASE_URL manquant/,
    );
  });
});
