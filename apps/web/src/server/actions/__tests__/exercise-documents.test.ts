import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Module 9 B5 — Tests des 2 hooks PDF generators (notification + bulletin).
 *
 * Mocke renderPdfFromTemplate (pas de PDF binaire en Vitest), Supabase admin
 * client (DB + Storage), logAuditEvent. Pattern vi.hoisted.
 *
 * Couverture :
 *  - generateExerciseNotification : success path complet (RPC ctx → render →
 *    upload → INSERT doc → UPDATE FK → audit)
 *  - Idempotence : si notification_document_id NOT NULL → return alreadyExists
 *  - Erreur RPC ctx null → ok:false
 *  - Erreur render (e.g. AGA throw) → ok:false
 *  - Erreur upload Storage → ok:false, no INSERT
 *  - Erreur INSERT document_instance → rollback Storage (remove called)
 *  - Idem pour generateSubscriptionBulletin
 */

const { TEST_EXERCISE_ID, TEST_ORG_ID } = vi.hoisted(() => ({
  TEST_EXERCISE_ID: 'e0b0c0d0-1111-4111-8111-111111111111',
  TEST_ORG_ID: '0fb0c0d0-2222-4222-8222-222222222222',
}));

const { mockState } = vi.hoisted(() => ({
  mockState: {
    exercise: null as null | {
      id: string;
      org_id: string;
      notification_document_id: string | null;
      bulletin_document_id: string | null;
      request_number: string | null;
    },
    rpcContextResult: { regime: 'BSPCE_3Y_LESS' } as unknown,
    rpcError: null as null | { message: string },
    renderResult: { buffer: Buffer.from('PDF'), hash: 'h0', size: 3 } as unknown,
    renderError: null as null | Error,
    uploadError: null as null | { message: string },
    storageRemoveCalls: [] as string[][],
    docTemplate: { id: 'tpl-1', version: 1 } as null | { id: string; version: number },
    insertDocResult: { id: 'doc-99' } as null | { id: string },
    insertDocError: null as null | { message: string },
    updateExerciseError: null as null | { message: string },
    auditCalls: [] as Array<{ eventType: string; metadata?: unknown }>,
  },
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(async (input: { eventType: string; metadata?: unknown }) => {
    mockState.auditCalls.push({ eventType: input.eventType, metadata: input.metadata });
  }),
}));

vi.mock('@/lib/pdf/render', () => ({
  renderPdfFromTemplate: vi.fn(async () => {
    if (mockState.renderError) throw mockState.renderError;
    return mockState.renderResult as { buffer: Buffer; hash: string; size: number };
  }),
}));

