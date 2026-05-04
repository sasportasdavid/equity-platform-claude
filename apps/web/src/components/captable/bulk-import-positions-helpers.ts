import Papa from 'papaparse';
import {
  importPositionRowSchema,
  type ImportPositionRowInput,
  STAKEHOLDER_TYPES_IMPORT,
} from '@equity/shared';

/**
 * Module 10 B6 — Helpers parsing & validation pour bulk import positions.
 *
 * Pure functions testables sans DOM. Le composant
 * `ImportPositionsWizard` les consomme.
 *
 * Headers CSV → camelCase Zod :
 *   stakeholder_type        → stakeholderType
 *   stakeholder_name        → stakeholderName
 *   stakeholder_email       → stakeholderEmail
 *   share_class_code        → shareClassCode
 *   units                   → units (parseFloat)
 *   acquired_at             → acquiredAt (YYYY-MM-DD)
 *   cost_basis_per_unit     → costBasisPerUnit (parseFloat optionnel)
 *   notes                   → notes
 */

export type ParsedImportRow = Partial<ImportPositionRowInput> & {
  __raw: Record<string, string>;
};

export type ImportRowValidation =
  | { valid: true; data: ImportPositionRowInput }
  | { valid: false; errors: { path: string; message: string }[] };

const REQUIRED_HEADERS = [
  'stakeholder_type',
  'stakeholder_name',
  'share_class_code',
  'units',
  'acquired_at',
];
const OPTIONAL_HEADERS = ['stakeholder_email', 'cost_basis_per_unit', 'notes'];

/**
 * Ordre des colonnes dans le CSV template — distinct de REQUIRED ∪ OPTIONAL
 * pour offrir un template lisible humainement (email à côté de name).
 */
const TEMPLATE_COLUMN_ORDER = [
  'stakeholder_type',
  'stakeholder_name',
  'stakeholder_email',
  'share_class_code',
  'units',
  'acquired_at',
  'cost_basis_per_unit',
  'notes',
];

const HEADER_MAP: Record<string, keyof ImportPositionRowInput> = {
  stakeholder_type: 'stakeholderType',
  stakeholder_name: 'stakeholderName',
  stakeholder_email: 'stakeholderEmail',
  share_class_code: 'shareClassCode',
  units: 'units',
  acquired_at: 'acquiredAt',
  cost_basis_per_unit: 'costBasisPerUnit',
  notes: 'notes',
};

export const CSV_TEMPLATE_HEADERS = TEMPLATE_COLUMN_ORDER;

/**
 * Génère un CSV template (4 rows d'exemple : 2 FOUNDER, 1 INVESTOR, 1 BENEFICIARY).
 * Encodage UTF-8 avec BOM pour Excel friendliness.
 */
export function buildCsvTemplate(): string {
  const headerLine = CSV_TEMPLATE_HEADERS.join(',');
  const examples = [
    'FOUNDER,Alice Dupont,alice@example.com,COMMON,500000,2020-01-15,0.10,Co-founder original allocation',
    'FOUNDER,Bob Martin,bob@example.com,COMMON,500000,2020-01-15,0.10,Co-founder original allocation',
    'INVESTOR,Lead VC SAS,contact@leadvc.com,PREF_A,250000,2024-06-20,4.00,Series A lead',
    'BENEFICIARY,Carla Rivera,carla@example.com,COMMON,5000,2024-08-01,1.50,Award exercised',
  ];
  // BOM UTF-8 pour Excel
  return '﻿' + [headerLine, ...examples].join('\n') + '\n';
}

function parseNumberOptional(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

export function parsePositionsCsv(csvText: string): {
  rows: ParsedImportRow[];
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
    return { rows: [], error: `Erreur CSV ligne ${first.row ?? '?'}: ${first.message}` };
  }

  const headers = (parsed.meta.fields ?? []).map((h) => h.toLowerCase());
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    return {
      rows: [],
      error: `Headers manquants : ${missing.join(', ')}. Requis : ${REQUIRED_HEADERS.join(', ')}.`,
    };
  }

  const rows: ParsedImportRow[] = parsed.data.map((raw) => {
    const row: ParsedImportRow = { __raw: raw };
    for (const [csvKey, zodKey] of Object.entries(HEADER_MAP)) {
      const v = raw[csvKey]?.trim();
      if (v === undefined || v === '') continue;
      switch (zodKey) {
        case 'stakeholderType':
          (row as Record<string, unknown>)[zodKey] = v.toUpperCase();
          break;
        case 'shareClassCode':
          (row as Record<string, unknown>)[zodKey] = v.toUpperCase();
          break;
        case 'units':
        case 'costBasisPerUnit': {
          const n = parseNumberOptional(v);
          if (n !== undefined) (row as Record<string, unknown>)[zodKey] = n;
          break;
        }
        case 'stakeholderEmail':
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

export function validateRow(row: ParsedImportRow): ImportRowValidation {
  const result = importPositionRowSchema.safeParse(row);
  if (result.success) {
    return { valid: true, data: result.data };
  }
  return {
    valid: false,
    errors: result.error.issues.map((iss) => ({
      path: iss.path.join('.') || '(root)',
      message: iss.message,
    })),
  };
}

export type ImportSummary = {
  total: number;
  valid: number;
  invalid: number;
  byStakeholderType: Record<string, number>;
  byShareClass: Record<string, number>;
};

export function computeSummary(rows: ParsedImportRow[]): ImportSummary {
  const byStakeholderType: Record<string, number> = {};
  const byShareClass: Record<string, number> = {};
  let valid = 0;
  let invalid = 0;
  for (const row of rows) {
    const v = validateRow(row);
    if (v.valid) {
      valid++;
      byStakeholderType[v.data.stakeholderType] =
        (byStakeholderType[v.data.stakeholderType] ?? 0) + 1;
      byShareClass[v.data.shareClassCode] = (byShareClass[v.data.shareClassCode] ?? 0) + 1;
    } else {
      invalid++;
    }
  }
  return { total: rows.length, valid, invalid, byStakeholderType, byShareClass };
}

export const KNOWN_STAKEHOLDER_TYPES = STAKEHOLDER_TYPES_IMPORT;
