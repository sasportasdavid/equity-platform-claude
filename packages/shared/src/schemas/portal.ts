import { z } from 'zod';

/**
 * Module 8 — Schémas Zod pour le portail bénéficiaire.
 *
 * Source de vérité pour les inputs des Server Actions exposées dans
 * `apps/web/src/app/portal/*`. Référence : docs/MODULE_08_BENEFICIARY_PORTAL.md
 * §3 (onboarding) et §6 (Server Actions).
 *
 * NB : `tax_residence_country` n'est PAS dans `completeBeneficiaryProfileSchema`
 * car le trigger Module 4 `enforce_beneficiary_self_update` bloque sa
 * modification par le bénéficiaire (donnée fiscale critique). La colonne est
 * NOT NULL avec valeur déjà set au moment de l'invite admin (Module 4).
 * Si le bénéficiaire veut changer sa résidence fiscale, il doit passer par
 * un admin.
 */

// Regex permissif pour téléphone international (E.164 + extensions, espaces).
const phoneRegex = /^[+\d][\d\s().\-x]{4,29}$/;

// ISO 3166-1 alpha-2 (2 lettres majuscules)
const isoCountry = z
  .string()
  .length(2)
  .regex(/^[A-Z]{2}$/, 'Code pays ISO-3166-1 alpha-2 attendu (ex: FR, BE)');

/**
 * Onboarding step 2 — completion du profil.
 *
 * Champs requis : first_name, last_name, address_line_1, postal_code, city,
 * country.
 *
 * Champs optionnels : phone (chiffré via RPC), address_line_2.
 */
export const completeBeneficiaryProfileSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z
    .string()
    .max(30)
    .optional()
    .refine(
      (val) => val === undefined || val.trim() === '' || phoneRegex.test(val.trim()),
      'Numéro de téléphone invalide',
    ),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).optional().or(z.literal('')),
  postalCode: z.string().min(2).max(20),
  city: z.string().min(1).max(100),
  country: isoCountry,
});

export type CompleteBeneficiaryProfileInput = z.infer<typeof completeBeneficiaryProfileSchema>;

/**
 * Update partiel du profil bénéficiaire depuis `/portal/profile` (Module 8 B5).
 *
 * Différences avec `completeBeneficiaryProfileSchema` :
 *   - Pas de `firstName` / `lastName` (read-only V1, modifiable côté admin
 *     uniquement pour préserver l'identité contractuelle)
 *   - Phone toujours optionnel
 *   - Adresse + pays modifiables
 *
 * `tax_residence_country` n'est PAS dans le schéma (B2 décision : bloqué
 * par trigger Module 4, admin-only).
 */
export const updateBeneficiaryProfileSchema = z.object({
  phone: z
    .string()
    .max(30)
    .optional()
    .refine(
      (val) => val === undefined || val.trim() === '' || phoneRegex.test(val.trim()),
      'Numéro de téléphone invalide',
    ),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).optional().or(z.literal('')),
  postalCode: z.string().min(2).max(20),
  city: z.string().min(1).max(100),
  country: isoCountry,
});

export type UpdateBeneficiaryProfileInput = z.infer<typeof updateBeneficiaryProfileSchema>;