vi.mock('@/lib/supabase/admin', () => {
  // Toolkit pour faker chains supabase fluent
  const buildExerciseChain = () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: () => Promise.resolve({ data: mockState.exercise, error: null }),
    };
    return builder;
  };
  const buildTemplateChain = () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      is: () => builder,
      maybeSingle: () => Promise.resolve({ data: mockState.docTemplate, error: null }),
    };
    return builder;
  };
  const buildInsertDocChain = () => {
    const builder = {
      insert: () => builder,
      select: () => builder,
      single: () =>
        Promise.resolve({
          data: mockState.insertDocResult,
          error: mockState.insertDocError,
        }),
    };
    return builder;
  };
  const buildUpdateExerciseChain = () => {
    const builder = {
      update: () => builder,
      eq: () => Promise.resolve({ error: mockState.updateExerciseError }),
    };
    return builder;
  };

  return {
    getSupabaseAdminClient: () => ({
      from: (table: string) => {
        if (table === 'exercise_requests') {
          // Differentiate select/update via lazy proxy : SELECT=> exercise; UPDATE=> updateChain
          return {
            select: () => buildExerciseChain(),
            update: buildUpdateExerciseChain().update,
          };
        }
        if (table === 'document_templates') {
          return buildTemplateChain();
        }
        if (table === 'document_instances') {
          return buildInsertDocChain();
        }
        return {};
      },
      rpc: (name: string) => {
        if (name === 'load_exercise_document_context') {
          return Promise.resolve({
            data: mockState.rpcContextResult,
            error: mockState.rpcError,
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
      storage: {
        from: () => ({
          upload: async () => ({ error: mockState.uploadError }),
          remove: async (paths: string[]) => {
            mockState.storageRemoveCalls.push(paths);
            return { error: null };
          },
        }),
      },
    }),
  };
});

import {
  generateExerciseNotification,
  generateSubscriptionBulletin,
} from '../_helpers/exercise-documents';

beforeEach(() => {
  mockState.exercise = {
    id: TEST_EXERCISE_ID,
    org_id: TEST_ORG_ID,
    notification_document_id: null,
    bulletin_document_id: null,
    request_number: 'EXR-2026-0099',
  };
  mockState.rpcContextResult = {
    exercise: { id: TEST_EXERCISE_ID, request_number: 'EXR-2026-0099', units_to_exercise: 100 },
    plan: { plan_type: 'BSPCE' },
  };
  mockState.rpcError = null;
  mockState.renderResult = { buffer: Buffer.from('PDF-CONTENT'), hash: 'sha-99', size: 11 };
  mockState.renderError = null;
  mockState.uploadError = null;
  mockState.storageRemoveCalls = [];
  mockState.docTemplate = { id: 'tpl-1', version: 1 };
  mockState.insertDocResult = { id: 'doc-99' };
  mockState.insertDocError = null;
  mockState.updateExerciseError = null;
  mockState.auditCalls = [];
});

describe('generateExerciseNotification', () => {
  it('success path → render + upload + INSERT + UPDATE FK + audit', async () => {
    const res = await generateExerciseNotification({ exerciseRequestId: TEST_EXERCISE_ID });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.documentId).toBe('doc-99');
      expect(res.alreadyExists).toBe(false);
      expect(res.storagePath).toMatch(new RegExp(`${TEST_ORG_ID}/exercises/${TEST_EXERCISE_ID}/`));
    }
    expect(mockState.auditCalls).toHaveLength(1);
    expect(mockState.auditCalls[0]!.eventType).toBe('exercise.notification_generated');
    expect(mockState.storageRemoveCalls).toHaveLength(0); // pas de rollback
  });

  it('idempotence : notification_document_id NOT NULL → skip render, return alreadyExists', async () => {
    mockState.exercise!.notification_document_id = 'existing-doc-id';
    const res = await generateExerciseNotification({ exerciseRequestId: TEST_EXERCISE_ID });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.documentId).toBe('existing-doc-id');
      expect(res.alreadyExists).toBe(true);
      expect(res.storagePath).toBeNull();
    }
    expect(mockState.auditCalls).toHaveLength(0); // pas d'audit si skip
  });

  it('exercise introuvable → ok:false', async () => {
    mockState.exercise = null;
    const res = await generateExerciseNotification({ exerciseRequestId: TEST_EXERCISE_ID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('introuvable');
  });

  it('RPC ctx null → ok:false', async () => {
    mockState.rpcContextResult = null;
    const res = await generateExerciseNotification({ exerciseRequestId: TEST_EXERCISE_ID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('load_exercise_document_context');
  });

  it('render throw (AGA assertion) → ok:false avec message render', async () => {
    mockState.renderError = new Error('AGA plans cannot exercise');
    const res = await generateExerciseNotification({ exerciseRequestId: TEST_EXERCISE_ID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('AGA plans cannot exercise');
  });

  it('upload Storage erreur → ok:false, no INSERT, no rollback', async () => {
    mockState.uploadError = { message: 'bucket full' };
    const res = await generateExerciseNotification({ exerciseRequestId: TEST_EXERCISE_ID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('bucket full');
    expect(mockState.storageRemoveCalls).toHaveLength(0); // pas de rollback (rien à rollback)
    expect(mockState.auditCalls).toHaveLength(0);
  });

  it('INSERT document_instance erreur → ok:false + rollback Storage', async () => {
    mockState.insertDocResult = null;
    mockState.insertDocError = { message: 'unique violation' };
    const res = await generateExerciseNotification({ exerciseRequestId: TEST_EXERCISE_ID });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('unique violation');
    expect(mockState.storageRemoveCalls).toHaveLength(1); // rollback effectué
  });
});

describe('generateSubscriptionBulletin', () => {
  it('success path → audit exercise.bulletin_generated', async () => {
    const res = await generateSubscriptionBulletin({ exerciseRequestId: TEST_EXERCISE_ID });
    expect(res.ok).toBe(true);
    expect(mockState.auditCalls).toHaveLength(1);
    expect(mockState.auditCalls[0]!.eventType).toBe('exercise.bulletin_generated');
  });

  it('idempotence : bulletin_document_id NOT NULL → skip', async () => {
    mockState.exercise!.bulletin_document_id = 'existing-bulletin-id';
    const res = await generateSubscriptionBulletin({ exerciseRequestId: TEST_EXERCISE_ID });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.documentId).toBe('existing-bulletin-id');
      expect(res.alreadyExists).toBe(true);
    }
  });

  it('upload erreur → ok:false', async () => {
    mockState.uploadError = { message: 'storage 500' };
    const res = await generateSubscriptionBulletin({ exerciseRequestId: TEST_EXERCISE_ID });
    expect(res.ok).toBe(false);
  });
});
