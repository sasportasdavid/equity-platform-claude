import { describe, expect, it } from 'vitest';
import { computeLineDiff, isEmptyDiff, stringifySnapshot } from '../json-diff-helpers';

describe('stringifySnapshot', () => {
  it('produit du JSON pretty 2-espaces', () => {
    expect(stringifySnapshot({ a: 1, b: 2 })).toBe('{\n  "a": 1,\n  "b": 2\n}');
  });

  it('renvoie chaîne vide pour null/undefined', () => {
    expect(stringifySnapshot(null)).toBe('');
    expect(stringifySnapshot(undefined)).toBe('');
  });

  it('fallback sur String() si la value contient des cycles', () => {
    type Cyc = { self?: Cyc };
    const obj: Cyc = {};
    obj.self = obj;
    const out = stringifySnapshot(obj);
    expect(out).toBe('[object Object]'); // String() output, pas crash
  });
});

describe('computeLineDiff', () => {
  it('retourne un Set vide si les snapshots sont identiques', () => {
    const a = stringifySnapshot({ x: 1, y: 2 });
    expect(computeLineDiff(a, a).size).toBe(0);
  });

  it('détecte les lignes différentes', () => {
    const before = stringifySnapshot({ strike: 1.5, units: 100 });
    const after = stringifySnapshot({ strike: 2.0, units: 100 });
    const diff = computeLineDiff(before, after);
    expect(diff.size).toBe(1);
    // La ligne strike est en index 1 (après l'accolade ouvrante en index 0)
    expect(diff.has(1)).toBe(true);
  });

  it('détecte les lignes en surplus si une side est plus longue', () => {
    const before = stringifySnapshot({ a: 1 });
    const after = stringifySnapshot({ a: 1, b: 2 });
    const diff = computeLineDiff(before, after);
    expect(diff.size).toBeGreaterThan(0);
  });
});

describe('isEmptyDiff', () => {
  it('true si les deux snapshots sont null/undefined', () => {
    expect(isEmptyDiff(null, null)).toBe(true);
    expect(isEmptyDiff(undefined, undefined)).toBe(true);
    expect(isEmptyDiff(null, undefined)).toBe(true);
  });

  it('false si au moins un snapshot est défini', () => {
    expect(isEmptyDiff({ a: 1 }, null)).toBe(false);
    expect(isEmptyDiff(null, { a: 1 })).toBe(false);
    expect(isEmptyDiff({ a: 1 }, { a: 2 })).toBe(false);
  });
});
