import { describe, expect, it } from 'vitest';
import { renderEmailTemplate } from '../render';
import { MODULE_7_TEMPLATE_CODES, TEMPLATES, type TemplateCode } from '../templates';
import { SAMPLE_VARS } from '@/app/dev/notifications/sample-vars';

describe('TEMPLATES registry', () => {
  it('expose 14 templates au total (5 Module 2 + 4 Module 7 + 5 Module 9 B5)', () => {
    expect(Object.keys(TEMPLATES)).toHaveLength(14);
  });

  it('chaque template a un Component + une fonction subject', () => {
    for (const code of Object.keys(TEMPLATES) as TemplateCode[]) {
      expect(typeof TEMPLATES[code].Component).toBe('function');
      expect(typeof TEMPLATES[code].subject).toBe('function');
    }
  });

  it('les 6 codes Module 7 sont présents dans MODULE_7_TEMPLATE_CODES', () => {
    expect(MODULE_7_TEMPLATE_CODES).toEqual([
      'approval_pending',
      'approval_approved',
      'approval_rejected',
      'award_granted',
      'team_member_invite',
      'beneficiary_first_invite',
    ]);
  });
});

describe('renderEmailTemplate — 6 templates Module 7', () => {
  it('approval_pending → HTML + plain text non vides + subject', async () => {
    const r = await renderEmailTemplate('approval_pending', SAMPLE_VARS.approval_pending);
    expect(r.subject).toBe("Action requise : approbation d'attribution AWD-2026-0042");
    expect(r.html).toContain('AWD-2026-0042');
    expect(r.html).toContain('Marie Dupont');
    expect(r.html).toContain('Examiner l');
    expect(r.text.length).toBeGreaterThan(50);
    // Vérifie l'espace insécable U+00A0 sur les milliers (cf. PR #9 #36)
    expect(r.html).toContain('1 500');
  });

  it('approval_approved → ton positif + sujet contient awardNumber', async () => {
    const r = await renderEmailTemplate('approval_approved', SAMPLE_VARS.approval_approved);
    expect(r.subject).toContain('AWD-2026-0042');
    expect(r.subject).toContain('approuvée');
    expect(r.html).toContain('Marie Dupont');
    expect(r.html).toContain('Voir l');
  });

  it('approval_rejected → contient le motif (reason)', async () => {
    const r = await renderEmailTemplate('approval_rejected', SAMPLE_VARS.approval_rejected);
    expect(r.subject).toContain('refusée');
    expect(r.html).toContain('Marie Dupont');
    expect(r.html).toContain('éligible');
    expect(r.html).toContain('BSPCE');
  });

  it('award_granted → format prix + date FR + units U+00A0', async () => {
    const r = await renderEmailTemplate('award_granted', SAMPLE_VARS.award_granted);
    expect(r.subject).toContain('Capiwise SAS');
    expect(r.subject).toContain('BSPCE');
    expect(r.html).toContain('Sophie Bernard');
    expect(r.html).toContain('1 500');
    // Date longue FR
    expect(r.html).toMatch(/15 janvier 2026/);
  });

  it('team_member_invite (Module 2) — render OK', async () => {
    const r = await renderEmailTemplate('team_member_invite', SAMPLE_VARS.team_member_invite);
    expect(r.html).toContain('Capiwise SAS');
    expect(r.html).toContain('admin@capiwise.local');
    expect(r.html).toContain('Bienvenue');
  });

  it('beneficiary_first_invite (Module 2) — render OK', async () => {
    const r = await renderEmailTemplate(
      'beneficiary_first_invite',
      SAMPLE_VARS.beneficiary_first_invite,
    );
    expect(r.html).toContain('Capiwise SAS');
    expect(r.html).toContain('20 mai 2026');
  });
});

