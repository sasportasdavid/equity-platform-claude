import { z } from 'zod';

/** UUID v4 (Supabase utilise gen_random_uuid()). */
export const uuidSchema = z.string().uuid();

/** Email RFC-5322 normalisé. */
export const emailSchema = z.string().trim().toLowerCase().email();

/** Numéro SIREN français — 9 chiffres. */
export const sirenSchema = z.string().regex(/^\d{9}$/, 'SIREN invalide : 9 chiffres requis');

/** ISO date string YYYY-MM-DD. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date ISO YYYY-MM-DD requise');

/** Montant numérique positif (au moins 0). */
export const positiveAmountSchema = z.number().nonnegative();

/** Quantité d'instruments (entier strictement positif, BigInt-compatible). */
export const positiveUnitsSchema = z.number().int().positive();

/** Mot de passe minimum 12 caractères, au moins 1 maj, 1 chiffre, 1 spécial. */
export const passwordSchema = z
  .string()
  .min(12, 'Le mot de passe doit faire au moins 12 caractères')
  .regex(/[A-Z]/, 'Au moins une majuscule')
  .regex(/[0-9]/, 'Au moins un chiffre')
  .regex(/[^A-Za-z0-9]/, 'Au moins un caractère spécial');

/** Adresse JSON (FR-centric). */
export const addressSchema = z.object({
  street: z.string().trim().min(1).max(200),
  postal_code: z.string().trim().min(1).max(20),
  city: z.string().trim().min(1).max(100),
  country: z.string().trim().length(2).default('FR'),
});
export type Address = z.infer<typeof addressSchema>;
