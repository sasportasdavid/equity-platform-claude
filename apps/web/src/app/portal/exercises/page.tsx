import Link from 'next/link';
import { listMyExerciseRequests } from '@/server/queries/exercises';
import { ExerciseRequestStatusBadge } from '@/components/exercises/ExerciseRequestStatusBadge';
import { formatDateFr, formatEuro, formatUnits } from '@/components/exercises/format-helpers';

/**
 * Module 9 B3 — Liste des exercise_requests du bénéficiaire courant.
 *
 * RLS filtre côté DB (policy SELECT own en migration 00057). Tri descendant
 * par requested_at. EmptyState si aucune demande.
 */
export default async function PortalExercisesListPage() {
  const requests = await listMyExerciseRequests();

  return (
    <div className="space-y-8" data-testid="portal-exercises-list-page">
      <header>
        <p className="text-overline text-brass-500">MES · DEMANDES D'EXERCICE</p>
        <h1 className="text-h2 text-ink-900 mt-1 font-medium">Suivi de mes exercices</h1>
        <p className="text-ink-500 mt-2 max-w-2xl text-sm">
          Liste de vos demandes d'exercice de BSPCE, Stock Options ou BSA. Cliquez sur une ligne
          pour consulter le détail (workflow d'approbation, documents, paiement).
        </p>
      </header>

      {requests.length === 0 ? (
        <div className="border-paper-300 bg-paper-50 rounded-lg border p-12 text-center">
          <p className="text-overline text-ink-500">AUCUNE · DEMANDE</p>
          <p className="text-ink-900 mt-2 text-base">Vous n'avez pas encore demandé d'exercice.</p>
          <p className="text-ink-500 mx-auto mt-2 max-w-md text-sm">
            Trouvez un award éligible (BSPCE / Stock Options / BSA avec unités vested) sur la page{' '}
            <Link href="/portal/awards" className="text-brass-600 underline">
              Mes attributions
            </Link>{' '}
            et lancez une demande.
          </p>
        </div>
      ) : (
        <div className="border-paper-300 overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-paper-100 text-overline text-ink-500">
              <tr>
                <th className="px-4 py-3 text-left font-normal">N°</th>
                <th className="px-4 py-3 text-left font-normal">Statut</th>
                <th className="px-4 py-3 text-right font-normal">Unités</th>
                <th className="px-4 py-3 text-right font-normal">Coût d'exercice</th>
                <th className="px-4 py-3 text-right font-normal">Demandée le</th>
                <th className="px-4 py-3 text-right font-normal" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-paper-300 bg-paper-50 divide-y">
              {requests.map((req) => (
                <tr
                  key={req.id}
                  className="hover:bg-paper-100 transition-colors"
                  data-testid={`exercise-row-${req.id}`}
                >
                  <td className="text-ink-900 px-4 py-3 font-mono text-xs">
                    {req.request_number ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <ExerciseRequestStatusBadge status={req.status} />
                  </td>
                  <td className="text-ink-900 px-4 py-3 text-right font-mono tabular-nums">
                    {formatUnits(req.units_to_exercise)}
                  </td>
                  <td className="text-ink-900 px-4 py-3 text-right font-mono tabular-nums">
                    {req.total_exercise_amount !== null
                      ? formatEuro(req.total_exercise_amount)
                      : '—'}
                  </td>
                  <td className="text-ink-500 px-4 py-3 text-right font-mono text-xs tabular-nums">
                    {formatDateFr(req.requested_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/portal/exercises/${req.id}`}
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
