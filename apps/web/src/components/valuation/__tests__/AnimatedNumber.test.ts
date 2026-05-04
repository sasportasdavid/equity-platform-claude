import { describe, expect, it } from 'vitest';
import { computeAnimatedValue } from '../AnimatedNumber';
import { easeLinear, easeInOutQuad, resolveEasing } from '../helpers';

/**
 * Module 11 B4 — Tests count-up + nouveaux easings.
 *
 * `AnimatedNumber` est un composant pure presentation — la logique testable
 * est dans `computeAnimatedValue`. Le rendu DOM est validé via la sandbox
 * /dev/monte-carlo-replay (visual smoke test cohérent avec pattern repo).
 */

describe('computeAnimatedValue', () => {
  it('returns 0 at progress=0', () => {
    expect(computeAnimatedValue(12.47, 0)).toBe(0);
  });

  it('returns exact targetValue at progress=1', () => {
    expect(computeAnimatedValue(12.47, 1)).toBe(12.47);
  });

  it('scales linearly with progress (count-up effect)', () => {
    expect(computeAnimatedValue(100, 0.25)).toBe(25);
    expect(computeAnimatedValue(100, 0.5)).toBe(50);
    expect(computeAnimatedValue(100, 0.75)).toBe(75);
  });

  it('clamps progress < 0 to 0', () => {
    expect(computeAnimatedValue(50, -0.3)).toBe(0);
  });

  it('clamps progress > 1 to targetValue exactly (no overshoot)', () => {
    expect(computeAnimatedValue(50, 1.2)).toBe(50);
  });

  it('handles negative target values (dette défavorable IFRS 2.B43)', () => {
    expect(computeAnimatedValue(-2500, 0.5)).toBe(-1250);
    expect(computeAnimatedValue(-2500, 1)).toBe(-2500);
  });
});

describe('easeLinear', () => {
  it('returns t (no easing) for valid range', () => {
    expect(easeLinear(0)).toBe(0);
    expect(easeLinear(0.25)).toBe(0.25);
    expect(easeLinear(0.5)).toBe(0.5);
    expect(easeLinear(0.75)).toBe(0.75);
    expect(easeLinear(1)).toBe(1);
  });

  it('clamps t outside [0, 1]', () => {
    expect(easeLinear(-0.5)).toBe(0);
    expect(easeLinear(1.5)).toBe(1);
  });
});

describe('easeInOutQuad', () => {
  it('returns 0 at t=0 and 1 at t=1', () => {
    expect(easeInOutQuad(0)).toBe(0);
    expect(easeInOutQuad(1)).toBe(1);
  });

  it('returns 0.5 at t=0.5 (symmetric ease-in-out)', () => {
    expect(easeInOutQuad(0.5)).toBe(0.5);
  });

  it('produces ease-in shape on [0, 0.5]', () => {
    // Premier quart : t=0.25 → 2 * 0.25^2 = 0.125 (slower than linear)
    expect(easeInOutQuad(0.25)).toBeCloseTo(0.125, 5);
  });

  it('produces ease-out shape on [0.5, 1]', () => {
    // Trois-quarts : t=0.75 → 1 - (-2*0.75+2)^2/2 = 1 - 0.5^2/2 = 0.875
    expect(easeInOutQuad(0.75)).toBeCloseTo(0.875, 5);
  });

  it('clamps t outside [0, 1]', () => {
    expect(easeInOutQuad(-0.2)).toBe(0);
    expect(easeInOutQuad(1.5)).toBe(1);
  });
});

describe('resolveEasing', () => {
  it('returns easeLinear for "linear"', () => {
    expect(resolveEasing('linear')(0.5)).toBe(0.5);
  });

  it('returns easeOutCubic for "easeOutCubic"', () => {
    expect(resolveEasing('easeOutCubic')(0.5)).toBeCloseTo(0.875, 5);
  });

  it('returns easeInOutQuad for "easeInOutQuad"', () => {
    expect(resolveEasing('easeInOutQuad')(0.5)).toBe(0.5);
  });
});
