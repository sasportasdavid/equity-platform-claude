import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { EditorialAwardHero } from '@/app/portal/components/EditorialAwardHero';
import { EditorialVestingSection } from '@/app/portal/components/EditorialVestingSection';
import type { VestingTimelineEntry } from '@/lib/portal/vesting';

export const metadata = { title: 'Dev — Portal Award Detail Preview' };

/**
 * Sandbox /dev/design/portal-award-detail-preview — Étape 14 commit 7/7.
 *
 * Rend la vue détail award du portail bénéficiaire (mockup 2 §4.3) avec
 * fixtures inline. Couvre :
 *   - EditorialAwardHero : 3 lignes Fraunces + 3 cards adaptatives
 *     (Card 2 conditionnelle exercise_price → date_attribution → status)
 *   - EditorialVestingSection : VestingTimeline simplified (mode portail)
 *   - LeaverSimulator : non rendu ici (nécessite Server Action live).
 *     Visuel disponible sur la vraie route /portal/awards/[id] avec
 *     session active.
 *
 * Couvre 3 cas Card 2 selon mockup user :
 *   - BSPCE avec exercise_price 24 € → "PRIX · D'EXERCICE"
 *   - AGA sans exercise_price, status='GRANTED' → "DATE · D'ATTRIBUTION"
 *   - PHANTOM cancelled (sans exercise_price ni GRANTED) → "STATUT"
 */

const TIMELINE_BSPCE_VESTING_ACTIVE: VestingTimelineEntry[] = [
  {
    date: '2027-01-15',
    unitsToVest: 300,
    unitsVested: 300,
    status: 'VESTED',
    performanceMultiplier: 1,
    fromSnapshot: true,
  },
  {
    date: '2028-01-15',
    unitsToVest: 300,
    unitsVested: 300,
    status: 'VESTED',
    performanceMultiplier: 1,
    fromSnapshot: true,
  },
  {
    date: '2029-01-15',
    unitsToVest: 300,
    unitsVested: 0,
    status: 'PENDING',
    performanceMultiplier: 1,
    fromSnapshot: true,
  },
  {
    date: '2030-01-15',
    unitsToVest: 300,
    unitsVested: 0,
    status: 'PENDING',
    performanceMultiplier: 1,
    fromSnapshot: true,
  },
];

const TIMELINE_AGA_PRE_CLIFF: VestingTimelineEntry[] = [
  {
    date: '2026-09-10',
    unitsToVest: 200,
    unitsVested: 0,
    status: 'PENDING',
    performanceMultiplier: 1,
    fromSnapshot: true,
  },
  {
    date: '2027-09-10',
    unitsToVest: 200,
    unitsVested: 0,
    status: 'PENDING',
    performanceMultiplier: 1,
    fromSnapshot: true,
  },
  {
    date: '2028-09-10',
    unitsToVest: 200,
    unitsVested: 0,
    status: 'PENDING',
    performanceMultiplier: 1,
    fromSnapshot: true,
  },
  {
    date: '2029-09-10',
    unitsToVest: 200,
    unitsVested: 0,
    status: 'PENDING',
    performanceMultiplier: 1,
    fromSnapshot: true,
  },
];

