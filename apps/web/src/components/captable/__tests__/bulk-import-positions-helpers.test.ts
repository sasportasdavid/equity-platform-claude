import { describe, expect, it } from 'vitest';
import {
  buildCsvTemplate,
  computeSummary,
  CSV_TEMPLATE_HEADERS,
  parsePositionsCsv,
  validateRow,
} from '../bulk-import-positions-helpers';

/**
 * Module 10 B6 — Tests bulk-import-positions-helpers (pure functions).
 *
 * Couvre :
 *  - parsePositionsCsv : headers manquants, parsing OK, BOM UTF-8, trim
 *  - validateRow : Zod success/fail
 *  - computeSummary : agrégats par type + classe
 *  - buildCsvTemplate : structure stable + parseable
 */

describe('parsePositionsCsv', () => {
  it('rejects empty csv', () => {
    const result = parsePositionsCsv('');
    expect(result.error).toBe('Fichier CSV vide');
    expect(result.rows).toEqual([]);
  });

  it('rejects whitespace-only csv', () => {
    const result = parsePositionsCsv('   \n  \n  ');
    expect(result.error).toBe('Fichier CSV vide');
  });

  it('rejects csv missing required headers', () => {
    const csv = 'stakeholder_name,units\nAlice,1000';
    const result = parsePositionsCsv(csv);
    expect(result.error).toContain('Headers manquants');
    expect(result.error).toContain('stakeholder_type');
  });

  it('parses minimal valid csv', () => {
    const csv = [
      'stakeholder_type,stakeholder_name,share_class_code,units,acquired_at',
      'FOUNDER,Alice Dupont,COMMON,500000,2020-01-15',
    ].join('\n');
    const result = parsePositionsCsv(csv);
    expect(result.error).toBeNull();
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      stakeholderType: 'FOUNDER',
      stakeholderName: 'Alice Dupont',
      shareClassCode: 'COMMON',
      units: 500000,
      acquiredAt: '2020-01-15',
    });
  });

  it('uppercases stakeholder_type and share_class_code', () => {
    const csv = [
      'stakeholder_type,stakeholder_name,share_class_code,units,acquired_at',
      'investor,Lead VC,pref_a,250000,2024-06-20',
    ].join('\n');
    const result = parsePositionsCsv(csv);
    expect(result.rows[0]).toMatchObject({
      stakeholderType: 'INVESTOR',
      shareClassCode: 'PREF_A',
    });
  });

  it('lowercases email', () => {
    const csv = [
      'stakeholder_type,stakeholder_name,stakeholder_email,share_class_code,units,acquired_at',
      'BENEFICIARY,Carla,Carla@Example.COM,COMMON,5000,2024-08-01',
    ].join('\n');
    const result = parsePositionsCsv(csv);
    expect(result.rows[0]?.stakeholderEmail).toBe('carla@example.com');
  });

  it('parses cost_basis_per_unit with comma decimal (FR locale)', () => {
    const csv = [
      'stakeholder_type,stakeholder_name,share_class_code,units,acquired_at,cost_basis_per_unit',
      'FOUNDER,Alice,COMMON,500000,2020-01-15,"0,10"',
    ].join('\n');
    const result = parsePositionsCsv(csv);
    expect(result.rows[0]?.costBasisPerUnit).toBe(0.1);
  });

  it('skips empty rows', () => {
    const csv = [
      'stakeholder_type,stakeholder_name,share_class_code,units,acquired_at',
      'FOUNDER,Alice,COMMON,500000,2020-01-15',
      '',
      '',
      'FOUNDER,Bob,COMMON,500000,2020-01-15',
    ].join('\n');
    const result = parsePositionsCsv(csv);
    expect(result.rows).toHaveLength(2);
  });

  it('handles BOM UTF-8 prefix (Excel exports)', () => {
    const csv =
      '﻿stakeholder_type,stakeholder_name,share_class_code,units,acquired_at\nFOUNDER,Alice,COMMON,500000,2020-01-15';
    const result = parsePositionsCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.stakeholderType).toBe('FOUNDER');
  });
});

