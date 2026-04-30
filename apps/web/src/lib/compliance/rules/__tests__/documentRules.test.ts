import { describe, expect, it } from 'vitest';
import { DOCUMENT_NOT_VOIDED, FMV_RECENT_ENOUGH, SIGNERS_COMPLETE_INFO } from '../documentRules';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

describe('FMV_RECENT_ENOUGH', () => {
  it('FMV récent (6 mois) → null', async () => {
    const sixMonthsAgo = new Date(Date.now() - 180 * ONE_DAY_MS).toISOString();
    const issue = await FMV_RECENT_ENOUGH.check(
      { awardId: 'a', planId: 'p' },
      { fmvSetAt: sixMonthsAgo },
    );
    expect(issue).toBeNull();
  });

  it('FMV ancienne (14 mois) → WARNING', async () => {
    const fourteenMonthsAgo = new Date(Date.now() - 420 * ONE_DAY_MS).toISOString();
    const issue = await FMV_RECENT_ENOUGH.check(
      { awardId: 'a', planId: 'p' },
      { fmvSetAt: fourteenMonthsAgo },
    );
    expect(issue?.severity).toBe('WARNING');
    expect(issue?.code).toBe('FMV_RECENT_ENOUGH');
    expect(issue?.message).toMatch(/mois/);
  });

  it('FMV null (jamais setté) → null (pas de check)', async () => {
    const issue = await FMV_RECENT_ENOUGH.check({ awardId: 'a', planId: 'p' }, { fmvSetAt: null });
    expect(issue).toBeNull();
  });

  it('FMV pile 12 mois → null (limite incluse)', async () => {
    const exactlyTwelveMonthsAgo = new Date(Date.now() - 365 * ONE_DAY_MS + 1000).toISOString();
    const issue = await FMV_RECENT_ENOUGH.check(
      { awardId: 'a', planId: 'p' },
      { fmvSetAt: exactlyTwelveMonthsAgo },
    );
    expect(issue).toBeNull();
  });
});

describe('SIGNERS_COMPLETE_INFO', () => {
  it('signers complets → null', async () => {
    const issue = await SIGNERS_COMPLETE_INFO.check(
      {
        documentId: 'd',
        documentStatus: 'GENERATED',
        signers: [
          { fullName: 'Jean Dupont', email: 'jean@test.com' },
          { fullName: 'Société SAS', email: 'rh@societe.com' },
        ],
      },
      {},
    );
    expect(issue).toBeNull();
  });

  it('1 signer sans email → ERROR', async () => {
    const issue = await SIGNERS_COMPLETE_INFO.check(
      {
        documentId: 'd',
        documentStatus: 'GENERATED',
        signers: [{ fullName: 'Jean Dupont', email: '' }],
      },
      {},
    );
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.code).toBe('SIGNERS_COMPLETE_INFO');
    expect(issue?.message).toMatch(/email/);
  });

  it('1 signer sans fullName → ERROR', async () => {
    const issue = await SIGNERS_COMPLETE_INFO.check(
      {
        documentId: 'd',
        documentStatus: 'GENERATED',
        signers: [{ fullName: '', email: 'jean@test.com' }],
      },
      {},
    );
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.message).toMatch(/nom complet/);
  });

  it('liste vide → null (pas un échec, pas de signer à valider)', async () => {
    const issue = await SIGNERS_COMPLETE_INFO.check(
      { documentId: 'd', documentStatus: 'GENERATED', signers: [] },
      {},
    );
    expect(issue).toBeNull();
  });
});

describe('DOCUMENT_NOT_VOIDED', () => {
  it('status GENERATED → null', async () => {
    const issue = await DOCUMENT_NOT_VOIDED.check(
      { documentId: 'd', documentStatus: 'GENERATED', signers: [] },
      {},
    );
    expect(issue).toBeNull();
  });

  it('status SIGNED → null (déjà signé, pas un blocker pour ré-envoi)', async () => {
    const issue = await DOCUMENT_NOT_VOIDED.check(
      { documentId: 'd', documentStatus: 'SIGNED', signers: [] },
      {},
    );
    expect(issue).toBeNull();
  });

  it('status VOIDED → ERROR', async () => {
    const issue = await DOCUMENT_NOT_VOIDED.check(
      { documentId: 'd', documentStatus: 'VOIDED', signers: [] },
      {},
    );
    expect(issue?.severity).toBe('ERROR');
    expect(issue?.code).toBe('DOCUMENT_NOT_VOIDED');
  });
});
