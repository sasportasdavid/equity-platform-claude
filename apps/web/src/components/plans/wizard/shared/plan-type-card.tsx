'use client';

import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Carte cliquable pour Step 1 du wizard. Variante "selected" met l'accent
 * sur le bord + le badge ✓. Accessible via clavier (role=button + onKeyDown).
 */
export function PlanTypeCard({
  title,
  description,
  icon,
  badge,
  selected,
  onSelect,
  testId,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  badge?: string;
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
        'border-border bg-card text-card-foreground hover:border-primary/40 relative flex h-full flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all hover:shadow-sm',
        selected && 'ring-primary border-primary ring-offset-background ring-2 ring-offset-2',
      )}
      aria-pressed={selected}
    >
      <div className="flex w-full items-start justify-between">
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
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold leading-none tracking-tight">{title}</h3>
          {badge ? (
            <span className="bg-muted text-muted-foreground rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase">
              {badge}
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs leading-snug">{description}</p>
      </div>
    </button>
  );
}