describe('renderEmailTemplate — 5 templates Module 9 B5 exercise', () => {
  it('exercise_request_submitted → admin reçoit récap demande + snapshot fiscal', async () => {
    const r = await renderEmailTemplate(
      'exercise_request_submitted',
      SAMPLE_VARS.exercise_request_submitted,
    );
    expect(r.subject).toContain('EXR-2026-0042');
    expect(r.subject).toContain('Sophie Bernard');
    expect(r.html).toContain('Marie Dupont'); // recipient admin
    expect(r.html).toContain('sophie.bernard@capiwise.local');
    expect(r.html).toContain('AWD-2026-0042');
    expect(r.html).toContain('BSPCE');
    expect(r.html).toContain('1 500'); // units U+00A0
    expect(r.html).toContain('Snapshot fiscal');
    expect(r.html).toContain('49% effective');
    expect(r.html).toContain('Voir la demande');
    expect(r.text.length).toBeGreaterThan(50);
  });

  it('exercise_request_approved → wording UX #108 + IBAN/BIC + bouton "Voir la demande"', async () => {
    const r = await renderEmailTemplate(
      'exercise_request_approved',
      SAMPLE_VARS.exercise_request_approved,
    );
    expect(r.subject).toContain('EXR-2026-0042');
    expect(r.subject).toContain('approuvée');
    expect(r.html).toContain('Sophie Bernard');
    // Wording UX #108 strict
    expect(r.html).toContain('vous virerez');
    expect(r.html).toContain('Capiwise SAS');
    expect(r.html).toContain('actionnaire dès réception du paiement');
    // Coordonnées bancaires
    expect(r.html).toContain('BNP Paribas');
    expect(r.html).toContain('FR76');
    expect(r.html).toContain('BNPAFRPPXXX');
    // Format euro FR
    expect(r.html).toMatch(/1\u00a0875,00/); // 1 875 € total cost (U+00A0 NBSP)
    expect(r.html).toMatch(/15(<!--.*?-->)?\s*jours/);
    expect(r.html).toContain('Voir la demande');
  });

  it('exercise_request_approved → fallback si bankIban/bic/name null → warning', async () => {
    const r = await renderEmailTemplate('exercise_request_approved', {
      ...SAMPLE_VARS.exercise_request_approved,
      bankIban: null,
      bankBic: null,
      bankName: null,
    });
    expect(r.html).toContain('Coordonnées bancaires non renseignées');
    expect(r.html).toContain('Contactez votre administrateur');
  });

  it('exercise_request_rejected → contient stepName + reason + admin contact', async () => {
    const r = await renderEmailTemplate(
      'exercise_request_rejected',
      SAMPLE_VARS.exercise_request_rejected,
    );
    expect(r.subject).toContain('EXR-2026-0042');
    expect(r.subject).toContain('refusée');
    expect(r.html).toContain('Sophie Bernard');
    expect(r.html).toContain('Marie Dupont');
    expect(r.html).toContain('Validation RH'); // step name
    expect(r.html).toContain('fenêtre d');
    expect(r.html).toContain('admin@capiwise.local');
    expect(r.html).toContain('award reste GRANTED');
  });

  it('exercise_request_rejected → fallback si adminContactEmail null', async () => {
    const r = await renderEmailTemplate('exercise_request_rejected', {
      ...SAMPLE_VARS.exercise_request_rejected,
      adminContactEmail: null,
    });
    expect(r.html).toContain('contacter votre administrateur');
  });

  it('exercise_payment_confirmed → date FR longue + montant FR + mention cession future', async () => {
    const r = await renderEmailTemplate(
      'exercise_payment_confirmed',
      SAMPLE_VARS.exercise_payment_confirmed,
    );
    expect(r.subject).toContain('Paiement reçu');
    expect(r.subject).toMatch(/1\u00a0500/);
    expect(r.subject).toContain('BSPCE');
    expect(r.html).toContain('Sophie Bernard');
    expect(r.html).toContain('Capiwise SAS');
    // Date longue FR
    expect(r.html).toMatch(/20 mai 2026/);
    // Montant FR
    expect(r.html).toMatch(/1\u00a0875,00/);
    expect(r.html).toMatch(/actionnaire pour <strong>1\u00a0500/);
    expect(r.html).toContain('Cession future');
  });

  it('exercise_request_cancelled_by_admin → adminName + reason + award reste GRANTED', async () => {
    const r = await renderEmailTemplate(
      'exercise_request_cancelled_by_admin',
      SAMPLE_VARS.exercise_request_cancelled_by_admin,
    );
    expect(r.subject).toContain('EXR-2026-0042');
    expect(r.subject).toContain('annulée');
    expect(r.html).toContain('Sophie Bernard');
    expect(r.html).toContain('Jean Martin');
    expect(r.html).toContain('Paiement non reçu');
    expect(r.html).toContain('award reste GRANTED');
    expect(r.html).toContain('Voir mon award');
  });
});

describe('renderEmailTemplate — error path', () => {
  it('throw sur template code inconnu', async () => {
    // @ts-expect-error — intentional unknown code for the test
    await expect(renderEmailTemplate('unknown_template', {})).rejects.toThrow(
      'Unknown template code',
    );
  });
});
