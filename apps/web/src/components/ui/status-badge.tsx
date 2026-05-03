import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LockIcon } from '@/components/shared/icons/lock-icon';

/**
 * Module Design System V1 — StatusBadge éditorial signature.
 *
 * 5 couleurs sémantiques × 4 patterns visuels :
 *
 * | Tone     | Usage métier                    |
 * |----------|---------------------------------|
 * | bond     | succès, signé, approved, granted|
 * | brass    | accent, premium, hero           |
 * | slate    | neutre informatif, in progress  |
 * | saffron  | warning, pending, en attente    |
 * | title    | danger, rejected, alert         |
 *
 * | Pattern  | Usage                                        |
 * |----------|----------------------------------------------|
 * | solid    | défaut — fond plein                          |
 * | dotted   | bordure pointillée animée (marching ants)    |
 * | pulse    | point gauche qui pulse (data temps réel)     |
 * | lock     | icône cadenas custom (verrouillé)            |
 *
 * Hauteur fixe 20px, padding 8px, radius 3px, mono uppercase 11px
 * tracking-widest pour cohérence sur toute l'app.
 *
 * @example
 *   <StatusBadge tone="bond">Signé</StatusBadge>
 *   <StatusBadge tone="saffron" pattern="dotted">En attente HR</StatusBadge>
 *   <StatusBadge tone="bond" pattern="pulse">LIVE</StatusBadge>
 *   <StatusBadge tone="slate" pattern="lock">Verrouillé</StatusBadge>
 */
export type StatusBadgeTone = 'bond' | 'brass' | 'slate' | 'saffron' | 'title';
export type StatusBadgePattern = 'solid' | 'dotted' | 'pulse' | 'lock';

const toneClasses: Record<StatusBadgeTone, string> = {
  bond: 'bg-bond-100 text-bond-700 border-bond-300',
  brass: 'bg-brass-100 text-brass-700 border-brass-300',
  slate: 'bg-slate-100 text-slate-700 border-slate-300',
  saffron: 'bg-saffron-100 text-saffron-700 border-saffron-300',
  title: 'bg-title-100 text-title-700 border-title-300',
};

const dotToneClasses: Record<StatusBadgeTone, string> = {
  bond: 'bg-bond-500',
  brass: 'bg-brass-500',
  slate: 'bg-slate-500',
  saffron: 'bg-saffron-500',
  title: 'bg-title-500',
};

const dottedBgImage: Record<StatusBadgeTone, string> = {
  bond: 'linear-gradient(90deg, var(--bond-500) 50%, transparent 50%)',
  brass: 'linear-gradient(90deg, var(--brass-500) 50%, transparent 50%)',
  slate: 'linear-gradient(90deg, var(--slate-500) 50%, transparent 50%)',
  saffron: 'linear-gradient(90deg, var(--saffron-500) 50%, transparent 50%)',
  title: 'linear-gradient(90deg, var(--title-500) 50%, transparent 50%)',
};

export function StatusBadge({
  tone,
  pattern = 'solid',
  children,
  icon,
  className,
  'data-testid': dataTestId,
}: {
  tone: StatusBadgeTone;
  pattern?: StatusBadgePattern;
  children: ReactNode;
  /** Icône optionnelle à gauche (Lucide stroke 1.5 attendu) */
  icon?: ReactNode;
  className?: string;
  'data-testid'?: string;
}) {
  const base =
    'inline-flex h-5 items-center gap-1.5 rounded-[3px] border px-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] tabular-nums whitespace-nowrap';

  if (pattern === 'dotted') {
    // Marching ants : bordure pointillée animée via background-image
    // 4 directions (top, bottom, left, right) qui défilent.
    const dotted = dottedBgImage[tone];
    return (
      <span
        className={cn(
          base,
          'border-transparent bg-transparent',
          toneClasses[tone].replace(/bg-\S+/g, ''),
          'animate-marching-ants',
          className,
        )}
        style={{
          backgroundImage: `${dotted}, ${dotted}, ${dotted.replace('90deg', '0deg')}, ${dotted.replace('90deg', '0deg')}`,
          backgroundPosition: '0 0, 0 100%, 0 0, 100% 0',
          backgroundRepeat: 'repeat-x, repeat-x, repeat-y, repeat-y',
          backgroundSize: '8px 1px, 8px 1px, 1px 8px, 1px 8px',
        }}
        data-testid={dataTestId}
      >
        {icon}
        {children}
      </span>
    );
  }

  if (pattern === 'pulse') {
    return (
      <span className={cn(base, toneClasses[tone], className)} data-testid={dataTestId}>
        <span
          className={cn('animate-pulse-live size-1.5 rounded-full', dotToneClasses[tone])}
          aria-hidden="true"
        />
        {children}
      </span>
    );
  }

  if (pattern === 'lock') {
    return (
      <span className={cn(base, toneClasses[tone], className)} data-testid={dataTestId}>
        <LockIcon size={12} strokeWidth={1.5} />
        {children}
      </span>
    );
  }

  // solid (défaut)
  return (
    <span className={cn(base, toneClasses[tone], className)} data-testid={dataTestId}>
      {icon}
      {children}
    </span>
  );
}
