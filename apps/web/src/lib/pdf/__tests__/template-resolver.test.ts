import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  resolveDocumentTemplate,
  resolveDocumentTemplateOrThrow,
  resolveTemplateCodeFromPlanType,
  SUPPORTED_AWARD_TEMPLATE_CODES,
  TemplateNotFoundError,
} from '../template-resolver';

// Le builder Supabase fluent est trop stricte pour qu'on en assemble un faux
// précis : on passe par un alias `MockedClient` qui satisfait le contrat
// minimal `Pick<SupabaseClient, 'from'>` côté resolver.
type MockedClient = Pick<SupabaseClient, 'from'>;

/**
 * V1.1 PR #49 — tests fallback GLOBAL pour `resolveDocumentTemplate`.
 *
 * On mocke un client Supabase minimal qui répond aux deux queries séquentielles
 * (org-specific puis GLOBAL). On vérifie :
 *   1. org-specific trouvé → utilise org-specific (pas de fallback)
 *   2. org-specific absent + GLOBAL trouvé → utilise GLOBAL (`isGlobal=true`)
 *   3. ni org ni GLOBAL → return null (et throw via OrThrow)
 *   4. plan_type → code mapping (BSPCE/AGA/SO/RSU/BSA)
 */

const TEST_ORG_ID = '0fb0c0d0-2222-4222-8222-222222222222';

type Row = {
  id: string;
  code: string;
  version: number;
  name: string;
  category: string;
  org_id: string | null;
} | null;

function buildClient(opts: { orgRow?: Row; globalRow?: Row }) {
  const calls: Array<'org' | 'global'> = [];

  // Chain factory : on garde un drapeau `seenOrgIdNull` qui passe à true
  // dès qu'on appelle `.is('org_id', null)` au lieu de `.eq('org_id', orgId)`.
  // C'est ce qui distingue les 2 queries du resolver.
  const buildChain = () => {
    let seenOrgIdNull = false;
    const builder = {
      select: () => builder,
      eq: () => builder,
      is: (col: string, val: unknown) => {
        if (col === 'org_id' && val === null) {
          seenOrgIdNull = true;
        }
        return builder;
      },
      maybeSingle: () => {
        if (seenOrgIdNull) {
          calls.push('global');
          return Promise.resolve({ data: opts.globalRow ?? null, error: null });
        }
        calls.push('org');
        return Promise.resolve({ data: opts.orgRow ?? null, error: null });
      },
    };
    return builder;
  };

  const client = {
    from: vi.fn((table: string) => {
      if (table !== 'document_templates') {
        throw new Error(`Unexpected table: ${table}`);
      }
      return buildChain();
    }),
  } as unknown as MockedClient;

  return { client, calls };
}

describe('resolveTemplateCodeFromPlanType (V1.1 extended)', () => {
  it('maps BSPCE → BSPCE_GRANT_LETTER', () => {
    expect(resolveTemplateCodeFromPlanType('BSPCE')).toBe('BSPCE_GRANT_LETTER');
  });

  it('maps AGA + AGA_PERFORMANCE → AGA_GRANT_LETTER', () => {
    expect(resolveTemplateCodeFromPlanType('AGA')).toBe('AGA_GRANT_LETTER');
    expect(resolveTemplateCodeFromPlanType('AGA_PERFORMANCE')).toBe('AGA_GRANT_LETTER');
  });

  it('maps STOCK_OPTION → SO_GRANT_LETTER', () => {
    expect(resolveTemplateCodeFromPlanType('STOCK_OPTION')).toBe('SO_GRANT_LETTER');
  });

  it('NEW V1.1 : maps RSU → RSU_GRANT_LETTER', () => {
    expect(resolveTemplateCodeFromPlanType('RSU')).toBe('RSU_GRANT_LETTER');
  });

  it('NEW V1.1 : maps BSA → BSA_GRANT_LETTER', () => {
    expect(resolveTemplateCodeFromPlanType('BSA')).toBe('BSA_GRANT_LETTER');
  });

  it('returns null for unsupported plan_type (e.g. PHANTOM, ESOP)', () => {
    expect(resolveTemplateCodeFromPlanType('PHANTOM')).toBeNull();
    expect(resolveTemplateCodeFromPlanType('ESOP')).toBeNull();
    expect(resolveTemplateCodeFromPlanType('SAR')).toBeNull();
    expect(resolveTemplateCodeFromPlanType('PERFORMANCE_SHARE')).toBeNull();
  });

  it('SUPPORTED_AWARD_TEMPLATE_CODES contient les 5 codes V1.1', () => {
    expect(SUPPORTED_AWARD_TEMPLATE_CODES).toEqual([
      'BSPCE_GRANT_LETTER',
      'AGA_GRANT_LETTER',
      'SO_GRANT_LETTER',
      'RSU_GRANT_LETTER',
      'BSA_GRANT_LETTER',
    ]);
  });
});

