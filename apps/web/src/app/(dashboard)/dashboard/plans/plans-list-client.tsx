'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Lock, MoreHorizontal, Pencil, Search, X } from 'lucide-react';
import { PlanTypeBadge } from '@/components/plans/shared/PlanTypeBadge';
import { StatusBadge } from '@/components/plans/shared/StatusBadge';
import { DataTable } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PlanListRow } from '@/server/queries/plans';

const STATUS_OPTIONS = ['DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED'] as const;
const PLAN_TYPE_OPTIONS = [
  'BSPCE',
  'AGA',
  'STOCK_OPTION',
  'BSA',
  'PERFORMANCE_SHARE',
  'PHANTOM',
  'ESOP',
  'RSU',
  'SAR',
] as const;

/**
 * Client component pour la table des plans.
 *
 * Filtres locaux (search + status + planType) appliqués in-memory sur le
 * dataset complet pré-fetché. V1 OK jusqu'à ~500 plans (table.tsx render
 * reste sous 100ms à cette échelle). Si le user dépasse, on switche en
 * SSR + searchParams (cf. plans.tsx).
 *
 * Actions par ligne (DropdownMenu) : Voir / Modifier / Dupliquer (B3) /
 * Archiver (B3). Les 2 dernières sont des placeholders qui n'agissent pas
 * encore — on désactive le menu item avec disabled + tooltip.
 */
export function PlansListClient({
  plans,
  canCreate,
}: {
  plans: PlanListRow[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filteredPlans = useMemo(() => {
    return plans.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      if (typeFilter !== 'all' && p.plan_type !== typeFilter) return false;
      if (search.trim().length > 0) {
        const q = search.trim().toLowerCase();
        const inName = p.name.toLowerCase().includes(q);
        const inCompany = p.company?.name.toLowerCase().includes(q) ?? false;
        if (!inName && !inCompany) return false;
      }
      return true;
    });
  }, [plans, search, statusFilter, typeFilter]);

  const hasActiveFilters =
    search.trim().length > 0 || statusFilter !== 'all' || typeFilter !== 'all';

  function clearFilters() {
    setSearch('');
    setStatusFilter('all');
    setTypeFilter('all');
  }

  const columns = useMemo<ColumnDef<PlanListRow>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Nom',
        cell: ({ row }) => (
          <div className="space-y-0.5">
            <p className="font-medium">{row.original.name}</p>
            {row.original.company ? (
              <p className="text-muted-foreground text-xs">{row.original.company.name}</p>
            ) : null}
          </div>
        ),
      },
      {
        id: 'plan_type',
        accessorKey: 'plan_type',
        header: 'Type',
        cell: ({ row }) => <PlanTypeBadge planType={row.original.plan_type} />,
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Statut',
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <StatusBadge status={row.original.status} />
            {row.original.is_locked ? (
              <Lock className="text-muted-foreground size-3" aria-label="Verrouillé" />
            ) : null}
          </div>
        ),
      },
      {
        id: 'pool',
        header: 'Pool',
        cell: ({ row }) => {
          const allocated = row.original.pool_allocated;
          const total = row.original.pool_size;
          const pct = total > 0 ? Math.round((allocated / total) * 100) : 0;
          return (
            <div className="space-y-0.5">
              <p className="font-mono tabular-nums">{total.toLocaleString('fr-FR')}</p>
              <p className="text-muted-foreground font-mono text-xs tabular-nums">
                {allocated.toLocaleString('fr-FR')} alloués · {pct} %
              </p>
            </div>
          );
        },
      },
      {
        id: 'grant_date',
        accessorKey: 'grant_date',
        header: 'Attribution',
        cell: ({ row }) => (
          <span className="font-mono text-sm tabular-nums">
            {formatDate(row.original.grant_date)}
          </span>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => <RowActions plan={row.original} canCreate={canCreate} router={router} />,
      },
    ],
    [canCreate, router],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom ou société…"
            className="pl-9"
            data-testid="plans-list-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'all')}>
          <SelectTrigger className="w-[170px]" data-testid="plans-list-status-filter">
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                <StatusBadge status={s} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? 'all')}>
          <SelectTrigger className="w-[180px]" data-testid="plans-list-type-filter">
            <SelectValue placeholder="Tous les types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {PLAN_TYPE_OPTIONS.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasActiveFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            data-testid="plans-list-clear-filters"
          >
            <X className="mr-1 size-3" />
            Effacer
          </Button>
        ) : null}
      </div>

      <p className="text-muted-foreground text-xs">
        {filteredPlans.length} plan{filteredPlans.length > 1 ? 's' : ''}
        {hasActiveFilters ? ` sur ${plans.length}` : ''}
      </p>

      <DataTable
        columns={columns}
        data={filteredPlans}
        onRowClick={(row) => router.push(`/dashboard/plans/${row.id}`)}
        emptyState={
          hasActiveFilters
            ? 'Aucun plan ne correspond aux filtres. Essayez d’élargir la recherche.'
            : 'Aucun plan dans cette organisation.'
        }
      />
    </div>
  );
}

function RowActions({
  plan,
  canCreate,
  router,
}: {
  plan: PlanListRow;
  canCreate: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="hover:bg-muted text-muted-foreground inline-flex size-8 items-center justify-center rounded-md transition-colors"
        aria-label={`Actions pour ${plan.name}`}
        data-testid={`plans-list-actions-${plan.id}`}
        onClick={(e) => e.stopPropagation()}
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuGroup>
          <DropdownMenuLabel>{plan.name}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push(`/dashboard/plans/${plan.id}`)}>
          <Eye className="mr-2 size-4" />
          Voir le détail
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={plan.is_locked || !canCreate}
          title={plan.is_locked ? 'Plan verrouillé' : 'Disponible en B3'}
          onClick={() => router.push(`/dashboard/plans/${plan.id}/edit`)}
        >
          <Pencil className="mr-2 size-4" />
          Modifier
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled title="Disponible en B3">
          Dupliquer
        </DropdownMenuItem>
        <DropdownMenuItem disabled title="Disponible en B3" className="text-destructive">
          Archiver
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  // Pad year to 4 digits manuellement pour éviter le bug E2E B2 où une
  // année an 2 AD s'affichait « 01/01/2 » via toLocaleDateString.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
