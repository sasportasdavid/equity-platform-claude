import { describe, expect, it } from 'vitest';
import {
  cancelSignatureRequestSchema,
  generateAwardDocumentSchema,
  sendDocumentForSignatureSchema,
  voidDocumentSchema,
} from './document';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';
const VALID_UUID_2 = '22222222-2222-4222-8222-222222222222';

describe('document schemas (Module 6 B3)', () => {
  describe('generateAwardDocumentSchema', () => {
    it('accepts valid input with templateCode', () => {
      const out = generateAwardDocumentSchema.safeParse({
        awardId: VALID_UUID,
        templateCode: 'BSPCE_GRANT_LETTER',
      });
      expect(out.success).toBe(true);
    });

    it('rejects invalid templateCode', () => {
      const out = generateAwardDocumentSchema.safeParse({
        awardId: VALID_UUID,
        templateCode: 'INVALID',
      });
      expect(out.success).toBe(false);
    });
  });

  describe('sendDocumentForSignatureSchema', () => {
    const baseSigner = {
      type: 'BENEFICIARY' as const,
      fullName: 'Jean Dupont',
      email: 'jean@example.com',
      signingOrder: 1,
    };

    it('accepts a single BENEFICIARY signer', () => {
      const out = sendDocumentForSignatureSchema.safeParse({
        documentId: VALID_UUID,
        signers: [baseSigner],
      });
      expect(out.success).toBe(true);
      if (out.success) {
        expect(out.data.signingOrder).toBe('SEQUENTIAL'); // default
        expect(out.data.expiryDays).toBe(30); // default
      }
    });

    it('rejects when no BENEFICIARY signer present (superRefine)', () => {
      const out = sendDocumentForSignatureSchema.safeParse({
        documentId: VALID_UUID,
        signers: [{ ...baseSigner, type: 'COMPANY_REPRESENTATIVE' as const }],
      });
      expect(out.success).toBe(false);
      if (!out.success) {
        expect(out.error.issues[0]!.message).toMatch(/BENEFICIARY/);
      }
    });

    it('rejects duplicate signingOrder values (superRefine)', () => {
      const out = sendDocumentForSignatureSchema.safeParse({
        documentId: VALID_UUID,
        signers: [baseSigner, { ...baseSigner, email: 'other@example.com', signingOrder: 1 }],
      });
      expect(out.success).toBe(false);
      if (!out.success) {
        expect(out.error.issues[0]!.message).toMatch(/unique/);
      }
    });

    it('rejects empty signers array', () => {
      const out = sendDocumentForSignatureSchema.safeParse({
        documentId: VALID_UUID,
        signers: [],
      });
      expect(out.success).toBe(false);
    });

    it('rejects more than 10 signers', () => {
      const signers = Array.from({ length: 11 }, (_, i) => ({
        ...baseSigner,
        email: `s${i}@example.com`,
        signingOrder: i + 1,
      }));
      const out = sendDocumentForSignatureSchema.safeParse({
        documentId: VALID_UUID,
        signers,
      });
      expect(out.success).toBe(false);
    });

    it('clamps expiryDays to [1, 365]', () => {
      const out366 = sendDocumentForSignatureSchema.safeParse({
        documentId: VALID_UUID,
        signers: [baseSigner],
        expiryDays: 366,
      });
      expect(out366.success).toBe(false);

      const out0 = sendDocumentForSignatureSchema.safeParse({
        documentId: VALID_UUID,
        signers: [baseSigner],
        expiryDays: 0,
      });
      expect(out0.success).toBe(false);
    });

    it('accepts SEQUENTIAL or PARALLEL signingOrder', () => {
      const seq = sendDocumentForSignatureSchema.safeParse({
        documentId: VALID_UUID,
        signers: [baseSigner],
        signingOrder: 'SEQUENTIAL',
      });
      const par = sendDocumentForSignatureSchema.safeParse({
        documentId: VALID_UUID,
        signers: [baseSigner],
        signingOrder: 'PARALLEL',
      });
      expect(seq.success).toBe(true);
      expect(par.success).toBe(true);
    });

    it('accepts 2 signers with distinct signingOrder', () => {
      const out = sendDocumentForSignatureSchema.safeParse({
        documentId: VALID_UUID,
        signers: [
          { ...baseSigner, signingOrder: 1 },
          {
            ...baseSigner,
            type: 'COMPANY_REPRESENTATIVE' as const,
            email: 'rep@example.com',
            signingOrder: 2,
          },
        ],
      });
      expect(out.success).toBe(true);
    });
  });

  describe('cancelSignatureRequestSchema', () => {
    it('accepts a valid cancel request', () => {
      const out = cancelSignatureRequestSchema.safeParse({
        requestId: VALID_UUID_2,
        reason: 'Annulation pour test E2E',
      });
      expect(out.success).toBe(true);
    });

    it('rejects reason shorter than 10 chars', () => {
      const out = cancelSignatureRequestSchema.safeParse({
        requestId: VALID_UUID_2,
        reason: 'short',
      });
      expect(out.success).toBe(false);
    });
  });

  describe('voidDocumentSchema', () => {
    it('rejects reason shorter than 10 chars', () => {
      const out = voidDocumentSchema.safeParse({
        documentId: VALID_UUID,
        reason: 'no',
      });
      expect(out.success).toBe(false);
    });
  });
});
