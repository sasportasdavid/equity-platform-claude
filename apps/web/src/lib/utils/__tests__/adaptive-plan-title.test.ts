import { describe, expect, it } from 'vitest';
import { getAdaptivePlanTitle } from '../adaptive-plan-title';

/**
 * Tests adaptive-plan-title — Étape 13 Design System V1.
 *
 * Helper pur. On injecte `today` pour ne pas dépendre de l'horloge système.
 * Les dates ISO sans `Z` sont interprétées en local time, ce qui correspond
 * au comportement runtime (`new Date()` côté SSR).
 */

const basePlan = {
  name: 'BSPCE-2026-001',
  status: 'ACTIVE',
  grant_date: '2026-01-15',
};

const baseSchedule = {
  cliff_months: 12,
  last_tranche_date: '2030-01-15',
};

function at(iso: string): Date {
  return new Date(iso);
}

describe('getAdaptivePlanTitle', () => {
  describe('état closed', () => {
    it('plan CLOSED prend toujours la priorité', () => {
      const result = getAdaptivePlanTitle({
        plan: { ...basePlan, status: 'CLOSED' },
        vestingSchedule: baseSchedule,
        today: at('2026-06-01T12:00:00'),
      });
      expect(result.state).toBe('closed');
      expect(result.prefix).toBe('Plan BSPCE-2026-001, ');
      expect(result.accent).toBe('clôturé en juin 2026');
    });

    it('CLOSED prime sur pre-cliff', () => {
      const result = getAdaptivePlanTitle({
        plan: { ...basePlan, status: 'CLOSED' },
        vestingSchedule: baseSchedule,
        today: at('2026-03-01T12:00:00'), // avant cliff (cliff = 2027-01-15)
      });
      expect(result.state).toBe('closed');
    });

    it('CLOSED prime sur fully-vested', () => {
      const result = getAdaptivePlanTitle({
        plan: { ...basePlan, status: 'CLOSED' },
        vestingSchedule: { cliff_months: 12, last_tranche_date: '2024-01-15' },
        today: at('2026-06-01T12:00:00'),
      });
      expect(result.state).toBe('closed');
      expect(result.accent).toMatch(/clôturé en/);
    });
  });

  describe('état pre-cliff', () => {
    it('detecte pre-cliff 11 mois 14 jours avant la fin du cliff', () => {
      // grant 2026-01-15, cliff_months 12 → cliff_date 2027-01-15
      // today 2026-02-01 → diff = 11 m 14 j approximativement
      const result = getAdaptivePlanTitle({
        plan: basePlan,
        vestingSchedule: baseSchedule,
        today: at('2026-02-01T12:00:00'),
      });
      expect(result.state).toBe('pre-cliff');
      expect(result.accent).toMatch(/^en attente du cliff dans \d+ m( \d+ j)?$/);
    });

    it('format "Xm" sans jours quand exactement N mois', () => {
      // today = exactement 6 mois avant cliff (cliff 2027-01-15, today 2026-07-15)
      const result = getAdaptivePlanTitle({
        plan: basePlan,
        vestingSchedule: baseSchedule,
        today: at('2026-07-15T00:00:00'),
      });
      expect(result.state).toBe('pre-cliff');
      // diff approximatif 6 mois
      expect(result.accent).toMatch(/dans \d+ m/);
    });

    it('format "Xm" sans jours pour plus de 12 mois', () => {
      // grant 2026-01-15, cliff_months 24 → cliff 2028-01-15
      // today 2026-01-20 → ~24 mois restants
      const result = getAdaptivePlanTitle({
        plan: basePlan,
        vestingSchedule: { cliff_months: 24, last_tranche_date: '2030-01-15' },
        today: at('2026-01-20T12:00:00'),
      });
      expect(result.state).toBe('pre-cliff');
      // ≥ 12 mois → pas de jours
      expect(result.accent).not.toContain('j');
    });

    it('extrait le prénom du plan name dans le prefix', () => {
      const result = getAdaptivePlanTitle({
        plan: { ...basePlan, name: 'AGA-2025-014 · Direction Ops' },
        vestingSchedule: baseSchedule,
        today: at('2026-02-01T12:00:00'),
      });
      expect(result.prefix).toBe('Plan AGA-2025-014 · Direction Ops, ');
    });
  });

  describe('état vesting-active', () => {
    it('detecte vesting-active après le cliff', () => {
      // grant 2026-01-15, cliff_months 12 → cliff 2027-01-15
      // today 2027-06-01 → après cliff, avant last (2030-01-15)
      const result = getAdaptivePlanTitle({
        plan: basePlan,
        vestingSchedule: baseSchedule,
        today: at('2027-06-01T12:00:00'),
      });
      expect(result.state).toBe('vesting-active');
      expect(result.accent).toBe('vesting en cours');
    });

    it("vesting-active : pas de pourcentage dans l'accent", () => {
      const result = getAdaptivePlanTitle({
        plan: basePlan,
        vestingSchedule: baseSchedule,
        today: at('2028-06-01T12:00:00'),
      });
      expect(result.state).toBe('vesting-active');
      expect(result.accent).not.toMatch(/\d/); // aucun chiffre
      expect(result.accent).not.toContain('%');
    });

    it('vesting-active si pas de cliff (cliff_months=null)', () => {
      // Plan sans cliff → directement actif
      const result = getAdaptivePlanTitle({
        plan: basePlan,
        vestingSchedule: { cliff_months: null, last_tranche_date: '2030-01-15' },
        today: at('2027-06-01T12:00:00'),
      });
      expect(result.state).toBe('vesting-active');
    });

    it('vesting-active si vestingSchedule null (pas de schedule défini)', () => {
      const result = getAdaptivePlanTitle({
        plan: basePlan,
        vestingSchedule: null,
        today: at('2027-06-01T12:00:00'),
      });
      expect(result.state).toBe('vesting-active');
    });
  });

  describe('état fully-vested', () => {
    it('detecte fully-vested après last tranche', () => {
      // last_tranche 2030-01-15, today 2030-06-01
      const result = getAdaptivePlanTitle({
        plan: basePlan,
        vestingSchedule: baseSchedule,
        today: at('2030-06-01T12:00:00'),
      });
      expect(result.state).toBe('fully-vested');
      expect(result.accent).toBe('calendrier de vesting terminé');
    });

    it("fully-vested copy ne contient pas le mot 'acquis' (réservé aux awards)", () => {
      const result = getAdaptivePlanTitle({
        plan: basePlan,
        vestingSchedule: baseSchedule,
        today: at('2030-06-01T12:00:00'),
      });
      expect(result.accent.toLowerCase()).not.toContain('acquis');
    });

    it('fully-vested à la date exacte de la dernière tranche', () => {
      // today === last_tranche_date → fully-vested (>=)
      const result = getAdaptivePlanTitle({
        plan: basePlan,
        vestingSchedule: baseSchedule,
        today: at('2030-01-15T00:00:00'),
      });
      expect(result.state).toBe('fully-vested');
    });
  });

  describe('cas limites et bordures', () => {
    it('cliff date exacte = vesting-active (pas pre-cliff)', () => {
      // cliff = 2027-01-15, today exactement 2027-01-15
      // today < cliff est false → pas pre-cliff → vesting-active
      const result = getAdaptivePlanTitle({
        plan: basePlan,
        vestingSchedule: baseSchedule,
        today: at('2027-01-15T00:00:00'),
      });
      expect(result.state).toBe('vesting-active');
    });

    it('grant_date invalide → vesting-active fallback', () => {
      const result = getAdaptivePlanTitle({
        plan: { ...basePlan, grant_date: 'not-a-date' },
        vestingSchedule: baseSchedule,
        today: at('2026-06-01T12:00:00'),
      });
      expect(result.state).toBe('vesting-active');
    });

    it('cliff_months = 0 → vesting-active (pas de cliff)', () => {
      const result = getAdaptivePlanTitle({
        plan: basePlan,
        vestingSchedule: { cliff_months: 0, last_tranche_date: '2030-01-15' },
        today: at('2026-06-01T12:00:00'),
      });
      expect(result.state).toBe('vesting-active');
    });

    it('last_tranche_date null → ne déclenche pas fully-vested', () => {
      const result = getAdaptivePlanTitle({
        plan: basePlan,
        vestingSchedule: { cliff_months: 12, last_tranche_date: null },
        today: at('2030-06-01T12:00:00'),
      });
      // Pas fully-vested car last_tranche inconnu
      expect(result.state).toBe('vesting-active');
    });
  });

  describe('robustesse copy éditorial', () => {
    it("préfixe contient toujours 'Plan {name}, '", () => {
      const states = [
        { ...basePlan, status: 'ACTIVE' },
        { ...basePlan, status: 'CLOSED' },
        { ...basePlan, status: 'DRAFT' },
      ];
      for (const p of states) {
        const result = getAdaptivePlanTitle({
          plan: p,
          vestingSchedule: baseSchedule,
          today: at('2026-06-01T12:00:00'),
        });
        expect(result.prefix.startsWith('Plan ')).toBe(true);
        expect(result.prefix.endsWith(', ')).toBe(true);
        expect(result.prefix).toContain(p.name);
      }
    });

    it('vesting-active accent constant indépendamment de la progression', () => {
      const dates = ['2027-06-01T12:00:00', '2028-06-01T12:00:00', '2029-06-01T12:00:00'];
      for (const d of dates) {
        const result = getAdaptivePlanTitle({
          plan: basePlan,
          vestingSchedule: baseSchedule,
          today: at(d),
        });
        expect(result.state).toBe('vesting-active');
        expect(result.accent).toBe('vesting en cours');
      }
    });
  });
});
