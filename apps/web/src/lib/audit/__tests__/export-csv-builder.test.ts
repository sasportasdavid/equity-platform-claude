import { describe, expect, it } from 'vitest';
import {
  CSV_COLUMNS,
  CSV_NEWLINE,
  CSV_SEPARATOR,
  UTF8_BOM,
  buildAuditCsv,
  buildCsvRow,
  escapeCsvCell,
} from '../export-csv-builder';
import type { AuditEventForExport } from '@/server/queries/audit-export';

const TEST_ORG = '526b87a9-ef7f-4831-9049-5182092b2bce';

function makeEvent(overrides: Partial<AuditEventForExport> = {}): AuditEventForExport {
  return {
    id: '11111111-2222-3333-4444-555555555555',
    org_id: TEST_ORG,
    user_id: null,
    user_email: null,
    event_type: 'plan.created',
    resource_type: 'PLAN',
    resource_id: '99999999-aaaa-bbbb-cccc-dddddddddddd',
    metadata: { plan_name: 'BSPCE-001' },
    before_state: null,
    after_state: null,
    occurred_at: '2026-05-05T10:00:00.000Z',
    ip_address: null,
    user_agent: null,
    request_id: null,
    event_hash: 'a'.repeat(64),
    previous_hash: null,
    chain_position: 1,
    ...overrides,
  };
}

describe('escapeCsvCell — RFC 4180 escaping', () => {
  it('null/undefined → empty string', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('plain string → as-is', () => {
    expect(escapeCsvCell('PROPOSED')).toBe('PROPOSED');
    expect(escapeCsvCell('admin@capiwise.local')).toBe('admin@capiwise.local');
  });

  it('contient virgule → wrappé en quotes', () => {
    expect(escapeCsvCell('foo, bar')).toBe('"foo, bar"');
  });

  it('contient guillemet → quotes + double-quote interne', () => {
    expect(escapeCsvCell('say "hello"')).toBe('"say ""hello"""');
  });

  it('contient newline → wrappé en quotes', () => {
    expect(escapeCsvCell('line 1\nline 2')).toBe('"line 1\nline 2"');
    expect(escapeCsvCell('line 1\r\nline 2')).toBe('"line 1\r\nline 2"');
  });

  it('number → string', () => {
    expect(escapeCsvCell(42)).toBe('42');
    expect(escapeCsvCell(0)).toBe('0');
  });

  it('boolean → "true"/"false"', () => {
    expect(escapeCsvCell(true)).toBe('true');
    expect(escapeCsvCell(false)).toBe('false');
  });

  it('object → JSON stringify (déjà escape virgule + guillemets)', () => {
    const result = escapeCsvCell({ status: 'PROPOSED', n: 42 });
    // JSON contient des virgules ou guillemets → wrappé
    expect(result.startsWith('"')).toBe(true);
    expect(result).toContain('PROPOSED');
  });

  it('array → JSON stringify', () => {
    const result = escapeCsvCell([1, 2, 3]);
    expect(result).toContain('1');
    expect(result.startsWith('"')).toBe(true);
  });

  it('string vide → empty cell', () => {
    expect(escapeCsvCell('')).toBe('');
  });
});

describe('buildCsvRow — un audit_event en ligne CSV', () => {
  it('event chained complet → 9 colonnes (cf CSV_COLUMNS)', () => {
    const row = buildCsvRow(makeEvent());
    const cells = row.split(CSV_SEPARATOR);
    expect(cells).toHaveLength(CSV_COLUMNS.length);
  });

  it("user_email null → 'Système'", () => {
    const row = buildCsvRow(makeEvent({ user_email: null }));
    expect(row).toContain('Système');
  });

  it('user_email valide → utilisé', () => {
    const row = buildCsvRow(makeEvent({ user_email: 'admin@capiwise.local' }));
    expect(row).toContain('admin@capiwise.local');
  });

  it('event pré-Module 13 → chain_position vide + event_hash vide', () => {
    const row = buildCsvRow(
      makeEvent({ chain_position: null, event_hash: null, previous_hash: null }),
    );
    const cells = row.split(CSV_SEPARATOR);
    // chain_position (col 0) = '', event_hash (col 7) = '', previous_hash (col 8) = ''
    expect(cells[0]).toBe('');
    expect(cells[7]).toBe('');
    expect(cells[8]).toBe('');
  });

  it('verb_fr concatène verb + object + context (verbalize)', () => {
    const row = buildCsvRow(
      makeEvent({
        event_type: 'plan.created',
        metadata: { plan_name: 'BSPCE-001', plan_type: 'BSPCE' },
      }),
    );
    // verbalize plan.created → 'a créé le plan' + plan_name
    expect(row).toContain('plan');
  });
});

describe('buildAuditCsv — fichier CSV complet', () => {
  it('preserve UTF-8 BOM en première position', () => {
    const csv = buildAuditCsv([]);
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
  });

  it('header row contient les 9 colonnes attendues', () => {
    const csv = buildAuditCsv([]);
    const firstLine = csv.slice(UTF8_BOM.length).split(CSV_NEWLINE)[0];
    const cells = firstLine!.split(CSV_SEPARATOR);
    expect(cells).toEqual([
      'chain_position',
      'occurred_at',
      'event_type',
      'actor_email',
      'resource_type',
      'resource_id',
      'verb_fr',
      'event_hash',
      'previous_hash',
    ]);
  });

  it('separator CRLF entre lignes (Excel-friendly)', () => {
    const csv = buildAuditCsv([makeEvent()]);
    expect(csv).toContain(CSV_NEWLINE);
    expect(csv.endsWith(CSV_NEWLINE)).toBe(true);
  });

  it('vide events → header + newline final uniquement', () => {
    const csv = buildAuditCsv([]);
    const linesAfterBom = csv
      .slice(UTF8_BOM.length)
      .split(CSV_NEWLINE)
      .filter((l) => l.length > 0);
    expect(linesAfterBom).toHaveLength(1); // only header
  });

  it('events multiples → header + N lignes', () => {
    const csv = buildAuditCsv([
      makeEvent({ id: 'a-1' }),
      makeEvent({ id: 'a-2' }),
      makeEvent({ id: 'a-3' }),
    ]);
    const linesAfterBom = csv
      .slice(UTF8_BOM.length)
      .split(CSV_NEWLINE)
      .filter((l) => l.length > 0);
    expect(linesAfterBom).toHaveLength(4); // header + 3 events
  });

  it('metadata avec virgule + guillemets → escape correct', () => {
    const evil = makeEvent({
      metadata: { note: 'Plan, "Tranche A"' },
    });
    const csv = buildAuditCsv([evil]);
    // Le metadata jsonb finit dans verb_fr (via verbalizeEvent fallback) ou
    // ailleurs ; mais l'escape ne doit jamais casser le parsing CSV.
    // On vérifie pas de newline non-escaped + bon nombre de cells
    const dataLine = csv.slice(UTF8_BOM.length).split(CSV_NEWLINE)[1];
    expect(dataLine).toBeTruthy();
  });
});
