import 'server-only';
import { insertNotificationWithRender } from '@/server/actions/notifications';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Module 9 B5 — 3 hooks notification email pour le workflow d'exercice.
 *
 * Pattern aligné Module 7 B5 (notifyApproversOfPendingApproval) :
 *  - Fire-and-forget côté caller (la Server Action ne bloque pas si fail)
 *  - Pattern Result { ok: true } | { ok: false, error } pour log côté caller
 *  - Channel EMAIL only V1 (IN_APP reporté V2)
 *  - Réutilise insertNotificationWithRender (queue Module 7) + TEMPLATES typé
 *
 * Tous les hooks chargent les données via service_role admin client (bypass
 * RLS — context déjà authentifié + autorisé par le Server Action caller).
 */

type NotifyOk<T> = { ok: true } & T;
type NotifyErr = { ok: false; error: string };

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Helpers internes
// ---------------------------------------------------------------------------

type ExerciseLite = {
  id: string;
  request_number: string | null;
  org_id: string;
  units_to_exercise: number;
  exercise_price_per_unit: number;
  total_exercise_amount: number | null;
  fmv_per_unit_at_request: number | null;
  payment_amount_received: number | null;
  payment_reference: string | null;
  payment_received_at: string | null;
  completed_at: string | null;
  tax_simulation_snapshot: {
    regime?: string;
    grossGainAmount?: number;
    totalTaxAmount?: number;
    netGainAmount?: number;
  } | null;
  award_id: string;
  beneficiary_id: string;
};

type AwardLite = {
  id: string;
  award_number: string | null;
  exercise_price: number | null;
  plan_id: string;
};

type PlanLite = { id: string; name: string; plan_type: string };
type OrgLite = {
  id: string;
  name: string;
  bank_iban: string | null;
  bank_bic: string | null;
  bank_name: string | null;
};
type BeneficiaryLite = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  user_id: string | null;
};

async function loadExerciseBundle(exerciseRequestId: string): Promise<{
  exercise: ExerciseLite;
  award: AwardLite | null;
  plan: PlanLite | null;
  org: OrgLite | null;
  beneficiary: BeneficiaryLite | null;
} | null> {
  const admin = getSupabaseAdminClient();
  const { data: exercise } = await admin
    .from('exercise_requests')
    .select(
      'id, request_number, org_id, units_to_exercise, exercise_price_per_unit, total_exercise_amount, fmv_per_unit_at_request, payment_amount_received, payment_reference, payment_received_at, completed_at, tax_simulation_snapshot, award_id, beneficiary_id',
    )
    .eq('id', exerciseRequestId)
    .maybeSingle();

  if (!exercise) return null;
  const ex = exercise as unknown as ExerciseLite;

  const [awardRes, beneRes, orgRes] = await Promise.all([
    admin
      .from('awards')
      .select('id, award_number, exercise_price, plan_id')
      .eq('id', ex.award_id)
      .maybeSingle(),
    admin
      .from('beneficiaries')
      .select('id, first_name, last_name, email, user_id')
      .eq('id', ex.beneficiary_id)
      .maybeSingle(),
    admin
      .from('organizations')
      .select('id, name, bank_iban, bank_bic, bank_name')
      .eq('id', ex.org_id)
      .maybeSingle(),
  ]);

  let plan: PlanLite | null = null;
  if (awardRes.data?.plan_id) {
    const { data: planData } = await admin
      .from('plans')
      .select('id, name, plan_type')
      .eq('id', awardRes.data.plan_id)
      .maybeSingle();
    plan = (planData as PlanLite | null) ?? null;
  }

  return {
    exercise: ex,
    award: (awardRes.data as AwardLite | null) ?? null,
    plan,
    org: (orgRes.data as OrgLite | null) ?? null,
    beneficiary: (beneRes.data as BeneficiaryLite | null) ?? null,
  };
}

async function resolveBeneficiaryEmail(
  bene: BeneficiaryLite | null,
): Promise<{ email: string | null; fullName: string }> {
  if (!bene) return { email: null, fullName: 'Bénéficiaire' };
  let email = bene.email;
  if (!email && bene.user_id) {
    const admin = getSupabaseAdminClient();
    const { data } = await admin.auth.admin.getUserById(bene.user_id);
    email = data?.user?.email ?? null;
  }
  const fullName =
    [bene.first_name, bene.last_name].filter(Boolean).join(' ').trim() || 'Bénéficiaire';
  return { email, fullName };
}

// ---------------------------------------------------------------------------
// 1. notifyAdminsOfExerciseRequest
// ---------------------------------------------------------------------------

