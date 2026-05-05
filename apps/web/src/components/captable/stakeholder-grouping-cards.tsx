'use client';

/**
 * Design System V2 B1b — `StakeholderGroupingCards.tsx`.
 *
 * Affiche 3-4 KPI cards groupant les positions par `stakeholder_type`
 * (FOUNDER / INVESTOR / BENEFICIARY / OTHER). Inspiré du mockup Cap Table
 * "Editorial Finance" : grouping FOUNDERS / INVESTORS / EMPLOYEES (ESOP).
 *
 * Mapping DB → label affiché :
 *   - 'FOUNDER'      → FOUNDERS
 *   - 'INVESTOR'     → INVESTORS
 *   - 'BENEFICIARY'  → EMPLOYEES (cohérent : un beneficiary = salarié actionnaire)
 *   - 'ENTITY'       → AUTRES (entités morales hors investisseurs)
 *   - 'POOL_RESERVE' → POOL ESOP (réserve non allouée)
 *
 * Les cards `ENTITY` et `POOL_RESERVE` sont rendues séparément si présentes,
 * sinon elles sont omises (jamais affichées vides).
 *
 * Aucun appel DB — pure agrégation côté client à partir des positions reçues
 * en props. Si `positions=[]`, rien n'est rendu (caller responsabilité).
 */

import { useMemo } from 'react';
import { Crown, Users, Wallet, Coins, Boxes } from 'lucide-react';
import type { CapTablePosition } from '@/server/queries/cap-table';
import { cn } from '@/lib/utils';

type StakeholderTypeKey = 'FOUNDER' | 'INVESTOR' | 'BENEFICIARY' | 'ENTITY' | 'POOL_RESERVE';

type GroupConfig = {
  label: string;
  Icon: typeof Crown;
  toneClasses: { card: string; overline: string; numericColor: string };
};

const GROUP_CONFIG: Record<StakeholderTypeKey, GroupConfig> = {
  FOUNDER: {
    label: 'FOUNDERS',
    Icon: Crown,
    toneClasses: {
      card: 'border-brass-300 bg-brass-50',
      overline: 'text-brass-700',
      numericColor: 'text-brass-900',
    },
  },
  INVESTOR: {
    label: 'INVESTORS',
    Icon: Wallet,
    toneClasses: {
      card: 'border-slate-300 bg-slate-50',
      overline: 'text-slate-700',
      numericColor: 'text-slate-900',
    },
  },
  BENEFICIARY: {
    label: 'EMPLOYEES',
    Icon: Users,
    toneClasses: {
      card: 'border-bond-300 bg-bond-50',
      overline: 'text-bond-700',
      numericColor: 'text-bond-900',
    },
  },
  ENTITY: {
    label: 'AUTRES',
    Icon: Boxes,
    toneClasses: {
      card: 'border-paper-300 bg-paper-200',
      overline: 'text-ink-500',
      numericColor: 'text-ink-900',
    },
  },
  POOL_RESERVE: {
    label: 'POOL ESOP',
    Icon: Coins,
    toneClasses: {
      card: 'border-saffron-300 bg-saffron-50',
      overline: 'text-saffron-700',
      numericColor: 'text-saffron-900',
    },
  },
};

const ORDER: StakeholderTypeKey[] = [
  'FOUNDER',
  'INVESTOR',
  'BENEFICIARY',
  'POOL_RESERVE',
  'ENTITY',
];

const numberFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const percentFormatter = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export type StakeholderGroupingCardsProps = {
  positions: CapTablePosition[];
  grandTotal: number;
  className?: string;
};

export function StakeholderGroupingCards({
  positions,
  grandTotal,
  className,
}: StakeholderGroupingCardsProps) {
  const groups = useMemo(() => {
    const acc = new Map<
      StakeholderTypeKey,
      { units: number; positions: number; stakeholders: Set<string> }
    >();
    for (const p of positions) {
      const key = (p.stakeholder_type as StakeholderTypeKey) || 'ENTITY';
      const cur = acc.get(key) ?? {
        units: 0,
        positions: 0,
        stakeholders: new Set<string>(),
      };
      cur.units += p.units;
      cur.positions += 1;
      cur.stakeholders.add(p.stakeholder_id ?? p.stakeholder_name);
      acc.set(key, cur);
    }
    return ORDER.filter((k) => acc.has(k)).map((k) => ({
      key: k,
      ...acc.get(k)!,
      stakeholdersCount: acc.get(k)!.stakeholders.size,
    }));
  }, [positions]);

  if (groups.length === 0) return null;

  return (
    <section
      className={cn(
        'grid gap-3 sm:grid-cols-2 lg:grid-cols-4',
        groups.length === 5 && 'lg:grid-cols-5',
        className,
      )}
      data-testid="stakeholder-grouping-cards"
      aria-label="Répartition par catégorie de stakeholders"
    >
      {groups.map(({ key, units, positions: posCount, stakeholdersCount }) => {
        const cfg = GROUP_CONFIG[key];
        const Icon = cfg.Icon;
        const pct = grandTotal > 0 ? (units / grandTotal) * 100 : 0;
        return (
          <article
            key={key}
            className={cn(
              'rounded-md border p-4 transition-shadow hover:shadow-sm',
              cfg.toneClasses.card,
            )}
            data-testid={`stakeholder-group-${key.toLowerCase()}`}
          >
            <header className="flex items-center justify-between">
              <p
                className={cn('text-overline flex items-center gap-1.5', cfg.toneClasses.overline)}
              >
                <Icon className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                {cfg.label}
              </p>
              <span className={cn('font-mono text-xs', cfg.toneClasses.overline)}>
                {percentFormatter.format(pct)} %
              </span>
            </header>
            <div className={cn('mt-2 font-mono text-xl', cfg.toneClasses.numericColor)}>
              {numberFormatter.format(units)}
              <span className="text-ink-500 ml-1 text-xs font-normal">u.</span>
            </div>
            <p className="text-ink-500 mt-1 text-xs">
              {stakeholdersCount} {stakeholdersCount > 1 ? 'stakeholders' : 'stakeholder'} ·{' '}
              {posCount} position{posCount > 1 ? 's' : ''}
            </p>
          </article>
        );
      })}
    </section>
  );
}
