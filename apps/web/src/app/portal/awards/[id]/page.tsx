import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Calculator, TrendingUp } from 'lucide-react';
import { EditorialAwardHero } from '../../components/EditorialAwardHero';
import { EditorialVestingSection } from '../../components/EditorialVestingSection';
import { VestingTranchesTable } from '../../components/VestingTranchesTable';
import { PortalDocumentsList } from '../../components/PortalDocumentsList';
import { EditorialLeaverSimulator } from '../../components/EditorialLeaverSimulator';
import { buildVestingTimeline } from '@/lib/portal/vesting';
import { computeMaxUnitsAvailable } from '@/components/exercises/format-helpers';
import {
  AwardPortalDetailError,
  getAwardPortalDetail,
  getPortalDashboard,
} from '@/server/queries/portal';

/**
 * Module 8 B3 + Étape 14 Design System V1 — Page détail award portail.
 *
 * Refonte editorial :
 *   - Hero typographique 3 lignes (EditorialAwardHero) : breadcrumb +
 *     overline + titre Fraunces + TitleRule + StatusBadges + 3 cards
 *     adaptatives (Card 2 conditionnelle à 3 niveaux : exercise_price /
 *     grant_date / status)
 *   - Calendrier de vesting (EditorialVestingSection) : VestingTimeline
 *     DS V1 mode simplified (labels mois courts) + tableau tranches
 *     en dessous
 *   - Simulateur de départ (LeaverSimulator inchangé V1, refonte dark
 *     theme reportée au commit 4)
 *   - Documents (PortalDocumentsList inchangé)
 *   - Conditions de performance (read-only V1, restylé editorial)
 *
 * **Aucun calcul de gain en €** (interdit spec Module 8 §1111).
 */
