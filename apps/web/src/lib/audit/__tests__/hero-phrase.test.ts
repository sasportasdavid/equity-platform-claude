import { describe, expect, it } from 'vitest';
import { buildAuditHeroPhrase, buildAuditSubtitle } from '../hero-phrase';

describe('buildAuditHeroPhrase (PR #39 B3)', () => {
  it("0 events → italic 'aucun événement' + suffix négatif", () => {
    const r = buildAuditHeroPhrase({ greetingPrefix: 'Bonjour,', totalEvents: 0 });
    expect(r.prefix).toBe('Bonjour, ');
    expect(r.accent).toBe('aucun événement');
    expect(r.suffix).toBe(' enregistré pour le moment.');
  });

  it("1 event → italic 'un événement' + au registre", () => {
    const r = buildAuditHeroPhrase({ greetingPrefix: 'Bonjour,', totalEvents: 1 });
    expect(r.accent).toBe('un événement');
    expect(r.suffix).toBe(' au registre.');
  });

  it('2-9 events → mots français (pluriel)', () => {
    expect(buildAuditHeroPhrase({ greetingPrefix: 'Bonjour,', totalEvents: 2 }).accent).toBe(
      'deux événements',
    );
    expect(buildAuditHeroPhrase({ greetingPrefix: 'Bonjour,', totalEvents: 5 }).accent).toBe(
      'cinq événements',
    );
    expect(buildAuditHeroPhrase({ greetingPrefix: 'Bonjour,', totalEvents: 9 }).accent).toBe(
      'neuf événements',
    );
  });

  it('10+ events → chiffre factuel pluriel', () => {
    expect(buildAuditHeroPhrase({ greetingPrefix: 'Bonjour,', totalEvents: 244 }).accent).toBe(
      '244 événements',
    );
  });

  it('clamp les négatifs à 0', () => {
    const r = buildAuditHeroPhrase({ greetingPrefix: 'Bonjour,', totalEvents: -5 });
    expect(r.accent).toBe('aucun événement');
  });

  it('normalise le préfixe (ajoute espace de jointure)', () => {
    const r1 = buildAuditHeroPhrase({ greetingPrefix: 'Bonjour Julien,', totalEvents: 244 });
    expect(r1.prefix).toBe('Bonjour Julien, ');
    const r2 = buildAuditHeroPhrase({ greetingPrefix: 'Bonjour Julien, ', totalEvents: 244 });
    expect(r2.prefix).toBe('Bonjour Julien, ');
  });
});

describe('buildAuditSubtitle (PR #39 B3)', () => {
  it('3 fragments complets', () => {
    expect(buildAuditSubtitle({ daysCovered: 8, distinctTypes: 30, distinctActors: 5 })).toBe(
      "8 jours d'historique · 30 types d'actions · 5 acteurs",
    );
  });

  it('singulier sur jour=1, type=1, acteur=1', () => {
    expect(buildAuditSubtitle({ daysCovered: 1, distinctTypes: 1, distinctActors: 1 })).toBe(
      "1 jour d'historique · 1 type d'action · 1 acteur",
    );
  });

  it("masque les fragments à 0 (pas de '0 jours')", () => {
    expect(buildAuditSubtitle({ daysCovered: 8, distinctTypes: 0, distinctActors: 0 })).toBe(
      "8 jours d'historique",
    );
    expect(buildAuditSubtitle({ daysCovered: 0, distinctTypes: 0, distinctActors: 0 })).toBe('');
  });
});
