import type { CookieConsentLevel } from './constants';

/**
 * Module 14 PR §B4 — utilities client-side pour le cookie consent banner.
 *
 * Le cookie `cookie_consent_v1` (1 an) est posé par le composant
 * `<CookieConsent />` quand l'utilisateur clique "OK / J'ai compris".
 *
 * Schéma JSON :
 *   { acknowledged: boolean, accepted_at: string ISO, level: 'essential' | 'all' }
 *
 * Le suffixe `_v1` permet d'invalider proprement le consentement si on
 * change le périmètre des cookies (ex : ajout de tracker analytics V1.5
 * → bump à `cookie_consent_v2` qui ré-affiche le banner). V1 n'a que
 * des cookies essentiels (sb-access-token, sb-refresh-token, theme,
 * cookie_consent_v1 elle-même).
 *
 * IMPORTANT : ce module est SAFE-SSR. Toutes les fonctions vérifient
 * `typeof window !== 'undefined'` avant de toucher au DOM/document.
 */

const COOKIE_NAME = 'cookie_consent_v1';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 an

export type CookieConsentValue = {
  acknowledged: boolean;
  accepted_at: string;
  level: CookieConsentLevel;
};

export function readCookieConsent(): CookieConsentValue | null {
  if (typeof document === 'undefined') return null;
  const raw = document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`))
    ?.split('=')[1];
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    const parsed = JSON.parse(decoded) as Partial<CookieConsentValue>;
    if (
      typeof parsed?.acknowledged === 'boolean' &&
      typeof parsed.accepted_at === 'string' &&
      (parsed.level === 'essential' || parsed.level === 'all')
    ) {
      return parsed as CookieConsentValue;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeCookieConsent(level: CookieConsentLevel): CookieConsentValue {
  const value: CookieConsentValue = {
    acknowledged: true,
    accepted_at: new Date().toISOString(),
    level,
  };
  if (typeof document === 'undefined') return value;
  const encoded = encodeURIComponent(JSON.stringify(value));
  // SameSite=Lax + path=/ : pas Secure (dev local en http) — V1.5 ajouter
  // Secure quand on déploie Vercel sur HTTPS.
  document.cookie = `${COOKIE_NAME}=${encoded};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax`;
  return value;
}

export const COOKIE_CONSENT_NAME = COOKIE_NAME;
