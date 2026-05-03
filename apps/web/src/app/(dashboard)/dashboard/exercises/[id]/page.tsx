import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { hasPermission, requirePermission, requireUser } from '@/lib/auth/rbac';
import { getExerciseRequestAdminDetail } from '@/server/queries/exercises-admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ExerciseRequestStatusBadge } from '@/components/exercises/ExerciseRequestStatusBadge';
import { TaxBreakdownDisplay } from '@/components/exercises/TaxBreakdownDisplay';
import {
  AdminApproveButton,
  AdminCancelButton,
  AdminConfirmPaymentButton,
  AdminRejectButton,
} from '@/components/exercises/AdminActionDialogs';
import { formatDateFr, formatEuro, formatUnits } from '@/components/exercises/format-helpers';
import type { TaxBreakdown } from '@/lib/tax';

export const metadata: Metadata = { title: "Détail demande d'exercice · Capiwise" };

export default async function AdminExerciseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePermission('exercises.read.all');

  const detail = await getExerciseRequestAdminDetail(id);
  if (!detail) notFound();

  const { request, award, plan, beneficiary } = detail;

  // Trouve si l'admin courant a une décision PENDING sur cet exercice
  // (pour afficher Approve / Reject buttons).
  let canApproveReject = false;
  if (request.approval_request_id) {
    const supabase = await createSupabaseServerClient();
    const { data: dec } = await supabase
      .from('approval_decisions')
      .select('id')
      .eq('request_id', request.approval_request_id)
      .eq('approver_user_id', user.id)
      .eq('status', 'PENDING')
      .limit(1)
      .maybeSingle();
    canApproveReject = !!dec;
  }

  const canConfirmPayment =
    (await hasPermission('exercises.confirm_payment')) &&
    (request.status === 'APPROVED' || request.status === 'SIGNED');

  const canAdminCancel =
    (await hasPermission('exercises.cancel.any')) &&
    !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(request.status);

  const taxSnapshot =
    request.tax_simulation_snapshot && typeof request.tax_simulation_snapshot === 'object'
      ? (request.tax_simulation_snapshot as TaxBreakdown)
      : null;

  return (
    <div className="space-y-12" data-testid="admin-exercise-detail">
      {/* Hero */}
      <header className="space-y-4">
        <div>
          <p className="text-overline text-brass-500">DEMANDE · D&apos;EXERCICE</p>
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
          {request.approved_at && ` · approuvée le ${formatDateFr(request.approved_at)}`}
          {request.completed_at && ` · complétée le ${formatDateFr(request.completed_at)}`}
          {request.cancelled_at && ` · annulée le ${formatDateFr(request.cancelled_at)}`}
        </p>
      </header>

      {/* KPIs */}
      <section className="border-paper-300 from-paper-300 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-gradient-to-br sm:grid-cols-4">
        <KpiCell label="Unités à exercer" value={formatUnits(request.units_to_exercise)} />
        <KpiCell
          label="Coût d'exercice"
          value={
            request.total_exercise_amount !== null ? formatEuro(request.total_exercise_amount) : '—'
          }
          accent="brass"
        />
        <KpiCell
          label="FMV à la demande"
          value={
            request.fmv_per_unit_at_request !== null
              ? formatEuro(request.fmv_per_unit_at_request)
              : '—'
          }
        />
        <KpiCell label="Type de plan" value={plan.plan_type} />
      </section>

      {/* Demandeur */}
      <section className="space-y-4">
        <header>
          <p className="text-overline text-brass-500">DEMANDEUR · BÉNÉFICIAIRE</p>
          <h2 className="text-h3 text-ink-900 mt-1">Identité</h2>
        </header>
        <div className="border-paper-300 bg-paper-50 rounded-lg border p-6">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
            <DetailItem
              label="Nom complet"
              value={`${beneficiary.first_name ?? ''} ${beneficiary.last_name ?? ''}`.trim() || '—'}
            />
            <DetailItem label="Email" value={beneficiary.email ?? '—'} />
            <DetailItem label="Date d'embauche" value={formatDateFr(beneficiary.hire_date)} />
          </dl>
        </div>
      </section>

      {/* Award + plan */}
      <section className="space-y-4">
        <header>
          <p className="text-overline text-brass-500">AWARD · ATTRIBUÉ</p>
          <h2 className="text-h3 text-ink-900 mt-1">Détails du plan</h2>
        </header>
        <div className="border-paper-300 bg-paper-50 rounded-lg border p-6">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
            <DetailItem label="Numéro award" value={award.award_number ?? '—'} />
            <DetailItem label="Plan" value={plan.name} />
            <DetailItem
              label="Prix d'exercice"
              value={award.exercise_price !== null ? formatEuro(award.exercise_price) : '—'}
            />
            <DetailItem label="Unités attribuées" value={formatUnits(award.units_granted)} />
            <DetailItem label="Unités déjà exercées" value={formatUnits(award.units_exercised)} />
            <DetailItem label="Date d'attribution" value={formatDateFr(award.grant_date)} />
          </dl>
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

      {/* Notes */}
      {(request.beneficiary_notes ||
        request.admin_notes ||
        request.rejected_reason ||
        request.cancellation_reason) && (
        <section className="space-y-4">
          <header>
            <p className="text-overline text-brass-500">NOTES · CONTEXTE</p>
            <h2 className="text-h3 text-ink-900 mt-1">Échanges</h2>
          </header>
          <div className="border-paper-300 bg-paper-50 space-y-4 rounded-lg border p-6">
            {request.beneficiary_notes && (
              <div>
                <p className="text-overline text-ink-500">NOTES · BÉNÉFICIAIRE</p>
                <p className="text-ink-900 mt-2 whitespace-pre-wrap text-sm">
                  {request.beneficiary_notes}
                </p>
              </div>
            )}
            {request.admin_notes && (
              <div className="border-paper-300 border-t pt-4">
                <p className="text-overline text-ink-500">NOTES · ADMIN</p>
                <p className="text-ink-900 mt-2 whitespace-pre-wrap text-sm">
                  {request.admin_notes}
                </p>
              </div>
            )}
            {request.rejected_reason && (
              <div className="border-paper-300 border-t pt-4">
                <p className="text-overline text-rose-700">MOTIF · DE REJET</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-rose-900">
                  {request.rejected_reason}
                </p>
              </div>
            )}
            {request.cancellation_reason && (
              <div className="border-paper-300 border-t pt-4">
                <p className="text-overline text-slate-700">MOTIF · D&apos;ANNULATION</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-900">
                  {request.cancellation_reason}
                </p>
              </div>
            )}
          </div>
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

      {/* Actions admin */}
      {(canApproveReject || canConfirmPayment || canAdminCancel) && (
        <section className="space-y-4">
          <header>
            <p className="text-overline text-brass-500">ACTIONS · ADMIN</p>
            <h2 className="text-h3 text-ink-900 mt-1">Que voulez-vous faire ?</h2>
          </header>
          <div className="border-paper-300 bg-paper-50 space-y-3 rounded-lg border p-6">
            {canApproveReject && (
              <div className="flex flex-wrap gap-3">
                <AdminApproveButton exerciseRequestId={request.id} />
                <AdminRejectButton exerciseRequestId={request.id} />
              </div>
            )}
            {canConfirmPayment && request.total_exercise_amount !== null && (
              <AdminConfirmPaymentButton
                exerciseRequestId={request.id}
                expectedAmount={request.total_exercise_amount}
              />
            )}
            {canAdminCancel && <AdminCancelButton exerciseRequestId={request.id} />}
          </div>
        </section>
      )}

      {/* Lien workflow */}
      {request.approval_request_id && (
        <section className="space-y-4">
          <header>
            <p className="text-overline text-brass-500">WORKFLOW · D&apos;APPROBATION</p>
            <h2 className="text-h3 text-ink-900 mt-1">Détail des décisions</h2>
          </header>
          <div className="border-paper-300 bg-paper-50 rounded-lg border p-6">
            <p className="text-ink-500 text-sm">
              Suivez l&apos;avancement complet du workflow d&apos;approbation (toutes les étapes,
              toutes les décisions) sur la page dédiée.
            </p>
            <a
              href={`/dashboard/approvals/${request.approval_request_id}`}
              className="text-brass-600 hover:text-brass-700 mt-3 inline-block text-sm font-medium underline"
            >
              → Voir le workflow d&apos;approbation
            </a>
          </div>
        </section>
      )}
    </div>
  );
}

function KpiCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'brass' | 'emerald';
}) {
  return (
    <div className="bg-paper-50 p-6">
      <p className="text-overline text-ink-500">{label.toUpperCase()}</p>
      <p
        className={`mt-2 font-mono text-xl tabular-nums ${
          accent === 'brass'
            ? 'text-brass-700 font-semibold'
            : accent === 'emerald'
              ? 'font-semibold text-emerald-700'
              : 'text-ink-900'
        }`}
      >
        {value}
      </p>
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
        className={`mt-1 font-mono text-sm tabular-nums ${
          accent === 'brass'
            ? 'text-brass-700 font-semibold'
            : accent === 'emerald'
              ? 'font-semibold text-emerald-700'
              : 'text-ink-900'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
