import { notFound } from 'next/navigation';
import { ExerciseQueryError, getExerciseRequestDetail } from '@/server/queries/exercises';
import { ExerciseRequestStatusBadge } from '@/components/exercises/ExerciseRequestStatusBadge';
import { CancelExerciseDialog } from '@/components/exercises/CancelExerciseDialog';
import { TaxBreakdownDisplay } from '@/components/exercises/TaxBreakdownDisplay';
import { formatDateFr, formatEuro, formatUnits } from '@/components/exercises/format-helpers';
import type { TaxBreakdown } from '@/lib/tax';

/**
 * Module 9 B3 — Page détail d'une exercise_request portail.
 *
 * Sections Editorial :
 *  - Hero (numéro de demande + statut + montant + actions)
 *  - Détails de la demande (units, prix d'exercice, FMV, paiement, notes)
 *  - Snapshot fiscal (TaxBreakdown rendu si tax_simulation_snapshot présent)
 *  - Actions disponibles (Cancel button si PENDING + ownership check via RLS)
 */
export default async function PortalExerciseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail;
  try {
    detail = await getExerciseRequestDetail(id);
  } catch (err) {
    if (err instanceof ExerciseQueryError && err.code === 'NOT_FOUND') {
      notFound();
    }
    throw err;
  }

  const { request, award, plan } = detail;

  // Parse snapshot fiscal si présent (peut être null)
  const taxSnapshot =
    request.tax_simulation_snapshot && typeof request.tax_simulation_snapshot === 'object'
      ? (request.tax_simulation_snapshot as TaxBreakdown)
      : null;

  return (
    <div className="space-y-12" data-testid="portal-exercise-detail">
      {/* Hero */}
      <header className="space-y-4">
        <div>
          <p className="text-overline text-brass-500">DEMANDE · D'EXERCICE</p>
          <h1 className="text-h1 text-ink-900 mt-1 font-medium">
            {request.request_number ?? 'Demande sans numéro'}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ExerciseRequestStatusBadge status={request.status} />
          <span className="text-ink-500 text-sm">
            Award {award.award_number ?? '—'} · {plan.name}
          </span>
        </div>
        <p className="text-ink-500 text-sm">
          Demandée le {formatDateFr(request.requested_at)}
          {request.completed_at && ` · complétée le ${formatDateFr(request.completed_at)}`}
          {request.cancelled_at && ` · annulée le ${formatDateFr(request.cancelled_at)}`}
        </p>
      </header>

      {/* Détails */}
      <section className="space-y-4">
        <header>
          <p className="text-overline text-brass-500">DÉTAILS · DE LA DEMANDE</p>
          <h2 className="text-h3 text-ink-900 mt-1">Paramètres économiques</h2>
        </header>
        <div className="border-paper-300 bg-paper-50 rounded-lg border p-6">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
            <DetailItem label="Unités exercées" value={formatUnits(request.units_to_exercise)} />
            <DetailItem
              label="Prix d'exercice"
              value={formatEuro(request.exercise_price_per_unit)}
            />
            <DetailItem
              label="Coût total d'exercice"
              value={
                request.total_exercise_amount !== null
                  ? formatEuro(request.total_exercise_amount)
                  : '—'
              }
              accent="brass"
            />
            <DetailItem
              label="FMV au moment de la demande"
              value={
                request.fmv_per_unit_at_request !== null
                  ? formatEuro(request.fmv_per_unit_at_request)
                  : '—'
              }
            />
            <DetailItem
              label="Méthode de paiement"
              value={paymentMethodLabel(request.payment_method)}
            />
            <DetailItem label="Type de plan" value={plan.plan_type} />
          </dl>

          {request.beneficiary_notes && (
            <div className="border-paper-300 mt-6 border-t pt-4">
              <p className="text-overline text-ink-500">NOTES · BÉNÉFICIAIRE</p>
              <p className="text-ink-900 mt-2 whitespace-pre-wrap text-sm">
                {request.beneficiary_notes}
              </p>
            </div>
          )}

          {request.admin_notes && (
            <div className="border-paper-300 mt-6 border-t pt-4">
              <p className="text-overline text-ink-500">NOTES · ADMIN</p>
              <p className="text-ink-900 mt-2 whitespace-pre-wrap text-sm">{request.admin_notes}</p>
            </div>
          )}

          {request.rejected_reason && (
            <div className="mt-6 rounded-md border border-rose-300 bg-rose-50 p-4">
              <p className="text-overline text-rose-700">MOTIF · DE REJET</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-rose-900">
                {request.rejected_reason}
              </p>
            </div>
          )}

          {request.cancellation_reason && (
            <div className="mt-6 rounded-md border border-slate-300 bg-slate-50 p-4">
              <p className="text-overline text-slate-700">MOTIF · D'ANNULATION</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-900">
                {request.cancellation_reason}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Snapshot fiscal */}
      {taxSnapshot && (
        <section className="space-y-4">
          <header>
            <p className="text-overline text-brass-500">SIMULATION · FISCALE</p>
            <h2 className="text-h3 text-ink-900 mt-1">Snapshot au moment de la demande</h2>
          </header>
          <TaxBreakdownDisplay breakdown={taxSnapshot} />
        </section>
      )}

      {/* Paiement reçu */}
      {request.status === 'COMPLETED' && request.payment_amount_received !== null && (
        <section className="space-y-4">
          <header>
            <p className="text-overline text-brass-500">PAIEMENT · CONFIRMÉ</p>
            <h2 className="text-h3 text-ink-900 mt-1">Réception</h2>
          </header>
          <div className="border-paper-300 bg-paper-50 rounded-lg border p-6">
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
              <DetailItem
                label="Montant reçu"
                value={formatEuro(request.payment_amount_received)}
                accent="emerald"
              />
              <DetailItem label="Reçu le" value={formatDateFr(request.payment_received_at)} />
              <DetailItem label="Référence" value={request.payment_reference ?? '—'} />
            </dl>
          </div>
        </section>
      )}

      {/* Actions disponibles */}
      <section className="space-y-4">
        <header>
          <p className="text-overline text-brass-500">ACTIONS · DISPONIBLES</p>
          <h2 className="text-h3 text-ink-900 mt-1">Que voulez-vous faire ?</h2>
        </header>
        <div className="border-paper-300 bg-paper-50 rounded-lg border p-6">
          {request.status === 'PENDING' ? (
            <CancelExerciseDialog requestId={request.id} />
          ) : request.status === 'COMPLETED' ? (
            <p className="text-ink-500 text-sm">
              Exercice complété. Le bulletin de souscription a été émis et le paiement reçu.
            </p>
          ) : request.status === 'CANCELLED' ? (
            <p className="text-ink-500 text-sm">
              Demande annulée. Vous pouvez créer une nouvelle demande depuis la page de l'award
              concerné.
            </p>
          ) : request.status === 'REJECTED' ? (
            <p className="text-ink-500 text-sm">
              Demande rejetée. Vous pouvez en créer une nouvelle après correction des éléments
              soulevés par l'admin.
            </p>
          ) : (
            <p className="text-ink-500 text-sm">
              Aucune action disponible à ce stade. La demande suit le workflow d'approbation et de
              signature configuré par l'organisation.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function DetailItem({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'brass' | 'emerald';
}) {
  return (
    <div>
      <dt className="text-overline text-ink-500">{label.toUpperCase()}</dt>
      <dd
        className={
          accent === 'brass'
            ? 'text-brass-700 mt-1 font-mono text-sm font-semibold tabular-nums'
            : accent === 'emerald'
              ? 'mt-1 font-mono text-sm font-semibold tabular-nums text-emerald-700'
              : 'text-ink-900 mt-1 font-mono text-sm tabular-nums'
        }
      >
        {value}
      </dd>
    </div>
  );
}

function paymentMethodLabel(method: string | null): string {
  switch (method) {
    case 'BANK_TRANSFER':
      return 'Virement bancaire';
    case 'CHECK':
      return 'Chèque';
    case 'OTHER':
      return 'Autre';
    default:
      return method ?? '—';
  }
}
