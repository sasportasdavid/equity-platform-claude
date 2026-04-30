/**
 * Module 6 B2 — Helper pur pour résoudre le code template depuis le plan_type.
 *
 * Extrait de `render.tsx` (qui contient du JSX) pour pouvoir être testé en
 * Vitest sans plugin React. Le mapping est cohérent avec TEMPLATE_MAP côté
 * render.tsx.
 */

export type TemplateCode = 'BSPCE_GRANT_LETTER' | 'AGA_GRANT_LETTER' | 'SO_GRANT_LETTER';

export const SUPPORTED_TEMPLATE_CODES: TemplateCode[] = [
  'BSPCE_GRANT_LETTER',
  'AGA_GRANT_LETTER',
  'SO_GRANT_LETTER',
];

export function resolveTemplateCodeFromPlanType(planType: string): TemplateCode | null {
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
