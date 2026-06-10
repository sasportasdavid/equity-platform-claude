'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@/components/ui/button';

export default function DashboardError({
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
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="space-y-2">
        <h2 className="text-foreground text-xl font-semibold">Une erreur est survenue</h2>
        <p className="text-muted-foreground max-w-md text-sm">
          Cette section n&apos;a pas pu se charger. L&apos;incident a été enregistré. Vous pouvez
          réessayer ou revenir au tableau de bord.
        </p>
        {error.digest ? (
          <p className="text-muted-foreground/70 font-mono text-xs">Réf. {error.digest}</p>
        ) : null}
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => reset()}>
          Réessayer
        </Button>
        <Button onClick={() => (window.location.href = '/dashboard')}>
          Retour au tableau de bord
        </Button>
      </div>
    </div>
  );
}
