import { describe, expect, it } from 'vitest';
import { AUDIT_EXPORT_FORMAT_VERSION, buildAuditExportJson } from '../export-json-builder';
import { AUDIT_CHAIN_GENESIS_SOURCE } from '../chain';
import type { AuditEventForExport } from '@/server/queries/audit-export';

const TEST_ORG = '526b87a9-ef7f-4831-9049-5182092b2bce';

function makeEvent(
  position: number | null,
  hash: string | null,
  prev: string | null,
  overrides: Partial<AuditEventForExport> = {},
): AuditEventForExport {
  return {
    id: `aaaaaaaa-aaaa-aaaa-aaaa-${String(position ?? 0).padStart(12, '0')}`,
    org_id: TEST_ORG,
    user_id: null,
    user_email: null,
    event_type: 'test.fixture',
    resource_type: null,
    resource_id: null,
    metadata: {},
    before_state: null,
    after_state: null,
    occurred_at: '2026-05-05T10:00:00.000Z',
    ip_address: null,
    user_agent: null,
    request_id: null,
    event_hash: hash,
    previous_hash: prev,
    chain_position: position,
    ...overrides,
  };
}

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

const baseGeneratedBy = {
  user_id: 'user-1',
  user_email: 'admin@capiwise.local',
  org_id: TEST_ORG,
  org_name: 'Paragraphe',
};

