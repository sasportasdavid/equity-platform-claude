import { describe, expect, it } from 'vitest';
import { getAdaptiveDashboardGreeting } from '../adaptive-greeting';

/**
 * Tests adaptive-greeting — Étape 12 Design System V1.
 *
 * Helper pur — on injecte `now` pour ne pas dépendre de l'horloge système.
 * Les dates ISO sans `Z` sont interprétées en local time (Europe/Paris en CI),
 * ce qui correspond au comportement runtime — `getHours()` retourne l'heure
 * locale.
 */

function at(iso: string): Date {
  return new Date(iso);
}

describe('getAdaptiveDashboardGreeting', () => {
  describe('heure de la journée', () => {
    it('Bonjour en matinée (mardi 9h)', () => {
      // 2026-05-05 = mardi
      expect(getAdaptiveDashboardGreeting({ now: at('2026-05-05T09:00:00') })).toBe('Bonjour,');
    });

    it('Bonjour en après-midi (mercredi 14h)', () => {
      // 2026-05-06 = mercredi
      expect(getAdaptiveDashboardGreeting({ now: at('2026-05-06T14:30:00') })).toBe('Bonjour,');
    });

    it('Bonsoir en début de soirée (mercredi 19h)', () => {
      expect(getAdaptiveDashboardGreeting({ now: at('2026-05-06T19:30:00') })).toBe('Bonsoir,');
    });

    it('Bonsoir à 21h59 (limite haute du soir)', () => {
      expect(getAdaptiveDashboardGreeting({ now: at('2026-05-06T21:59:00') })).toBe('Bonsoir,');
    });

    it('Bonne nuit à 22h pile (limite basse de la nuit)', () => {
      expect(getAdaptiveDashboardGreeting({ now: at('2026-05-06T22:00:00') })).toBe('Bonne nuit,');
    });

    it('Bonne nuit à 3h du matin', () => {
      expect(getAdaptiveDashboardGreeting({ now: at('2026-05-06T03:00:00') })).toBe('Bonne nuit,');
    });

    it('Bonjour à 5h pile (limite haute de la nuit)', () => {
      expect(getAdaptiveDashboardGreeting({ now: at('2026-05-06T05:00:00') })).toBe('Bonjour,');
    });
  });

  describe('jour de la semaine', () => {
    it('Bon début de semaine lundi matin', () => {
      // 2026-05-04 = lundi
      expect(getAdaptiveDashboardGreeting({ now: at('2026-05-04T09:00:00') })).toBe(
        'Bon début de semaine,',
      );
    });

    it('Bonjour lundi après-midi (12h+, plus début de semaine)', () => {
      expect(getAdaptiveDashboardGreeting({ now: at('2026-05-04T14:00:00') })).toBe('Bonjour,');
    });

    it('Bon vendredi après 14h', () => {
      // 2026-05-08 = vendredi
      expect(getAdaptiveDashboardGreeting({ now: at('2026-05-08T15:00:00') })).toBe(
        'Bon vendredi,',
      );
    });

    it('Bonjour vendredi avant 14h', () => {
      expect(getAdaptiveDashboardGreeting({ now: at('2026-05-08T11:00:00') })).toBe('Bonjour,');
    });

    it('Bon week-end samedi journée', () => {
      // 2026-05-09 = samedi
      expect(getAdaptiveDashboardGreeting({ now: at('2026-05-09T11:00:00') })).toBe(
        'Bon week-end,',
      );
    });

    it('Bon week-end dimanche journée', () => {
      // 2026-05-10 = dimanche
      expect(getAdaptiveDashboardGreeting({ now: at('2026-05-10T15:00:00') })).toBe(
        'Bon week-end,',
      );
    });

    it('Bonsoir samedi soir (le soir prime sur week-end)', () => {
      expect(getAdaptiveDashboardGreeting({ now: at('2026-05-09T20:00:00') })).toBe('Bonsoir,');
    });

    it('Bonne nuit dimanche minuit (la nuit prime)', () => {
      expect(getAdaptiveDashboardGreeting({ now: at('2026-05-10T23:30:00') })).toBe('Bonne nuit,');
    });
  });

  describe('extraction du prénom', () => {
    it('extrait le prénom depuis fullName "Marie Lambert"', () => {
      expect(
        getAdaptiveDashboardGreeting({ name: 'Marie Lambert', now: at('2026-05-05T09:00:00') }),
      ).toBe('Bonjour Marie,');
    });

    it('garde le prénom seul si pas de nom de famille', () => {
      expect(getAdaptiveDashboardGreeting({ name: 'Marie', now: at('2026-05-05T09:00:00') })).toBe(
        'Bonjour Marie,',
      );
    });

    it('trim les whitespaces autour du nom', () => {
      expect(
        getAdaptiveDashboardGreeting({
          name: '   Marie  Lambert   ',
          now: at('2026-05-05T09:00:00'),
        }),
      ).toBe('Bonjour Marie,');
    });

    it('omit le suffixe si name = null', () => {
      expect(getAdaptiveDashboardGreeting({ name: null, now: at('2026-05-05T09:00:00') })).toBe(
        'Bonjour,',
      );
    });

    it('omit le suffixe si name est blank', () => {
      expect(getAdaptiveDashboardGreeting({ name: '   ', now: at('2026-05-05T09:00:00') })).toBe(
        'Bonjour,',
      );
    });

    it('omit le suffixe si name est undefined', () => {
      expect(getAdaptiveDashboardGreeting({ now: at('2026-05-05T09:00:00') })).toBe('Bonjour,');
    });

    it('combine nom et soir', () => {
      expect(getAdaptiveDashboardGreeting({ name: 'Élise', now: at('2026-05-06T20:00:00') })).toBe(
        'Bonsoir Élise,',
      );
    });

    it('combine nom et lundi début de semaine', () => {
      expect(
        getAdaptiveDashboardGreeting({ name: 'Marie Lambert', now: at('2026-05-04T08:30:00') }),
      ).toBe('Bon début de semaine Marie,');
    });

    it('combine nom et week-end', () => {
      expect(getAdaptiveDashboardGreeting({ name: 'Julien', now: at('2026-05-09T14:00:00') })).toBe(
        'Bon week-end Julien,',
      );
    });
  });

  describe('robustesse defaults', () => {
    it('fonctionne sans aucun argument (utilise new Date())', () => {
      const result = getAdaptiveDashboardGreeting();
      // Doit retourner une des 5 formes possibles, terminée par virgule
      expect(result).toMatch(
        /^(Bonjour|Bonsoir|Bonne nuit|Bon week-end|Bon début de semaine|Bon vendredi),$/,
      );
    });

    it('fonctionne avec objet vide {}', () => {
      const result = getAdaptiveDashboardGreeting({});
      expect(result).toMatch(
        /^(Bonjour|Bonsoir|Bonne nuit|Bon week-end|Bon début de semaine|Bon vendredi),$/,
      );
    });
  });
});
