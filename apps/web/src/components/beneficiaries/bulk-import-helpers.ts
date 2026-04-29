import Papa from 'papaparse';
import { bulkBeneficiaryRowSchema, type BulkBeneficiaryRow } from '@equity/shared';

/**
 * Helpers parsing & validation pour l'import CSV bénéficiaires — Module 4 B5.
 *
 * Pure functions testables sans DOM. Le composant
 * `BulkImportBeneficiariesModal` les consomme pour la preview step 2.
 *
 * Mapping headers CSV → camelCase Zod :
 *   email                      → email
 *   first_name                 → firstName
 *   last_name                  → lastName
 *   beneficiary_type           → beneficiaryType   (UPPERCASE: EMPLOYEE/...)
 *   contract_type              → contractType
 *   job_title                  → jobTitle
 *   department                 → department
 *   tax_residence              → taxResidence      (ISO-3166-1 alpha-2)
 *   is_tax_resident_france     → isTaxResidentFrance  (parsed string→boolean)
 *   hire_date                  → hireDate          (YYYY-MM-DD)
 */

export type ParsedBeneficiaryRow = Partial<BulkBeneficiaryRow> & {
  __raw: Record<string, string>;
};

export type RowValidationResult =
  | { valid: true }
  | { valid: false; errors: { path: string; message: string }[] };

const REQUIRED_HEADERS = ['email', 'first_name', 'last_name', 'beneficiary_type'];
const OPTIONAL_HEADERS = [
  'contract_type',
  'job_title',
  'department',
  'tax_residence',
  'is_tax_resident_france',
  'hire_date',
];

const HEADER_MAP: Record<string, keyof BulkBeneficiaryRow> = {
  email: 'email',
  first_name: 'firstName',
  last_name: 'lastName',
  beneficiary_type: 'beneficiaryType',
  contract_type: 'contractType',
  job_title: 'jobTitle',
  department: 'department',
  tax_residence: 'taxResidence',
  is_tax_resident_france: 'isTaxResidentFrance',
  hire_date: 'hireDate',
};

function parseBoolean(v: string): boolean | undefined {
  const t = v.trim().toLowerCase();
  if (t === 'true' || t === '1' || t === 'yes' || t === 'oui') return true;
  if (t === 'false' || t === '0' || t === 'no' || t === 'non') return false;
  return undefined;
}

export function parseBeneficiariesCsv(csvText: string): {
  rows: ParsedBeneficiaryRow[];
  error: string | null;
} {
  if (!csvText.trim()) {
    return { rows: [], error: 'Fichier CSV vide' };
  }

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (parsed.errors.length > 0) {
    const first = parsed.errors[0]!;
    return { rows: [], error: `Erreur CSV ligne ${first.row}: ${first.message}` };
  }

  const headers = (parsed.meta.fields ?? []).map((h) => h.toLowerCase());
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    return {
      rows: [],
      error: `Headers manquants : ${missing.join(', ')}. Headers requis : ${REQUIRED_HEADERS.join(', ')}.`,
    };
  }

  const rows: ParsedBeneficiaryRow[] = parsed.data.map((raw) => {
    const row: ParsedBeneficiaryRow = { __raw: raw };
    for (const [csvKey, zodKey] of Object.entries(HEADER_MAP)) {
      const v = raw[csvKey]?.trim();
      if (v === undefined || v === '') continue;
      switch (zodKey) {
        case 'beneficiaryType':
          (row as Record<string, unknown>)[zodKey] = v.toUpperCase();
          break;
        case 'isTaxResidentFrance': {
          const b = parseBoolean(v);
          if (b !== undefined) (row as Record<string, unknown>)[zodKey] = b;
          break;
        }
        case 'taxResidence':
          (row as Record<string, unknown>)[zodKey] = v.toUpperCase();
          break;
        default:
          (row as Record<string, unknown>)[zodKey] = v;
      }
    }
    return row;
  });

  return { rows, error: null };
}

export function validateBeneficiaryRows(rows: ParsedBeneficiaryRow[]): RowValidationResult[] {
  return rows.map((row) => {
    const { __raw, ...candidate } = row;
    void __raw;
    const result = bulkBeneficiaryRowSchema.safeParse(candidate);
    if (result.success) return { valid: true };
    return {
      valid: false,
      errors: result.error.issues.map((iss) => ({
        path: iss.path.join('.') || '(root)',
        message: iss.message,
      })),
    };
  });
}

/**
 * Récupère les emails des rows valides — utilisé pour le pré-check
 * existence intra-org dans la modale (badge "Skip" sur lignes existantes).
 */
export function extractValidEmails(
  rows: ParsedBeneficiaryRow[],
  validations: RowValidationResult[],
): string[] {
  const out: string[] = [];
  validations.forEach((v, i) => {
    if (v.valid) {
      const email = rows[i]?.email;
      if (email) out.push(email.toLowerCase());
    }
  });
  return out;
}

export function summarizeBeneficiariesBulk(
  rows: ParsedBeneficiaryRow[],
  validations: RowValidationResult[],
  existingEmails: Set<string>,
): {
  total: number;
  valid: number;
  invalid: number;
  newCount: number;
  skipCount: number;
} {
  let valid = 0;
  let newCount = 0;
  let skipCount = 0;
  validations.forEach((v, i) => {
    if (v.valid) {
      valid += 1;
      const email = rows[i]?.email?.toLowerCase();
      if (email && existingEmails.has(email)) skipCount += 1;
      else newCount += 1;
    }
  });
  return {
    total: rows.length,
    valid,
    invalid: rows.length - valid,
    newCount,
    skipCount,
  };
}

export const BULK_BENEFICIARY_HEADERS = {
  required: REQUIRED_HEADERS,
  optional: OPTIONAL_HEADERS,
};
