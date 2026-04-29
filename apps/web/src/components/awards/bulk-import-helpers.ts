import Papa from 'papaparse';
import { bulkAwardRowSchema, type BulkAwardRow } from '@equity/shared';

/**
 * Helpers de parsing & validation pour l'import CSV d'awards — Module 3b B5.
 *
 * Pure functions — testables sans monter de DOM. Le composant
 * BulkImportModal les consomme pour afficher la preview de l'étape 2.
 *
 * Parsing : papaparse en mode header-aware (1ère ligne = noms de colonnes).
 * Validation : bulkAwardRowSchema de @equity/shared (single source of truth).
 *
 * Mapping headers CSV → camelCase Zod :
 *   beneficiary_email     → beneficiaryEmail
 *   beneficiary_full_name → beneficiaryFullName
 *   beneficiary_type      → beneficiaryType  (lowercase: employee/consultant/dirigeant/external)
 *   units_granted         → unitsGranted     (parsed Number)
 *   exercise_price        → exercisePrice    (parsed Number, optional)
 *   grant_date            → grantDate        (YYYY-MM-DD)
 *   vesting_start_date    → vestingStartDate (YYYY-MM-DD, optional)
 */

export type ParsedRow = Partial<BulkAwardRow> & { __raw: Record<string, string> };

export type RowValidationResult =
  | { valid: true }
  | { valid: false; errors: { path: string; message: string }[] };

const REQUIRED_HEADERS = [
  'beneficiary_email',
  'beneficiary_full_name',
  'beneficiary_type',
  'units_granted',
  'grant_date',
];

const OPTIONAL_HEADERS = ['exercise_price', 'vesting_start_date'];

const HEADER_MAP: Record<string, keyof BulkAwardRow> = {
  beneficiary_email: 'beneficiaryEmail',
  beneficiary_full_name: 'beneficiaryFullName',
  beneficiary_type: 'beneficiaryType',
  units_granted: 'unitsGranted',
  exercise_price: 'exercisePrice',
  grant_date: 'grantDate',
  vesting_start_date: 'vestingStartDate',
};

export function parseAwardsCsv(csvText: string): {
  rows: ParsedRow[];
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

  const rows: ParsedRow[] = parsed.data.map((raw) => {
    const row: ParsedRow = { __raw: raw };
    for (const [csvKey, zodKey] of Object.entries(HEADER_MAP)) {
      const v = raw[csvKey]?.trim();
      if (v === undefined || v === '') continue;
      switch (zodKey) {
        case 'unitsGranted': {
          const n = Number(v);
          if (Number.isFinite(n)) (row as Record<string, unknown>)[zodKey] = n;
          else (row as Record<string, unknown>)[zodKey] = v;
          break;
        }
        case 'exercisePrice': {
          const n = Number(v.replace(',', '.'));
          if (Number.isFinite(n)) (row as Record<string, unknown>)[zodKey] = n;
          else (row as Record<string, unknown>)[zodKey] = v;
          break;
        }
        case 'beneficiaryType':
          (row as Record<string, unknown>)[zodKey] = v.toLowerCase();
          break;
        default:
          (row as Record<string, unknown>)[zodKey] = v;
      }
    }
    return row;
  });

  return { rows, error: null };
}

export function validateBulkRows(rows: ParsedRow[]): RowValidationResult[] {
  return rows.map((row) => {
    const { __raw, ...candidate } = row;
    void __raw;
    const result = bulkAwardRowSchema.safeParse(candidate);
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

export function summarizeBulk(
  rows: ParsedRow[],
  validations: RowValidationResult[],
): {
  total: number;
  valid: number;
  invalid: number;
  totalUnits: number;
} {
  let valid = 0;
  let totalUnits = 0;
  validations.forEach((v, i) => {
    if (v.valid) {
      valid += 1;
      const u = rows[i]?.unitsGranted;
      if (typeof u === 'number') totalUnits += u;
    }
  });
  return {
    total: rows.length,
    valid,
    invalid: rows.length - valid,
    totalUnits,
  };
}

export const BULK_HEADERS = {
  required: REQUIRED_HEADERS,
  optional: OPTIONAL_HEADERS,
};
