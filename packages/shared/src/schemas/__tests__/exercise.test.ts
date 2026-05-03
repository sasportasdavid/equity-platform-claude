import { describe, expect, it } from 'vitest';

import {
  cancelExerciseRequestInputSchema,
  createExerciseRequestInputSchema,
  exerciseRequestStatusSchema,
} from '../exercise';

describe('createExerciseRequestInputSchema', () => {
  const baseValid = {
    awardId: 'a3b9c2d4-1234-4567-89ab-1234567890ab',
    unitsToExercise: 100,
    cessionToggle: false,
    paymentMethod: 'BANK_TRANSFER' as const,
  };

  it('valid input sans cession', () => {
    const result = createExerciseRequestInputSchema.safeParse(baseValid);
    expect(result.success).toBe(true);
  });

  it('units_to_exercise ≤ 0 → invalid', () => {
    const result = createExerciseRequestInputSchema.safeParse({
      ...baseValid,
      unitsToExercise: 0,
    });
    expect(result.success).toBe(false);
  });

  it('cession_price < 0 → invalid', () => {
    const result = createExerciseRequestInputSchema.safeParse({
      ...baseValid,
      cessionToggle: true,
      cessionDate: new Date('2026-12-01'),
      cessionPricePerUnit: -10,
    });
    expect(result.success).toBe(false);
  });

  it('cession_toggle true mais cession_date manquante → invalid', () => {
    const result = createExerciseRequestInputSchema.safeParse({
      ...baseValid,
      cessionToggle: true,
      cessionPricePerUnit: 25,
    });
    expect(result.success).toBe(false);
  });

  it('cession_toggle true avec date + prix → valid', () => {
    const result = createExerciseRequestInputSchema.safeParse({
      ...baseValid,
      cessionToggle: true,
      cessionDate: new Date('2026-12-01'),
      cessionPricePerUnit: 25,
    });
    expect(result.success).toBe(true);
  });

  it('awardId pas un UUID → invalid', () => {
    const result = createExerciseRequestInputSchema.safeParse({
      ...baseValid,
      awardId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });
});

describe('cancelExerciseRequestInputSchema', () => {
  it('valid input', () => {
    const result = cancelExerciseRequestInputSchema.safeParse({
      requestId: 'a3b9c2d4-1234-4567-89ab-1234567890ab',
      reason: 'Reconsidered the decision',
    });
    expect(result.success).toBe(true);
  });

  it('reason trop court (< 3 chars) → invalid', () => {
    const result = cancelExerciseRequestInputSchema.safeParse({
      requestId: 'a3b9c2d4-1234-4567-89ab-1234567890ab',
      reason: 'no',
    });
    expect(result.success).toBe(false);
  });
});

describe('exerciseRequestStatusSchema', () => {
  it('accepte tous les statuts officiels', () => {
    const statuses = [
      'PENDING',
      'APPROVED',
      'REJECTED',
      'SIGNED',
      'CANCELLED',
      'COMPLETED',
    ] as const;
    for (const s of statuses) {
      expect(exerciseRequestStatusSchema.safeParse(s).success).toBe(true);
    }
  });

  it('rejette un statut inconnu', () => {
    expect(exerciseRequestStatusSchema.safeParse('UNKNOWN').success).toBe(false);
  });
});
