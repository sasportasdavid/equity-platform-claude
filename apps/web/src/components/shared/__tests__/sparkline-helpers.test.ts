import { describe, expect, it } from 'vitest';
import {
  computeSparkline2Points,
  computeSparklinePoints,
  hollowPointIndices,
  sparklineDotColor,
} from '../sparkline-helpers';

describe('Sparkline helpers (PR #37 B1)', () => {
  describe('computeSparklinePoints (basique, viewBox h+2)', () => {
    it('projette une série simple : min en bas, max en haut', () => {
      const pts = computeSparklinePoints([0, 5, 10], 200, 32);
      expect(pts).toHaveLength(3);
      // i=0 → x=0, valeur=0=min → y=32 (bottom)
      expect(pts[0]).toEqual([0, 32]);
      // i=1 → x=100, valeur=5=mid → y=16
      expect(pts[1]).toEqual([100, 16]);
      // i=2 → x=200, valeur=10=max → y=0 (top)
      expect(pts[2]).toEqual([200, 0]);
    });

    it('gère le cas range=0 (toutes les valeurs égales) sans diviser par zéro', () => {
      const pts = computeSparklinePoints([5, 5, 5], 200, 32);
      // range=0 fallback à 1 → toutes les valeurs au top (y=0) car (v-min)/1 = 0/1
      // → y = 32 - 0*32 = 32 (bottom). Pas de NaN.
      expect(pts.every(([, y]) => Number.isFinite(y))).toBe(true);
    });

    it('retourne tableau vide pour values=[]', () => {
      expect(computeSparklinePoints([], 200, 32)).toEqual([]);
    });

    it('canonique mockup Vesting [0,0,0,30,30,30,30,30,30,75,75,75,187] — 13 points', () => {
      const pts = computeSparklinePoints(
        [0, 0, 0, 30, 30, 30, 30, 30, 30, 75, 75, 75, 187],
        200,
        32,
      );
      expect(pts).toHaveLength(13);
      // Premier point au bottom (valeur=0=min)
      expect(pts[0]).toEqual([0, 32]);
      // Dernier point au top (valeur=187=max)
      expect(pts[12]).toEqual([200, 0]);
    });
  });

  describe('computeSparkline2Points (riche, inset 8/16)', () => {
    it('projette avec inset 8px top + 16px bottom (height effective = h-16)', () => {
      const pts = computeSparkline2Points([0, 10], 280, 48);
      expect(pts).toHaveLength(2);
      // i=0 valeur min → y = 48 - 8 - 0 = 40
      expect(pts[0]).toEqual([0, 40]);
      // i=1 valeur max → y = 48 - 8 - (48-16) = 8
      expect(pts[1]).toEqual([280, 8]);
    });

    it('canonique HeroKpi 13 points Fair Value [8,9,8.5,…,12.4]', () => {
      const pts = computeSparkline2Points(
        [8, 9, 8.5, 9.2, 10, 9.8, 10.5, 11, 10.8, 11.5, 12, 11.9, 12.4],
        280,
        64,
      );
      expect(pts).toHaveLength(13);
      // premier x=0, dernier x=280
      expect(pts[0]?.[0]).toBe(0);
      expect(pts[12]?.[0]).toBe(280);
      // Toutes les valeurs entre 8 et 12.4 → y entre `64-8 - 0 = 56` et `64-8 - (64-16) = 8`
      for (const [, y] of pts) {
        expect(y).toBeGreaterThanOrEqual(8);
        expect(y).toBeLessThanOrEqual(56);
      }
    });

    it('retourne tableau vide pour values=[]', () => {
      expect(computeSparkline2Points([], 280, 48)).toEqual([]);
    });
  });

  describe('hollowPointIndices (1 sur 3 sauf dernier)', () => {
    it('13 points → indices 0, 3, 6, 9 (sans 12 = dernier)', () => {
      expect(hollowPointIndices(13)).toEqual([0, 3, 6, 9]);
    });

    it('5 points → indices 0, 3 (sans 4 = dernier)', () => {
      expect(hollowPointIndices(5)).toEqual([0, 3]);
    });

    it('1 point → []', () => {
      expect(hollowPointIndices(1)).toEqual([]);
    });

    it('0 point → []', () => {
      expect(hollowPointIndices(0)).toEqual([]);
    });
  });

  describe('sparklineDotColor (anchor)', () => {
    it('retourne color quand trailDown=false', () => {
      expect(sparklineDotColor('var(--brass-500)', false)).toBe('var(--brass-500)');
      expect(sparklineDotColor('var(--bond-500)', false)).toBe('var(--bond-500)');
    });

    it('override en title-500 quand trailDown=true (signal baissier)', () => {
      expect(sparklineDotColor('var(--brass-500)', true)).toBe('var(--title-500)');
      expect(sparklineDotColor('var(--saffron-500)', true)).toBe('var(--title-500)');
    });
  });
});