describe('resolveDocumentTemplate (V1.1 GLOBAL fallback)', () => {
  it('org-specific trouvé → utilise org-specific, pas de fallback', async () => {
    const orgRow = {
      id: 'tpl-org',
      code: 'BSPCE_GRANT_LETTER',
      version: 2,
      name: 'BSPCE custom org',
      category: 'AWARD_LETTER',
      org_id: TEST_ORG_ID,
    };
    const { client, calls } = buildClient({ orgRow });
    const res = await resolveDocumentTemplate(client, {
      orgId: TEST_ORG_ID,
      code: 'BSPCE_GRANT_LETTER',
    });
    expect(res).toEqual({
      id: 'tpl-org',
      code: 'BSPCE_GRANT_LETTER',
      version: 2,
      name: 'BSPCE custom org',
      category: 'AWARD_LETTER',
      isGlobal: false,
    });
    // Optimisation : si on a trouvé l'org-specific, pas besoin de re-query GLOBAL
    expect(calls).toEqual(['org']);
  });

  it('org-specific absent + GLOBAL trouvé → utilise GLOBAL (isGlobal=true)', async () => {
    const globalRow = {
      id: 'tpl-global',
      code: 'RSU_GRANT_LETTER',
      version: 1,
      name: 'RSU GLOBAL',
      category: 'AWARD_LETTER',
      org_id: null,
    };
    const { client, calls } = buildClient({ orgRow: null, globalRow });
    const res = await resolveDocumentTemplate(client, {
      orgId: TEST_ORG_ID,
      code: 'RSU_GRANT_LETTER',
    });
    expect(res).toEqual({
      id: 'tpl-global',
      code: 'RSU_GRANT_LETTER',
      version: 1,
      name: 'RSU GLOBAL',
      category: 'AWARD_LETTER',
      isGlobal: true,
    });
    // Les 2 queries doivent avoir été tentées dans l'ordre
    expect(calls).toEqual(['org', 'global']);
  });

  it('aucun match → return null', async () => {
    const { client, calls } = buildClient({ orgRow: null, globalRow: null });
    const res = await resolveDocumentTemplate(client, {
      orgId: TEST_ORG_ID,
      code: 'BSA_GRANT_LETTER',
    });
    expect(res).toBeNull();
    expect(calls).toEqual(['org', 'global']);
  });
});

describe('resolveDocumentTemplateOrThrow', () => {
  it('match trouvé → return value', async () => {
    const orgRow = {
      id: 'tpl-1',
      code: 'BSPCE_GRANT_LETTER',
      version: 1,
      name: 'X',
      category: 'AWARD_LETTER',
      org_id: TEST_ORG_ID,
    };
    const { client } = buildClient({ orgRow });
    const res = await resolveDocumentTemplateOrThrow(client, {
      orgId: TEST_ORG_ID,
      code: 'BSPCE_GRANT_LETTER',
    });
    expect(res.id).toBe('tpl-1');
    expect(res.isGlobal).toBe(false);
  });

  it('aucun match → throw TemplateNotFoundError avec orgId + code', async () => {
    const { client } = buildClient({ orgRow: null, globalRow: null });
    await expect(() =>
      resolveDocumentTemplateOrThrow(client, {
        orgId: TEST_ORG_ID,
        code: 'BSA_GRANT_LETTER',
      }),
    ).rejects.toThrowError(TemplateNotFoundError);

    try {
      await resolveDocumentTemplateOrThrow(client, {
        orgId: TEST_ORG_ID,
        code: 'BSA_GRANT_LETTER',
      });
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateNotFoundError);
      expect((err as TemplateNotFoundError).code).toBe('BSA_GRANT_LETTER');
      expect((err as TemplateNotFoundError).orgId).toBe(TEST_ORG_ID);
      expect((err as Error).message).toContain('TEMPLATE_NOT_FOUND');
      expect((err as Error).message).toContain('BSA_GRANT_LETTER');
    }
  });
});
