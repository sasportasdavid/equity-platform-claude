import { describe, expect, it } from 'vitest';
import {
  AUDIT_CHAIN_GENESIS_SOURCE,
  chainedEventsOrdered,
  getAuditEventHash,
  isChained,
  verifyChainLinkage,
  type AuditEventWithChain,
} from '../chain';
import { computeAuditEventHash } from '../hash';

const TEST_ORG = '526b87a9-ef7f-4831-9049-5182092b2bce';

function makeEvent(
  position: number | null,
  hash: string | null,
  previousHash: string | null,
  overrides: Partial<AuditEventWithChain> = {},
): AuditEventWithChain {
  return {
    id: `aaaaaaaa-aaaa-aaaa-aaaa-${String(position ?? 0).padStart(12, '0')}`,
    event_type: 'test.event',
    user_id: null,
    resource_type: null,
    resource_id: null,
    occurred_at: '2026-05-05T10:00:00.000Z',
    metadata: {},
    chain_position: position,
    event_hash: hash,
    previous_hash: previousHash,
    ...overrides,
  };
}

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);

describe('Module 13 V2 — chain.ts (PR #42 B1.5)', () => {
  describe('AUDIT_CHAIN_GENESIS_SOURCE', () => {
    it('matche la string SQL constant CAPIWISE_AUDIT_GENESIS_2026_05', () => {
      expect(AUDIT_CHAIN_GENESIS_SOURCE).toBe('CAPIWISE_AUDIT_GENESIS_2026_05');
    });
  });

  describe('getAuditEventHash — priorité DB > legacy compute', () => {
    it('retourne event_hash si présent et valide hex 64', () => {
      const e = makeEvent(1, HASH_A, null);
      expect(getAuditEventHash(e)).toBe(HASH_A);
    });

    it('fallback sur computeAuditEventHash si event_hash null (pré-Module 13)', () => {
      const e = makeEvent(null, null, null, {
        id: '11111111-2222-3333-4444-555555555555',
        event_type: 'plan.locked',
        occurred_at: '2026-04-30T13:18:42.000Z',
        metadata: { plan_name: 'BSPCE-2026-001' },
      });
      const expected = computeAuditEventHash(e);
      expect(getAuditEventHash(e)).toBe(expected);
      expect(expected).toMatch(/^[0-9a-f]{64}$/);
    });

    it('fallback aussi si event_hash format invalide (regression check)', () => {
      const e = makeEvent(1, 'not-a-valid-hex', null);
      const expected = computeAuditEventHash(e);
      expect(getAuditEventHash(e)).toBe(expected);
    });
  });

  describe('isChained — distingue events V2 chainés vs legacy', () => {
    it('true pour event avec chain_position + event_hash valide', () => {
      expect(isChained(makeEvent(1, HASH_A, null))).toBe(true);
    });

    it('false pour event pré-Module 13 (chain_position null)', () => {
      expect(isChained(makeEvent(null, null, null))).toBe(false);
    });

    it('false pour event sans event_hash', () => {
      expect(isChained(makeEvent(1, null, null))).toBe(false);
    });
  });

  describe('chainedEventsOrdered — filtre + tri par chain_position', () => {
    it('exclut les events pré-Module 13 (mark-and-sweep V1)', () => {
      const events = [
        makeEvent(null, null, null), // legacy
        makeEvent(1, HASH_A, null),
        makeEvent(2, HASH_B, HASH_A),
      ];
      expect(chainedEventsOrdered(events)).toHaveLength(2);
    });

    it('trie par chain_position croissante (genesis premier)', () => {
      const events = [
        makeEvent(3, HASH_C, HASH_B),
        makeEvent(1, HASH_A, null),
        makeEvent(2, HASH_B, HASH_A),
      ];
      const ordered = chainedEventsOrdered(events);
      expect(ordered.map((e) => e.chain_position)).toEqual([1, 2, 3]);
    });
  });

  describe('verifyChainLinkage — chain valide, cassée, edge cases', () => {
    it('chain vide → valid', () => {
      expect(verifyChainLinkage([])).toEqual({ valid: true, totalEvents: 0 });
    });

    it('chain 1 event genesis (previous_hash null, chain_position 1) → valid', () => {
      const events = [makeEvent(1, HASH_A, null)];
      expect(verifyChainLinkage(events)).toEqual({ valid: true, totalEvents: 1 });
    });

    it('chain 3 events liés correctement → valid', () => {
      const events = [
        makeEvent(1, HASH_A, null),
        makeEvent(2, HASH_B, HASH_A),
        makeEvent(3, HASH_C, HASH_B),
      ];
      expect(verifyChainLinkage(events)).toEqual({ valid: true, totalEvents: 3 });
    });

    it('chain cassée : previous_hash mismatch à position 2 → invalid avec brokenAt=2', () => {
      const events = [
        makeEvent(1, HASH_A, null),
        makeEvent(2, HASH_B, 'd'.repeat(64)), // wrong previous_hash
      ];
      const result = verifyChainLinkage(events);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.brokenAt).toBe(2);
        expect(result.reason).toContain('previous_hash');
      }
    });

    it('chain cassée : chain_position non-monotone (gap) → invalid', () => {
      const events = [
        makeEvent(1, HASH_A, null),
        makeEvent(3, HASH_C, HASH_A), // missing position 2
      ];
      const result = verifyChainLinkage(events);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.brokenAt).toBe(3);
        expect(result.reason).toContain('non-monotone');
      }
    });

    it('genesis avec previous_hash NON null → invalid (corruption)', () => {
      const events = [makeEvent(1, HASH_A, HASH_B)];
      const result = verifyChainLinkage(events);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.brokenAt).toBe(1);
        expect(result.reason).toContain('previous_hash = null');
      }
    });

    it('chain ne commence pas à chain_position=1 → invalid', () => {
      const events = [makeEvent(2, HASH_A, null)];
      const result = verifyChainLinkage(events);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.brokenAt).toBe(2);
        expect(result.reason).toContain('chain_position = 1');
      }
    });

    it('events pré-Module 13 mélangés avec chained → vérif uniquement la chain V2', () => {
      const events = [
        makeEvent(null, null, null), // legacy 1
        makeEvent(null, null, null), // legacy 2
        makeEvent(1, HASH_A, null),
        makeEvent(2, HASH_B, HASH_A),
      ];
      expect(verifyChainLinkage(events)).toEqual({ valid: true, totalEvents: 2 });
    });
  });
});
