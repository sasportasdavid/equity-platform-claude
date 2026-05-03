import { describe, expect, it } from 'vitest';
import { PORTAL_COUNTRIES, getPortalCountryName, isKnownPortalCountry } from '../countries';

describe('PORTAL_COUNTRIES', () => {
  it('contains FR as default', () => {
    expect(PORTAL_COUNTRIES.some((c) => c.code === 'FR' && c.name === 'France')).toBe(true);
  });

  it('all codes are 2 uppercase letters (ISO 3166-1 alpha-2)', () => {
    for (const c of PORTAL_COUNTRIES) {
      expect(c.code).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('no duplicate codes', () => {
    const codes = PORTAL_COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('isKnownPortalCountry', () => {
  it('returns true for known code', () => {
    expect(isKnownPortalCountry('FR')).toBe(true);
    expect(isKnownPortalCountry('US')).toBe(true);
  });

  it('returns true for lowercase (case-insensitive)', () => {
    expect(isKnownPortalCountry('fr')).toBe(true);
  });

  it('returns false for unknown / null / empty', () => {
    expect(isKnownPortalCountry('XX')).toBe(false);
    expect(isKnownPortalCountry(null)).toBe(false);
    expect(isKnownPortalCountry(undefined)).toBe(false);
    expect(isKnownPortalCountry('')).toBe(false);
  });
});

describe('getPortalCountryName', () => {
  it('returns French name for known code', () => {
    expect(getPortalCountryName('FR')).toBe('France');
    expect(getPortalCountryName('GB')).toBe('Royaume-Uni');
  });

  it('returns dash for null/empty', () => {
    expect(getPortalCountryName(null)).toBe('—');
    expect(getPortalCountryName('')).toBe('—');
  });

  it('returns code as fallback for unknown', () => {
    expect(getPortalCountryName('XX')).toBe('XX');
  });
});
