/**
 * Salutation adaptative pour le hero du Dashboard CFO — Étape 12
 * Design System V1 (spec section 5.7).
 *
 * Retourne un greeting court qui s'adapte à :
 *   - L'heure de la journée (matin / après-midi / soir / nuit)
 *   - Le jour de la semaine (lundi début, vendredi fin, week-end)
 *   - Le prénom de l'utilisateur (extrait du `fullName` si disponible)
 *
 * Pattern de sortie : `"Bonjour Marie,"` (ou `"Bonjour,"` si pas de nom).
 * La virgule terminale permet d'enchaîner avec une phrase éditoriale
 * (ex: "Bonjour Marie, voici votre vue Q2 2026").
 *
 * Helper PUR — pas d'I/O, pas de Date.now() au module-level. La date
 * est injectée via `now` (default `new Date()`) pour faciliter les tests
 * Vitest.
 */

export type AdaptiveGreetingInput = {
  /** Nom complet ou prénom seul. Optionnel. */
  name?: string | null;
  /** Date de référence — défaut `new Date()`. Override pour tests. */
  now?: Date;
};

/**
 * @returns une salutation FR du type `"Bonjour Marie,"` ou `"Bonsoir,"`.
 *
 * Règles (Europe/Paris) :
 * - 22h–5h          → "Bonne nuit"
 * - 18h–22h         → "Bonsoir"
 * - lundi avant 12h → "Bon début de semaine"
 * - vendredi ≥ 14h  → "Bon vendredi"
 * - samedi/dimanche → "Bon week-end"
 * - sinon (5h–18h)  → "Bonjour"
 */
export function getAdaptiveDashboardGreeting({
  name,
  now = new Date(),
}: AdaptiveGreetingInput = {}): string {
  const hour = now.getHours();
  const day = now.getDay(); // 0 = dimanche, 1 = lundi, ..., 6 = samedi
  const firstName = extractFirstName(name);
  const suffix = firstName ? ` ${firstName}` : '';

  // Nuit (22h–5h) — domine sur tout le reste
  if (hour >= 22 || hour < 5) return `Bonne nuit${suffix},`;

  // Soir (18h–22h)
  if (hour >= 18) return `Bonsoir${suffix},`;

  // Week-end (samedi & dimanche, journée)
  if (day === 0 || day === 6) return `Bon week-end${suffix},`;

  // Lundi matin (jusqu'à 12h)
  if (day === 1 && hour < 12) return `Bon début de semaine${suffix},`;

  // Vendredi après-midi (à partir de 14h)
  if (day === 5 && hour >= 14) return `Bon vendredi${suffix},`;

  // Cas standard : Bonjour
  return `Bonjour${suffix},`;
}

/**
 * Extrait le prénom depuis un fullName "Marie Lambert" → "Marie".
 * Retourne null si l'input est vide / null / blank.
 */
function extractFirstName(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}
