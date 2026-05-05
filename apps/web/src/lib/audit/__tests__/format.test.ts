import { describe, expect, it } from 'vitest';
import { verbalizeEvent, type AuditEventForFormat } from '../format';

const make = (
  overrides: Partial<AuditEventForFormat> & { event_type: string },
): AuditEventForFormat => ({
  resource_type: null,
  resource_id: null,
  metadata: {},
  ...overrides,
});

describe('verbalizeEvent (PR #39 B1) — 30 event_types couverts', () => {
  describe('AUTH', () => {
    it("auth.login_success → s'est connecté", () => {
      expect(verbalizeEvent(make({ event_type: 'auth.login_success' }))).toEqual({
        verb: "s'est connecté",
      });
    });

    it('auth.org_switched → bascule vers org name si fourni', () => {
      const r = verbalizeEvent(
        make({
          event_type: 'auth.org_switched',
          metadata: { to_org_name: 'Paragraphe', to_org_id: 'abcd1234-...' },
        }),
      );
      expect(r.verb).toBe('a basculé vers');
      expect(r.object).toBe('Paragraphe');
    });

    it('auth.org_switched fallback id court si pas de name', () => {
      const r = verbalizeEvent(
        make({
          event_type: 'auth.org_switched',
          metadata: { to_org_id: 'abcd1234-deef-aaaa' },
        }),
      );
      expect(r.object).toBe('#abcd1234');
    });

    it('auth.logout → déconnecté', () => {
      expect(verbalizeEvent(make({ event_type: 'auth.logout' })).verb).toBe("s'est déconnecté");
    });
  });

  describe('PLAN', () => {
    it('plan.created avec plan_name', () => {
      const r = verbalizeEvent(
        make({ event_type: 'plan.created', metadata: { plan_name: 'BSPCE-2026-001' } }),
      );
      expect(r.verb).toBe('a créé le plan');
      expect(r.object).toBe('BSPCE-2026-001');
    });

    it('plan.locked avec plan_name', () => {
      const r = verbalizeEvent(
        make({ event_type: 'plan.locked', metadata: { plan_name: 'BSPCE-2026-001' } }),
      );
      expect(r.verb).toBe('a verrouillé le plan');
      expect(r.object).toBe('BSPCE-2026-001');
    });

    it('plan.created fallback shortId si pas de plan_name', () => {
      const r = verbalizeEvent(
        make({
          event_type: 'plan.created',
          resource_id: 'abc12345-deef-aaaa-bbbb-cccc',
          metadata: {},
        }),
      );
      expect(r.object).toBe('#abc12345');
    });
  });

  describe('AWARD', () => {
    it('award.created avec award_number + beneficiary_name (context)', () => {
      const r = verbalizeEvent(
        make({
          event_type: 'award.created',
          metadata: { award_number: 'AW-001', beneficiary_name: 'Marie Lambert' },
        }),
      );
      expect(r.verb).toBe("a créé l'attribution");
      expect(r.object).toBe('AW-001');
      expect(r.context).toBe('pour Marie Lambert');
    });

    it('award.status_changed avec before_status → after_status', () => {
      const r = verbalizeEvent(
        make({
          event_type: 'award.status_changed',
          metadata: { award_number: 'AW-001', before_status: 'DRAFT', after_status: 'PROPOSED' },
        }),
      );
      expect(r.context).toBe('DRAFT → PROPOSED');
    });

    it('award.modified', () => {
      const r = verbalizeEvent(
        make({ event_type: 'award.modified', metadata: { award_number: 'AW-001' } }),
      );
      expect(r.verb).toBe("a modifié l'attribution");
      expect(r.object).toBe('AW-001');
    });
  });

  describe('APPROVAL', () => {
    it('approval.workflow_created', () => {
      expect(verbalizeEvent(make({ event_type: 'approval.workflow_created' })).verb).toBe(
        "a créé un workflow d'approbation",
      );
    });

    it('approval.decision_recorded mappe APPROVE → approuvé', () => {
      const r = verbalizeEvent(
        make({ event_type: 'approval.decision_recorded', metadata: { decision: 'APPROVE' } }),
      );
      expect(r.context).toBe('approuvé');
    });

    it('approval.decision_recorded mappe REJECT → rejeté', () => {
      const r = verbalizeEvent(
        make({ event_type: 'approval.decision_recorded', metadata: { decision: 'REJECT' } }),
      );
      expect(r.context).toBe('rejeté');
    });

    it('approval.workflow_started avec resource_label', () => {
      const r = verbalizeEvent(
        make({
          event_type: 'approval.workflow_started',
          metadata: { resource_label: 'BSPCE-2026-001' },
        }),
      );
      expect(r.object).toBe('BSPCE-2026-001');
    });
  });

  describe('DOCUMENT', () => {
    it('document.generated avec document_type', () => {
      const r = verbalizeEvent(
        make({ event_type: 'document.generated', metadata: { document_type: 'BSPCE Award' } }),
      );
      expect(r.verb).toBe('a généré le document');
      expect(r.object).toBe('BSPCE Award');
    });

    it('document.signed', () => {
      const r = verbalizeEvent(
        make({ event_type: 'document.signed', metadata: { document_type: 'Contrat' } }),
      );
      expect(r.verb).toBe('a signé');
      expect(r.object).toBe('Contrat');
    });

    it('document.send_signature_failed avec error_reason en context', () => {
      const r = verbalizeEvent(
        make({
          event_type: 'document.send_signature_failed',
          metadata: { document_type: 'Contrat', error_reason: 'Yousign timeout' },
        }),
      );
      expect(r.verb).toBe("n'a pas pu envoyer pour signature");
      expect(r.context).toBe('Yousign timeout');
    });
  });

  describe('VALUATION + EXERCISE + BENEFICIARY + PORTAL + INVITATION', () => {
    it('valuation.started avec plan_name → context "pour {nom}"', () => {
      const r = verbalizeEvent(
        make({ event_type: 'valuation.started', metadata: { plan_name: 'BSPCE-2026-001' } }),
      );
      expect(r.context).toBe('pour BSPCE-2026-001');
    });

    it('exercise.requested avec units → "{N} u."', () => {
      const r = verbalizeEvent(
        make({ event_type: 'exercise.requested', metadata: { units: 1200 } }),
      );
      expect(r.object).toBe('1200 u.');
    });

    it('beneficiary.created avec name', () => {
      const r = verbalizeEvent(
        make({
          event_type: 'beneficiary.created',
          metadata: { beneficiary_name: 'Marie Lambert' },
        }),
      );
      expect(r.object).toBe('Marie Lambert');
    });

    it('portal.document_downloaded avec document_type', () => {
      const r = verbalizeEvent(
        make({ event_type: 'portal.document_downloaded', metadata: { document_type: 'Contrat' } }),
      );
      expect(r.verb).toBe('a téléchargé');
      expect(r.object).toBe('Contrat');
    });

    it('invitation.created avec invitee_email', () => {
      const r = verbalizeEvent(
        make({
          event_type: 'invitation.created',
          metadata: { invitee_email: 'jean@paragraphe.fr' },
        }),
      );
      expect(r.object).toBe('jean@paragraphe.fr');
    });
  });

  describe('Fallback + edge cases', () => {
    it('event_type inconnu → fallback déclenché avec event_type en object', () => {
      const r = verbalizeEvent(
        make({ event_type: 'mystery.unknown_action', resource_type: 'WIDGET' }),
      );
      expect(r.verb).toBe("a déclenché l'événement");
      expect(r.object).toBe('mystery.unknown_action');
      expect(r.context).toBe('sur WIDGET');
    });

    it('metadata absent → pas de crash, fallback string', () => {
      const r = verbalizeEvent({ event_type: 'plan.created', metadata: null });
      expect(r.verb).toBe('a créé le plan');
      expect(r.object).toBe('un plan');
    });

    it('metadata avec types non-string → ignorés (resilient)', () => {
      const r = verbalizeEvent(
        make({
          event_type: 'plan.created',
          metadata: { plan_name: 42 as unknown as string },
        }),
      );
      // 42 (number) n'est pas pris comme string → fallback
      expect(r.object).toBe('un plan');
    });
  });
});
