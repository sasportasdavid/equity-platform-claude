import { describe, expect, it } from 'vitest';
import { completeBeneficiaryProfileSchema } from './portal';

const valid = {
  firstName: 'Alice',
  lastName: 'Martin',
  addressLine1: '12 rue de Paris',
  postalCode: '75001',
  city: 'Paris',
  country: 'FR',
};

describe('completeBeneficiaryProfileSchema (Module 8 B2)', () => {
  it('accepts minimal valid input (no phone, no addressLine2)', () => {
    const out = completeBeneficiaryProfileSchema.safeParse(valid);
    expect(out.success).toBe(true);
  });

  it('accepts valid input with optional phone + addressLine2', () => {
    const out = completeBeneficiaryProfileSchema.safeParse({
      ...valid,
      phone: '+33 6 12 34 56 78',
      addressLine2: 'Bât. B',
    });
    expect(out.success).toBe(true);
  });

  it('accepts empty-string phone (treated as not provided)', () => {
    const out = completeBeneficiaryProfileSchema.safeParse({ ...valid, phone: '' });
    expect(out.success).toBe(true);
  });

  it('rejects empty firstName', () => {
    const out = completeBeneficiaryProfileSchema.safeParse({ ...valid, firstName: '' });
    expect(out.success).toBe(false);
  });

  it('rejects firstName > 100 chars', () => {
    const out = completeBeneficiaryProfileSchema.safeParse({
      ...valid,
      firstName: 'a'.repeat(101),
    });
    expect(out.success).toBe(false);
  });

  it('rejects country code !== 2 letters', () => {
    expect(
      completeBeneficiaryProfileSchema.safeParse({ ...valid, country: 'France' }).success,
    ).toBe(false);
    expect(completeBeneficiaryProfileSchema.safeParse({ ...valid, country: 'F' }).success).toBe(
      false,
    );
  });

  it('rejects lowercase country code', () => {
    const out = completeBeneficiaryProfileSchema.safeParse({ ...valid, country: 'fr' });
    expect(out.success).toBe(false);
  });

  it('rejects empty city / postalCode / addressLine1', () => {
    expect(completeBeneficiaryProfileSchema.safeParse({ ...valid, city: '' }).success).toBe(false);
    expect(completeBeneficiaryProfileSchema.safeParse({ ...valid, postalCode: '' }).success).toBe(
      false,
    );
    expect(completeBeneficiaryProfileSchema.safeParse({ ...valid, addressLine1: '' }).success).toBe(
      false,
    );
  });

  it('rejects too-short postalCode (1 char)', () => {
    const out = completeBeneficiaryProfileSchema.safeParse({ ...valid, postalCode: 'X' });
    expect(out.success).toBe(false);
  });

  it('rejects garbage phone (does not match regex)', () => {
    const out = completeBeneficiaryProfileSchema.safeParse({ ...valid, phone: 'abc' });
    expect(out.success).toBe(false);
  });
});
