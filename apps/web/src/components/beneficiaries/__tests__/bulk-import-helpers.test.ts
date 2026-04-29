import { describe, expect, it } from 'vitest';
import {
  extractValidEmails,
  parseBeneficiariesCsv,
  summarizeBeneficiariesBulk,
  validateBeneficiaryRows,
} from '../bulk-import-helpers';

const VALID_CSV = `email,first_name,last_name,beneficiary_type,contract_type,job_title,department,tax_residence,is_tax_resident_france,hire_date
jean@example.com,Jean,Dupont,EMPLOYEE,CDI,Engineer,Engineering,FR,true,2024-01-15
marie@example.com,Marie,Martin,EMPLOYEE,CDI,PM,Product,FR,true,2023-06-01
john@example.com,John,Smith,CONSULTANT,CONSULTANT,Advisor,Strategy,US,false,2025-03-01`;

describe('parseBeneficiariesCsv', () => {
  it('parse 3 lignes valides + boolean coerce + uppercase', () => {
    const r = parseBeneficiariesCsv(VALID_CSV);
    expect(r.error).toBeNull();
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]?.email).toBe('jean@example.com');
    expect(r.rows[0]?.beneficiaryType).toBe('EMPLOYEE');
    expect(r.rows[0]?.isTaxResidentFrance).toBe(true);
    expect(r.rows[2]?.isTaxResidentFrance).toBe(false);
  });

  it('rejette CSV vide', () => {
    expect(parseBeneficiariesCsv('').error).toMatch(/vide/i);
    expect(parseBeneficiariesCsv('   \n\n').error).toMatch(/vide/i);
  });

  it('rejette si headers requis manquants', () => {
    const csv = `email,first_name\njean@example.com,Jean`;
    const r = parseBeneficiariesCsv(csv);
    expect(r.error).toMatch(/headers manquants/i);
    expect(r.error).toMatch(/last_name/);
    expect(r.error).toMatch(/beneficiary_type/);
  });

  it('skip les lignes vides intercalées', () => {
    const csv =
      VALID_CSV.split('\n').slice(0, 2).join('\n') +
      '\n\n\n' +
      VALID_CSV.split('\n').slice(2).join('\n');
    const r = parseBeneficiariesCsv(csv);
    expect(r.error).toBeNull();
    expect(r.rows).toHaveLength(3);
  });

  it('lowercase headers + uppercase beneficiary_type', () => {
    const csv = `EMAIL,FIRST_NAME,LAST_NAME,BENEFICIARY_TYPE\njean@example.com,Jean,Dupont,employee`;
    const r = parseBeneficiariesCsv(csv);
    expect(r.error).toBeNull();
    expect(r.rows[0]?.beneficiaryType).toBe('EMPLOYEE');
  });

  it('coerce boolean depuis "1"/"0"/"oui"/"non"', () => {
    const csv = `email,first_name,last_name,beneficiary_type,is_tax_resident_france
a@e.com,A,B,EMPLOYEE,1
c@e.com,C,D,EMPLOYEE,0
e@e.com,E,F,EMPLOYEE,oui
g@e.com,G,H,EMPLOYEE,non`;
    const r = parseBeneficiariesCsv(csv);
    expect(r.rows[0]?.isTaxResidentFrance).toBe(true);
    expect(r.rows[1]?.isTaxResidentFrance).toBe(false);
    expect(r.rows[2]?.isTaxResidentFrance).toBe(true);
    expect(r.rows[3]?.isTaxResidentFrance).toBe(false);
  });
});

describe('validateBeneficiaryRows', () => {
  it('marque les rows valides comme valid:true', () => {
    const r = parseBeneficiariesCsv(VALID_CSV);
    const v = validateBeneficiaryRows(r.rows);
    expect(v).toHaveLength(3);
    expect(v.every((x) => x.valid)).toBe(true);
  });

  it('détecte un email invalide', () => {
    const csv = `email,first_name,last_name,beneficiary_type\nnot-email,Jean,Dupont,EMPLOYEE`;
    const r = parseBeneficiariesCsv(csv);
    const v = validateBeneficiaryRows(r.rows);
    expect(v[0]?.valid).toBe(false);
    if (!v[0]?.valid) {
      expect(v[0]?.errors.some((e) => e.path === 'email')).toBe(true);
    }
  });

  it('détecte hire_date au mauvais format', () => {
    const csv = `email,first_name,last_name,beneficiary_type,hire_date\njean@example.com,Jean,Dupont,EMPLOYEE,15/01/2024`;
    const r = parseBeneficiariesCsv(csv);
    const v = validateBeneficiaryRows(r.rows);
    expect(v[0]?.valid).toBe(false);
    if (!v[0]?.valid) {
      expect(v[0]?.errors.some((e) => e.path === 'hireDate')).toBe(true);
    }
  });

  it('détecte beneficiary_type hors enum', () => {
    const csv = `email,first_name,last_name,beneficiary_type\njean@example.com,Jean,Dupont,INTERN`;
    const r = parseBeneficiariesCsv(csv);
    const v = validateBeneficiaryRows(r.rows);
    expect(v[0]?.valid).toBe(false);
  });

  it('détecte tax_residence non-2-letters', () => {
    const csv = `email,first_name,last_name,beneficiary_type,tax_residence\njean@example.com,Jean,Dupont,EMPLOYEE,FRA`;
    const r = parseBeneficiariesCsv(csv);
    const v = validateBeneficiaryRows(r.rows);
    expect(v[0]?.valid).toBe(false);
  });
});

describe('summarizeBeneficiariesBulk + extractValidEmails', () => {
  it('agrège total / valid / new / skip', () => {
    const r = parseBeneficiariesCsv(VALID_CSV);
    const v = validateBeneficiaryRows(r.rows);
    // Existant : "marie@example.com" déjà en DB
    const existing = new Set(['marie@example.com']);
    const s = summarizeBeneficiariesBulk(r.rows, v, existing);
    expect(s.total).toBe(3);
    expect(s.valid).toBe(3);
    expect(s.invalid).toBe(0);
    expect(s.newCount).toBe(2);
    expect(s.skipCount).toBe(1);
  });

  it('extractValidEmails ne retourne que les valides en lowercase', () => {
    const csv = `email,first_name,last_name,beneficiary_type
JEAN@Example.com,Jean,Dupont,EMPLOYEE
not-email,Bad,Email,EMPLOYEE`;
    const r = parseBeneficiariesCsv(csv);
    const v = validateBeneficiaryRows(r.rows);
    const emails = extractValidEmails(r.rows, v);
    expect(emails).toEqual(['jean@example.com']);
  });
});
