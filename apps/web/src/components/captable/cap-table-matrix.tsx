'use client';

/**
 * Module 10 B3 — `cap-table-matrix.tsx` (création initiale).
 *
 * Spec MODULE_10 §1 + §4 : matrice par stakeholder × share_class avec
 * totaux, mini-barre %, sticky headers.
 *
 * ⚠️ Erratum spec §0.2 : la spec disait "déjà créé en PR #12" — c'était
 * faux (cf memory/module_10_recon.md §3). Création initiale en B3.
 *
 * V1 features :
 *   - Tableau positions plat (1 ligne = 1 position) — V2 = pivot par
 *     stakeholder avec drill-down par share_class
 *   - Sortable par n'importe quelle colonne (TanStack Table v8)
 *   - Mini-barre % au-dessus de la colonne units (proportion / total)
 *   - Footer total par share_class + grand total
 *   - Empty state si positions=[] (caller responsibility)
 *
 * V2 (B4-B6) : deltas T-1 (vs snapshot précédent), pivot, hover stakeholder
 * → drill-down toutes ses positions.
 */

import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CapTablePosition } from '@/server/queries/cap-table';

/**
 * Format un nombre en notation FR (espaces séparateurs milliers, max 4
 * décimales). Pas d'arrondi pour conserver la précision audit IFRS.
 */
function formatUnits(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 4,
    minimumFractionDigits: 0,
  }).format(n);
}

function formatPercent(num: number, total: number): string {
  if (total === 0) return '0,00 %';
  const pct = (num / total) * 100;
  return (
    new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(pct) + ' %'
  );
}

/**
 * Couleurs Tailwind par class_type (cohérent design tokens éditoriaux).
 */
function classTypeBadge(classType: string): React.ReactNode {
  const variantMap: Record<string, string> = {
    COMMON: 'bg-emerald-100 text-emerald-900 border-emerald-200',
    PREFERRED: 'bg-indigo-100 text-indigo-900 border-indigo-200',
    ESOP: 'bg-amber-100 text-amber-900 border-amber-200',
    WARRANT: 'bg-purple-100 text-purple-900 border-purple-200',
    BSPCE: 'bg-blue-100 text-blue-900 border-blue-200',
    OTHER: 'bg-gray-100 text-gray-900 border-gray-200',
  };
  return (
    <span
      className={cn(
        'rounded-md border px-1.5 py-0.5 text-xs font-medium',
        variantMap[classType] ?? variantMap.OTHER,
      )}
    >
      {classType}
    </span>
  );
}

function stakeholderTypeBadge(stakeholderType: string): React.ReactNode {
  return (
    <Badge variant="outline" className="text-xs">
      {stakeholderType}
    </Badge>
  );
}

export type CapTableMatrixProps = {
  positions: CapTablePosition[];
  totalsByClass: Record<string, number>;
  grandTotal: number;
  /** Si fourni, afficher comme total visible — sinon recompute interne. */
  className?: string;
};

export function CapTableMatrix({
  positions,
  totalsByClass,
  grandTotal,
  className,
}: CapTableMatrixProps) {
  const [sorting, setSorting] = useState<SortingState>([
    // Tri par défaut : units desc → les plus gros en haut
    { id: 'units', desc: true },
  ]);

  const columns = useMemo<ColumnDef<CapTablePosition>[]>(
    () => [
      {
        accessorKey: 'stakeholder_name',
        header: 'Stakeholder',
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{row.original.stakeholder_name}</span>
            {row.original.stakeholder_email ? (
              <span className="text-muted-foreground text-xs">
                {row.original.stakeholder_email}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'stakeholder_type',
        header: 'Type',
        cell: ({ row }) => stakeholderTypeBadge(row.original.stakeholder_type),
      },
      {
        accessorKey: 'share_class_code',
        header: 'Classe',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">{row.original.share_class_code}</span>
            {classTypeBadge(row.original.share_class_type)}
          </div>
        ),
      },
      {
        accessorKey: 'units',
        header: () => <div className="text-right">Units</div>,
        cell: ({ row }) => (
          <div className="text-right font-mono">{formatUnits(row.original.units)}</div>
        ),
        sortingFn: 'basic',
      },
      {
        id: 'percent',
        header: () => <div className="text-right">%</div>,
        cell: ({ row }) => {
          const pct = grandTotal === 0 ? 0 : (row.original.units / grandTotal) * 100;
          return (
            <div className="space-y-1">
              <div className="text-right font-mono text-xs">
                {formatPercent(row.original.units, grandTotal)}
              </div>
              {/* Mini-barre proportionnelle */}
              <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full transition-all"
                  style={{ width: `${Math.min(100, pct)}%` }}
                  aria-hidden
                />
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'source',
        header: 'Source',
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono text-xs">{row.original.source}</span>
        ),
      },
      {
        accessorKey: 'acquired_at',
        header: 'Acquis le',
        cell: ({ row }) =>
          new Date(row.original.acquired_at).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          }),
      },
    ],
    [grandTotal],
  );

  const table = useReactTable({
    data: positions,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const totalsEntries = Object.entries(totalsByClass).sort((a, b) => b[1] - a[1]);

  return (
    <div className={cn('rounded-lg border', className)} data-testid="cap-table-matrix">
      <Table>
        <TableHeader className="bg-muted/40 sticky top-0">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sortDir = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      'text-overline text-ink-700 select-none',
                      canSort && 'cursor-pointer',
                    )}
                    onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                  >
                    <div className="flex items-center gap-1">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {canSort ? (
                        sortDir === 'asc' ? (
                          <ChevronUp className="text-brass-500 size-3" />
                        ) : sortDir === 'desc' ? (
                          <ChevronDown className="text-brass-500 size-3" />
                        ) : (
                          <ChevronsUpDown className="text-muted-foreground size-3 opacity-50" />
                        )
                      ) : null}
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className="hover:bg-muted/30 transition-colors"
              data-testid={`cap-table-row-${row.original.id ?? row.original.source_id ?? row.id}`}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>

        <TableFooter className="bg-muted/30">
          {totalsEntries.map(([code, units]) => (
            <TableRow key={`total-${code}`} className="border-t">
              <TableCell colSpan={2} className="text-muted-foreground text-xs">
                Total {code}
              </TableCell>
              <TableCell />
              <TableCell className="text-right font-mono">{formatUnits(units)}</TableCell>
              <TableCell className="text-right font-mono text-xs">
                {formatPercent(units, grandTotal)}
              </TableCell>
              <TableCell colSpan={2} />
            </TableRow>
          ))}
          <TableRow className="border-t-2 font-semibold">
            <TableCell colSpan={2}>Total général</TableCell>
            <TableCell />
            <TableCell className="text-right font-mono">{formatUnits(grandTotal)}</TableCell>
            <TableCell className="text-right font-mono">100,00 %</TableCell>
            <TableCell colSpan={2} />
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