describe('buildAuditExportJson — PR #42 B2', () => {
  it('format_version aligné sur la constante', () => {
    const result = buildAuditExportJson({
      generatedBy: baseGeneratedBy,
      filters: {},
      integrity: null,
      events: [],
      truncated: false,
    });
    expect(result.format_version).toBe(AUDIT_EXPORT_FORMAT_VERSION);
    expect(result.format_version).toBe('1.0');
  });

  it('integrity.genesis_source pin la string SQL', () => {
    const result = buildAuditExportJson({
      generatedBy: baseGeneratedBy,
      filters: {},
      integrity: null,
      events: [],
      truncated: false,
    });
    expect(result.integrity.genesis_source).toBe(AUDIT_CHAIN_GENESIS_SOURCE);
    expect(result.integrity.genesis_source).toBe('CAPIWISE_AUDIT_GENESIS_2026_05');
  });

  it('range : null si filters absents', () => {
    const result = buildAuditExportJson({
      generatedBy: baseGeneratedBy,
      filters: {},
      integrity: null,
      events: [],
      truncated: false,
    });
    expect(result.range).toEqual({
      from: null,
      to: null,
      event_type_prefix: null,
    });
  });

  it('range : populé avec from/to/prefix si filters fournis', () => {
    const result = buildAuditExportJson({
      generatedBy: baseGeneratedBy,
      filters: { from: '2026-01-01', to: '2026-04-30', eventTypePrefix: 'plan' },
      integrity: null,
      events: [],
      truncated: false,
    });
    expect(result.range).toEqual({
      from: '2026-01-01',
      to: '2026-04-30',
      event_type_prefix: 'plan',
    });
  });

  it('range.event_type_prefix null si "all"', () => {
    const result = buildAuditExportJson({
      generatedBy: baseGeneratedBy,
      filters: { eventTypePrefix: 'all' },
      integrity: null,
      events: [],
      truncated: false,
    });
    expect(result.range.event_type_prefix).toBeNull();
  });

  it('integrity.chain_head_hash = event_hash du dernier event chained', () => {
    const events = [makeEvent(1, HASH_A, null), makeEvent(2, HASH_B, HASH_A)];
    const result = buildAuditExportJson({
      generatedBy: baseGeneratedBy,
      filters: {},
      integrity: {
        org_id: TEST_ORG,
        total_events: 2,
        verified_events: 2,
        broken_at: null,
        broken_event_id: null,
        is_intact: true,
      },
      events,
      truncated: false,
    });
    expect(result.integrity.chain_head_hash).toBe(HASH_B);
    expect(result.integrity.chain_position_max).toBe(2);
    expect(result.integrity.events_signed).toBe(2);
    expect(result.integrity.is_intact).toBe(true);
  });

  it('integrity.chain_head_hash null si aucun event chained (mark-and-sweep)', () => {
    const events = [
      makeEvent(null, null, null), // legacy
      makeEvent(null, null, null),
    ];
    const result = buildAuditExportJson({
      generatedBy: baseGeneratedBy,
      filters: {},
      integrity: null,
      events,
      truncated: false,
    });
    expect(result.integrity.chain_head_hash).toBeNull();
    expect(result.integrity.chain_position_max).toBeNull();
    expect(result.integrity.events_signed).toBe(0);
  });

  it('integrity.broken_at + broken_event_id propagés depuis intégrité DB', () => {
    const result = buildAuditExportJson({
      generatedBy: baseGeneratedBy,
      filters: {},
      integrity: {
        org_id: TEST_ORG,
        total_events: 5,
        verified_events: 2,
        broken_at: 3,
        broken_event_id: 'broken-event-uuid',
        is_intact: false,
      },
      events: [],
      truncated: false,
    });
    expect(result.integrity.is_intact).toBe(false);
    expect(result.integrity.broken_at).toBe(3);
    expect(result.integrity.broken_event_id).toBe('broken-event-uuid');
  });

  it('integrity.events_signed compte uniquement events avec event_hash', () => {
    const events = [
      makeEvent(1, HASH_A, null),
      makeEvent(2, null, null), // chain_position mais pas de hash (in-flight)
      makeEvent(null, null, null), // legacy
    ];
    const result = buildAuditExportJson({
      generatedBy: baseGeneratedBy,
      filters: {},
      integrity: null,
      events,
      truncated: false,
    });
    expect(result.integrity.events_signed).toBe(1);
  });

  it("events[] préservés dans l'ordre fourni avec tous les champs auditables", () => {
    const e1 = makeEvent(1, HASH_A, null, {
      event_type: 'plan.created',
      metadata: { plan_name: 'BSPCE-001' },
      ip_address: '192.168.1.1', // ne doit PAS apparaître dans l'export
    });
    const result = buildAuditExportJson({
      generatedBy: baseGeneratedBy,
      filters: {},
      integrity: null,
      events: [e1],
      truncated: false,
    });
    expect(result.events).toHaveLength(1);
    const exported = result.events[0]!;
    expect(exported.event_type).toBe('plan.created');
    expect(exported.event_hash).toBe(HASH_A);
    expect(exported.metadata).toEqual({ plan_name: 'BSPCE-001' });
    // PII sensitive omitted (ip_address is not in AuditEventExportRow type)
    expect((exported as Record<string, unknown>).ip_address).toBeUndefined();
  });

  it('truncated flag propagé', () => {
    const result = buildAuditExportJson({
      generatedBy: baseGeneratedBy,
      filters: {},
      integrity: null,
      events: [makeEvent(1, HASH_A, null)],
      truncated: true,
    });
    expect(result.truncated).toBe(true);
  });

  it('verify_endpoint_url override pour tests', () => {
    const result = buildAuditExportJson({
      generatedBy: baseGeneratedBy,
      filters: {},
      integrity: null,
      events: [],
      truncated: false,
      verifyEndpointUrl: 'https://localhost:3000/api/test',
    });
    expect(result.integrity.verify_endpoint_url).toBe('https://localhost:3000/api/test');
  });

  it('verify_endpoint_url default pointe vers prod capiwise.com', () => {
    const result = buildAuditExportJson({
      generatedBy: baseGeneratedBy,
      filters: {},
      integrity: null,
      events: [],
      truncated: false,
    });
    expect(result.integrity.verify_endpoint_url).toContain('capiwise.com');
    expect(result.integrity.verify_endpoint_url).toContain('verify-chain');
  });

  it('generated_at ISO 8601 UTC (déterministe via toISOString)', () => {
    const result = buildAuditExportJson({
      generatedBy: baseGeneratedBy,
      filters: {},
      integrity: null,
      events: [],
      truncated: false,
    });
    expect(result.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('generated_by passé tel quel (org_name peut être null)', () => {
    const result = buildAuditExportJson({
      generatedBy: { ...baseGeneratedBy, org_name: null },
      filters: {},
      integrity: null,
      events: [],
      truncated: false,
    });
    expect(result.generated_by.org_name).toBeNull();
    expect(result.generated_by.user_email).toBe('admin@capiwise.local');
  });
});