export default function PortalAwardDetailPreviewPage() {
  return (
    <div className="bg-paper-100 min-h-screen">
      <header className="border-paper-300 border-b px-6 py-4">
        <Link
          href="/dev/design"
          className="text-ink-500 hover:text-ink-900 inline-flex items-center text-sm"
        >
          <ArrowLeft className="mr-2 size-4" />
          /dev/design
        </Link>
        <p className="text-overline text-brass-500 mt-3">DESIGN SYSTEM V1 · SANDBOX</p>
        <h1 className="text-h1 text-ink-900">
          Portal award detail{' '}
          <span className="serif-italic text-brass-500">3 cas Card 2 conditionnelle</span>
        </h1>
        <div className="bg-brass-500 animate-draw-line mt-3 h-[2px] w-16" aria-hidden="true" />
        <p className="text-ink-500 mt-3 text-sm">
          LeaverSimulator dark theme : disponible sur{' '}
          <code className="bg-paper-200 rounded px-1 font-mono">/portal/awards/[id]</code>{' '}
          (nécessite session bénéficiaire). Sa logique nécessite une Server Action live.
        </p>
      </header>

      <div className="mx-auto max-w-5xl space-y-16 p-6 sm:p-8">
        {/* Cas 1 — BSPCE vesting actif (Card 2 = PRIX D'EXERCICE) */}
        <section className="space-y-6">
          <div className="border-paper-300 border-l-[3px] pl-4">
            <p className="text-overline text-brass-500">CAS 1 · BSPCE</p>
            <h2 className="text-h2 text-ink-900">
              Card 2 → <span className="serif-italic text-brass-500">PRIX D&apos;EXERCICE</span>
            </h2>
            <p className="text-ink-500 mt-2 text-sm">
              BSPCE avec exercise_price = 24 €. La Card 2 affiche le prix d&apos;exercice (le plus
              actionnable pour ce type de plan).
            </p>
          </div>
          <EditorialAwardHero
            awardNumber="A-001234"
            awardStatus="VESTING"
            unitsGranted={1200}
            unitsVested={600}
            exercisePrice={24}
            grantDate="2026-01-15"
            planName="BSPCE-2026-001 · Tranche A"
            planType="BSPCE"
            timeline={TIMELINE_BSPCE_VESTING_ACTIVE}
          />
          <EditorialVestingSection
            timeline={TIMELINE_BSPCE_VESTING_ACTIVE}
            unitsGranted={1200}
            grantDate="2026-01-15"
            fromSnapshot
          />
        </section>

        {/* Cas 2 — AGA pré-cliff status=GRANTED (Card 2 = DATE D'ATTRIBUTION) */}
        <section className="space-y-6">
          <div className="border-paper-300 border-l-[3px] pl-4">
            <p className="text-overline text-brass-500">CAS 2 · AGA</p>
            <h2 className="text-h2 text-ink-900">
              Card 2 → <span className="serif-italic text-brass-500">DATE D&apos;ATTRIBUTION</span>
            </h2>
            <p className="text-ink-500 mt-2 text-sm">
              AGA sans exercise_price, status=GRANTED. La Card 2 swap pour la date d&apos;octroi (la
              question naturelle pour une AGA).
            </p>
          </div>
          <EditorialAwardHero
            awardNumber="A-001235"
            awardStatus="GRANTED"
            unitsGranted={800}
            unitsVested={0}
            exercisePrice={null}
            grantDate="2025-09-10"
            planName="AGA-2025-014 · Direction Ops"
            planType="AGA"
            timeline={TIMELINE_AGA_PRE_CLIFF}
          />
          <EditorialVestingSection
            timeline={TIMELINE_AGA_PRE_CLIFF}
            unitsGranted={800}
            grantDate="2025-09-10"
            fromSnapshot
          />
        </section>

        {/* Cas 3 — PHANTOM cancelled (Card 2 = STATUT) */}
        <section className="space-y-6">
          <div className="border-paper-300 border-l-[3px] pl-4">
            <p className="text-overline text-brass-500">CAS 3 · PHANTOM ANNULÉ</p>
            <h2 className="text-h2 text-ink-900">
              Card 2 → <span className="serif-italic text-brass-500">STATUT</span>
            </h2>
            <p className="text-ink-500 mt-2 text-sm">
              PHANTOM sans exercise_price, status=CANCELLED. La Card 2 affiche le StatusBadge actuel
              (la question naturelle : « où en est mon attribution ? »).
            </p>
          </div>
          <EditorialAwardHero
            awardNumber="A-001237"
            awardStatus="CANCELLED"
            unitsGranted={300}
            unitsVested={0}
            exercisePrice={null}
            grantDate="2024-12-01"
            planName="PHANTOM-2024-006 · Cadres dirigeants"
            planType="PHANTOM"
            timeline={[]}
          />
        </section>
      </div>
    </div>
  );
}
