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
 * DataTable réutilisable basée sur TanStack Table v8.
 *
 * Features minimales pour la V1 :
 *  - sorting client-side (clic header)
 *  - filtrage côté serveur (déjà appliqué via les filters de listPlans)
 *  - empty state custom
 *  - row click handler (onRowClick) pour ouvrir le détail
 *
 * On NE veut PAS de pagination client-side ici : la V1 est plafonnée à
 * ~100 plans par org (limit côté listPlans à ajouter si besoin), donc
 * tout tient sur une page. La pagination serveur arrivera quand un user
 * dépassera 200 plans.
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

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn(
                    'whitespace-nowrap',
                    header.column.getCanSort() && 'cursor-pointer select-none',
                  )}
                  onClick={
                    header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined
                  }
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                  {header.column.getIsSorted() === 'asc' ? ' ↑' : null}
                  {header.column.getIsSorted() === 'desc' ? ' ↓' : null}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-muted-foreground h-32 text-center text-sm"
              >
                {emptyState ?? 'Aucun résultat.'}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className={cn(onRowClick && 'hover:bg-muted/50 cursor-pointer')}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                data-testid={`datatable-row-${row.id}`}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
