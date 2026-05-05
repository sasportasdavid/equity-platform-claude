import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryRateLimiter } from '../memory-store';

describe('MemoryRateLimiter (Module 14 B5)', () => {
  let rl: MemoryRateLimiter;

  beforeEach(() => {
    rl = new MemoryRateLimiter();
  });

  it('allows up to limit hits in the same window', async () => {
    const opts = { key: 'k', limit: 3, windowMs: 10_000 };
    const r1 = await rl.check(opts);
    const r2 = await rl.check(opts);
    const r3 = await rl.check(opts);
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r2.remaining).toBe(1);
    expect(r3.remaining).toBe(0);
  });

  it('rejects after limit exceeded', async () => {
    const opts = { key: 'k', limit: 2, windowMs: 10_000 };
    await rl.check(opts);
    await rl.check(opts);
    const r3 = await rl.check(opts);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
    expect(r3.retryAfterMs).toBeGreaterThan(0);
  });

  it('isolates counters by key', async () => {
    const opts = { limit: 1, windowMs: 10_000 };
    const a1 = await rl.check({ ...opts, key: 'a' });
    const a2 = await rl.check({ ...opts, key: 'a' });
    const b1 = await rl.check({ ...opts, key: 'b' });
    expect(a1.allowed).toBe(true);
    expect(a2.allowed).toBe(false);
    expect(b1.allowed).toBe(true);
  });

  it('resets the window after windowMs elapses', async () => {
    const opts = { key: 'k', limit: 1, windowMs: 50 };
    const r1 = await rl.check(opts);
    expect(r1.allowed).toBe(true);
    const r2 = await rl.check(opts);
    expect(r2.allowed).toBe(false);
    await new Promise((res) => setTimeout(res, 60));
    const r3 = await rl.check(opts);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0); // limit=1 → 1-1=0
  });

  it('reset(key) clears the counter', async () => {
    const opts = { key: 'k', limit: 1, windowMs: 10_000 };
    await rl.check(opts);
    const before = await rl.check(opts);
    expect(before.allowed).toBe(false);
    await rl.reset('k');
    const after = await rl.check(opts);
    expect(after.allowed).toBe(true);
  });

  it('returns 0 retryAfterMs when allowed', async () => {
    const r = await rl.check({ key: 'k', limit: 5, windowMs: 10_000 });
    expect(r.allowed).toBe(true);
    expect(r.retryAfterMs).toBe(0);
  });
});