export default async function PortalAwardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Charge en parallèle : detail (RPC sécurisé) + dashboard (pour org.name
  // utilisé par le simulator dark theme). Le RPC dashboard est cheap (1
  // round-trip) et déjà autorisé pour le bénéficiaire courant.
  let detail;
  let orgName = '';
  try {
    const [detailResult, dashboard] = await Promise.all([
      getAwardPortalDetail(id),
      getPortalDashboard().catch(() => null),
    ]);
    detail = detailResult;
    orgName = dashboard?.org.name ?? '';
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

  const fromSnapshot = timeline.length > 0 && timeline[0]?.fromSnapshot === true;

  // CTAs exercise — disponible pour BSPCE/SO/BSA uniquement (pas AGA),
  // et seulement si l'award est en statut exerçable.
  const isExercisablePlanType = ['BSPCE', 'STOCK_OPTION', 'BSA'].includes(plan.plan_type);
  const isExercisableStatus = [
    'GRANTED',
    'VESTING',
    'PARTIALLY_VESTED',
    'FULLY_VESTED',
    'PARTIALLY_EXERCISED',
  ].includes(award.status);
  const showExerciseCTA = isExercisablePlanType && isExercisableStatus;
  const unitsAvailable = computeMaxUnitsAvailable(
    Number(award.units_granted),
    Number(award.units_exercised),
    award.vesting_schedule_snapshot,
  );
  const canExerciseNow = showExerciseCTA && unitsAvailable > 0;

  return (
    <div className="space-y-12" data-testid="portal-award-detail">
      {/* Hero éditorial — 3 lignes typographiques + 3 cards adaptatives */}
      <EditorialAwardHero
        awardNumber={award.award_number}
        awardStatus={award.status}
        unitsGranted={Number(award.units_granted)}
        unitsVested={unitsVested}
        exercisePrice={award.exercise_price ?? null}
        grantDate={award.grant_date}
        planName={plan.name}
        planType={plan.plan_type}
        timeline={timeline}
      />

      {/* CTAs — Exercise (Module 9 B3, BSPCE/SO/BSA uniquement) */}
      {showExerciseCTA && (
        <section className="space-y-4" data-testid="exercise-cta-section">
          <header>
            <p className="text-overline text-brass-500">EXERCISE · DE VOS TITRES</p>
            <h2 className="text-h3 text-ink-900 mt-1">Convertir vos unités en actions</h2>
          </header>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Tax simulator — toujours accessible (exploration sans engagement) */}
            <Link
              href={`/portal/awards/${award.id}/tax-simulator`}
              className="border-paper-300 bg-paper-50 hover:border-brass-500 hover:bg-brass-50 group rounded-lg border p-6 transition-colors"
              data-testid="cta-tax-simulator"
            >
              <div className="flex items-start gap-4">
                <div className="bg-paper-100 group-hover:bg-brass-100 rounded-md p-2 transition-colors">
                  <Calculator
                    className="text-ink-700 group-hover:text-brass-700 size-5"
                    strokeWidth={1.5}
                  />
                </div>
                <div className="flex-1">
                  <p className="text-overline text-ink-500">SIMULER · D'ABORD</p>
                  <h3 className="text-ink-900 group-hover:text-brass-700 mt-1 text-base font-medium">
                    Simulateur fiscal
                  </h3>
                  <p className="text-ink-500 mt-2 text-sm leading-relaxed">
                    Explorez 5 scénarios de prix de cession (50 / 75 / 100 / 150 / 200 % de la FMV)
                    sans créer de demande. Idéal pour comparer le net après impôt.
                  </p>
                </div>
              </div>
            </Link>

            {/* Demande d'exercice — désactivé si 0 unités vested */}
            {canExerciseNow ? (
              <Link
                href={`/portal/awards/${award.id}/exercise/new`}
                className="border-paper-300 bg-paper-50 hover:border-brass-500 hover:bg-brass-50 group rounded-lg border p-6 transition-colors"
                data-testid="cta-exercise-new"
              >
                <div className="flex items-start gap-4">
                  <div className="bg-paper-100 group-hover:bg-brass-100 rounded-md p-2 transition-colors">
                    <TrendingUp
                      className="text-ink-700 group-hover:text-brass-700 size-5"
                      strokeWidth={1.5}
                    />
                  </div>
                  <div className="flex-1">
                    <p className="text-overline text-ink-500">DEMANDER · L'EXERCICE</p>
                    <h3 className="text-ink-900 group-hover:text-brass-700 mt-1 text-base font-medium">
                      Créer une demande
                    </h3>
                    <p className="text-ink-500 mt-2 text-sm leading-relaxed">
                      Soumettez une demande pour exercer tout ou partie de vos {unitsAvailable}{' '}
                      unités acquises. Workflow d'approbation puis émission du bulletin de
                      souscription.
                    </p>
                  </div>
                </div>
              </Link>
            ) : (
              <div
                className="border-paper-300 bg-paper-50 cursor-not-allowed rounded-lg border p-6 opacity-60"
                data-testid="cta-exercise-disabled"
              >
                <div className="flex items-start gap-4">
                  <div className="bg-paper-100 rounded-md p-2">
                    <TrendingUp className="text-ink-500 size-5" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1">
                    <p className="text-overline text-ink-500">DEMANDER · L'EXERCICE</p>
                    <h3 className="text-ink-500 mt-1 text-base font-medium">
                      Aucune unité disponible
                    </h3>
                    <p className="text-ink-500 mt-2 text-sm leading-relaxed">
                      Aucune unité acquise (vested) à ce jour. La prochaine tranche se déverrouille
                      à la date indiquée dans votre calendrier d'acquisition. Vous pouvez explorer
                      le simulateur fiscal pour anticiper.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Section 1 — Calendrier de vesting (VestingTimeline DS V1 simplified) */}
      <EditorialVestingSection
        timeline={timeline}
        unitsGranted={Number(award.units_granted)}
        grantDate={award.grant_date}
        fromSnapshot={fromSnapshot}
      />

      {/* Tableau détaillé des tranches */}
      <section className="space-y-4">
        <header>
          <p className="text-overline text-brass-500">DÉTAIL · DES TRANCHES</p>
          <h2 className="text-h3 text-ink-900 mt-1">Tableau d&apos;acquisition</h2>
        </header>
        <div className="bg-paper-50 border-paper-300 rounded-lg border p-4 sm:p-6">
          <VestingTranchesTable timeline={timeline} />
        </div>
      </section>

      {/* Section 2 — Simulateur de départ (EditorialLeaverSimulator dark theme) */}
      <section className="space-y-4">
        <EditorialLeaverSimulator
          awardId={award.id}
          planType={plan.plan_type}
          leaverRulesSnapshot={award.leaver_rules_snapshot}
          unitsGranted={Number(award.units_granted)}
          orgName={orgName || 'votre société'}
        />
      </section>

      {/* Section 3 — Documents */}
      <section className="space-y-4">
        <header>
          <p className="text-overline text-brass-500">DOCUMENTS · CONTRACTUELS</p>
          <h2 className="text-h3 text-ink-900 mt-1">PDF signés à votre disposition</h2>
        </header>
        <PortalDocumentsList documents={documents} />
      </section>

      {/* Section 4 — Performance conditions (read-only V1) */}
      {performance_conditions && performance_conditions.length > 0 ? (
        <section className="space-y-4">
          <header>
            <p className="text-overline text-brass-500">CONDITIONS · DE PERFORMANCE</p>
            <h2 className="text-h3 text-ink-900 mt-1">
              {performance_conditions.length}{' '}
              {performance_conditions.length > 1 ? 'critères' : 'critère'} à atteindre
            </h2>
          </header>
          <div className="bg-paper-50 border-paper-300 rounded-lg border p-6">
            <ul className="divide-paper-300 -mx-2 divide-y">
              {performance_conditions.map(
                (c: { id?: string; name: string; threshold?: number | null }, idx: number) => (
                  <li
                    key={c.id ?? idx}
                    className="flex items-baseline justify-between gap-3 px-2 py-3"
                  >
                    <span className="text-ink-900 text-sm font-medium">{c.name}</span>
                    {c.threshold != null ? (
                      <span className="text-ink-500 font-mono text-xs tabular-nums">
                        Seuil · {c.threshold}
                      </span>
                    ) : null}
                  </li>
                ),
              )}
            </ul>
            <p className="text-ink-500 mt-4 font-mono text-xs">
              ⚠ Le suivi en temps réel des conditions de performance sera disponible prochainement.
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
