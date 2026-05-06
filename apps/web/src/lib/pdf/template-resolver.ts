/**
 * Module 6 B2 — Helper pur pour résoudre le code template depuis le plan_type.
 *
 * Extrait de `render.tsx` (qui contient du JSX) pour pouvoir être testé en
 * Vitest sans plugin React. Le mapping est cohérent avec TEMPLATE_MAP côté
 * render.tsx.
 *
 * Module 9 B5 ajoute les 2 codes EXERCISE_NOTIFICATION + SUBSCRIPTION_BULLETIN
 * (templates exercise — shape de payload différente, cf. DocumentContextExercise).
 *
 * V1.1 PR #49 :
 *   - 2 nouveaux codes RSU_GRANT_LETTER + BSA_GRANT_LETTER (réutilisent
 *     respectivement AgaGrantLetterTemplate et StockOptionGrantLetterTemplate
 *     côté React PDF, métadonnées DB distinctes via migration 00103)
 *   - `resolveDocumentTemplate()` : helper async qui interroge `document_templates`
 *     avec fallback GLOBAL (org_id IS NULL). Throw `TEMPLATE_NOT_FOUND` si
 *     aucun match.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type AwardTemplateCode =
  | 'BSPCE_GRANT_LETTER'
  | 'AGA_GRANT_LETTER'
  | 'SO_GRANT_LETTER'
  | 'RSU_GRANT_LETTER'
  | 'BSA_GRANT_LETTER';

export type ExerciseTemplateCode = 'EXERCISE_NOTIFICATION' | 'SUBSCRIPTION_BULLETIN';

export type TemplateCode = AwardTemplateCode | ExerciseTemplateCode;

export const SUPPORTED_AWARD_TEMPLATE_CODES: AwardTemplateCode[] = [
  'BSPCE_GRANT_LETTER',
  'AGA_GRANT_LETTER',
  'SO_GRANT_LETTER',
  'RSU_GRANT_LETTER',
  'BSA_GRANT_LETTER',
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
    case 'RSU':
      return 'RSU_GRANT_LETTER';
    case 'BSA':
      return 'BSA_GRANT_LETTER';
    default:
      return null;
  }
}

export function isExerciseTemplateCode(code: string): code is ExerciseTemplateCode {
  return SUPPORTED_EXERCISE_TEMPLATE_CODES.includes(code as ExerciseTemplateCode);
}

// ---------------------------------------------------------------------------
// V1.1 — DB-aware resolver avec fallback GLOBAL
// ---------------------------------------------------------------------------

export type ResolvedDocumentTemplate = {
  id: string;
  code: string;
  version: number;
  name: string;
  category: string;
  isGlobal: boolean;
};

type MinimalTemplateRow = {
  id: string;
  code: string;
  version: number;
  name: string;
  category: string;
  org_id: string | null;
};

/**
 * Cherche le template `code` pour `orgId`, avec fallback GLOBAL (org_id IS NULL).
 *
 * Stratégie :
 *   1. Lookup org-specific (`org_id = orgId AND code = code`)
 *   2. Si rien → lookup GLOBAL (`org_id IS NULL AND code = code`)
 *   3. Si toujours rien → return `null` (le caller décide de throw avec
 *      contexte métier, ex: TEMPLATE_NOT_FOUND: code=BSPCE_GRANT_LETTER for
 *      org=...). Cf. Module 6 / V1.1 §"Templates GLOBAL fallback" dans CLAUDE.md.
 *
 * Filtres communs : `is_active = true` ET `deleted_at IS NULL`.
 *
 * Le caller doit fournir un client Supabase capable de SELECT sur
 * `document_templates` — soit le client SSR (RLS authentifié, voit GLOBAL via
 * la policy 00103), soit le client admin (service_role bypass RLS).
 */
export async function resolveDocumentTemplate(
  supabase: Pick<SupabaseClient, 'from'>,
  params: { orgId: string; code: string },
): Promise<ResolvedDocumentTemplate | null> {
  const { orgId, code } = params;

  const { data: orgSpecific } = await supabase
    .from('document_templates')
    .select('id, code, version, name, category, org_id')
    .eq('org_id', orgId)
    .eq('code', code)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle<MinimalTemplateRow>();

  if (orgSpecific) {
    return {
      id: orgSpecific.id,
      code: orgSpecific.code,
      version: orgSpecific.version,
      name: orgSpecific.name,
      category: orgSpecific.category,
      isGlobal: false,
    };
  }

  const { data: globalRow } = await supabase
    .from('document_templates')
    .select('id, code, version, name, category, org_id')
    .is('org_id', null)
    .eq('code', code)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle<MinimalTemplateRow>();

  if (globalRow) {
    return {
      id: globalRow.id,
      code: globalRow.code,
      version: globalRow.version,
      name: globalRow.name,
      category: globalRow.category,
      isGlobal: true,
    };
  }

  return null;
}

/** Erreur métier dédiée au lookup template — utile pour distinguer un fail
 *  "vraiment pas de template" d'une erreur réseau Supabase. */
export class TemplateNotFoundError extends Error {
  readonly code: string;
  readonly orgId: string;
  constructor(params: { code: string; orgId: string }) {
    super(
      `TEMPLATE_NOT_FOUND: code=${params.code} (no org-specific nor GLOBAL match for org=${params.orgId})`,
    );
    this.name = 'TemplateNotFoundError';
    this.code = params.code;
    this.orgId = params.orgId;
  }
}

/** Variante qui throw `TemplateNotFoundError` si rien n'est trouvé.
 *  Pratique dans les hooks fire-and-forget où on veut un message explicite. */
export async function resolveDocumentTemplateOrThrow(
  supabase: Pick<SupabaseClient, 'from'>,
  params: { orgId: string; code: string },
): Promise<ResolvedDocumentTemplate> {
  const result = await resolveDocumentTemplate(supabase, params);
  if (!result) {
    throw new TemplateNotFoundError(params);
  }
  return result;
}
