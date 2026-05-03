import { VestingTimeline, type VestingTimelineTranche } from '@/components/awards/vesting-timeline';
import { Card, CardContent } from '@/components/ui/card';

export const metadata = { title: 'Dev — VestingTimeline' };

/**
 * Sandbox /dev/design/vesting-timeline — Module Design System V1, Étape 9.
 *
 * 3 états du composant VestingTimeline (SVG natif, pas Recharts) :
 *
 * 1. **Pré-cliff** (mockup 4) : aucune tranche acquise, ligne TODAY
 *    avant la première tranche. Frise hachurée "À acquérir" + tick
 *    cliff visible.
 * 2. **Vesting actif** (cas usuel) : 2 tranches sur 4 vested, today
 *    entre la 2e et la 3e tranche. Zone "Acquis" + zone "En cours" +
 *    zone "À acquérir".
 * 3. **Fully-vested** (cas edge) : toutes tranches vested, today à
 *    100 %. Frise toute en bond-500.
 *
 * **Bonus 4e cas** : avec une tranche conditionnelle (perf. ARR ≥ 12 M€)
 * pour démontrer la zone "Conditionnel" pointillée brass.
 */

const FIXED_TODAY = '2026-05-02';

// CAS 1 — pré-cliff
const preCliff: VestingTimelineTranche[] = [
  {
    vestingDate: '2027-03-15',
    unitsToVest: 1050,
    cumulativePct: 25,
    cumulativeUnits: 1050,
    status: 'PENDING',
  },
  {
    vestingDate: '2028-03-15',
    unitsToVest: 1050,
    cumulativePct: 50,
    cumulativeUnits: 2100,
    status: 'PENDING',
  },
  {
    vestingDate: '2029-03-15',
    unitsToVest: 1050,
    cumulativePct: 75,
    cumulativeUnits: 3150,
    status: 'PENDING',
  },
  {
    vestingDate: '2030-03-15',
    unitsToVest: 1050,
    cumulativePct: 100,
    cumulativeUnits: 4200,
    status: 'PENDING',
  },
];

// CAS 2 — vesting actif
const vestingActif: VestingTimelineTranche[] = [
  {
    vestingDate: '2024-09-01',
    unitsToVest: 250,
    cumulativePct: 25,
    cumulativeUnits: 250,
    status: 'VESTED',
  },
  {
    vestingDate: '2025-09-01',
    unitsToVest: 250,
    cumulativePct: 50,
    cumulativeUnits: 500,
    status: 'VESTED',
  },
  {
    vestingDate: '2026-09-01',
    unitsToVest: 250,
    cumulativePct: 75,
    cumulativeUnits: 750,
    status: 'PENDING',
  },
  {
    vestingDate: '2027-09-01',
    unitsToVest: 250,
    cumulativePct: 100,
    cumulativeUnits: 1000,
    status: 'PENDING',
  },
];

// CAS 3 — fully-vested
const fullyVested: VestingTimelineTranche[] = [
  {
    vestingDate: '2020-12-01',
    unitsToVest: 500,
    cumulativePct: 25,
    cumulativeUnits: 500,
    status: 'VESTED',
  },
  {
    vestingDate: '2021-12-01',
    unitsToVest: 500,
    cumulativePct: 50,
    cumulativeUnits: 1000,
    status: 'VESTED',
  },
  {
    vestingDate: '2022-12-01',
    unitsToVest: 500,
    cumulativePct: 75,
    cumulativeUnits: 1500,
    status: 'VESTED',
  },
  {
    vestingDate: '2023-12-01',
    unitsToVest: 500,
    cumulativePct: 100,
    cumulativeUnits: 2000,
    status: 'VESTED',
  },
];

// CAS 4 — avec performance condition
const withPerf: VestingTimelineTranche[] = [
  {
    vestingDate: '2024-06-01',
    unitsToVest: 250,
    cumulativePct: 25,
    cumulativeUnits: 250,
    status: 'VESTED',
  },
  {
    vestingDate: '2025-06-01',
    unitsToVest: 250,
    cumulativePct: 50,
    cumulativeUnits: 500,
    status: 'VESTED',
  },
  {
    vestingDate: '2026-12-01',
    unitsToVest: 250,
    cumulativePct: 75,
    cumulativeUnits: 750,
    status: 'PENDING',
    hasPerformanceCondition: true,
    conditionLabel: 'Conditionnel · perf. ARR ≥ 12 M€',
  },
  {
    vestingDate: '2027-12-01',
    unitsToVest: 250,
    cumulativePct: 100,
    cumulativeUnits: 1000,
    status: 'PENDING',
    hasPerformanceCondition: true,
    conditionLabel: 'Conditionnel · perf. ARR ≥ 12 M€',
  },
];

