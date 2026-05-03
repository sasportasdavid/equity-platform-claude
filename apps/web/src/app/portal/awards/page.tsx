import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AwardSummaryCard } from '../components/AwardSummaryCard';
import { getPortalDashboard } from '@/server/queries/portal';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireUser } from '@/lib/auth/rbac';

/**
 * Module 8 B3 — Page liste awards portail (§4.2).
 *
 * Server Component qui :
 *   1. Charge le dashboard via RPC `get_beneficiary_portal_dashboard`
 *   2. Affiche un bandeau "Profil incomplet" si has_complete_profile=false
 *   3. Empty state si awards_count=0
 *   4. Sinon : grid de cards summary
 *
 * Le RPC charge units_vested cumulé en agrégeant `vesting_events`. En V1 où
 * les events ne sont pas matérialisés, units_vested = 0 (le RPC ne fait pas
 * le fallback snapshot — décision V1, le simulator B4 le fait). Pour avoir
 * un cumulé fidèle ici, on enrichit côté Server Component via un fallback :
 * pour chaque award où units_vested=0 ET vesting_events est vide, on calcule
 * le cumulé depuis le snapshot.
 *
 * Note : on ne refait pas le full RPC `get_award_portal_detail` par award
 * (trop coûteux). On charge en batch les snapshots manquants.
 */
export default async function PortalAwardsListPage() {
  const dashboard = await getPortalDashboard();
  const awards = dashboard.awards_summary ?? [];

  // Enrichissement units_vested : si units_vested=0 et qu'on a un snapshot
  // dans la table awards, calcule le cumulé "réalisé à aujourd'hui" depuis
  // le snapshot. Ça évite d'afficher 0% partout en V1.
  const enriched = awards.length > 0 ? await enrichWithSnapshotVested(awards) : [];

  const firstName =
    dashboard.beneficiary.full_name.split(' ')[0] ?? dashboard.beneficiary.full_name;

  return (
    <div className="space-y-8" data-testid="portal-awards-list">
      {/* Hero éditorial */}
      <header className="space-y-2">
        <p className="text-overline text-brass-500">VOS ATTRIBUTIONS</p>
        <h1 className="text-h1 text-ink-900">
          Bonjour {firstName},{' '}
          <span className="serif-italic text-brass-500">voici votre capital partagé</span>
        </h1>
        <div className="bg-brass-500 animate-draw-line mt-3 h-[2px] w-16" aria-hidden="true" />
        <p className="text-ink-500 mt-3 max-w-2xl text-sm leading-relaxed">
          Plans d&apos;actionnariat salarié attribués par{' '}
          <span className="text-ink-900 font-medium">{dashboard.org.name}</span>. Vos unités vous
          sont remises selon le calendrier de vesting défini dans votre contrat.
        </p>
      </header>

      {!dashboard.beneficiary.has_complete_profile ? (
        <div
          className="border-saffron-500 bg-saffron-50 flex items-start gap-3 rounded-md border-l-[3px] p-4"
          data-testid="portal-profile-incomplete-banner"
        >
          <AlertCircle className="text-saffron-700 size-5 shrink-0" strokeWidth={1.75} />
          <div className="flex-1 space-y-1">
            <p className="text-overline text-saffron-700">PROFIL · INCOMPLET</p>
            <p className="text-ink-900 text-sm font-medium">
              Quelques informations manquent pour exercer vos droits.
            </p>
            <p className="text-ink-700 text-xs">
              Adresse, résidence fiscale — ce sont les données que nous transmettons à
              l&apos;administration en cas d&apos;exercice.
            </p>
          </div>
          <Link
            href="/portal/profile/setup"
            className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}
          >
            Compléter
          </Link>
        </div>
      ) : null}

      {enriched.length === 0 ? (
        <div className="border-paper-300 bg-paper-50 rounded-lg border border-dashed p-12 text-center">
          <p className="serif-italic text-ink-500 text-base leading-relaxed">
            Aucune attribution active.
          </p>
          <p className="text-ink-500 mt-2 text-sm">
            Si vous attendez une attribution, contactez votre service RH.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {enriched.map((a) => (
            <AwardSummaryCard
              key={a.id}
              awardId={a.id}
              awardNumber={a.award_number}
              planName={a.plan_name}
              planType={a.plan_type}
              unitsGranted={a.units_granted}
              unitsVested={a.units_vested_effective}
              exercisePrice={a.exercise_price ?? null}
              grantDate={a.grant_date}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type EnrichedAward = {
  id: string;
  award_number: string;
  plan_name: string;
  plan_type: string;
  units_granted: number;
  units_vested_effective: number;
  exercise_price: string | number | null;
  grant_date: string;
};

/**
 * Pour chaque award résumé du RPC, charge `exercise_price` +
 * `vesting_schedule_snapshot` et calcule le cumul "vested at today" si
 * units_vested=0 (signe que les events ne sont pas matérialisés).
 */
async function enrichWithSnapshotVested(
  awards: NonNullable<Awaited<ReturnType<typeof getPortalDashboard>>['awards_summary']>,
): Promise<EnrichedAward[]> {
  const user = await requireUser();
  const admin = getSupabaseAdminClient();

  // On ne charge que les awards où le user est bénéficiaire (defense in depth)
  const ids = awards.map((a) => a.id);
  const { data: rows } = await admin
    .from('awards')
    .select(
      'id, exercise_price, vesting_schedule_snapshot, beneficiary_id, beneficiaries!inner(user_id)',
    )
    .in('id', ids)
    .eq('beneficiaries.user_id', user.id);

  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  const todayIso = new Date().toISOString().slice(0, 10);

  return awards.map((a: (typeof awards)[number]): EnrichedAward => {
    const row = byId.get(a.id);
    let effectiveVested = a.units_vested;
    if (effectiveVested === 0 && row?.vesting_schedule_snapshot) {
      // Fallback snapshot : sum percentage_of_award * units_granted pour
      // les tranches dont vesting_date <= today.
      type Tranche = { vesting_date: string; percentage_of_award: number };
      const snap = row.vesting_schedule_snapshot as { tranches?: Tranche[] };
      const tranches: Tranche[] = snap.tranches ?? [];
      effectiveVested = tranches
        .filter((t: Tranche) => t.vesting_date <= todayIso)
        .reduce(
          (acc: number, t: Tranche) =>
            acc + Math.round((Number(a.units_granted) * Number(t.percentage_of_award)) / 100),
          0,
        );
    }
    return {
      id: a.id,
      award_number: a.award_number,
      plan_name: a.plan_name,
      plan_type: a.plan_type,
      units_granted: Number(a.units_granted),
      units_vested_effective: effectiveVested,
      exercise_price: row?.exercise_price ?? null,
      grant_date: a.grant_date,
    };
  });
}
