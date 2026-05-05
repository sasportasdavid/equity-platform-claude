import { describe, expect, it } from 'vitest';
import { buildHeroGreetingPhrase } from '../dashboard-hero-phrase';

describe('buildHeroGreetingPhrase (PR #36 B1)', () => {
  describe("0 alerte + 0 approbation = 'tout est en ordre'", () => {
    it('compose une phrase positive', () => {
      const r = buildHeroGreetingPhrase({
        greetingPrefix: 'Bonjour Julien,',
        criticalAlertsCount: 0,
        pendingApprovalsCount: 0,
      });
      expect(r.prefix).toBe('Bonjour Julien, ');
      expect(r.accent).toBe('tout est en ordre');
      expect(r.suffix).toBe('.');
    });

    it('garde le ton positif même sans firstName', () => {
      const r = buildHeroGreetingPhrase({
        greetingPrefix: 'Bonsoir,',
        criticalAlertsCount: 0,
        pendingApprovalsCount: 0,
      });
      expect(r.prefix).toBe('Bonsoir, ');
      expect(r.accent).toBe('tout est en ordre');
    });
  });

  describe('total 1 = singulier', () => {
    it("1 alerte + 0 approbation → 'un point' singulier", () => {
      const r = buildHeroGreetingPhrase({
        greetingPrefix: 'Bonjour Julien,',
        criticalAlertsCount: 1,
        pendingApprovalsCount: 0,
      });
      expect(r.accent).toBe('un point');
      expect(r.suffix).toBe(' mérite votre attention.');
    });

    it("0 alerte + 1 approbation → 'un point' singulier", () => {
      const r = buildHeroGreetingPhrase({
        greetingPrefix: 'Bonjour Julien,',
        criticalAlertsCount: 0,
        pendingApprovalsCount: 1,
      });
      expect(r.accent).toBe('un point');
      expect(r.suffix).toBe(' mérite votre attention.');
    });
  });

  describe('total 2 = "deux points" (mockup standard)', () => {
    it('1 alerte + 1 approbation', () => {
      const r = buildHeroGreetingPhrase({
        greetingPrefix: 'Bonjour Julien,',
        criticalAlertsCount: 1,
        pendingApprovalsCount: 1,
      });
      expect(r.accent).toBe('deux points');
      expect(r.suffix).toBe(' méritent votre attention.');
    });

    it('2 alertes + 0 approbation', () => {
      const r = buildHeroGreetingPhrase({
        greetingPrefix: 'Bonjour Julien,',
        criticalAlertsCount: 2,
        pendingApprovalsCount: 0,
      });
      expect(r.accent).toBe('deux points');
    });
  });

  describe('total 3-9 = mots français', () => {
    it("3 → 'trois points'", () => {
      const r = buildHeroGreetingPhrase({
        greetingPrefix: 'Bonjour Julien,',
        criticalAlertsCount: 2,
        pendingApprovalsCount: 1,
      });
      expect(r.accent).toBe('trois points');
    });

    it("9 → 'neuf points'", () => {
      const r = buildHeroGreetingPhrase({
        greetingPrefix: 'Bonjour Julien,',
        criticalAlertsCount: 5,
        pendingApprovalsCount: 4,
      });
      expect(r.accent).toBe('neuf points');
    });
  });

  describe('total 10+ = chiffres factuels', () => {
    it("12 → '12 points'", () => {
      const r = buildHeroGreetingPhrase({
        greetingPrefix: 'Bonjour Julien,',
        criticalAlertsCount: 8,
        pendingApprovalsCount: 4,
      });
      expect(r.accent).toBe('12 points');
      expect(r.suffix).toBe(' méritent votre attention.');
    });
  });

  describe('robustesse aux entrées négatives', () => {
    it('clamp les valeurs négatives à 0', () => {
      const r = buildHeroGreetingPhrase({
        greetingPrefix: 'Bonjour Julien,',
        criticalAlertsCount: -3,
        pendingApprovalsCount: 1,
      });
      expect(r.accent).toBe('un point');
    });
  });

  describe('normalisation du préfixe (espace de jointure)', () => {
    it("ajoute un espace si le préfixe n'en finit pas", () => {
      const r = buildHeroGreetingPhrase({
        greetingPrefix: 'Bonjour Julien,',
        criticalAlertsCount: 1,
        pendingApprovalsCount: 1,
      });
      expect(r.prefix).toBe('Bonjour Julien, ');
    });

    it('préserve les préfixes déjà bien terminés', () => {
      const r = buildHeroGreetingPhrase({
        greetingPrefix: 'Bonjour Julien, ',
        criticalAlertsCount: 1,
        pendingApprovalsCount: 1,
      });
      expect(r.prefix).toBe('Bonjour Julien, ');
    });
  });
});
