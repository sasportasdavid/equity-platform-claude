/**
 * Module 9 B5 — Helpers partagés des 2 templates PDF exercise.
 *
 * Extrait des templates pour permettre les tests Vitest sans rendre le PDF
 * (qui nécessite Helvetica + filesystem côté Node).
 */

/**
 * Plan types autorisés pour les workflows d'exercice. AGA est exclu car les
 * actions gratuites ne s'« exercent » pas (elles deviennent acquises au
 * vesting). Si un plan AGA arrive ici → bug en amont (compliance + RPC
 * applies_to_plan_types l'excluent normalement).
 *
 * Cette assertion runtime est une dernière ligne de défense — les hooks PDF
 * doivent crash plutôt que générer un document juridiquement faux.
 */
export const EXERCISABLE_PLAN_TYPES = ['BSPCE', 'STOCK_OPTION', 'BSA'] as const;

export type ExercisablePlanType = (typeof EXERCISABLE_PLAN_TYPES)[number];

export function assertExercisableType(planType: string): void {
  if (planType === 'AGA' || planType === 'AGA_PERFORMANCE') {
    throw new Error(
      `AGA plans cannot exercise — invalid template usage (received plan_type=${planType})`,
    );
  }
  if (!EXERCISABLE_PLAN_TYPES.includes(planType as ExercisablePlanType)) {
    throw new Error(
      `Unknown exercisable plan_type=${planType} (expected one of ${EXERCISABLE_PLAN_TYPES.join(', ')})`,
    );
  }
}

/**
 * Mentions légales V1 imprimées dans les PDF exercise.
 *
 * Les références CGI / Code de commerce sont V1. Pour les formulations
 * définitives signées avocat, voir dette V2 #110 (validation juridique
 * formulations).
 */
export const LEGAL_MENTIONS = {
  /**
   * Notification d'exercice — bas du PDF post sections instructions.
   * Réfs : L228-91+ (titres complexes), L225-177 (SO), 163 bis G CGI (BSPCE).
   */
  EXERCISE_NOTIFICATION: [
    "Cette notification fait office de demande formelle d'exercice des droits attribués au bénéficiaire,",
    'conformément aux articles L228-91 et suivants du Code de commerce et,',
    "le cas échéant, à l'article 163 bis G du CGI pour les BSPCE ou L225-177 pour les options.",
    "Le bénéficiaire deviendra actionnaire dès réception et confirmation du paiement par l'entreprise.",
    "Cette notification ne constitue ni un titre, ni un certificat d'actions.",
  ].join(' '),

  /**
   * Bulletin de souscription — preuve papier post-paiement, valeur juridique.
   * Réfs : L228-7 (titres financiers), L228-1 (registre), 163 bis G CGI.
   */
  SUBSCRIPTION_BULLETIN: [
    'Le présent bulletin vaut titre de souscription au sens des articles L228-7 et suivants du Code de commerce.',
    'Le souscripteur est inscrit au registre des mouvements de titres de la société à la date de réception du paiement,',
    "conformément à l'article L228-1 du Code de commerce.",
    'Les actions ainsi souscrites sont nominatives, conformément aux statuts de la société.',
    '[V2 #110 — formulations à valider par conseil juridique avant publication production.]',
  ].join(' '),
} as const;

/**
 * Compose un nom complet à partir de first/last name (RPC exercise context
 * les expose séparément, contrairement au M6 award context qui a full_name).
 */
export function composeFullName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  const parts = [firstName, lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : '—';
}

/**
 * Compose une adresse multilignes (1 ligne par champ non null).
 */
export function composeAddressLines(b: {
  address_line_1?: string | null;
  address_line_2?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country?: string | null;
}): string[] {
  const lines: string[] = [];
  if (b.address_line_1) lines.push(b.address_line_1);
  if (b.address_line_2) lines.push(b.address_line_2);
  const cityLine = [b.postal_code, b.city].filter(Boolean).join(' ');
  if (cityLine) lines.push(cityLine);
  if (b.country) lines.push(b.country);
  return lines;
}
