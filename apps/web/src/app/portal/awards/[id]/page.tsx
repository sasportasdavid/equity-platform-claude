import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { AwardOverview } from '../../components/AwardOverview';
import { VestingChart } from '../../components/VestingChart';
import { VestingTranchesTable } from '../../components/VestingTranchesTable';
import { PortalDocumentsList } from '../../components/PortalDocumentsList';
import { LeaverSimulator } from '../../components/LeaverSimulator';
import { Card, CardContent } from '@/components/ui/card';
import { buildVestingTimeline } from '@/lib/portal/vesting';
import { AwardPortalDetailError, getAwardPortalDetail } from '@/server/queries/portal';

/**
 * Module 8 B3 — Page détail award portail (§4.3).
 *
 * Server Component qui appelle le RPC SECURITY DEFINER `get_award_portal_detail`
 * (Module 8 B1) pour charger en 1 round-trip :
 *   - L'award + plan
 *   - vesting_events (potentiellement vide)
 *   - leaver_rules (utilisé en B4 simulator, pas en B3)
 *   - performance_conditions
 *   - documents SIGNED
 *
 * 4 sections rendues stack (pas de tabs V1) :
 *   1. Synthèse (4 cards stat)
 *   2. Calendrier de vesting (chart Recharts + table tranches)
 *   3. Documents (PDFs signés + bouton télécharger)
 *   4. Conditions de performance (read-only V1)
 *
 * Section "Simulateur de départ" reportée à B4.
 */
export default async function PortalAwardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let detail;
  try {
    detail = await getAwardPortalDetail(id);
  } catch (err) {
    if (err instanceof AwardPortalDetailError && err.code === 'NOT_FOUND') {
      notFound();
    }
    throw err;
  }

  const { award, plan, vesting_events, performance_conditions, documents } = detail;

  // Build vesting timeline (avec fallback snapshot si events vides)
  const timeline = buildVestingTimeline(
    Number(award.units_granted),
    vesting_events,
    award.vesting_schedule_snapshot,
  );

  // unitsVested cumulé "à aujourd'hui" depuis la timeline (cumul VESTED)
  const unitsVested = timeline.reduce(
    (acc, e) => acc + (e.status === 'VESTED' ? e.unitsVested : 0),
    0,
  );

  return (
    <div className="space-y-8" data-testid="portal-award-detail">
      {/* Breadcrumb + title */}
      <div className="space-y-3">
        <Link
          href="/portal/awards"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" />
          Mes attributions
        </Link>
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{plan.name}</h1>
          <span className="text-muted-foreground font-mono text-xs">{award.award_number}</span>
          <span className="bg-muted text-foreground rounded px-2 py-0.5 font-mono text-[11px] font-semibold">
            {plan.plan_type}
          </span>
        </div>
        {plan.description ? (
          <p className="text-muted-foreground text-sm">{plan.description}</p>
        ) : null}
      </div>

      {/* Section 1 — Synthèse */}
      <section className="space-y-3">
        <AwardOverview
          unitsGranted={Number(award.units_granted)}
          unitsVested={unitsVested}
          exercisePrice={award.exercise_price ?? null}
          grantDate={award.grant_date}
        />
      </section>

      {/* Section 2 — Vesting */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Calendrier d&apos;acquisition</h2>
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <VestingChart timeline={timeline} />
            <VestingTranchesTable timeline={timeline} />
          </CardContent>
        </Card>
        {timeline.length > 0 && timeline[0]?.fromSnapshot ? (
          <p className="text-muted-foreground text-xs">
            Calendrier indicatif basé sur le contrat. Les unités seront officiellement acquises
            selon les dates affichées.
          </p>
        ) : null}
      </section>

      {/* Section 3 — Simulateur de départ (Module 8 B4) */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Simulateur de départ</h2>
        <LeaverSimulator
          awardId={award.id}
          planType={plan.plan_type}
          leaverRulesSnapshot={award.leaver_rules_snapshot}
          unitsGranted={Number(award.units_granted)}
        />
      </section>

      {/* Section 4 — Documents */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Documents</h2>
        <PortalDocumentsList documents={documents} />
      </section>

      {/* Section 5 — Performance conditions (read-only V1) */}
      {performance_conditions && performance_conditions.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Conditions de performance</h2>
          <Card>
            <CardContent className="space-y-3 p-4 sm:p-6">
              <ul className="space-y-2 text-sm">
                {performance_conditions.map(
                  (c: { id?: string; name: string; threshold?: number | null }, idx: number) => (
                    <li key={c.id ?? idx} className="flex items-baseline justify-between gap-3">
                      <span className="font-medium">{c.name}</span>
                      {c.threshold != null ? (
                        <span className="text-muted-foreground tabular-nums">
                          Seuil : {c.threshold}
                        </span>
                      ) : null}
                    </li>
                  ),
                )}
              </ul>
              <p className="text-muted-foreground text-xs">
                Le suivi en temps réel des conditions de performance sera disponible prochainement.
              </p>
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
