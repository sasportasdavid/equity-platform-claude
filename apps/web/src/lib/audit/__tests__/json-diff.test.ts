import { describe, expect, it } from 'vitest';
import { computeJsonDiff, formatDiffValue, type DiffEntry } from '../json-diff';

describe('computeJsonDiff (PR #41 B2)', () => {
  it('both null/undefined → empty array', () => {
    expect(computeJsonDiff(null, null)).toEqual([]);
    expect(computeJsonDiff(undefined, undefined)).toEqual([]);
    expect(computeJsonDiff(null, undefined)).toEqual([]);
  });

  it('only after (creation case) → all keys as added', () => {
    const result = computeJsonDiff(null, { status: 'PROPOSED', units: 1200 });
    expect(result).toHaveLength(2);
    const byKey = (k: string) => result.find((e) => e.key === k)!;
    expect(byKey('status')).toEqual<DiffEntry>({
      key: 'status',
      type: 'added',
      before: undefined,
      after: 'PROPOSED',
    });
    expect(byKey('units')).toEqual<DiffEntry>({
      key: 'units',
      type: 'added',
      before: undefined,
      after: 1200,
    });
  });

  it('only before (deletion case) → all keys as removed', () => {
    const result = computeJsonDiff({ status: 'CANCELLED' }, null);
    expect(result).toEqual<DiffEntry[]>([
      { key: 'status', type: 'removed', before: 'CANCELLED', after: undefined },
    ]);
  });

  it('same keys + same values → empty array (unchanged filtered)', () => {
    expect(
      computeJsonDiff({ status: 'PROPOSED', units: 1200 }, { status: 'PROPOSED', units: 1200 }),
    ).toEqual([]);
  });

  it('same keys + different values → all modified', () => {
    const result = computeJsonDiff(
      { status: 'PROPOSED', granted_at: null },
      { status: 'GRANTED', granted_at: '2026-05-05T13:44:00Z' },
    );
    expect(result).toHaveLength(2);
    const status = result.find((e) => e.key === 'status')!;
    expect(status.type).toBe('modified');
    expect(status.before).toBe('PROPOSED');
    expect(status.after).toBe('GRANTED');
    const granted = result.find((e) => e.key === 'granted_at')!;
    expect(granted.type).toBe('modified');
    expect(granted.before).toBeNull();
    expect(granted.after).toBe('2026-05-05T13:44:00Z');
  });

  it('mixed (added + removed + modified) → correct types', () => {
    const result = computeJsonDiff(
      { status: 'PROPOSED', strike: 24, removed_field: 'x' },
      { status: 'GRANTED', strike: 24, new_field: 'y' },
    );
    // status: modified, strike: unchanged (filtered), removed_field: removed,
    // new_field: added
    expect(result).toHaveLength(3);
    const types = Object.fromEntries(result.map((e) => [e.key, e.type]));
    expect(types).toEqual({
      status: 'modified',
      removed_field: 'removed',
      new_field: 'added',
    });
    expect(result.some((e) => e.key === 'strike')).toBe(false);
  });

  it('nested object equal → unchanged (filtered)', () => {
    expect(
      computeJsonDiff(
        { conditions: { type: 'TIME', months: 36 } },
        { conditions: { type: 'TIME', months: 36 } },
      ),
    ).toEqual([]);
  });

  it('nested object different → modified with full nested values', () => {
    const result = computeJsonDiff(
      { conditions: { type: 'TIME', months: 36 } },
      { conditions: { type: 'PERFORMANCE', months: 36 } },
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('modified');
    expect(result[0]!.before).toEqual({ type: 'TIME', months: 36 });
    expect(result[0]!.after).toEqual({ type: 'PERFORMANCE', months: 36 });
  });

  it('empty objects on both sides → empty array', () => {
    expect(computeJsonDiff({}, {})).toEqual([]);
  });

  it('null vs undefined value (key present both) → unchanged', () => {
    // Both treat as "no value" — JSON.stringify yields same `null`.
    expect(computeJsonDiff({ x: null }, { x: null })).toEqual([]);
  });

  it('explicit null → real value → modified', () => {
    const result = computeJsonDiff({ granted_at: null }, { granted_at: '2026-05-05T13:44:00Z' });
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe('modified');
  });
});

describe('formatDiffValue (PR #41 B2)', () => {
  it('null and undefined → "(vide)"', () => {
    expect(formatDiffValue(null)).toBe('(vide)');
    expect(formatDiffValue(undefined)).toBe('(vide)');
  });

  it('boolean → "Oui"/"Non"', () => {
    expect(formatDiffValue(true)).toBe('Oui');
    expect(formatDiffValue(false)).toBe('Non');
  });

  it('number → fr-FR locale (NBSP separators)', () => {
    // Intl.NumberFormat fr-FR uses U+202F (narrow no-break space).
    expect(formatDiffValue(1200)).toBe('1 200');
    expect(formatDiffValue(0)).toBe('0');
    expect(formatDiffValue(-42)).toBe('-42');
  });

  it('non-finite number → String fallback', () => {
    expect(formatDiffValue(Number.NaN)).toBe('NaN');
    expect(formatDiffValue(Number.POSITIVE_INFINITY)).toBe('Infinity');
  });

  it('empty string → "(vide)"', () => {
    expect(formatDiffValue('')).toBe('(vide)');
  });

  it('UUID → tronqué "12345678…78901234"', () => {
    const uuid = '11111111-2222-3333-4444-555555555555';
    const result = formatDiffValue(uuid);
    expect(result).toContain('…');
    expect(result.startsWith('11111111')).toBe(true);
    expect(result.endsWith('55555555')).toBe(true);
  });

  it('ISO date string → fr-FR long', () => {
    const result = formatDiffValue('2026-05-05');
    // "5 mai 2026" — accepter les variations de locale (NBSP)
    expect(result).toContain('mai');
    expect(result).toContain('2026');
    expect(result).not.toContain('-');
  });

  it('ISO datetime string → fr-FR long avec heure', () => {
    const result = formatDiffValue('2026-05-05T13:44:00Z');
    expect(result).toContain('mai');
    expect(result).toContain('2026');
    // Une heure quelconque doit apparaître (Europe/Paris : 15:44 ou 13:44 selon DST).
    expect(/\d{2}:\d{2}/.test(result)).toBe(true);
  });

  it('plain string → as-is', () => {
    expect(formatDiffValue('PROPOSED')).toBe('PROPOSED');
    expect(formatDiffValue('Lorem ipsum')).toBe('Lorem ipsum');
  });

  it('object → JSON pretty', () => {
    const obj = { type: 'TIME', months: 36 };
    const result = formatDiffValue(obj);
    expect(result).toContain('"type"');
    expect(result).toContain('"TIME"');
    expect(result.split('\n').length).toBeGreaterThan(1);
  });

  it('array → JSON pretty', () => {
    expect(formatDiffValue([1, 2, 3])).toContain('1,');
  });
});
