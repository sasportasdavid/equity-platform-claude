/**
 * Module 6 B2 — Helper pur pour résoudre le code template depuis le plan_type.
 *
 * Extrait de `render.tsx` (qui contient du JSX) pour pouvoir être testé en
 * Vitest sans plugin React. Le mapping est cohérent avec TEMPLATE_MAP côté
 * render.tsx.
 *
 * Module 9 B5 ajoute les 2 codes EXERCISE_NOTIFICATION + SUBSCRIPTION_BULLETIN
 * (templates exercise — shape de payload différente, cf. DocumentContextExercise).
 */

export type AwardTemplateCode = 'BSPCE_GRANT_LETTER' | 'AGA_GRANT_LETTER' | 'SO_GRANT_LETTER';

export type ExerciseTemplateCode = 'EXERCISE_NOTIFICATION' | 'SUBSCRIPTION_BULLETIN';

export type TemplateCode = AwardTemplateCode | ExerciseTemplateCode;

export const SUPPORTED_AWARD_TEMPLATE_CODES: AwardTemplateCode[] = [
  'BSPCE_GRANT_LETTER',
  'AGA_GRANT_LETTER',
  'SO_GRANT_LETTER',
];

export const SUPPORTED_EXERCISE_TEMPLATE_CODES: ExerciseTemplateCode[] = [
  'EXERCISE_NOTIFICATION',
  'SUBSCRIPTION_BULLETIN',
];

export const SUPPORTED_TEMPLATE_CODES: TemplateCode[] = [
  ...SUPPORTED_AWARD_TEMPLATE_CODES,
  ...SUPPORTED_EXERCISE_TEMPLATE_CODES,
];

export function resolveTemplateCodeFromPlanType(planType: string): AwardTemplateCode | null {
  switch (planType) {
    case 'BSPCE':
      return 'BSPCE_GRANT_LETTER';
    case 'AGA':
    case 'AGA_PERFORMANCE':
      return 'AGA_GRANT_LETTER';
    case 'STOCK_OPTION':
      return 'SO_GRANT_LETTER';
    default:
      return null;
  }
}

export function isExerciseTemplateCode(code: string): code is ExerciseTemplateCode {
  return SUPPORTED_EXERCISE_TEMPLATE_CODES.includes(code as ExerciseTemplateCode);
}
