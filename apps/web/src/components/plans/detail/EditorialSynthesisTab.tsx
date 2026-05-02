'use client';

import { useMemo } from 'react';
import { VestingTimeline, type VestingTimelineTranche } from '@/components/awards/vesting-timeline';
import type { PlanDetail } from '@/server/queries/plans';

/**
 * Synthesis tab Editorial Finance V1 — Étape 13 commit 3/6.
 *
 * Refonte du Synthesis tab du Plan Detail (mockup 4) avec :
 * - 4 KPIs adaptatifs en grille 2×2 ou 4×1 selon largeur
 * - VestingTimeline en mode "calendrier théorique" (plan, pas award)
 *
 * Les blocs bénéficiaires + conditions (bloc bas du mockup 4) sont
 * livrés au commit 4.
 *
 * KPIs (selon mockup 4) :
 *  1. Unités totales — pool_size
 *  2. Avant cliff — Xm Yj jusqu'à la fin du cliff (masqué si déjà passé)
 *  3. Au cliff — pool_size × cliff_percentage / 100 (masqué si pas de cliff)
 *  4. Gain latent à terme — (FMV − strike) × pool_size
 *     Empty state si reference_share_price est NULL (pas valorisé)
 */

export type EditorialSynthesisTabProps = {
  detail: PlanDetail;
};

export function EditorialSynthesisTab({ detail }: EditorialSynthesisTabProps) {
  const today = new Date();
  const grantDate = parseIsoLocalDate(detail.plan.grant_date);
  const cliffDate = computeCliffDate(grantDate, detail.vestingSchedule?.cliff_months ?? null);
  const isPreCliff = cliffDate !== null && today < cliffDate;

  const cliffRemainingLabel = useMemo(() => {
    if (!cliffDate || !isPreCliff) return null;
    return formatRemainingFr(today, cliffDate);
  }, [cliffDate, isPreCliff, today]);

  const cliffPct = detail.vestingSchedule?.cliff_percentage ?? null;
  const unitsAtCliff =
    cliffPct != null ? Math.round((detail.plan.pool_size * cliffPct) / 100) : null;

  const fmv = detail.plan.reference_share_price;
  const strike = detail.plan.exercise_price ?? 0;
  const gainLatent = fmv != null ? (fmv - strike) * detail.plan.pool_size : null;

  // Tranches pour la VestingTimeline mode théorique (toutes PENDING).
  // Si le plan a au moins une condition de performance définie, on
  // marque toutes les tranches comme conditionnelles (zone Conditionnel
  // uniforme V1, cf. arbitrage user — granularité par tranche en V2).
  const hasConditions = detail.conditions.length > 0;
  const tranches: VestingTimelineTranche[] = (detail.vestingSchedule?.tranches ?? []).map(
    (t, idx, arr) => {
      const cumulPct = arr.slice(0, idx + 1).reduce((sum, x) => sum + x.percentage_of_award, 0);
      const cumulUnits = Math.round((cumulPct * detail.plan.pool_size) / 100);
      const unitsToVest = Math.round((t.percentage_of_award * detail.plan.pool_size) / 100);
      return {
        vestingDate: t.vesting_date,
        unitsToVest,
        cumulativePct: Math.min(cumulPct, 100),
        cumulativeUnits: cumulUnits,
        status: 'PENDING' as const,
        hasPerformanceCondition: hasConditions,
        conditionLabel: hasConditions ? 'Conditionnel · performance' : undefined,
      };
    },
  );

  // Bornes du calendrier de vesting
  const vestingStart = detail.plan.grant_date;
  const vestingEnd =
    tranches.length > 0
      ? tranches.reduce(
          (acc, t) => (t.vestingDate > acc ? t.vestingDate : acc),
          tranches[0]!.vestingDate,
        )
      : detail.plan.grant_date;

  return (
    <div className="space-y-6">
      {/* Section 1 — Grille 4 KPIs adaptatifs */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1 — Unités totales */}
        <KPIBlock
          label="UNITÉS · TOTALES"
          value={formatNumber(detail.plan.pool_size)}
          unit="u."
          contextLine={`Pool intégral du plan`}
        />

        {/* KPI 2 — Avant cliff (conditionnel) */}
        {isPreCliff && cliffRemainingLabel ? (
          <KPIBlock
            label="AVANT · CLIFF"
            value={cliffRemainingLabel}
            contextLine={`Jusqu'au ${formatDateFr(cliffDate)}`}
          />
        ) : (
          <KPIBlock
            label="DEPUIS · CLIFF"
            value={cliffDate ? formatDateFr(cliffDate) : '—'}
            isMuted
            contextLine={
              cliffDate ? `Cliff atteint le ${formatDateFr(cliffDate)}` : 'Aucun cliff configuré'
            }
          />
        )}

        {/* KPI 3 — Au cliff */}
        {unitsAtCliff != null && cliffPct != null ? (
          <KPIBlock
            label="AU · CLIFF"
            value={formatNumber(unitsAtCliff)}
            unit="u."
            contextLine={`${cliffPct} % du pool · à acquisition`}
          />
        ) : (
          <KPIBlock label="AU · CLIFF" value="—" isMuted contextLine="Aucun cliff configuré" />
        )}

        {/* KPI 4 — Gain latent */}
        {gainLatent != null && fmv != null ? (
          <KPIBlock
            label="GAIN · LATENT À TERME"
            value={formatCompactEur(gainLatent)}
            unit={compactUnit(gainLatent)}
            contextLine={`(FMV ${formatNumber(fmv)} € − strike ${formatNumber(strike)} €) × ${formatNumber(detail.plan.pool_size)} u.`}
          />
        ) : (
          <KPIBlock
            label="GAIN · LATENT À TERME"
            value="—"
            isEmpty
            emptyHint="Lancez une valorisation pour calculer le gain latent."
          />
        )}
      </section>

      {/* Section 2 — Chronologie de vesting */}
      <section className="bg-card border-border/50 rounded-lg border p-6">
        <header className="mb-4">
          <p className="text-overline text-brass-500">CHRONOLOGIE · VESTING</p>
          <h2 className="text-h3 text-ink-900 mt-1">
            {tranches.length === 0
              ? 'Aucune tranche définie'
              : `${tranches.length} tranche${tranches.length > 1 ? 's' : ''} programmée${tranches.length > 1 ? 's' : ''}`}
          </h2>
        </header>

        {tranches.length > 0 ? (
          <VestingTimeline
            tranches={tranches}
            vestingStart={vestingStart}
            vestingEnd={vestingEnd}
            unitsGranted={detail.plan.pool_size}
            theoreticalMode
          />
        ) : (
          <p className="text-ink-500 serif-italic text-sm">
            Aucune tranche n&apos;a été configurée pour ce plan.
          </p>
        )}
      </section>
    </div>
  );
}