describe('validateRow', () => {
  it('passes valid FOUNDER row', () => {
    const result = validateRow({
      __raw: {},
      stakeholderType: 'FOUNDER',
      stakeholderName: 'Alice Dupont',
      shareClassCode: 'COMMON',
      units: 500000,
      acquiredAt: '2020-01-15',
    });
    expect(result.valid).toBe(true);
  });

  it('passes valid BENEFICIARY row with email', () => {
    const result = validateRow({
      __raw: {},
      stakeholderType: 'BENEFICIARY',
      stakeholderName: 'Carla',
      stakeholderEmail: 'carla@example.com',
      shareClassCode: 'COMMON',
      units: 5000,
      acquiredAt: '2024-08-01',
    });
    expect(result.valid).toBe(true);
  });

  it('rejects unknown stakeholder_type', () => {
    const result = validateRow({
      __raw: {},
      // @ts-expect-error invalid intentional
      stakeholderType: 'CEO',
      stakeholderName: 'Alice',
      shareClassCode: 'COMMON',
      units: 1000,
      acquiredAt: '2020-01-15',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects negative units', () => {
    const result = validateRow({
      __raw: {},
      stakeholderType: 'FOUNDER',
      stakeholderName: 'Alice',
      shareClassCode: 'COMMON',
      units: -10,
      acquiredAt: '2020-01-15',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects zero units (must be positive)', () => {
    const result = validateRow({
      __raw: {},
      stakeholderType: 'FOUNDER',
      stakeholderName: 'Alice',
      shareClassCode: 'COMMON',
      units: 0,
      acquiredAt: '2020-01-15',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects malformed acquired_at', () => {
    const result = validateRow({
      __raw: {},
      stakeholderType: 'FOUNDER',
      stakeholderName: 'Alice',
      shareClassCode: 'COMMON',
      units: 1000,
      acquiredAt: '15/01/2020',
    });
    expect(result.valid).toBe(false);
  });

  it('rejects shareClassCode with lowercase', () => {
    const result = validateRow({
      __raw: {},
      stakeholderType: 'FOUNDER',
      stakeholderName: 'Alice',
      shareClassCode: 'common',
      units: 1000,
      acquiredAt: '2020-01-15',
    });
    expect(result.valid).toBe(false);
  });
});

describe('computeSummary', () => {
  it('aggregates by stakeholder_type and share_class', () => {
    const rows = [
      {
        __raw: {},
        stakeholderType: 'FOUNDER' as const,
        stakeholderName: 'Alice',
        shareClassCode: 'COMMON',
        units: 500000,
        acquiredAt: '2020-01-15',
      },
      {
        __raw: {},
        stakeholderType: 'FOUNDER' as const,
        stakeholderName: 'Bob',
        shareClassCode: 'COMMON',
        units: 500000,
        acquiredAt: '2020-01-15',
      },
      {
        __raw: {},
        stakeholderType: 'INVESTOR' as const,
        stakeholderName: 'Lead VC',
        shareClassCode: 'PREF_A',
        units: 250000,
        acquiredAt: '2024-06-20',
      },
    ];
    const summary = computeSummary(rows);
    expect(summary.total).toBe(3);
    expect(summary.valid).toBe(3);
    expect(summary.invalid).toBe(0);
    expect(summary.byStakeholderType).toEqual({ FOUNDER: 2, INVESTOR: 1 });
    expect(summary.byShareClass).toEqual({ COMMON: 2, PREF_A: 1 });
  });

  it('counts invalid rows separately', () => {
    const rows = [
      {
        __raw: {},
        stakeholderType: 'FOUNDER' as const,
        stakeholderName: 'Alice',
        shareClassCode: 'COMMON',
        units: 500000,
        acquiredAt: '2020-01-15',
      },
      {
        __raw: {},
        // @ts-expect-error invalid intentional
        stakeholderType: 'UNKNOWN',
        stakeholderName: 'Bob',
        shareClassCode: 'COMMON',
        units: 1000,
        acquiredAt: '2020-01-15',
      },
    ];
    const summary = computeSummary(rows);
    expect(summary.total).toBe(2);
    expect(summary.valid).toBe(1);
    expect(summary.invalid).toBe(1);
    expect(summary.byStakeholderType).toEqual({ FOUNDER: 1 });
  });
});

describe('buildCsvTemplate', () => {
  it('generates a CSV with all expected headers', () => {
    const csv = buildCsvTemplate();
    for (const h of CSV_TEMPLATE_HEADERS) {
      expect(csv).toContain(h);
    }
  });

  it('generated template parses cleanly', () => {
    const csv = buildCsvTemplate();
    const result = parsePositionsCsv(csv);
    expect(result.error).toBeNull();
    expect(result.rows.length).toBeGreaterThanOrEqual(4);
    // All template rows valid
    for (const row of result.rows) {
      expect(validateRow(row).valid).toBe(true);
    }
  });
});
