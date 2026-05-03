import Link from 'next/link';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { AwardSummaryCard } from '@/app/portal/components/AwardSummaryCard';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Dev — Portal Awards Preview' };

/**
 * Sandbox /dev/design/portal-awards-preview — Étape 14 commit 7/7.
 *
 * Rend la liste des awards du portail bénéficiaire (mockup 2) avec
 * fixtures inline pour validation visuelle sans session bénéficiaire
 * authentifiée.
 *
 * Couvert :
 * - Hero typographique (overline + h1 Fraunces avec accent serif italic
 *   + TitleRule + subtitle org.name)
 * - 4 AwardSummaryCard variées (BSPCE / AGA / STOCK_OPTION / RSU)
 * - Bandeau profil incomplet en option
 */

const FIXTURES = [
  {
    id: 'a1',
    award_number: 'A-001234',
    plan_name: 'BSPCE-2026-001 · Tranche A',
    plan_type: 'BSPCE',
    units_granted: 1200,
    units_vested: 600,
    exercise_price: 24,
    grant_date: '2026-01-15',
  },
  {
    id: 'a2',
    award_number: 'A-001235',
    plan_name: 'AGA-2025-014 · Direction Ops',
    plan_type: 'AGA',
    units_granted: 800,
    units_vested: 200,
    exercise_price: null,
    grant_date: '2025-09-10',
  },
  {
    id: 'a3',
    award_number: 'A-001236',
    plan_name: 'SO-2024-002 · Founders pool',
    plan_type: 'STOCK_OPTION',
    units_granted: 5000,
    units_vested: 5000,
    exercise_price: 12,
    grant_date: '2024-04-15',
  },
  {
    id: 'a4',
    award_number: 'A-001237',
    plan_name: 'RSU-2026-008 · Talent Q2',
    plan_type: 'RSU',
    units_granted: 400,
    units_vested: 0,
    exercise_price: null,
    grant_date: '2026-04-01',
  },
];

export default function PortalAwardsPreviewPage() {
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
          Portal awards <span className="serif-italic text-brass-500">liste bénéficiaire</span>
        </h1>
        <div className="bg-brass-500 animate-draw-line mt-3 h-[2px] w-16" aria-hidden="true" />
      </header>

      <div className="mx-auto max-w-5xl space-y-8 p-6 sm:p-8">
        {/* Hero éditorial */}
        <header className="space-y-2">
          <p className="text-overline text-brass-500">VOS ATTRIBUTIONS</p>
          <h1 className="text-h1 text-ink-900">
            Bonjour Marie,{' '}
            <span className="serif-italic text-brass-500">voici votre capital partagé</span>
          </h1>
          <div className="bg-brass-500 animate-draw-line mt-3 h-[2px] w-16" aria-hidden="true" />
          <p className="text-ink-500 mt-3 max-w-2xl text-sm leading-relaxed">
            Plans d&apos;actionnariat salarié attribués par{' '}
            <span className="text-ink-900 font-medium">Paragraphe SAS</span>. Vos unités vous sont
            remises selon le calendrier de vesting défini dans votre contrat.
          </p>
        </header>

        {/* Bandeau profil incomplet (variant éditorial) */}
        <div className="border-saffron-500 bg-saffron-50 flex items-start gap-3 rounded-md border-l-[3px] p-4">
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
          <Link href="#" className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}>
            Compléter
          </Link>
        </div>

        {/* Grid des 4 awards */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {FIXTURES.map((a) => (
            <AwardSummaryCard
              key={a.id}
              awardId={a.id}
              awardNumber={a.award_number}
              planName={a.plan_name}
              planType={a.plan_type}
              unitsGranted={a.units_granted}
              unitsVested={a.units_vested}
              exercisePrice={a.exercise_price}
              grantDate={a.grant_date}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
