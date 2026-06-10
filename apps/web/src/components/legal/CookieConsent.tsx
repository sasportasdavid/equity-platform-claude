'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { Cookie, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { readCookieConsent, writeCookieConsent } from '@/lib/legal/cookie-consent';
import { recordCookieConsent } from '@/server/actions/consent';

/**
 * Module 14 PR §B4 — Cookie consent banner (V1 light).
 *
 * UX :
 *   - Affiché en bas de viewport au 1er visite si cookie absent.
 *   - 1 message court : "Capiwise utilise uniquement des cookies
 *     essentiels (session, sécurité). Pas de tracking analytique ni
 *     marketing."
 *   - 1 bouton "OK, j'ai compris" → set cookie + ferme banner +
 *     appelle Server Action si user logged (mirror dans
 *     `user_profiles.cookie_preferences`).
 *   - 1 lien "En savoir plus" → /legal/privacy
 *
 * **Ne bloque JAMAIS** les cookies essentiels Supabase Auth
 * (`sb-access-token`, `sb-refresh-token`) — ce composant pose juste son
 * propre cookie `cookie_consent_v1` ; il n'altère pas le cookie store
 * applicatif (cf. brief §B4 condition critique).
 *
 * V1.X : ajout d'un toggle granulaire si on intègre un tracker analytics
 * (Vercel Analytics, Posthog, etc).
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [pending, startTransition] = useTransition();

  // Read cookie au mount — useEffect car document n'est dispo que côté client.
  // setState one-shot au mount (pas de boucle de rendu) : on affiche le bandeau
  // uniquement si aucun consentement n'a déjà été enregistré.
  useEffect(() => {
    const existing = readCookieConsent();
    if (!existing?.acknowledged) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot client-only (lecture cookie au mount)
      setVisible(true);
    }
  }, []);

  function onAccept() {
    if (pending) return;
    writeCookieConsent('essential');
    setVisible(false);
    // Mirror DB côté Server Action (ok si anon, ok si authed)
    startTransition(async () => {
      await recordCookieConsent({ level: 'essential' }).catch(() => undefined);
    });
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-3 bottom-3 z-50 sm:bottom-4 sm:left-auto sm:right-4 sm:max-w-md"
      role="region"
      aria-label="Consentement cookies"
      data-testid="cookie-consent-banner"
    >
      <div className="border-border bg-background relative rounded-lg border p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <Cookie className="text-brass-500 mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="flex-1 space-y-2 pr-6">
            <p className="text-foreground text-xs leading-relaxed">
              Capiwise utilise uniquement des cookies <strong>essentiels</strong> au fonctionnement
              du service (session, sécurité). Aucun tracking analytique ni marketing en V1.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={onAccept}
                disabled={pending}
                data-testid="cookie-consent-accept"
              >
                {pending ? 'Enregistrement…' : 'OK, j’ai compris'}
              </Button>
              <Link
                href="/legal/privacy"
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
                target="_blank"
              >
                En savoir plus
              </Link>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setVisible(false)}
            aria-label="Fermer"
            className="text-muted-foreground hover:text-foreground absolute right-2 top-2 rounded-sm p-1"
            data-testid="cookie-consent-dismiss"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
