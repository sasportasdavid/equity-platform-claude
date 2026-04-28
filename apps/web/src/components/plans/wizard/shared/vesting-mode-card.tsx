'use client';

import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Carte cliquable pour le sélecteur de mode de vesting (Step 3).
 *
 * Variante de PlanTypeCard plus large (description plus longue) +
 * détails secondaires (3-4 caractéristiques en bullets).
 */
export function VestingModeCard({
  title,
  subtitle,
  icon,
  bullets,
  selected,
  onSelect,
  testId,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  bullets: readonly string[];
  selected: boolean;
  onSelect: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect()}
      data-testid={testId}
      data-selected={selected || undefined}
      className={cn(
        'border-border bg-card text-card-foreground hover:border-primary/40 relative flex h-full flex-col gap-3 rounded-lg border p-4 text-left transition-all hover:shadow-sm',
        selected && 'ring-primary border-primary ring-offset-background ring-2 ring-offset-2',
      )}
      aria-pressed={selected}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-md">
          {icon}
        </div>
        {selected ? (
          <div className="bg-primary text-primary-foreground inline-flex size-5 items-center justify-center rounded-full">
            <Check className="size-3" />
          </div>
        ) : null}
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <p className="text-muted-foreground text-xs leading-snug">{subtitle}</p>
      </div>
      <ul className="text-muted-foreground space-y-0.5 text-xs">
        {bullets.map((b) => (
          <li key={b} className="flex items-start gap-1.5">
            <span className="text-primary/60 mt-1.5 inline-block size-1 shrink-0 rounded-full bg-current" />
            {b}
          </li>
        ))}
      </ul>
    </button>
  );
}
