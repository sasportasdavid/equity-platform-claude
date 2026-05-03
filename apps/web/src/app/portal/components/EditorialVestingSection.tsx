import { VestingTimeline, type VestingTimelineTranche } from '@/components/awards/vesting-timeline';
import type { VestingTimelineEntry } from '@/lib/portal/vesting';

/**
 * Editorial vesting section pour le détail award portail — Étape 14
 * Design System V1.
 *
 * Wrapper qui mappe `VestingTimelineEntry[]` (helper Module 8 portail)
 * vers `VestingTimelineTranche[]` (composant DS V1 Étape 9) et rend la
 * frise en mode `simplified={true}` (labels courts type "Mar 2026" au
 * lieu de "15.03.2026").
 *
 * Le mode simplified est cohérent avec l'arbitrage Étape 9 : pour le
 * portail bénéficiaire (espace réduit, audience non-experte), labels
 * compacts.
 */

export type EditorialVestingSectionProps = {
  timeline: ReadonlyArray<VestingTimelineEntry>;
  unitsGranted: number;
  /** ISO `YYYY-MM-DD` — début du vesting (grant_date du plan) */
  grantDate: string;
  /** Si true (par défaut), labels mois courts ("Mar 2026") */
  simplified?: boolean;
  /** Disclaimer si fallback snapshot */
  fromSnapshot?: boolean;
};

export function EditorialVestingSection({
  timeline,
  unitsGranted,
  grantDate,
  simplified = true,
  fromSnapshot,
}: EditorialVestingSectionProps) {
  // Mapping vers le format VestingTimeline DS V1
  const tranches: VestingTimelineTranche[] = timeline.map((entry, idx, arr) => {
    const cumulUnits = arr.slice(0, idx + 1).reduce((sum, e) => sum + e.unitsToVest, 0);
    const cumulPct = unitsGranted > 0 ? (cumulUnits / unitsGranted) * 100 : 0;
    return {
      vestingDate: entry.date,
      unitsToVest: entry.unitsToVest,
      cumulativePct: Math.min(cumulPct, 100),
      cumulativeUnits: cumulUnits,
      status: entry.status === 'VESTED' ? 'VESTED' : 'PENDING',
    };
  });

  const vestingStart = grantDate;
  const vestingEnd =
    tranches.length > 0
      ? tranches.reduce(
          (acc, t) => (t.vestingDate > acc ? t.vestingDate : acc),
          tranches[0]!.vestingDate,
        )
      : grantDate;

  return (
    <section className="space-y-4">
      <header>
        <p className="text-overline text-brass-500">CALENDRIER · D&apos;ACQUISITION</p>
        <h2 className="text-h3 text-ink-900 mt-1">
          {tranches.length === 0
            ? 'Aucune tranche définie'
            : `${tranches.length} tranche${tranches.length > 1 ? 's' : ''} programmée${tranches.length > 1 ? 's' : ''}`}
        </h2>
      </header>

      <div className="bg-paper-50 border-paper-300 rounded-lg border p-6">
        {tranches.length > 0 ? (
          <VestingTimeline
            tranches={tranches}
            vestingStart={vestingStart}
            vestingEnd={vestingEnd}
            unitsGranted={unitsGranted}
            simplified={simplified}
          />
        ) : (
          <p className="serif-italic text-ink-500 text-sm">
            Le calendrier d&apos;acquisition n&apos;est pas encore défini sur cette attribution.
          </p>
        )}
      </div>

      {fromSnapshot ? (
        <p className="text-ink-500 font-mono text-xs">
          ⚠ Calendrier indicatif basé sur le contrat. Les unités seront officiellement acquises
          selon les dates affichées.
        </p>
      ) : null}
    </section>
  );
}
