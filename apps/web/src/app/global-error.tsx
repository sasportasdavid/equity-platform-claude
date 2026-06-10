'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

/**
 * global-error.tsx remplace le root layout quand une erreur survient au niveau
 * racine (rendu du layout lui-même). Il doit donc fournir ses propres balises
 * <html>/<body>. Capture l'erreur dans Sentry (les erreurs de rendu racine
 * n'étaient pas remontées avant — audit P0-5).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          padding: '1.5rem',
        }}
      >
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Une erreur inattendue est survenue</h2>
        <p style={{ maxWidth: '28rem', color: '#64748b', fontSize: '0.875rem' }}>
          L&apos;application a rencontré un problème. L&apos;incident a été enregistré. Veuillez
          réessayer.
        </p>
        {error.digest ? (
          <p style={{ color: '#94a3b8', fontSize: '0.75rem', fontFamily: 'monospace' }}>
            Réf. {error.digest}
          </p>
        ) : null}
        <button
          onClick={() => reset()}
          style={{
            cursor: 'pointer',
            borderRadius: '0.5rem',
            border: '1px solid #cbd5e1',
            background: '#1e1b4b',
            color: 'white',
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
          }}
        >
          Réessayer
        </button>
      </body>
    </html>
  );
}
