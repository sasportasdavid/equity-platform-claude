import { describe, expect, it } from 'vitest';
import { generateCliffLinearTranches } from './cliff-linear';

/**
 * Tests pour generateCliffLinearTranches — helper UI du Step 3 (cliff_linear
 * preview). Les edge cases sont issus du sandbox dev/wizard-step3 (cf.
 * memory/module_3a_step4_closure.md) qui valide visuellement la logique.
 */

describe('generateCliffLinearTranches', () => {
  // ---------------------------------------------------------------------------
  // Garde-fous (input invalide)
  // ---------------------------------------------------------------------------
  describe('garde-fous', () => {
    it('renvoie [] si grantDate manquant', () => {
      expect(
        generateCliffLinearTranches({
          grantDate: undefined,
          cliffMonths: 12,
          cliffPercentage: 25,
          totalMonths: 48,
          frequency: 'monthly',
        }),
      ).toEqual([]);
    });

    it('renvoie [] si cliffMonths est négatif', () => {
      expect(
        generateCliffLinearTranches({
          grantDate: '2026-01-01',
          cliffMonths: -1,
          cliffPercentage: 25,
          totalMonths: 48,
          frequency: 'monthly',
        }),
      ).toEqual([]);
    });

    it('renvoie [] si cliffPercentage hors [0, 100]', () => {
      expect(
        generateCliffLinearTranches({
          grantDate: '2026-01-01',
          cliffMonths: 12,
          cliffPercentage: 110,
          totalMonths: 48,
          frequency: 'monthly',
        }),
      ).toEqual([]);
    });

    it('renvoie [] si totalMonths < cliffMonths', () => {
      expect(
        generateCliffLinearTranches({
          grantDate: '2026-01-01',
          cliffMonths: 24,
          cliffPercentage: 25,
          totalMonths: 12,
          frequency: 'monthly',
        }),
      ).toEqual([]);
    });

    it('renvoie [] si grantDate au mauvais format', () => {
      expect(
        generateCliffLinearTranches({
          grantDate: 'pas-une-date',
          cliffMonths: 12,
          cliffPercentage: 25,
          totalMonths: 48,
          frequency: 'monthly',
        }),
      ).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Cas standard 12/48 monthly (4 ans, 25 % cliff)
  // ---------------------------------------------------------------------------
  describe('cas 12/48 monthly avec cliff 25 %', () => {
    const tranches = generateCliffLinearTranches({
      grantDate: '2026-01-01',
      cliffMonths: 12,
      cliffPercentage: 25,
      totalMonths: 48,
      frequency: 'monthly',
    });

    it('génère 37 tranches au total (1 cliff + 36 monthly)', () => {
      expect(tranches.length).toBe(37);
    });

    it('1ère tranche est la cliff au M+12 à 25 %', () => {
      expect(tranches[0]).toMatchObject({
        index: 1,
        date: '2027-01-01',
        percentage: 25,
        isCliff: true,
      });
    });

    it('cumul atteint exactement 100 % à la dernière tranche (drift correction)', () => {
      const last = tranches[tranches.length - 1];
      // Float arithmetic — drift résiduel ~1e-14 sous le seuil de correction
      // (0.0001) du code. Comportement attendu, le cumul est 100 à epsilon près.
      expect(last?.cumulative).toBeCloseTo(100, 10);
    });

    it('chaque tranche post-cliff fait ~2.083 % (= 75 / 36)', () => {
      const second = tranches[1];
      expect(second?.percentage).toBeCloseTo(75 / 36, 4);
      expect(second?.isCliff).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Cas 12/48 quarterly (= 12 paliers post-cliff)
  // ---------------------------------------------------------------------------
  describe('cas 12/48 quarterly avec cliff 25 %', () => {
    const tranches = generateCliffLinearTranches({
      grantDate: '2026-01-01',
      cliffMonths: 12,
      cliffPercentage: 25,
      totalMonths: 48,
      frequency: 'quarterly',
    });

    it('génère 13 tranches (1 cliff + 12 quarterly)', () => {
      expect(tranches.length).toBe(13);
    });

    it('chaque palier post-cliff fait 6.25 % (= 75 / 12)', () => {
      const second = tranches[1];
      expect(second?.percentage).toBeCloseTo(6.25, 4);
    });

    it('cumul final = 100 %', () => {
      expect(tranches[tranches.length - 1]?.cumulative).toBeCloseTo(100, 10);
    });
  });

  // ---------------------------------------------------------------------------
  // Cas 24/24 monthly (cliff sans paliers post)
  // ---------------------------------------------------------------------------
  describe('cas dégénéré 24/24 monthly (cliff = total)', () => {
    const tranches = generateCliffLinearTranches({
      grantDate: '2026-01-01',
      cliffMonths: 24,
      cliffPercentage: 50,
      totalMonths: 24,
      frequency: 'monthly',
    });

    it('génère 1 seule tranche (la cliff)', () => {
      expect(tranches.length).toBe(1);
    });

    it('drift correction ramène la cliff à 100 % même si cliffPercentage < 100', () => {
      // Input: cliff 50 %. Drift correction force la SEULE tranche à 100 %.
      expect(tranches[0]?.percentage).toBe(100);
      expect(tranches[0]?.cumulative).toBe(100);
    });
  });

  // ---------------------------------------------------------------------------
  // Cas annually
  // ---------------------------------------------------------------------------
  describe('cas 12/60 annually', () => {
    const tranches = generateCliffLinearTranches({
      grantDate: '2026-01-01',
      cliffMonths: 12,
      cliffPercentage: 20,
      totalMonths: 60,
      frequency: 'annually',
    });

    it('génère 5 tranches (1 cliff + 4 annual)', () => {
      expect(tranches.length).toBe(5);
    });

    it('chaque palier annuel = 20 %', () => {
      expect(tranches[1]?.percentage).toBeCloseTo(20, 4);
    });

    it('dates espacées de 12 mois', () => {
      expect(tranches[0]?.date).toBe('2027-01-01');
      expect(tranches[1]?.date).toBe('2028-01-01');
      expect(tranches[4]?.date).toBe('2031-01-01');
    });
  });

  // ---------------------------------------------------------------------------
  // Cas particulier 12/50 monthly (39 mois post-cliff arrondi sup)
  // ---------------------------------------------------------------------------
  describe('cas 12/50 monthly (numPostTranches = floor(38))', () => {
    const tranches = generateCliffLinearTranches({
      grantDate: '2026-01-01',
      cliffMonths: 12,
      cliffPercentage: 25,
      totalMonths: 50,
      frequency: 'monthly',
    });

    it('génère 39 tranches (1 + 38)', () => {
      expect(tranches.length).toBe(39);
    });

    it('cumul final = 100 % exact', () => {
      expect(tranches[tranches.length - 1]?.cumulative).toBeCloseTo(100, 10);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases : addMonths avec end-of-month rollover
  // ---------------------------------------------------------------------------
  describe('addMonths — gestion fin de mois', () => {
    it('grantDate=31/01 + 1 mois → 28 ou 29 février, pas mars', () => {
      const tranches = generateCliffLinearTranches({
        grantDate: '2026-01-31',
        cliffMonths: 1,
        cliffPercentage: 100,
        totalMonths: 1,
        frequency: 'monthly',
      });
      // 2026 n'est pas bissextile, donc fév a 28 jours
      expect(tranches[0]?.date).toBe('2026-02-28');
    });

    it('grantDate=31/03 + 1 mois → 30 avril, pas mai', () => {
      const tranches = generateCliffLinearTranches({
        grantDate: '2026-03-31',
        cliffMonths: 1,
        cliffPercentage: 100,
        totalMonths: 1,
        frequency: 'monthly',
      });
      expect(tranches[0]?.date).toBe('2026-04-30');
    });
  });
});
