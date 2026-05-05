/**
 * PR #36 B1 — Hero phrase éditoriale du Dashboard CFO.
 *
 * Compose une phrase 3 fragments (préfixe + italic accent + suffixe) à partir
 * du contexte org : nb d'alertes conformité critiques + nb d'approbations
 * en attente. Le fragment italic est mis en valeur en serif italic brass-500
 * (cf `<PageShell.TitleAccent>` + utility CSS `text-h1-accent`).
 *
 * Helper PUR — pas d'I/O, pas de Date.now(). Tests Vitest avec injection.
 *
 * Exemples de sorties (par contexte) :
 * - 0 alerte + 0 approbation : `Bonjour Julien,` *tout est en ordre* `.`
 * - 1 alerte + 0 approbation : `Bonjour Julien,` *un point* ` mérite votre attention.`
 * - 1 alerte + 1 approbation : `Bonjour Julien,` *deux points* ` méritent votre attention.`
 * - 3 alertes + 2 approbations : `Bonjour Julien,` *5 points* ` méritent votre attention.`
 *
 * Le préfixe `Bonjour {firstName},` est composable avec le helper
 * `getAdaptiveDashboardGreeting()` existant (qui injecte le saisonnier
 * "Bonsoir/Bonne nuit/Bon week-end" selon l'heure).
 */

export type HeroGreetingInput = {
  /** Préfixe complet ("Bonjour Julien,"). Vient typiquement de
   *  `getAdaptiveDashboardGreeting({ name: user.fullName })`. */
  greetingPrefix: string;
  /** Nb d'alertes conformité critiques (`getOrgComplianceAlertsSummary().critical`). */
  criticalAlertsCount: number;
  /** Nb d'approbations en attente (`getOrgAwardsAwaitingApproval().count`). */
  pendingApprovalsCount: number;
};

export type HeroGreetingPhrase = {
  /** Texte avant l'italic (avec espace de jointure si non terminé par espace). */
  prefix: string;
  /** Texte mis en italic brass-500 (le mot/expression à attirer l'œil). */
  accent: string;
  /** Texte après l'italic (avec espace de jointure initial si nécessaire). */
  suffix: string;
};

/**
 * Convertit un nombre en mot français pour les valeurs courantes (1-9). Au-delà,
 * retourne le nombre formaté en chiffres (`'12'`, `'42'`). Une approche
 * éditoriale plus chaleureuse pour les petits cas, factuelle pour les grands.
 */
function frenchNumberWord(n: number): string {
  const words: Record<number, string> = {
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
  return words[n] ?? String(n);
}

export function buildHeroGreetingPhrase({
  greetingPrefix,
  criticalAlertsCount,
  pendingApprovalsCount,
}: HeroGreetingInput): HeroGreetingPhrase {
  const total = Math.max(0, criticalAlertsCount) + Math.max(0, pendingApprovalsCount);

  // Normalisation préfixe : termine par virgule + espace (ou juste virgule).
  // Le préfixe injecté par `getAdaptiveDashboardGreeting` finit par `,` sans
  // espace — on s'assure qu'il y aura un espace avant l'italic.
  const prefix = greetingPrefix.endsWith(' ') ? greetingPrefix : `${greetingPrefix} `;

  if (total === 0) {
    return {
      prefix,
      accent: 'tout est en ordre',
      suffix: '.',
    };
  }

  if (total === 1) {
    return {
      prefix,
      accent: 'un point',
      suffix: ' mérite votre attention.',
    };
  }

  // Pluriel — 2 → "deux points", 3-9 → "trois points", "quatre points"…, 10+ → "12 points"
  return {
    prefix,
    accent: `${frenchNumberWord(total)} points`,
    suffix: ' méritent votre attention.',
  };
}
