/**
 * Module 14 PR #43 — Constantes légales V1.
 *
 * **TOS_VERSION** : version courante des Conditions d'Utilisation. Stockée
 * dans `user_profiles.tos_version_accepted` au signup. En V1.X, si le user
 * a accepté une version antérieure à `TOS_VERSION`, le proxy peut le
 * rediriger vers `/legal/accept-update` (pas implémenté V1).
 *
 * Format : `vX.Y-YYYY-MM-DD` (lisible, comparable lex).
 */
export const TOS_VERSION = 'v1.0-2026-05-05';

/**
 * Niveau de consentement cookies. V1 = `essential` ou `all` uniquement
 * (pas de granularité analytics/marketing tant qu'on n'a pas de tracker
 * tiers).
 */
export const COOKIE_CONSENT_LEVELS = ['essential', 'all'] as const;
export type CookieConsentLevel = (typeof COOKIE_CONSENT_LEVELS)[number];