/**
 * Notifie tous les ADMIN_HR + OWNER actifs de l'org qu'une nouvelle demande
 * d'exercice attend leur approbation. Dédup par user_id (un même user peut
 * avoir plusieurs rôles — on n'envoie qu'un email).
 */
export async function notifyAdminsOfExerciseRequest(input: {
  exerciseRequestId: string;
}): Promise<NotifyOk<{ created: number }> | NotifyErr> {
  const bundle = await loadExerciseBundle(input.exerciseRequestId);
  if (!bundle) return { ok: false, error: 'Exercise request introuvable' };

  const { exercise, award, plan, beneficiary } = bundle;
  const beneEmail = await resolveBeneficiaryEmail(beneficiary);

  const admin = getSupabaseAdminClient();
  const { data: members } = await admin
    .from('memberships')
    .select('user_id, roles')
    .eq('org_id', exercise.org_id)
    .eq('status', 'ACTIVE');

  const recipientIds = new Set<string>();
  for (const m of (members ?? []) as Array<{ user_id: string | null; roles: string[] | null }>) {
    if (!m.user_id || !m.roles) continue;
    if (m.roles.includes('ADMIN_HR') || m.roles.includes('OWNER')) {
      recipientIds.add(m.user_id);
    }
  }

  if (recipientIds.size === 0) {
    console.warn(
      `[notifyAdminsOfExerciseRequest] no ADMIN_HR/OWNER recipient for org ${exercise.org_id}`,
    );
    return { ok: true, created: 0 };
  }

  const tax = exercise.tax_simulation_snapshot ?? {};
  const planType = plan?.plan_type ?? 'Plan';
  const beneficiaryName = beneEmail.fullName;
  const beneficiaryEmail = beneEmail.email ?? '—';

  let created = 0;
  for (const userId of recipientIds) {
    const { data: u } = await admin.auth.admin.getUserById(userId);
    const recipientEmail = u?.user?.email;
    if (!recipientEmail) continue;
    const recipientName =
      (u.user?.user_metadata as { full_name?: string } | null)?.full_name ?? 'Administrateur';

    const res = await insertNotificationWithRender({
      orgId: exercise.org_id,
      templateCode: 'exercise_request_submitted',
      channel: 'EMAIL',
      recipientEmail,
      userId,
      relatedEntityType: 'exercise_request',
      relatedEntityId: exercise.id,
      variables: {
        recipientName,
        requestNumber: exercise.request_number ?? exercise.id.slice(0, 8),
        beneficiaryName,
        beneficiaryEmail,
        awardNumber: award?.award_number ?? '—',
        planType,
        units: Number(exercise.units_to_exercise),
        totalCost: Number(exercise.total_exercise_amount ?? 0),
        fmvAtRequest: Number(exercise.fmv_per_unit_at_request ?? 0),
        taxRegime: tax.regime ?? '—',
        totalTaxes: Number(tax.totalTaxAmount ?? 0),
        netGain: Number(tax.netGainAmount ?? 0),
        approvalUrl: `${APP_URL}/dashboard/exercises/${exercise.id}`,
      },
    });
    if (res.ok) created += 1;
    else
      console.error(
        `[notifyAdminsOfExerciseRequest] insert failed for ${recipientEmail}: ${res.error}`,
      );
  }

  return { ok: true, created };
}

// ---------------------------------------------------------------------------
// 2. notifyBeneficiaryOfExerciseDecision
// ---------------------------------------------------------------------------

/**
 * Notifie le bénéficiaire d'une décision sur sa demande (APPROVED / REJECTED /
 * CANCELLED_BY_ADMIN). Dispatch sur 3 templates selon la décision avec
 * variables adaptées.
 */
