import { describe, expect, it } from 'vitest';
import { DOCUMENT_STATUS_CLASSES, DOCUMENT_STATUS_LABELS } from '../document-status-helpers';

/**
 * Tests sur les maps de labels/classes du DocumentStatusBadge — pure helpers,
 * pas de rendu React (pas de plugin JSX dans Vitest workspace).
 */
describe('DocumentStatusBadge — labels & classes maps', () => {
  it('expose un label pour chaque status standard du Module 6', () => {
    const statuses = [
      'DRAFT',
      'GENERATED',
      'SENT_FOR_SIGNATURE',
      'PARTIALLY_SIGNED',
      'SIGNED',
      'VOIDED',
      'ARCHIVED',
    ];
    for (const s of statuses) {
      expect(DOCUMENT_STATUS_LABELS[s]).toBeDefined();
      expect(DOCUMENT_STATUS_LABELS[s]).not.toBe('');
    }
  });

  it('expose une classe Tailwind pour chaque status standard', () => {
    const statuses = ['DRAFT', 'GENERATED', 'SENT_FOR_SIGNATURE', 'SIGNED', 'VOIDED'];
    for (const s of statuses) {
      expect(DOCUMENT_STATUS_CLASSES[s]).toContain('bg-');
      expect(DOCUMENT_STATUS_CLASSES[s]).toContain('text-');
      expect(DOCUMENT_STATUS_CLASSES[s]).toContain('border-');
    }
  });

  it('SIGNED utilise la palette emerald (succès)', () => {
    expect(DOCUMENT_STATUS_CLASSES.SIGNED).toContain('emerald');
  });

  it('VOIDED utilise la palette destructive (rouge)', () => {
    expect(DOCUMENT_STATUS_CLASSES.VOIDED).toContain('destructive');
  });

  it('SENT_FOR_SIGNATURE et PARTIALLY_SIGNED utilisent la palette amber (en cours)', () => {
    expect(DOCUMENT_STATUS_CLASSES.SENT_FOR_SIGNATURE).toContain('amber');
    expect(DOCUMENT_STATUS_CLASSES.PARTIALLY_SIGNED).toContain('amber');
  });

  it('GENERATED utilise la palette indigo (prêt à envoyer)', () => {
    expect(DOCUMENT_STATUS_CLASSES.GENERATED).toContain('indigo');
  });

  it('label français pour SENT_FOR_SIGNATURE est "Envoyé"', () => {
    expect(DOCUMENT_STATUS_LABELS.SENT_FOR_SIGNATURE).toBe('Envoyé');
  });
});
