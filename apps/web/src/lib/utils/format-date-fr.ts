/**
 * PR #36 B2 — Helpers de formatage de date à la française avec ordinal.
 *
 * Pure (pas d'I/O). Tests Vitest avec injection de date.
 *
 * Exemples :
 * - formatDateOrdinalFr(new Date('2026-06-01')) → "1ᵉʳ juin"
 * - formatDateOrdinalFr(new Date('2026-06-15')) → "15 juin"
 * - formatDateOrdinalFr(new Date('2026-12-03')) → "3 décembre"
 *
 * Note typographique : "1ᵉʳ" utilise les modifier letters Unicode
 * U+1D49 (ᵉ) + U+02B3 (ʳ) pour l'exposant éditorial "premier".
 * Cf. typographie française standard pour le 1er du mois.
 */

const MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

/** Retourne la date au format français court avec ordinal pour le 1er.
 *  Utilise `getDate()` / `getMonth()` (timezone locale du runtime). */
export function formatDateOrdinalFr(date: Date): string {
  const day = date.getDate();
  const month = MONTHS_FR[date.getMonth()] ?? '';
  if (day === 1) return `1ᵉʳ ${month}`;
  return `${day} ${month}`;
}