export async function notifyBeneficiaryOfExerciseDecision(input: {
  exerciseRequestId: string;
  decision: 'APPROVED' | 'REJECTED' | 'CANCELLED_BY_ADMIN';
  reason?: string | null;
  adminName?: string | null;
  approverName?: string | null;
  stepName?: string | null;
  paymentDeadlineDays?: number;
}): Promise<NotifyOk<{ notificationId: string | null }> | NotifyErr> {
  const bundle = await loadExerciseBundle(input.exerciseRequestId);
  if (!bundle) return { ok: false, error: 'Exercise request introuvable' };

  const { exercise, award, plan, org, beneficiary } = bundle;
  const beneEmail = await resolveBeneficiaryEmail(beneficiary);

  if (!beneEmail.email) {
    console.warn(
      `[notifyBeneficiaryOfExerciseDecision] beneficiary ${beneficiary?.id ?? '?'} has no email — skipping`,
    );
    return { ok: true, notificationId: null };
  }

  const requestNumber = exercise.request_number ?? exercise.id.slice(0, 8);
  const awardNumber = award?.award_number ?? '—';
  const orgName = org?.name ?? '—';
  const planType = plan?.plan_type ?? 'Plan';
  const exerciseUrl = `${APP_URL}/portal/exercises/${exercise.id}`;
  const awardUrl = award ? `${APP_URL}/portal/awards/${award.id}` : APP_URL;

  let templateCode:
    | 'exercise_request_approved'
    | 'exercise_request_rejected'
    | 'exercise_request_cancelled_by_admin';
  let variables: Record<string, unknown>;

  if (input.decision === 'APPROVED') {
    templateCode = 'exercise_request_approved';
    variables = {
      recipientName: beneEmail.fullName,
      requestNumber,
      awardNumber,
      units: Number(exercise.units_to_exercise),
      planType,
      strikePrice: Number(exercise.exercise_price_per_unit),
      totalCost: Number(exercise.total_exercise_amount ?? 0),
      bankIban: org?.bank_iban ?? null,
      bankBic: org?.bank_bic ?? null,
      bankName: org?.bank_name ?? null,
      orgName,
      paymentDeadlineDays: input.paymentDeadlineDays ?? 30,
      exerciseUrl,
    };
  } else if (input.decision === 'REJECTED') {
    templateCode = 'exercise_request_rejected';
    variables = {
      recipientName: beneEmail.fullName,
      requestNumber,
      awardNumber,
      approverName: input.approverName ?? 'Un approbateur',
      stepName: input.stepName ?? 'Validation',
      reason: input.reason ?? 'Aucune raison fournie',
      adminContactEmail: null,
      awardUrl,
    };
  } else {
    templateCode = 'exercise_request_cancelled_by_admin';
    variables = {
      recipientName: beneEmail.fullName,
      requestNumber,
      awardNumber,
      adminName: input.adminName ?? 'Un administrateur',
      reason: input.reason ?? 'Aucune raison fournie',
      awardUrl,
    };
  }

  const res = await insertNotificationWithRender({
    orgId: exercise.org_id,
    templateCode,
    channel: 'EMAIL',
    recipientEmail: beneEmail.email,
    beneficiaryId: beneficiary?.id ?? null,
    userId: beneficiary?.user_id ?? null,
    relatedEntityType: 'exercise_request',
    relatedEntityId: exercise.id,
    variables,
  });

  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, notificationId: res.notificationId };
}

// ---------------------------------------------------------------------------
// 3. notifyBeneficiaryOfExercisePayment
// ---------------------------------------------------------------------------

/**
 * Notifie le bénéficiaire que son paiement a été reçu — il est désormais
 * actionnaire. Inclut la date de réception et le montant.
 */
export async function notifyBeneficiaryOfExercisePayment(input: {
  exerciseRequestId: string;
}): Promise<NotifyOk<{ notificationId: string | null }> | NotifyErr> {
  const bundle = await loadExerciseBundle(input.exerciseRequestId);
  if (!bundle) return { ok: false, error: 'Exercise request introuvable' };

  const { exercise, award, plan, org, beneficiary } = bundle;
  const beneEmail = await resolveBeneficiaryEmail(beneficiary);
  if (!beneEmail.email) {
    console.warn(
      `[notifyBeneficiaryOfExercisePayment] beneficiary ${beneficiary?.id ?? '?'} has no email — skipping`,
    );
    return { ok: true, notificationId: null };
  }

  const confirmedAt =
    exercise.completed_at ?? exercise.payment_received_at ?? new Date().toISOString();
  const totalAmount = Number(
    exercise.payment_amount_received ?? exercise.total_exercise_amount ?? 0,
  );

  const res = await insertNotificationWithRender({
    orgId: exercise.org_id,
    templateCode: 'exercise_payment_confirmed',
    channel: 'EMAIL',
    recipientEmail: beneEmail.email,
    beneficiaryId: beneficiary?.id ?? null,
    userId: beneficiary?.user_id ?? null,
    relatedEntityType: 'exercise_request',
    relatedEntityId: exercise.id,
    variables: {
      recipientName: beneEmail.fullName,
      requestNumber: exercise.request_number ?? exercise.id.slice(0, 8),
      awardNumber: award?.award_number ?? '—',
      units: Number(exercise.units_to_exercise),
      planType: plan?.plan_type ?? 'Plan',
      totalAmount,
      paymentReference: exercise.payment_reference ?? exercise.request_number ?? '—',
      confirmedAt,
      orgName: org?.name ?? '—',
      exerciseUrl: `${APP_URL}/portal/exercises/${exercise.id}`,
    },
  });

  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, notificationId: res.notificationId };
}