export default function VestingTimelineSandboxPage() {
  return (
    <div className="bg-background mx-auto min-h-screen max-w-6xl space-y-12 p-8">
      <header className="space-y-2">
        <p className="text-overline text-brass-500">DESIGN SYSTEM V1 · SANDBOX</p>
        <h1 className="text-h1 text-ink-900">
          VestingTimeline <span className="serif-italic text-brass-500">SVG natif</span>
        </h1>
        <div className="bg-brass-500 animate-draw-line mt-3 h-[2px] w-16" aria-hidden="true" />
        <p className="text-ink-500 mt-3 text-sm">
          3 états + 1 bonus conditionnel. Position TODAY calculée par formule stricte ((today −
          vestingStart) / (vestingEnd − vestingStart)) × 100%.
        </p>
      </header>

      {/* CAS 1 — pré-cliff */}
      <section className="space-y-3">
        <h2 className="text-h2 text-ink-900">
          Cas 1 — <span className="serif-italic text-brass-500">Pré-cliff</span>
        </h2>
        <p className="text-ink-500 text-sm">
          Plan signé 15.03.2026, cliff 12 mois (15.03.2027), vesting fin 15.03.2030.
          Aujourd&apos;hui = {FIXED_TODAY} → ligne TODAY au tout début, hachures &laquo; À acquérir
          &raquo; sur toute la frise.
        </p>
        <Card>
          <CardContent className="p-6">
            <VestingTimeline
              tranches={preCliff}
              vestingStart="2026-03-15"
              vestingEnd="2030-03-15"
              today={FIXED_TODAY}
              unitsGranted={4200}
            />
          </CardContent>
        </Card>
      </section>

      {/* CAS 2 — vesting actif */}
      <section className="space-y-3">
        <h2 className="text-h2 text-ink-900">
          Cas 2 — <span className="serif-italic text-brass-500">Vesting actif</span>
        </h2>
        <p className="text-ink-500 text-sm">
          Plan signé 01.09.2023, 4 tranches annuelles. 2 tranches déjà vested (250+250 = 500 u.),
          today {FIXED_TODAY} entre la 2e et la 3e tranche. Zone bond-500 + zone gradient en cours +
          hachures à venir.
        </p>
        <Card>
          <CardContent className="p-6">
            <VestingTimeline
              tranches={vestingActif}
              vestingStart="2023-09-01"
              vestingEnd="2027-09-01"
              today={FIXED_TODAY}
              unitsGranted={1000}
            />
          </CardContent>
        </Card>
      </section>

      {/* CAS 3 — fully-vested */}
      <section className="space-y-3">
        <h2 className="text-h2 text-ink-900">
          Cas 3 — <span className="serif-italic text-brass-500">Fully-vested</span>
        </h2>
        <p className="text-ink-500 text-sm">
          Plan signé 01.12.2019, terminé 01.12.2023. Toutes tranches vested. Frise complètement
          bond-500, ligne TODAY clamped à 100 %.
        </p>
        <Card>
          <CardContent className="p-6">
            <VestingTimeline
              tranches={fullyVested}
              vestingStart="2019-12-01"
              vestingEnd="2023-12-01"
              today={FIXED_TODAY}
              unitsGranted={2000}
            />
          </CardContent>
        </Card>
      </section>

      {/* CAS 4 — bonus avec performance */}
      <section className="space-y-3">
        <h2 className="text-h2 text-ink-900">
          Bonus — <span className="serif-italic text-brass-500">Avec condition de performance</span>
        </h2>
        <p className="text-ink-500 text-sm">
          2 tranches passées vested (sans condition), 2 tranches futures conditionnées par ARR ≥ 12
          M€. Zone &laquo; Conditionnel &raquo; en pointillés verticaux brass apparaît dans la frise
          + dans la légende.
        </p>
        <Card>
          <CardContent className="p-6">
            <VestingTimeline
              tranches={withPerf}
              vestingStart="2023-06-01"
              vestingEnd="2027-12-01"
              today={FIXED_TODAY}
              unitsGranted={1000}
            />
          </CardContent>
        </Card>
      </section>

      <footer className="text-ink-400 border-paper-300 mt-16 border-t pt-6 font-mono text-xs">
        <p>
          VestingTimeline · Editorial Finance V1 · spec 5.8 · sandbox{' '}
          <code className="bg-paper-200 rounded px-1">/dev/design/vesting-timeline</code>
        </p>
        <p className="text-ink-500 mt-2">
          ⚠ <strong>Position TODAY formule stricte</strong> : aucun fallback arbitraire. Si today
          &lt; vestingStart, ratio = 0. Si today &gt; vestingEnd, ratio = 1. Sinon ratio linéaire.
        </p>
      </footer>
    </div>
  );
}
