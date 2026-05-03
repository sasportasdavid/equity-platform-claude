import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { EditorialLeaverSimulator } from '@/app/portal/components/EditorialLeaverSimulator';

export const metadata = { title: 'Dev — Portal LeaverSimulator Preview' };

/**
 * Sandbox /dev/design/portal-leaver-preview — Étape 14 commit 7/7+.
 *
 * Rend l'EditorialLeaverSimulator dark theme avec un snapshot
 * leaver_rules_snapshot mocké pour valider visuellement :
 *   - Card extérieure ink-900 + paper-50 form interne (variante semi-dark)
 *   - Phrase éditoriale dynamique serif italic brass-500
 *   - Form fields lisibles (date picker + select + focus ring)
 *   - Bouton brass-500 disabled si form incomplet
 *
 * **Le bouton "Simuler" appelle simulateLeaverScenario (Server Action)
 * qui fonctionne en sandbox uniquement si l'user a une session
 * bénéficiaire active. Pour le test visuel pur, ne pas cliquer.**
 */

const MOCK_LEAVER_RULES_SNAPSHOT = [
  {
    leaver_type: 'resignation',
    treatment: 'forfeit_all',
    acceleration_months: null,
    exercise_window_days: null,
  },
  {
    leaver_type: 'mutual_agreement',
    treatment: 'pro_rata',
    acceleration_months: null,
    exercise_window_days: 90,
  },
  {
    leaver_type: 'termination_no_cause',
    treatment: 'keep_vested',
    acceleration_months: null,
    exercise_window_days: 180,
  },
  {
    leaver_type: 'company_sale',
    treatment: 'full_accelerate',
    acceleration_months: null,
    exercise_window_days: 365,
  },
  {
    leaver_type: 'death',
    treatment: 'keep_vested',
    acceleration_months: 12,
    exercise_window_days: 365,
  },
];

export default function PortalLeaverPreviewPage() {
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
          EditorialLeaverSimulator{' '}
          <span className="serif-italic text-brass-500">dark theme semi-dark</span>
        </h1>
        <div className="bg-brass-500 animate-draw-line mt-3 h-[2px] w-16" aria-hidden="true" />
        <p className="text-ink-500 mt-3 max-w-3xl text-sm leading-relaxed">
          Variante semi-dark : card extérieure{' '}
          <code className="bg-paper-200 rounded px-1 font-mono">bg-ink-900</code> + zone form{' '}
          <code className="bg-paper-200 rounded px-1 font-mono">paper-50</code> claire pour
          préserver l&apos;utilisabilité du date picker natif et du select natif. Le bouton
          «&nbsp;Simuler&nbsp;» fait un appel Server Action live — ne pas cliquer dans la sandbox
          (la session admin Capiwise ne déclenchera pas de simulation valide).
        </p>
      </header>

      <div className="mx-auto max-w-5xl space-y-12 p-6 sm:p-8">
        <EditorialLeaverSimulator
          awardId="award-mock-uuid-here"
          planType="BSPCE"
          leaverRulesSnapshot={MOCK_LEAVER_RULES_SNAPSHOT}
          unitsGranted={1200}
          orgName="Paragraphe SAS"
        />
      </div>
    </div>
  );
}
