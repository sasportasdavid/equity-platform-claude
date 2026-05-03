import { redirect } from 'next/navigation';
import { AwardPortalDetailError, getAwardPortalDetail } from '@/server/queries/portal';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/rbac';
import { ExerciseRequestForm } from '@/components/exercises/ExerciseRequestForm';

/**
 * Module 9 B3 — Page de création d'une demande d'exercice.
 *
 * Server Component qui charge l'award + check eligibility avant de
 * rendre le form client. Si non-eligible, redirige vers la page détail
 * award (ou portail profile si profil incomplet).
 */
export default async function NewExerciseRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ units?: string; cessionPrice?: string }>;
}) {
  const { id } = await params;
  const queryParams = await searchParams;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // Charge le détail award via RPC sécurisé
  let detail;
  try {
    detail = await getAwardPortalDetail(id);
  } catch (err) {
    if (err instanceof AwardPortalDetailError && err.code === 'NOT_FOUND') {
      redirect('/portal/awards');
    }
    throw err;
  }

  const { award, plan } = detail;

  // Eligibility checks
  if (plan.plan_type === 'AGA') {
    redirect(`/portal/awards/${id}?msg=aga-not-exercisable`);
  }

  const exercisableStatuses = [
    'GRANTED',
    'VESTING',
    'PARTIALLY_VESTED',
    'FULLY_VESTED',
    'PARTIALLY_EXERCISED',
  ];
  if (!exercisableStatuses.includes(award.status)) {
    redirect(`/portal/awards/${id}?msg=status-not-exercisable`);
  }

  // Récupère plan.company_id (pas dans PortalPlanSummary), puis FMV
  const { data: planRow } = await supabase
    .from('plans')
    .select('company_id')
    .eq('id', plan.id)
    .maybeSingle();

  const [{ data: company }, { data: bene }, { data: org }] = await Promise.all([
    planRow?.company_id
      ? supabase
          .from('companies')
          .select('last_known_fmv_per_share')
          .eq('id', planRow.company_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('beneficiaries')
      .select(
        'hire_date, first_name, last_name, address_line_1, country, tax_residence_country, org_id',
      )
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('organizations')
      .select('id, name, bank_iban, bank_bic, bank_name')
      .eq('id', user.activeOrgId ?? '')
      .maybeSingle(),
  ]);

  // Profil complet ? Sinon redirect vers /portal/profile
  if (
    !bene?.first_name ||
    !bene?.last_name ||
    !bene?.address_line_1 ||
    !bene?.country ||
    !bene?.tax_residence_country
  ) {
    redirect('/portal/profile?msg=complete-profile-first');
  }

  const fmvAtExercise =
    company?.last_known_fmv_per_share !== null && company?.last_known_fmv_per_share !== undefined
      ? Number(company.last_known_fmv_per_share)
      : 0;

  // Préfill depuis tax-simulator si query params présents
  const prefillUnits = queryParams.units ? Number(queryParams.units) : undefined;
  const prefillCessionPrice = queryParams.cessionPrice
    ? Number(queryParams.cessionPrice)
    : undefined;

  return (
    <div className="space-y-8" data-testid="exercise-new-page">
      <ExerciseRequestForm
        awardId={award.id}
        awardNumber={award.award_number}
        planType={plan.plan_type}
        planName={plan.name}
        attributionDate={award.grant_date}
        strikePrice={Number(award.exercise_price ?? 0)}
        unitsGranted={Number(award.units_granted)}
        unitsExercised={Number(award.units_exercised)}
        vestingSnapshot={award.vesting_schedule_snapshot}
        fmvAtExercise={fmvAtExercise}
        hireDate={bene?.hire_date ?? null}
        prefillUnits={prefillUnits}
        prefillCessionPrice={prefillCessionPrice}
        orgName={org?.name ?? null}
        bankIban={org?.bank_iban ?? null}
        bankBic={org?.bank_bic ?? null}
        bankName={org?.bank_name ?? null}
      />
    </div>
  );
}
