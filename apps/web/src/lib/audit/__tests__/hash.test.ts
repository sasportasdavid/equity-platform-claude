import { describe, expect, it } from 'vitest';
import { computeAuditEventHash, shortHash, type AuditEventForHash } from '../hash';

const baseEvent: AuditEventForHash = {
  id: '11111111-2222-3333-4444-555555555555',
  event_type: 'plan.locked',
  user_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  resource_type: 'PLAN',
  resource_id: '99999999-aaaa-bbbb-cccc-dddddddddddd',
  occurred_at: '2026-04-30T13:18:42.000Z',
  metadata: { plan_name: 'BSPCE-2026-001' },
};

describe('computeAuditEventHash (PR #39 B2)', () => {
  it('hash déterministe : même input → même output', () => {
    const h1 = computeAuditEventHash(baseEvent);
    const h2 = computeAuditEventHash(baseEvent);
    expect(h1).toBe(h2);
  });

  it('différents events → hashes différents', () => {
    const otherEvent: AuditEventForHash = {
      ...baseEvent,
      id: '00000000-1111-2222-3333-444444444444',
    };
    const h1 = computeAuditEventHash(baseEvent);
    const h2 = computeAuditEventHash(otherEvent);
    expect(h1).not.toBe(h2);
  });

  it('métadonnées différentes → hashes différents', () => {
    const h1 = computeAuditEventHash(baseEvent);
    const h2 = computeAuditEventHash({
      ...baseEvent,
      metadata: { plan_name: 'BSPCE-2026-002' },
    });
    expect(h1).not.toBe(h2);
  });

  it('format hex 64 chars (SHA-256)', () => {
    const h = computeAuditEventHash(baseEvent);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('métadonnées null vs {} produisent le même hash (normalisation)', () => {
    const h1 = computeAuditEventHash({ ...baseEvent, metadata: null });
    const h2 = computeAuditEventHash({ ...baseEvent, metadata: {} });
    expect(h1).toBe(h2);
  });

  it("user_id null vs '' produisent le même hash", () => {
    const h1 = computeAuditEventHash({ ...baseEvent, user_id: null });
    const h2 = computeAuditEventHash({ ...baseEvent, user_id: '' });
    expect(h1).toBe(h2);
  });
});

describe('shortHash (PR #39 B2)', () => {
  it('retourne les 8 premiers caractères hex', () => {
    expect(shortHash('3a91f04c1b2e7d1abcdef0123456789012345678901234567890123456789ab')).toBe(
      '3a91f04c',
    );
  });

  it('format hex stable (pas de modification)', () => {
    const full = computeAuditEventHash(baseEvent);
    const short = shortHash(full);
    expect(short).toHaveLength(8);
    expect(short).toBe(full.slice(0, 8));
  });
});
