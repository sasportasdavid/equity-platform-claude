'use client';

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronsUpDown, ChevronUp } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * Module Design System V1 — DataTable Editorial Finance.
 *
 * Refonte visuelle (Étape 8) :
 * - Header sticky text-overline ink-700 fond paper-200
 * - Lignes alternées zebra paper-200/30 (subtle)
 * - Hover row : bg paper-200/60 transition 100ms
 * - Row click : underline 1px brass-300 sur la première cellule au hover
 * - Sort icons : ChevronUp/Down brass quand actif, neutre sinon
 * - Empty state plug : si `emptyState` est un ReactNode complet
 *   (EmptyState component), il remplace la cell unique. Sinon fallback
 *   string dans une cell unique.
 *
 * **API publique inchangée** :
 * - `columns: ColumnDef<TData, TValue>[]`
 * - `data: TData[]`
 * - `onRowClick?: (row: TData) => void`
 * - `emptyState?: ReactNode`
 *
 * Backward compat 100% — les ~58 fichiers consommateurs Module 3a/3b/4/5/7
 * continuent à fonctionner sans changement.
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  onRowClick,
  emptyState,
}: {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onRowClick?: (row: TData) => void;
  emptyState?: ReactNode;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const isEmpty = table.getRowModel().rows.length === 0;

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const canSort = header.column.getCanSort();
              const sortDir = header.column.getIsSorted();
              return (
                <TableHead
                  key={header.id}
                  className={cn(canSort && 'hover:text-ink-900 cursor-pointer select-none')}
                  onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                  data-sortable={canSort ? 'true' : undefined}
                  data-sort={sortDir || undefined}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                    {canSort ? <SortIcon direction={sortDir as 'asc' | 'desc' | false} /> : null}
                  </span>
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {isEmpty ? (
          <TableRow className="hover:bg-transparent">
            <TableCell
              colSpan={columns.length}
              className="text-ink-500 px-3 py-8 text-center text-sm"
            >
              {emptyState ?? (
                <span className="serif-italic text-ink-500">Aucun résultat à afficher.</span>
              )}
            </TableCell>
          </TableRow>
        ) : (
          table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className={cn('group/row', onRowClick && 'cursor-pointer')}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              data-testid={`datatable-row-${row.id}`}
            >
              {row.getVisibleCells().map((cell, idx) => (
                <TableCell
                  key={cell.id}
                  className={cn(
                    onRowClick &&
                      idx === 0 &&
                      'group-hover/row:decoration-brass-300 group-hover/row:underline group-hover/row:underline-offset-4',
                  )}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

/**
 * Sort icon — neutre (chevrons up+down) ou brass directionnel.
 */
function SortIcon({ direction }: { direction: 'asc' | 'desc' | false }) {
  if (direction === 'asc') {
    return <ChevronUp className="text-brass-500 size-3" strokeWidth={1.5} />;
  }
  if (direction === 'desc') {
    return <ChevronDown className="text-brass-500 size-3" strokeWidth={1.5} />;
  }
  return <ChevronsUpDown className="text-ink-400 size-3" strokeWidth={1.5} />;
}