// ============================================================================
// Internal KPI block component (variation simplifiée du KPICard sans sparkline)
// ============================================================================

type KPIBlockProps = {
  label: string;
  value: string;
  unit?: string;
  contextLine?: string;
  isMuted?: boolean;
  isEmpty?: boolean;
  emptyHint?: string;
};

function KPIBlock({ label, value, unit, contextLine, isMuted, isEmpty, emptyHint }: KPIBlockProps) {
  return (
    <div
      className="bg-card border-border/50 flex flex-col gap-2 rounded-lg border p-5"
      data-testid="plan-detail-kpi"
    >
      <p className="text-overline text-brass-500">{label}</p>
      <div className="flex items-baseline gap-2">
        <span
          className={
            isEmpty || isMuted ? 'text-numeric-md text-ink-400' : 'text-numeric-lg text-ink-900'
          }
        >
          {value}
        </span>
        {unit ? <span className="text-numeric-md text-ink-500">{unit}</span> : null}
      </div>
      {isEmpty && emptyHint ? (
        <p className="serif-italic text-ink-500 text-sm leading-snug">{emptyHint}</p>
      ) : contextLine ? (
        <p className="text-ink-500 text-xs leading-snug">{contextLine}</p>
      ) : null}
    </div>
  );
}

// ============================================================================
// Helpers locaux
// ============================================================================

function parseIsoLocalDate(iso: string): Date | null {
  if (!iso || iso.length < 10) return null;
  const y = parseInt(iso.slice(0, 4), 10);
  const m = parseInt(iso.slice(5, 7), 10);
  const d = parseInt(iso.slice(8, 10), 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d);
}

function computeCliffDate(grantDate: Date | null, cliffMonths: number | null): Date | null {
  if (!grantDate || cliffMonths == null || cliffMonths <= 0) return null;
  return new Date(grantDate.getFullYear(), grantDate.getMonth() + cliffMonths, grantDate.getDate());
}

function formatRemainingFr(from: Date, to: Date): string {
  const diffMs = to.getTime() - from.getTime();
  if (diffMs <= 0) return '0 j';
  const totalDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const months = Math.floor(totalDays / 30);
  const days = totalDays - months * 30;
  if (months >= 12) return `${months} m`;
  if (days === 0) return `${months} m`;
  return `${months} m ${days} j`;
}

function formatDateFr(d: Date): string {
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(n);
}

function formatCompactEur(eur: number): string {
  if (Math.abs(eur) >= 1_000_000) {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(eur / 1_000_000);
  }
  if (Math.abs(eur) >= 1_000) {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(eur / 1_000);
  }
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(eur);
}

function compactUnit(eur: number): string {
  if (Math.abs(eur) >= 1_000_000) return 'M€';
  if (Math.abs(eur) >= 1_000) return 'K€';
  return '€';
}
