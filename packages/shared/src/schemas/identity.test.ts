import { describe, expect, it } from 'vitest';
import {
  onboardingCompanySchema,
  onboardingProfileSchema,
  ROLE_TITLE_LABELS,
  ROLE_TITLES,
  signupWithMagicLinkSchema,
} from './identity';

describe('signupWithMagicLinkSchema (Module 14 B1)', () => {
  it('accepts valid input', () => {
    const out = signupWithMagicLinkSchema.safeParse({
      email: 'user@example.com',
      tosAccepted: true,
      tosVersion: 'v1.0-2026-05-05',
    });
    expect(out.success).toBe(true);
  });

  it('lowercases and trims email', () => {
    const out = signupWithMagicLinkSchema.safeParse({
      email: '  USER@Example.COM  ',
      tosAccepted: true,
      tosVersion: 'v1.0-2026-05-05',
    });
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.data.email).toBe('user@example.com');
    }
  });

  it('rejects invalid email', () => {
    const out = signupWithMagicLinkSchema.safeParse({
      email: 'not-an-email',
      tosAccepted: true,
      tosVersion: 'v1.0',
    });
    expect(out.success).toBe(false);
  });

  it('rejects tosAccepted=false (literal true required)', () => {
    const out = signupWithMagicLinkSchema.safeParse({
      email: 'user@example.com',
      tosAccepted: false,
      tosVersion: 'v1.0',
    });
    expect(out.success).toBe(false);
    if (!out.success) {
      const flat = out.error.flatten().fieldErrors;
      expect(flat.tosAccepted?.[0]).toContain('conditions d');
    }
  });

  it('rejects when tosAccepted is missing', () => {
    const out = signupWithMagicLinkSchema.safeParse({
      email: 'user@example.com',
      tosVersion: 'v1.0',
    });
    expect(out.success).toBe(false);
  });

  it('rejects empty tosVersion', () => {
    const out = signupWithMagicLinkSchema.safeParse({
      email: 'user@example.com',
      tosAccepted: true,
      tosVersion: '',
    });
    expect(out.success).toBe(false);
  });

  it('rejects tosVersion longer than 50 chars', () => {
    const out = signupWithMagicLinkSchema.safeParse({
      email: 'user@example.com',
      tosAccepted: true,
      tosVersion: 'v'.repeat(51),
    });
    expect(out.success).toBe(false);
  });
});

describe('onboardingProfileSchema (Module 14 B2)', () => {
  it('accepts valid input', () => {
    const out = onboardingProfileSchema.safeParse({
      firstName: 'Jeanne',
      lastName: 'Dupont',
      roleTitle: 'CFO',
    });
    expect(out.success).toBe(true);
  });

  it('trims first/last name', () => {
    const out = onboardingProfileSchema.safeParse({
      firstName: '  Jeanne  ',
      lastName: '  Dupont  ',
      roleTitle: 'EQUITY_MANAGER',
    });
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.data.firstName).toBe('Jeanne');
      expect(out.data.lastName).toBe('Dupont');
    }
  });

  it('rejects empty firstName', () => {
    const out = onboardingProfileSchema.safeParse({
      firstName: '',
      lastName: 'Dupont',
      roleTitle: 'FOUNDER',
    });
    expect(out.success).toBe(false);
  });

  it('rejects unknown roleTitle', () => {
    const out = onboardingProfileSchema.safeParse({
      firstName: 'Jeanne',
      lastName: 'Dupont',
      roleTitle: 'NOT_A_ROLE',
    });
    expect(out.success).toBe(false);
  });

  it('rejects firstName longer than 60 chars', () => {
    const out = onboardingProfileSchema.safeParse({
      firstName: 'J'.repeat(61),
      lastName: 'Dupont',
      roleTitle: 'OTHER',
    });
    expect(out.success).toBe(false);
  });

  it('exposes a label for every ROLE_TITLE', () => {
    for (const rt of ROLE_TITLES) {
      expect(ROLE_TITLE_LABELS[rt]).toBeTruthy();
    }
  });
});

describe('onboardingCompanySchema (Module 14 B2)', () => {
  it('accepts join mode with valid token', () => {
    const out = onboardingCompanySchema.safeParse({
      mode: 'join',
      invitationToken: 'a'.repeat(64),
    });
    expect(out.success).toBe(true);
  });

  it('rejects join mode with too-short token', () => {
    const out = onboardingCompanySchema.safeParse({
      mode: 'join',
      invitationToken: 'short',
    });
    expect(out.success).toBe(false);
  });

  it('accepts create mode with name only', () => {
    const out = onboardingCompanySchema.safeParse({
      mode: 'create',
      name: 'Capiwise',
    });
    expect(out.success).toBe(true);
  });

  it('accepts create mode with full payload', () => {
    const out = onboardingCompanySchema.safeParse({
      mode: 'create',
      name: 'Capiwise',
      legalName: 'Capiwise SAS',
      legalForm: 'SAS',
      siren: '123456789',
    });
    expect(out.success).toBe(true);
  });

  it('rejects create mode with bad SIREN', () => {
    const out = onboardingCompanySchema.safeParse({
      mode: 'create',
      name: 'Capiwise',
      siren: '12345',
    });
    expect(out.success).toBe(false);
  });

  it('rejects unknown mode', () => {
    const out = onboardingCompanySchema.safeParse({
      mode: 'maybe-something',
      name: 'Capiwise',
    });
    expect(out.success).toBe(false);
  });

  it('rejects create mode with name shorter than 2 chars', () => {
    const out = onboardingCompanySchema.safeParse({
      mode: 'create',
      name: 'C',
    });
    expect(out.success).toBe(false);
  });
});
