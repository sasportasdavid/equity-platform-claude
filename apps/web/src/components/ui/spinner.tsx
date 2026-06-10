import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type SpinnerProps = {
  className?: string;
  /** Texte lu par les lecteurs d'écran (défaut : « Chargement… »). */
  label?: string;
};

/**
 * Spinner accessible réutilisable. Le label est annoncé via aria-live
 * et masqué visuellement.
 */
export function Spinner({ className, label = 'Chargement…' }: SpinnerProps) {
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center">
      <Loader2
        className={cn('text-muted-foreground h-5 w-5 animate-spin', className)}
        aria-hidden
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * Conteneur plein écran centré pour les fichiers `loading.tsx` de l'App Router.
 */
export function FullPageSpinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3">
      <Spinner className="h-8 w-8" label={label} />
      <p className="text-muted-foreground text-sm">{label}</p>
    </div>
  );
}
