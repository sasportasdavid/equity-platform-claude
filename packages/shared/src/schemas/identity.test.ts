import { describe, expect, it } from 'vitest';
import { signupWithMagicLinkSchema } from './identity';

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
