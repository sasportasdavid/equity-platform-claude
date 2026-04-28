import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * PageShell — wrapper standardisé pour les pages dashboard.
 *
 * Header avec titre + description + actions à droite (boutons primaires
 * comme « Nouveau plan »). Body en dessous avec padding cohérent.
 *
 * Pattern utilisé par /dashboard/plans, /dashboard/plans/[id],
 * /dashboard/beneficiaries (futur), etc.
 */
export function PageShell({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('container mx-auto max-w-7xl space-y-6 px-4 py-6 lg:px-8', className)}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  );
}
