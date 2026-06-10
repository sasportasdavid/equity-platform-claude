import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock du client admin : on contrôle ce que renvoie `.rpc().maybeSingle()`.
const rpcMaybeSingle = vi.fn();
const rpc = vi.fn(() => ({ maybeSingle: rpcMaybeSingle }));
const del = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
const from = vi.fn(() => ({ delete: del }));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdminClient: () => ({ rpc, from }),
}));

// server-only est un no-op en test
vi.mock('server-only', () => ({}));

import { PostgresRateLimiter } from '../postgres-store';

afterEach(() => {
  vi.clearAllMocks();
});

describe('PostgresRateLimiter', () => {
  it('mappe la réponse RPC (allowed) vers RateLimitDecision', async () => {
    rpcMaybeSingle.mockResolvedValue({
      data: { allowed: true, remaining: 4, retry_after_ms: 0 },
      error: null,
    });
    const limiter = new PostgresRateLimiter();
    const d = await limiter.check({ key: 'signup:1.2.3.4', limit: 5, windowMs: 900000 });
    expect(d).toEqual({ allowed: true, remaining: 4, retryAfterMs: 0 });
    expect(rpc).toHaveBeenCalledWith('rate_limit_hit', {
      p_key: 'signup:1.2.3.4',
      p_limit: 5,
      p_window_ms: 900000,
    });
  });

  it('mappe la réponse RPC (bloqué) avec retry_after_ms', async () => {
    rpcMaybeSingle.mockResolvedValue({
      data: { allowed: false, remaining: 0, retry_after_ms: 59998 },
      error: null,
    });
    const limiter = new PostgresRateLimiter();
    const d = await limiter.check({ key: 'magic_link:1.2.3.4', limit: 5, windowMs: 900000 });
    expect(d.allowed).toBe(false);
    expect(d.retryAfterMs).toBe(59998);
  });

  it('fail-open si la RPC renvoie une erreur (ne bloque pas un user légitime)', async () => {
    rpcMaybeSingle.mockResolvedValue({ data: null, error: { message: 'db down' } });
    const limiter = new PostgresRateLimiter();
    const d = await limiter.check({ key: 'signup:x', limit: 5, windowMs: 900000 });
    expect(d.allowed).toBe(true);
  });

  it('fail-open si le client admin jette une exception', async () => {
    rpcMaybeSingle.mockRejectedValue(new Error('boom'));
    const limiter = new PostgresRateLimiter();
    const d = await limiter.check({ key: 'signup:y', limit: 5, windowMs: 900000 });
    expect(d.allowed).toBe(true);
  });
});
