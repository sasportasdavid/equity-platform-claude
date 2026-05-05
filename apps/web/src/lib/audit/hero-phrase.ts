/**
 * PR #39 B3 — Helper éditorial pour le hero de la page /audit-trail.
 *
 * Pure helper (pas d'I/O). Compose une phrase 3 fragments
 * `prefix + italic accent + suffix` selon le volume d'events.
 *
 * Logique :
 * - 0 event              → "Aucun événement enregistré pour le moment."
 * - 1 event              → "Bonjour, *un événement* au registre."
 * - 2-9 events           → "Bonjour, *deux/.../neuf événements* au registre."
 * - 10+ events           → "Bonjour, *244 événements* au registre."
 *
 * Aligné avec `buildHeroGreetingPhrase` (PR #36 B1) — même shape de retour
 * pour réutilisation par <PageShell.Title> + <PageShell.TitleAccent>.
 */

export type AuditHeroPhraseInput = {
  /** Préfixe complet ("Bonjour Julien,") — typiquement issu de `getAdaptiveDashboardGreeting`. */
  greetingPrefix: string;
  /** Nb total d'événements au registre. */
  totalEvents: number;
};

export type AuditHeroPhrase = {
  prefix: string;
  accent: string;
  suffix: string;
};

const FRENCH_NUMBER_WORDS: Record<number, string> = {
  1: 'un',
  2: 'deux',
  3: 'trois',
  4: 'quatre',
  5: 'cinq',
  6: 'six',
  7: 'sept',
  8: 'huit',
  9: 'neuf',
};

function frenchNumberWord(n: number): string {
  return FRENCH_NUMBER_WORDS[n] ?? String(n);
}

export function buildAuditHeroPhrase({
  greetingPrefix,
  totalEvents,
}: AuditHeroPhraseInput): AuditHeroPhrase {
  const total = Math.max(0, totalEvents);
  const prefix = greetingPrefix.endsWith(' ') ? greetingPrefix : `${greetingPrefix} `;

  if (total === 0) {
    return {
      prefix,
      accent: 'aucun événement',
      suffix: ' enregistré pour le moment.',
    };
  }

  if (total === 1) {
    return {
      prefix,
      accent: 'un événement',
      suffix: ' au registre.',
    };
  }

  return {
    prefix,
    accent: `${frenchNumberWord(total)} événements`,
    suffix: ' au registre.',
  };
}

/**
 * Génère le subtitle 3 fragments du hero audit :
 *   "8 jours d'historique · 30 types d'actions · 5 acteurs"
 *
 * Pluralisations basiques. Si une stat = 0, le fragment est masqué pour
 * éviter "0 jours d'historique" et préserver la densité éditoriale.
 */
export function buildAuditSubtitle(stats: {
  daysCovered: number;
  distinctTypes: number;
  distinctActors: number;
}): string {
  const parts: string[] = [];
  if (stats.daysCovered > 0) {
    parts.push(
      `${stats.daysCovered} ${stats.daysCovered > 1 ? "jours d'historique" : "jour d'historique"}`,
    );
  }
  if (stats.distinctTypes > 0) {
    parts.push(
      `${stats.distinctTypes} ${stats.distinctTypes > 1 ? "types d'actions" : "type d'action"}`,
    );
  }
  if (stats.distinctActors > 0) {
    parts.push(`${stats.distinctActors} ${stats.distinctActors > 1 ? 'acteurs' : 'acteur'}`);
  }
  return parts.join(' · ');
}
