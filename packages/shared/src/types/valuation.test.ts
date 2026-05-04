import { describe, expect, it } from 'vitest';
import { listValuationRunsSchema, requestValuationRunSchema } from './valuation';

/**
 * Module 11 B6 — Tests des schemas Zod valuation.
 *
 * Couvre principalement les valeurs par défaut (= API contract). Le détail
 * des SAs est testé côté apps/web/src/server/actions/__tests__/valuations-b5.test.ts.
 */

describe('requestValuationRunSchema', () => {
  it('default numPaths = 20000 (B6 quick fix α — sous timeout EF avec viz)', () => {
    const parsed = requestValuationRunSchema.parse({
      planId: '11111111-1111-4111-8111-111111111111',
    });
    expect(parsed.numPaths).toBe(20000);
  });

  it('default numTimeSteps = 36 (mensuel sur 3 ans)', () => {
    const parsed = requestValuationRunSchema.parse({
      planId: '11111111-1111-4111-8111-111111111111',
    });
    expect(parsed.numTimeSteps).toBe(36);
  });

  it('default includeVisualization = true', () => {
    const parsed = requestValuationRunSchema.parse({
      planId: '11111111-1111-4111-8111-111111111111',
    });
    expect(parsed.includeVisualization).toBe(true);
  });

  it('respecte les overrides utilisateur (numPaths borné [1000, 100000])', () => {
    const parsed = requestValuationRunSchema.parse({
      planId: '11111111-1111-4111-8111-111111111111',
      numPaths: 50000,
    });
    expect(parsed.numPaths).toBe(50000);
  });

  it('rejette numPaths = 500 (sous min 1000)', () => {
    const r = requestValuationRunSchema.safeParse({
      planId: '11111111-1111-4111-8111-111111111111',
      numPaths: 500,
    });
    expect(r.success).toBe(false);
  });

  it('rejette numPaths > 100000', () => {
    const r = requestValuationRunSchema.safeParse({
      planId: '11111111-1111-4111-8111-111111111111',
      numPaths: 200000,
    });
    expect(r.success).toBe(false);
  });
});

describe('listValuationRunsSchema', () => {
  it('default limit = 50, offset = 0', () => {
    const parsed = listValuationRunsSchema.parse({});
    expect(parsed.limit).toBe(50);
    expect(parsed.offset).toBe(0);
  });

  it('rejette limit > 200', () => {
    const r = listValuationRunsSchema.safeParse({ limit: 300 });
    expect(r.success).toBe(false);
  });
});
