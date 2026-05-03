import { redirect } from 'next/navigation';
import { AwardPortalDetailError, getAwardPortalDetail } from '@/server/queries/portal';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/rbac';
import { TaxSimulator } from '@/components/exercises/TaxSimulator';

/**
 * Module 9 B3 — Page de simulation fiscale standalone.
 *
 * Permet d'explorer les scénarios sans engagement. Le bouton CTA final
 * redirige vers /portal/awards/[id]/exercise/new avec query params
 * pré-remplis.
 */
export default async function TaxSimulatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

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

  // Pour AGA on désactive l'accès au simulateur (régime non exerçable V1)
  if (plan.plan_type === 'AGA') {
    redirect(`/portal/awards/${id}?msg=aga-not-exercisable`);
  }

  const { data: planRow } = await supabase
    .from('plans')
    .select('company_id')
    .eq('id', plan.id)
    .maybeSingle();

  const [{ data: company }, { data: bene }] = await Promise.all([
    planRow?.company_id
      ? supabase
          .from('companies')
          .select('last_known_fmv_per_share')
          .eq('id', planRow.company_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('beneficiaries')
      .select('hire_date')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle(),
  ]);

  const fmvAtExercise =
    company?.last_known_fmv_per_share !== null && company?.last_known_fmv_per_share !== undefined
      ? Number(company.last_known_fmv_per_share)
      : 0;

  return (
    <div className="space-y-8" data-testid="tax-simulator-page">
      <TaxSimulator
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
      />
    </div>
  );
}
