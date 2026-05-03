'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Module Design System V1 — Tableau Editorial Finance.
 *
 * Refonte visuelle (Étape 8) :
 * - Cellules px-3 py-3 (~52px row height) — densité éditoriale
 * - Header text-overline ink-700 paper-200 (mockup 1)
 * - Lignes alternées paper-200/30 zebra (subtle)
 * - Hover row : bg paper-200/60, transition 100ms
 * - Borders : paper-300 (jamais default border)
 *
 * **API publique inchangée** — `Table`, `TableHeader`, `TableBody`,
 * `TableRow`, `TableHead`, `TableCell`, `TableCaption`, `TableFooter`.
 */

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div
      data-slot="table-container"
      className="border-paper-300 relative w-full overflow-x-auto rounded-md border"
    >
      <table
        data-slot="table"
        className={cn('w-full caption-bottom text-sm', className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('bg-paper-200 [&_tr]:border-paper-300 [&_tr]:border-b', className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:nth-child(even)]:bg-paper-200/30 [&_tr:last-child]:border-0', className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'bg-paper-200 border-paper-300 border-t font-medium [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-paper-300 hover:bg-paper-200/60 has-aria-expanded:bg-paper-200/60 data-[state=selected]:bg-brass-50 border-b transition-colors duration-100',
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'text-overline text-ink-700 h-10 whitespace-nowrap px-3 text-left align-middle [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'text-ink-900 whitespace-nowrap px-3 py-3 align-middle [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('text-ink-500 mt-4 text-sm', className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
