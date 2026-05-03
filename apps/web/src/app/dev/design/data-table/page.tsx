'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/empty-state';
import { BookIllustration } from '@/components/shared/illustrations';
import { StatusBadge } from '@/components/ui/status-badge';

/**
 * Sandbox /dev/design/data-table — Module Design System V1, Étape 8.
 *
 * 2 cas de validation visuelle pour le composant DataTable refondu :
 *
 * 1. **Avec données** (4 lignes Plans actifs) — référence mockup 1 :
 *    ID + PLAN + TYPE + STATUT + UNITÉS + FMV
 * 2. **Empty state intégré** via le composant EmptyState éditorial
 *    (book illustration + lettre cuivre + CTA primary)
 */

type Plan = {
  id: string;
  plan: string;
  type: string;
  status: 'STRIKE_FMV' | 'PENDING_HR' | 'GRANTED' | 'DRAFT';
  units: number;
  fmv: number;
};

const samplePlans: Plan[] = [
  {
    id: 'BSPCE-2026-001',
    plan: 'Tranche A — Tech',
    type: 'BSPCE',
    status: 'STRIKE_FMV',
    units: 4200,
    fmv: 312,
  },
  {
    id: 'AGA-2025-014',
    plan: 'Direction Ops',
    type: 'AGA',
    status: 'PENDING_HR',
    units: 450,
    fmv: 410,
  },
  {
    id: 'BSPCE-2025-007',
    plan: 'Sales Q3',
    type: 'BSPCE',
    status: 'GRANTED',
    units: 2400,
    fmv: 312,
  },
  {
    id: 'SO-2024-002',
    plan: 'Founders pool',
    type: 'STOCK_OPTION',
    status: 'DRAFT',
    units: 8000,
    fmv: 280,
  },
];

const planColumns: ColumnDef<Plan>[] = [
  {
    accessorKey: 'id',
    header: 'ID',
    cell: ({ row }) => <span className="text-numeric-sm text-ink-500">{row.original.id}</span>,
  },
  {
    accessorKey: 'plan',
    header: 'Plan',
    cell: ({ row }) => <span className="text-ink-900 font-medium">{row.original.plan}</span>,
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => (
      <span className="bg-paper-200 text-ink-700 rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider">
        {row.original.type}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Statut',
    cell: ({ row }) => {
      const s = row.original.status;
      if (s === 'STRIKE_FMV')
        return (
          <StatusBadge tone="title" pattern="solid">
            ⚠ STRIKE &lt; FMV
          </StatusBadge>
        );
      if (s === 'PENDING_HR')
        return (
          <StatusBadge tone="saffron" pattern="dotted">
            EN ATTENTE HR
          </StatusBadge>
        );
      if (s === 'GRANTED')
        return (
          <StatusBadge tone="bond" pattern="solid">
            Attribué
          </StatusBadge>
        );
      return (
        <StatusBadge tone="slate" pattern="solid">
          Brouillon
        </StatusBadge>
      );
    },
  },
  {
    accessorKey: 'units',
    header: 'Unités',
    cell: ({ row }) => (
      <span className="text-numeric-md text-ink-900 block text-right">
        {row.original.units.toLocaleString('fr-FR')}
      </span>
    ),
  },
  {
    accessorKey: 'fmv',
    header: 'FMV',
    cell: ({ row }) => (
      <span className="text-numeric-md text-ink-900 block text-right">{row.original.fmv} €</span>
    ),
  },
];

export default function DataTableSandboxPage() {
  return (
    <div className="bg-background mx-auto min-h-screen max-w-6xl space-y-12 p-8">
      <header className="space-y-2">
        <p className="text-overline text-brass-500">DESIGN SYSTEM V1 · SANDBOX</p>
        <h1 className="text-h1 text-ink-900">
          DataTable <span className="serif-italic text-brass-500">éditoriale</span>
        </h1>
        <div className="bg-brass-500 animate-draw-line mt-3 h-[2px] w-16" aria-hidden="true" />
        <p className="text-ink-500 mt-3 text-sm">
          2 cas de validation : avec données + empty state. API publique backward-compatible avec
          les ~58 consommateurs existants.
        </p>
      </header>

      {/* CAS 1 — Avec données */}
      <section className="space-y-3">
        <h2 className="text-h2 text-ink-900">
          Cas 1 — <span className="serif-italic text-brass-500">Plans actifs</span>
        </h2>
        <p className="text-ink-500 text-sm">
          4 lignes type mockup 1. Header overline ink-700 paper-200, lignes zebra paper-200/30, IDs
          mono ink-500, chiffres mono right-aligned, StatusBadge varié, sort cliquable (essaie «
          Unités » ou « FMV »). Hover row : bg paper-200/60 + underline subtle brass-300 sur la
          première cellule.
        </p>
        <DataTable
          columns={planColumns}
          data={samplePlans}
          onRowClick={(row) => console.log('clicked', row.id)}
        />
      </section>

      {/* CAS 2 — Empty state */}
      <section className="space-y-3">
        <h2 className="text-h2 text-ink-900">
          Cas 2 — <span className="serif-italic text-brass-500">Empty state</span> éditorial
        </h2>
        <p className="text-ink-500 text-sm">
          Quand `data=[]`, le composant EmptyState (Étape 7) prend le relais. Illustration livre
          ouvert + titre serif + description + CTA cuivre.
        </p>
        <DataTable
          columns={planColumns}
          data={[]}
          emptyState={
            <EmptyState
              illustration={<BookIllustration size={64} />}
              title="Aucun plan signé pour le moment."
              description="Créez votre premier plan BSPCE, AGA ou stock options pour démarrer le suivi."
              action={{ label: 'Nouveau plan →', href: '/dashboard/plans/new' }}
              secondaryLink={{ label: 'Lire le guide BSPCE', href: '#' }}
            />
          }
        />
      </section>

      <footer className="text-ink-400 border-paper-300 mt-16 border-t pt-6 font-mono text-xs">
        <p>
          DataTable · Editorial Finance V1 · spec 5.4 · sandbox{' '}
          <code className="bg-paper-200 rounded px-1">/dev/design/data-table</code>
        </p>
        <p className="text-ink-500 mt-2">
          ⚠ <strong>Audit StatusBadge mapping</strong> : les 16 statuts award
          (DRAFT/PROPOSED/.../FORFEITED) seront audités lors du refactor de AwardStatusBadge en
          Étape 12 (refonte Dashboard CFO). Mapping proposé documenté dans le reporting Étape 10.
        </p>
      </footer>
    </div>
  );
}
