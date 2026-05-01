import { cn } from '@/lib/utils';

/**
 * Module Design System V1 — Line cuivre 64px sous chaque titre de page.
 *
 * Détail signature Editorial Finance V1. Animation `draw-line` 400ms
 * ease-enter au mount (`width: 0 → 64px`). Respecte
 * `prefers-reduced-motion` via les keyframes globales.
 *
 * Usage : sous chaque `<PageShell.Title>` ou tout titre h1/h2 de page
 * principale. Optionnellement utilisable comme séparateur de section
 * éditoriale avec une largeur custom.
 *
 * @example
 *   <h1>Bonjour Julien...</h1>
 *   <TitleRule />
 *
 *   <h2>Section</h2>
 *   <TitleRule width="48px" />
 */
export function TitleRule({
  width = '64px',
  className,
}: {
  /** Largeur cible (défaut 64px). Animation draw-line 0 → width. */
  width?: string;
  className?: string;
}) {
  return (
    <div
      className={cn('bg-brass-500 animate-draw-line mt-3 h-[2px]', className)}
      style={{ width }}
      aria-hidden="true"
      data-testid="title-rule"
    />
  );
}
