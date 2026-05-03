'use client';

import Link from 'next/link';
import { type ColumnDef } from '@tanstack/react-table';
import { ArrowRight } from 'lucide-react';
import { DataTable } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/empty-state';
import { BookIllustration } from '@/components/shared/illustrations';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';
import type { PlanListRow } from '@/server/queries/plans';
import { cn } from '@/lib/utils';

/**
 * Bloc bas gauche du Dashboard CFO (~66% width) — Étape 12.
 *
 * DataTable éditoriale (Étape 8) consommant `listPlans({ status: ['ACTIVE'] })`.
 * Réutilise les conventions du DS V1 :
 * - Header overline ink-700 sur paper-200
 * - Lignes zebra paper-200/30
 * - StatusBadge tones par plan_type
 * - Mono pour ID + chiffres tabular
 */

const PLAN_TYPE_LABEL: Record<string, string> = {
  BSPCE: 'BSPCE',
  AGA: 'AGA',
  STOCK_OPTION: 'Stock Option',
  PHANTOM: 'Phantom',
  BSA: 'BSA',
  RSU: 'RSU',
};

const PLAN_TYPE_TONE: Record<string, StatusBadgeTone> = {
  BSPCE: 'brass',
  AGA: 'bond',
  STOCK_OPTION: 'saffron',
  PHANTOM: 'slate',
  BSA: 'brass',
  RSU: 'slate',
};

const STATUS_LABEL: Record<string, { label: string; tone: StatusBadgeTone }> = {
  DRAFT: { label: 'Brouillon', tone: 'slate' },
  ACTIVE: { label: 'Actif', tone: 'bond' },
  CLOSED: { label: 'Clôturé', tone: 'slate' },
};

function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('fr-FR').format(n);
}

function formatPct(allocated: number, total: number): string {
  if (total <= 0) return '—';
  const pct = (allocated / total) * 100;
  return `${pct.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} %`;
}

export type ActivePlansTableProps = {
  plans: ReadonlyArray<PlanListRow>;
  className?: string;
};

export function ActivePlansTable({ plans, className }: ActivePlansTableProps) {
  const columns: ColumnDef<PlanListRow>[] = [
    {
      accessorKey: 'name',
      header: 'Plan',
      cell: ({ row }) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-ink-900 text-sm font-medium">{row.original.name}</span>
          {row.original.company?.name ? (
            <span className="text-ink-500 font-mono text-[11px]">{row.original.company.name}</span>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: 'plan_type',
      header: 'Type',
      cell: ({ row }) => {
        const t = row.original.plan_type;
        return (
          <StatusBadge tone={PLAN_TYPE_TONE[t] ?? 'slate'} pattern="solid">
            {PLAN_TYPE_LABEL[t] ?? t}
          </StatusBadge>
        );
      },
    },
    {
      accessorKey: 'pool_allocated',
      header: () => <span className="text-right">Pool alloué</span>,
      cell: ({ row }) => (
        <div className="text-right">
          <div className="text-ink-900 font-mono text-sm tabular-nums">
            {formatNumber(row.original.pool_allocated)}{' '}
            <span className="text-ink-400 text-xs">/ {formatNumber(row.original.pool_size)}</span>
          </div>
          <div className="text-ink-500 font-mono text-[11px] tabular-nums">
            {formatPct(row.original.pool_allocated, row.original.pool_size)}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'pool_vested',
      header: () => <span className="text-right">Acquis</span>,
      cell: ({ row }) => (
        <div className="text-bond-700 text-right font-mono text-sm tabular-nums">
          {formatNumber(row.original.pool_vested)}
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Statut',
      cell: ({ row }) => {
        const cfg = STATUS_LABEL[row.original.status] ?? {
          label: row.original.status,
          tone: 'slate' as StatusBadgeTone,
        };
        return (
          <StatusBadge tone={cfg.tone} pattern="solid">
            {cfg.label}
          </StatusBadge>
        );
      },
    },
    {
      id: 'cta',
      header: '',
      cell: ({ row }) => (
        <Link
          href={`/dashboard/plans/${row.original.id}`}
          className="text-brass-700 hover:text-brass-900 inline-flex items-center text-xs"
        >
          <ArrowRight className="size-4" strokeWidth={1.5} />
        </Link>
      ),
    },
  ];

  if (plans.length === 0) {
    return (
      <div
        className={cn(
          'bg-card border-border/50 flex flex-col gap-4 rounded-lg border p-6',
          className,
        )}
      >
        <header>
          <p className="text-overline text-brass-500">PLANS · ACTIFS</p>
          <h2 className="text-h3 text-ink-900 mt-1">Aucun plan actif pour le moment</h2>
        </header>
        <EmptyState
          variant="list"
          illustration={<BookIllustration size={64} />}
          title="Lancez votre premier plan d'actionnariat"
          description="BSPCE, AGA ou Stock Options — créez un plan, attribuez aux bénéficiaires et lancez le suivi automatique."
          action={{ label: 'Créer un plan →', href: '/dashboard/plans/new' }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'bg-card border-border/50 flex flex-col gap-4 rounded-lg border p-6',
        className,
      )}
    >
      <header className="flex items-baseline justify-between">
        <div>
          <p className="text-overline text-brass-500">PLANS · ACTIFS</p>
          <h2 className="text-h3 text-ink-900 mt-1">
            {plans.length} {plans.length > 1 ? 'plans' : 'plan'} en cours
          </h2>
        </div>
        <Link
          href="/dashboard/plans"
          className="text-brass-700 hover:text-brass-900 inline-flex items-center gap-1 text-xs font-medium"
        >
          Voir tous les plans
          <ArrowRight className="size-3" strokeWidth={1.5} />
        </Link>
      </header>

      <DataTable columns={columns} data={plans as PlanListRow[]} />
    </div>
  );
}
