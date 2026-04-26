import { z } from 'zod';
import { emailSchema, passwordSchema } from './common';

/** Sign-in (login) — email + password. */
export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Mot de passe requis'),
});
export type SignInInput = z.infer<typeof signInSchema>;

/** Sign-up — création de compte (utilisé par le flow d'invitation). */
export const signUpSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    fullName: z.string().trim().min(2).max(120),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });
export type SignUpInput = z.infer<typeof signUpSchema>;

/** Reset password — étape 1 (envoi de l'email). */
export const requestPasswordResetSchema = z.object({
  email: emailSchema,
});
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

/** Reset password — étape 2 (nouveau mot de passe via token). */
export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
