/**
 * PR #42 B4 — Builder CSV pour export audit (lib pure, testable).
 *
 * Format conçu pour Excel FR + comptables :
 * - Séparateur virgule (`,`) standard CSV (pas point-virgule — UTF-8 BOM
 *   pré-pendé pour qu'Excel interprète correctement le séparateur)
 * - BOM UTF-8 (﻿) en première position pour éviter mojibake (caractères
 *   accentués mal décodés en latin-1 par défaut)
 * - Escape RFC 4180 : `"` → `""`, cellules contenant `,` `"` `\n` enveloppées
 *   de `"`
 * - Newline CRLF (\r\n) — RFC 4180 + Excel-friendly
 *
 * Colonnes :
 * - chain_position : position dans la chaîne (vide pour pré-Module 13)
 * - occurred_at : ISO 8601 UTC
 * - event_type : ex `award.status_changed`
 * - actor_email : user_email ou 'Système'
 * - resource_type / resource_id : si présent
 * - verb_fr : verbalize() français FR pour lecture humaine
 * - event_hash : hash full 64 hex (vide si pré-Module 13)
 * - previous_hash : (vide pour genesis ou pré-Module 13)
 */

import { verbalizeEvent } from './format';
import type { AuditEventForExport } from '@/server/queries/audit-export';

export const CSV_COLUMNS = [
  'chain_position',
  'occurred_at',
  'event_type',
  'actor_email',
  'resource_type',
  'resource_id',
  'verb_fr',
  'event_hash',
  'previous_hash',
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

/** BOM UTF-8 pour Excel — sans ça, Excel décode latin-1 → mojibake (é → Ã©). */
export const UTF8_BOM = '﻿';

export const CSV_SEPARATOR = ',';
export const CSV_NEWLINE = '\r\n';

/**
 * Escape une cellule CSV per RFC 4180 :
 * - Si contient `,`, `"`, `\n`, ou `\r` → wrap en `"…"` + double-quote interne
 * - Sinon as-is
 * - null/undefined → cellule vide
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str: string;
  if (typeof value === 'string') {
    str = value;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    str = String(value);
  } else {
    // object / array → JSON stringify pour qu'Excel voie quelque chose lisible
    try {
      str = JSON.stringify(value);
    } catch {
      str = String(value);
    }
  }

  if (str.length === 0) return '';
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Construit la ligne CSV pour un audit_event.
 * `verb_fr` est composé via verbalizeEvent (verb + object + context concatenés
 * en une seule string lisible).
 */
export function buildCsvRow(event: AuditEventForExport): string {
  const verb = verbalizeEvent(event);
  const verbFr = [verb.verb, verb.object, verb.context].filter(Boolean).join(' ').trim();

  const cells: ReadonlyArray<unknown> = [
    event.chain_position,
    event.occurred_at,
    event.event_type,
    event.user_email ?? 'Système',
    event.resource_type,
    event.resource_id,
    verbFr,
    event.event_hash,
    event.previous_hash,
  ];

  return cells.map(escapeCsvCell).join(CSV_SEPARATOR);
}

/**
 * Build le CSV complet (BOM + header + rows + CRLF).
 */
export function buildAuditCsv(events: ReadonlyArray<AuditEventForExport>): string {
  const headerRow = CSV_COLUMNS.map(escapeCsvCell).join(CSV_SEPARATOR);
  const dataRows = events.map(buildCsvRow);
  return UTF8_BOM + [headerRow, ...dataRows].join(CSV_NEWLINE) + CSV_NEWLINE;
}
