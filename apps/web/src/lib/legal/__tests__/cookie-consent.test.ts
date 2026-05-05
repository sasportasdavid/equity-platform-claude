import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COOKIE_CONSENT_NAME, readCookieConsent, writeCookieConsent } from '../cookie-consent';

/**
 * Module 14 PR §B4 — tests cookie-consent helpers (SSR-safe + browser).
 *
 * Le test env est `node` (pas `jsdom`) — on installe un faux `document`
 * stockant le cookie en mémoire pour simuler le browser API.
 */

type FakeDocument = { cookie: string };
const ORIG_DOCUMENT = (globalThis as unknown as { document?: FakeDocument }).document;

function setFakeDocument() {
  const fake: FakeDocument = { cookie: '' };
  Object.defineProperty(globalThis, 'document', {
    value: fake,
    writable: true,
    configurable: true,
  });
  return fake;
}

function clearDocument() {
  if (ORIG_DOCUMENT === undefined) {
    delete (globalThis as { document?: unknown }).document;
  } else {
    Object.defineProperty(globalThis, 'document', {
      value: ORIG_DOCUMENT,
      writable: true,
      configurable: true,
    });
  }
}

describe('cookie-consent helpers (Module 14 B4)', () => {
  beforeEach(() => {
    setFakeDocument();
  });
  afterEach(() => {
    clearDocument();
  });

  it('readCookieConsent returns null when no cookie is set', () => {
    expect(readCookieConsent()).toBeNull();
  });

  it('writeCookieConsent + readCookieConsent round-trip', () => {
    const written = writeCookieConsent('essential');
    expect(written.acknowledged).toBe(true);
    expect(written.level).toBe('essential');
    expect(typeof written.accepted_at).toBe('string');

    const read = readCookieConsent();
    expect(read).not.toBeNull();
    expect(read?.acknowledged).toBe(true);
    expect(read?.level).toBe('essential');
    expect(read?.accepted_at).toBe(written.accepted_at);
  });

  it('writeCookieConsent supports level "all"', () => {
    const w = writeCookieConsent('all');
    expect(w.level).toBe('all');
    expect(readCookieConsent()?.level).toBe('all');
  });

  it('readCookieConsent returns null when JSON is corrupted', () => {
    (globalThis as unknown as { document: FakeDocument }).document.cookie =
      `${COOKIE_CONSENT_NAME}=not-a-json`;
    expect(readCookieConsent()).toBeNull();
  });

  it('readCookieConsent returns null when level is unknown', () => {
    const corrupted = encodeURIComponent(
      JSON.stringify({ acknowledged: true, accepted_at: '2026-05-05T00:00:00Z', level: 'evil' }),
    );
    (globalThis as unknown as { document: FakeDocument }).document.cookie =
      `${COOKIE_CONSENT_NAME}=${corrupted}`;
    expect(readCookieConsent()).toBeNull();
  });

  it('readCookieConsent returns null when acknowledged is missing', () => {
    const partial = encodeURIComponent(
      JSON.stringify({ accepted_at: '2026-05-05T00:00:00Z', level: 'essential' }),
    );
    (globalThis as unknown as { document: FakeDocument }).document.cookie =
      `${COOKIE_CONSENT_NAME}=${partial}`;
    expect(readCookieConsent()).toBeNull();
  });

  it('writeCookieConsent value is correct even on SSR (no document)', () => {
    clearDocument();
    const v = writeCookieConsent('essential');
    expect(v.acknowledged).toBe(true);
    expect(v.level).toBe('essential');
    expect(typeof v.accepted_at).toBe('string');
  });

  it('readCookieConsent returns null on SSR (no document)', () => {
    clearDocument();
    expect(readCookieConsent()).toBeNull();
  });
});
