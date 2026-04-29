import { describe, expect, it } from 'vitest';
import { parseAwardsCsv, summarizeBulk, validateBulkRows } from '../bulk-import-helpers';

const VALID_CSV = `beneficiary_email,beneficiary_full_name,beneficiary_type,units_granted,exercise_price,grant_date,vesting_start_date
jean@example.com,Jean Dupont,employee,1000,1.50,2026-05-01,2026-05-01
marie@example.com,Marie Martin,dirigeant,500,1.50,2026-05-01,
sarah@example.com,Sarah Chen,consultant,250,2.00,2026-05-01,2026-05-01`;

describe('parseAwardsCsv', () => {
  it('parse 3 lignes valides', () => {
    const r = parseAwardsCsv(VALID_CSV);
    expect(r.error).toBeNull();
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]?.beneficiaryEmail).toBe('jean@example.com');
    expect(r.rows[0]?.unitsGranted).toBe(1000);
    expect(r.rows[0]?.exercisePrice).toBe(1.5);
    expect(r.rows[0]?.beneficiaryType).toBe('employee');
  });

  it('rejette un CSV vide', () => {
    expect(parseAwardsCsv('').error).toMatch(/vide/i);
    expect(parseAwardsCsv('   \n   ').error).toMatch(/vide/i);
  });

  it('rejette si headers manquants', () => {
    const csv = `beneficiary_email,beneficiary_full_name
jean@example.com,Jean Dupont`;
    const r = parseAwardsCsv(csv);
    expect(r.error).toMatch(/headers manquants/i);
    expect(r.error).toMatch(/units_granted/);
  });

  it('skip les lignes vides intercalées', () => {
    const csvWithBlanks =
      VALID_CSV.split('\n').slice(0, 2).join('\n') +
      '\n\n\n' +
      VALID_CSV.split('\n').slice(2).join('\n');
    const r = parseAwardsCsv(csvWithBlanks);
    expect(r.error).toBeNull();
    expect(r.rows).toHaveLength(3);
  });

  it('accepte virgule décimale dans exercise_price', () => {
    const csv = `beneficiary_email,beneficiary_full_name,beneficiary_type,units_granted,exercise_price,grant_date
jean@example.com,Jean Dupont,employee,1000,"1,50",2026-05-01`;
    const r = parseAwardsCsv(csv);
    expect(r.error).toBeNull();
    expect(r.rows[0]?.exercisePrice).toBe(1.5);
  });

  it('lowercase le beneficiary_type', () => {
    const csv = `beneficiary_email,beneficiary_full_name,beneficiary_type,units_granted,grant_date
jean@example.com,Jean Dupont,EMPLOYEE,1000,2026-05-01`;
    const r = parseAwardsCsv(csv);
    expect(r.rows[0]?.beneficiaryType).toBe('employee');
  });
});

describe('validateBulkRows', () => {
  it('marque toutes les rows valides comme valid:true', () => {
    const r = parseAwardsCsv(VALID_CSV);
    const v = validateBulkRows(r.rows);
    expect(v).toHaveLength(3);
    expect(v.every((x) => x.valid)).toBe(true);
  });

  it('détecte un email invalide', () => {
    const csv = `beneficiary_email,beneficiary_full_name,beneficiary_type,units_granted,grant_date
not-an-email,Jean Dupont,employee,1000,2026-05-01`;
    const r = parseAwardsCsv(csv);
    const v = validateBulkRows(r.rows);
    expect(v[0]?.valid).toBe(false);
    if (!v[0]?.valid) {
      expect(v[0]?.errors.some((e) => e.path === 'beneficiaryEmail')).toBe(true);
    }
  });

  it('détecte une date au mauvais format', () => {
    const csv = `beneficiary_email,beneficiary_full_name,beneficiary_type,units_granted,grant_date
jean@example.com,Jean Dupont,employee,1000,01/05/2026`;
    const r = parseAwardsCsv(csv);
    const v = validateBulkRows(r.rows);
    expect(v[0]?.valid).toBe(false);
    if (!v[0]?.valid) {
      expect(v[0]?.errors.some((e) => e.path === 'grantDate')).toBe(true);
    }
  });

  it('détecte un beneficiary_type hors enum', () => {
    const csv = `beneficiary_email,beneficiary_full_name,beneficiary_type,units_granted,grant_date
jean@example.com,Jean Dupont,intern,1000,2026-05-01`;
    const r = parseAwardsCsv(csv);
    const v = validateBulkRows(r.rows);
    expect(v[0]?.valid).toBe(false);
  });

  it('détecte units_granted non-positif', () => {
    const csv = `beneficiary_email,beneficiary_full_name,beneficiary_type,units_granted,grant_date
jean@example.com,Jean Dupont,employee,0,2026-05-01`;
    const r = parseAwardsCsv(csv);
    const v = validateBulkRows(r.rows);
    expect(v[0]?.valid).toBe(false);
  });
});

describe('summarizeBulk', () => {
  it('agrège total / valid / invalid / totalUnits', () => {
    const r = parseAwardsCsv(VALID_CSV);
    const v = validateBulkRows(r.rows);
    const s = summarizeBulk(r.rows, v);
    expect(s.total).toBe(3);
    expect(s.valid).toBe(3);
    expect(s.invalid).toBe(0);
    expect(s.totalUnits).toBe(1750);
  });

  it('exclut les units des rows invalides du total', () => {
    const csv = `beneficiary_email,beneficiary_full_name,beneficiary_type,units_granted,grant_date
jean@example.com,Jean Dupont,employee,1000,2026-05-01
not-email,X,employee,500,2026-05-01`;
    const r = parseAwardsCsv(csv);
    const v = validateBulkRows(r.rows);
    const s = summarizeBulk(r.rows, v);
    expect(s.total).toBe(2);
    expect(s.valid).toBe(1);
    expect(s.invalid).toBe(1);
    expect(s.totalUnits).toBe(1000);
  });
});
