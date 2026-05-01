import Link from 'next/link';
import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Module Design System V1 — Breadcrumb éditorial.
 *
 * Format mockup : `Paragraphe / Dashboard` — séparateur `/` ink-300
 * en mono 13, items en sans 13 ink-500 (current page en ink-900).
 *
 * Pas d'icônes, pas de chevron — juste une trace minimaliste.
 *
 * @example
 *   <Breadcrumb items={[
 *     { label: 'Paragraphe' },
 *     { label: 'Plans', href: '/dashboard/plans' },
 *     { label: 'BSPCE-2026-001' },  // current (no href)
 *   ]} />
 */
export type BreadcrumbItem = {
  label: ReactNode;
  href?: string;
};

export function Breadcrumb({
  items,
  className,
}: {
  items: ReadonlyArray<BreadcrumbItem>;
  className?: string;
}) {
  return (
    <nav
      aria-label="Fil d'Ariane"
      className={cn('flex items-center gap-2 text-sm', className)}
      data-testid="breadcrumb"
    >
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <span key={idx} className="flex items-center gap-2">
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="text-ink-500 hover:text-brass-700 decoration-brass-300 transition-colors hover:underline-offset-4"
              >
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? 'text-ink-900' : 'text-ink-500'}>{item.label}</span>
            )}
            {!isLast ? (
              <span className="text-ink-300 font-mono text-xs" aria-hidden="true">
                /
              </span>
            ) : null}
          </span>
        );
      })}
    </nav>
  );
}
