import { describe, expect, it } from 'vitest';
import { DOCUMENT_NOT_VOIDED, FMV_RECENT_ENOUGH, SIGNERS_COMPLETE_INFO } from '../documentRules';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Module 12.5 B3 — Sémantique V1.X : default `staleDays` = 90 jours
 * (vs `12 mois` ≈ 365 jours en V1). Plus strict. Documenté comme évolution
 * V1.X (commit + closure).
 */
describe('FMV_RECENT_ENOUGH', () => {
  it('FMV récente (60 jours) → null (sous le seuil 90j default)', async () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * ONE_DAY_MS).toISOString();
    const issue = await FMV_RECENT_ENOUGH.check(
      { awardId: 'a', planId: 'p' },
      { fmvSetAt: sixtyDaysAgo },
    );
    expect(issue).toBeNull();
  });

  it('FMV ancienne (120 jours) → WARNING (au-delà 90j default)', async () => {
    const oneTwentyDaysAgo = new Date(Date.now() - 120 * ONE_DAY_MS).toISOString();
    const issue = await FMV_RECENT_ENOUGH.check(
      { awardId: 'a', planId: 'p' },
      { fmvSetAt: oneTwentyDaysAgo },
    );
    expect(issue?.severity).toBe('WARNING');
    expect(issue?.code).toBe('FMV_RECENT_ENOUGH');
    expect(issue?.message).toMatch(/jours/);
    expect(issue?.message).toMatch(/seuil 90 jours/);
  });

  it('FMV null (jamais setté) → null (pas de check)', async () => {
    const issue = await FMV_RECENT_ENOUGH.check({ awardId: 'a', planId: 'p' }, { fmvSetAt: null });
    expect(issue).toBeNull();
  });

  it('FMV pile 90 jours → null (limite incluse)', async () => {
    const exactlyNinetyDaysAgo = new Date(Date.now() - 90 * ONE_DAY_MS + 1000).toISOString();
    const issue = await FMV_RECENT_ENOUGH.check(
      { awardId: 'a', planId: 'p' },
      { fmvSetAt: exactlyNinetyDaysAgo },
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

// ===========================================================================
// Module 12.5 B3 — Lecture des seuils + severity depuis ctx
// ===========================================================================

describe('FMV_RECENT_ENOUGH — params dynamiques (Module 12.5 B3)', () => {
  it('utilise staleDays=180 (org permissive) — 100 jours passe', async () => {
    const oneHundredDaysAgo = new Date(Date.now() - 100 * ONE_DAY_MS).toISOString();
    const issue = await FMV_RECENT_ENOUGH.check(
      { awardId: 'a', planId: 'p' },
      {
        fmvSetAt: oneHundredDaysAgo,
        effectiveParamsByRule: { FMV_RECENT_ENOUGH: { staleDays: 180 } },
      },
    );
    expect(issue).toBeNull();
  });

  it('utilise staleDays=30 (org strict) — 60 jours bloque', async () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * ONE_DAY_MS).toISOString();
    const issue = await FMV_RECENT_ENOUGH.check(
      { awardId: 'a', planId: 'p' },
      {
        fmvSetAt: sixtyDaysAgo,
        effectiveParamsByRule: { FMV_RECENT_ENOUGH: { staleDays: 30 } },
      },
    );
    expect(issue?.code).toBe('FMV_RECENT_ENOUGH');
    expect(issue?.message).toMatch(/seuil 30 jours/);
  });

  it('respecte severity DB error (V1.X default DB) — admin upgrade', async () => {
    const sixMonthsAgo = new Date(Date.now() - 200 * ONE_DAY_MS).toISOString();
    const issue = await FMV_RECENT_ENOUGH.check(
      { awardId: 'a', planId: 'p' },
      {
        fmvSetAt: sixMonthsAgo,
        effectiveSeverityByRule: { FMV_RECENT_ENOUGH: 'error' },
      },
    );
    expect(issue?.severity).toBe('ERROR');
  });
});

describe('Document signature rules — severity dynamique (Module 12.5 B3)', () => {
  it('SIGNERS_COMPLETE_INFO respecte severity DB warning (admin downgrade)', async () => {
    const issue = await SIGNERS_COMPLETE_INFO.check(
      {
        documentId: 'd',
        documentStatus: 'GENERATED',
        signers: [{ fullName: 'Jean Dupont', email: '' }],
      },
      { effectiveSeverityByRule: { SIGNERS_COMPLETE_INFO: 'warning' } },
    );
    expect(issue?.severity).toBe('WARNING');
  });

  it('DOCUMENT_NOT_VOIDED respecte severity DB warning', async () => {
    const issue = await DOCUMENT_NOT_VOIDED.check(
      { documentId: 'd', documentStatus: 'VOIDED', signers: [] },
      { effectiveSeverityByRule: { DOCUMENT_NOT_VOIDED: 'warning' } },
    );
    expect(issue?.severity).toBe('WARNING');
  });
});
