import Link from 'next/link';
import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/rbac';
import {
  countExerciseRequestsByStatus,
  listExerciseRequestsAdmin,
} from '@/server/queries/exercises-admin';
import { ExerciseRequestStatusBadge } from '@/components/exercises/ExerciseRequestStatusBadge';
import { formatDateFr, formatEuro, formatUnits } from '@/components/exercises/format-helpers';

export const metadata: Metadata = { title: "Demandes d'exercice · Capiwise" };

const FILTER_TABS = [
  { key: 'pending', label: 'En attente', statuses: ['PENDING'] },
  { key: 'approved', label: 'Approuvées', statuses: ['APPROVED', 'SIGNED'] },
  { key: 'completed', label: 'Terminées', statuses: ['COMPLETED'] },
  { key: 'archived', label: 'Rejetées et annulées', statuses: ['REJECTED', 'CANCELLED'] },
] as const;

type FilterKey = (typeof FILTER_TABS)[number]['key'];

function isFilterKey(value: unknown): value is FilterKey {
  return typeof value === 'string' && FILTER_TABS.some((t) => t.key === value);
}

export default async function ExerciseInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requirePermission('exercises.read.all');
  const params = await searchParams;

  const activeFilter: FilterKey = isFilterKey(params.status) ? params.status : 'pending';
  const activeTab = FILTER_TABS.find((t) => t.key === activeFilter) ?? FILTER_TABS[0];

  const [rows, counts] = await Promise.all([
    listExerciseRequestsAdmin({ statuses: activeTab.statuses as unknown as string[] }),
    countExerciseRequestsByStatus(),
  ]);

  function tabCount(t: (typeof FILTER_TABS)[number]): number {
    return t.statuses.reduce((acc, s) => acc + (counts[s] ?? 0), 0);
  }

  return (
    <div className="space-y-8" data-testid="admin-exercises-inbox">
      <header>
        <p className="text-overline text-brass-500">EXERCISE · WORKFLOW</p>
        <h1 className="text-h2 text-ink-900 mt-1 font-medium">Demandes d&apos;exercice</h1>
        <p className="text-ink-500 mt-2 max-w-2xl text-sm">
          Inbox des demandes d&apos;exercice de l&apos;organisation. Approuvez, rejetez ou confirmez
          le paiement selon le workflow configuré.
        </p>
      </header>

      {/* Quick filters Tabs */}
      <nav
        className="border-paper-300 flex flex-wrap gap-1 border-b"
        aria-label="Filtres par statut"
      >
        {FILTER_TABS.map((tab) => {
          const active = tab.key === activeFilter;
          const count = tabCount(tab);
          return (
            <Link
              key={tab.key}
              href={`/dashboard/exercises?status=${tab.key}`}
              className={`relative px-4 py-2 text-sm transition-colors ${
                active
                  ? 'text-brass-700 border-brass-500 -mb-px border-b-2 font-medium'
                  : 'text-ink-500 hover:text-ink-900'
              }`}
              data-testid={`filter-tab-${tab.key}`}
            >
              {tab.label}
              <span
                className={`ml-2 rounded px-1.5 py-0.5 font-mono text-xs tabular-nums ${
                  active ? 'bg-brass-100 text-brass-700' : 'bg-paper-200 text-ink-500'
                }`}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <div className="border-paper-300 bg-paper-50 rounded-lg border p-12 text-center">
          <p className="text-overline text-ink-500">AUCUNE · DEMANDE</p>
          <p className="text-ink-900 mt-2 text-base">
            Aucune demande dans le filtre &quot;{activeTab.label}&quot;.
          </p>
        </div>
      ) : (
        <div className="border-paper-300 overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-paper-100 text-overline text-ink-500">
              <tr>
                <th className="px-4 py-3 text-left font-normal">N°</th>
                <th className="px-4 py-3 text-left font-normal">Bénéficiaire</th>
                <th className="px-4 py-3 text-left font-normal">Award</th>
                <th className="px-4 py-3 text-right font-normal">Unités</th>
                <th className="px-4 py-3 text-right font-normal">Montant</th>
                <th className="px-4 py-3 text-left font-normal">Statut</th>
                <th className="px-4 py-3 text-right font-normal">Demandée le</th>
                <th className="px-4 py-3 text-right font-normal" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-paper-300 bg-paper-50 divide-y">
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-paper-100 transition-colors"
                  data-testid={`admin-exercise-row-${row.id}`}
                >
                  <td className="text-ink-900 px-4 py-3 font-mono text-xs">
                    {row.request_number ?? '—'}
                  </td>
                  <td className="text-ink-900 px-4 py-3">
                    {row.beneficiary_first_name ?? ''} {row.beneficiary_last_name ?? ''}
                  </td>
                  <td className="text-ink-500 px-4 py-3 text-xs">
                    <span className="font-mono">{row.award_number ?? '—'}</span>
                    <span className="ml-2">· {row.plan_type}</span>
                  </td>
                  <td className="text-ink-900 px-4 py-3 text-right font-mono tabular-nums">
                    {formatUnits(row.units_to_exercise)}
                  </td>
                  <td className="text-ink-900 px-4 py-3 text-right font-mono tabular-nums">
                    {row.total_exercise_amount !== null
                      ? formatEuro(row.total_exercise_amount)
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <ExerciseRequestStatusBadge status={row.status} />
                  </td>
                  <td className="text-ink-500 px-4 py-3 text-right font-mono text-xs tabular-nums">
                    {formatDateFr(row.requested_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/exercises/${row.id}`}
                      className="text-brass-600 hover:text-brass-700 text-xs font-medium underline"
                    >
                      Voir détail
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
