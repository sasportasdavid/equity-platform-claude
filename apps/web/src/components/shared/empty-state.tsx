'use client';

import Link from 'next/link';
import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

/**
 * Module Design System V1 — EmptyState éditorial.
 *
 * Anatomie obligatoire (cf. spec 5.6) :
 *   1. Illustration SVG inline custom 60-80px (palette brass + ink)
 *   2. Titre serif text-h3 ink-900 — 5-9 mots, ton éditorial
 *   3. Phrase d'accompagnement text-body ink-500 — 12-25 mots
 *   4. CTA primaire (Button variant="default" cuivre)
 *   5. Lien secondaire text-caption brass-700 underline-offset-4 vers la doc
 *
 * 4 variantes :
 *   - `list` (défaut) : aucun élément à afficher, propose la création
 *   - `filtered` : aucun résultat sur le filtre actuel, bouton « reset »
 *   - `error` : erreur (auth, network, etc.), bouton « réessayer »
 *   - `permission` : pas le droit, lien vers la doc / contact
 */

export type EmptyStateVariant = 'list' | 'filtered' | 'error' | 'permission';

export type EmptyStateProps = {
  /** Variante visuelle (impacte le ton + les CTA défaut) */
  variant?: EmptyStateVariant;
  /** Illustration SVG — un des composants `apps/web/src/components/shared/illustrations/` */
  illustration: ReactNode;
  /** Titre serif. 5-9 mots, ton éditorial. Ex: « Aucune attribution active pour le moment. » */
  title: string;
  /** Phrase d'accompagnement. 12-25 mots, conseil concret. */
  description?: string;
  /** Action primaire (bouton cuivre). Soit href Link, soit onClick callback. */
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  /** Lien secondaire éditorial (vers doc, contact, etc.) */
  secondaryLink?: {
    label: string;
    href: string;
  };
  className?: string;
};

export function EmptyState({
  variant = 'list',
  illustration,
  title,
  description,
  action,
  secondaryLink,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'border-border/40 bg-card flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center',
        className,
      )}
      data-testid="empty-state"
      data-variant={variant}
    >
      <div className="text-brass-500 mb-2" aria-hidden="true">
        {illustration}
      </div>

      <h3 className="text-h3 text-ink-900 max-w-md">{title}</h3>

      {description ? (
        <p className="text-ink-500 max-w-md text-sm leading-relaxed">{description}</p>
      ) : null}

      {(action || secondaryLink) && (
        <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row">
          {action ? (
            action.href ? (
              <Link
                href={action.href}
                className={cn(buttonVariants({ variant: 'default', size: 'default' }))}
              >
                {action.label}
              </Link>
            ) : (
              <button
                type="button"
                onClick={action.onClick}
                className={cn(buttonVariants({ variant: 'default', size: 'default' }))}
              >
                {action.label}
              </button>
            )
          ) : null}
          {secondaryLink ? (
            <Link
              href={secondaryLink.href}
              className="text-caption text-brass-700 hover:text-brass-900 decoration-brass-300 hover:decoration-brass-500 underline underline-offset-4 transition-colors"
            >
              {secondaryLink.label}
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}
