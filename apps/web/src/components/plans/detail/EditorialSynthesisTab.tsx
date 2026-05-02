'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { VestingTimeline, type VestingTimelineTranche } from '@/components/awards/vesting-timeline';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';
import type { AwardListRow } from '@/server/queries/awards';
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
  /** Awards de ce plan, chargés côté Server Component (page.tsx) */
  planAwards?: ReadonlyArray<AwardListRow>;
};

export function EditorialSynthesisTab({ detail, planAwards = [] }: EditorialSynthesisTabProps) {
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

      {/* Section 3 — Bloc bas 2 colonnes : bénéficiaires (66%) + conditions (33%) */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <BeneficiariesBlock awards={planAwards} planId={detail.plan.id} className="lg:col-span-2" />
        <PlanConditionsCard detail={detail} cliffDate={cliffDate} className="lg:col-span-1" />
      </section>
    </div>
  );
}

// ============================================================================
// Bloc bas gauche — Bénéficiaires de ce plan
// ============================================================================

const AWARD_STATUS_TONE: Record<string, StatusBadgeTone> = {
  DRAFT: 'slate',
  PROPOSED: 'saffron',
  PENDING_APPROVAL: 'saffron',
  APPROVED: 'bond',
  REJECTED: 'title',
  SENT_FOR_SIGNATURE: 'brass',
  SIGNED: 'brass',
  GRANTED: 'bond',
  VESTING: 'bond',
  VESTED: 'bond',
  EXERCISED: 'bond',
  CANCELLED: 'slate',
  FORFEITED: 'title',
  EXPIRED: 'slate',
};

const AWARD_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Brouillon',
  PROPOSED: 'Proposé',
  PENDING_APPROVAL: 'En approbation',
  APPROVED: 'Approuvé',
  REJECTED: 'Rejeté',
  SENT_FOR_SIGNATURE: 'En signature',
  SIGNED: 'Signé',
  GRANTED: 'Octroyé',
  VESTING: 'Vesting',
  VESTED: 'Acquis',
  EXERCISED: 'Exercé',
  CANCELLED: 'Annulé',
  FORFEITED: 'Renoncé',
  EXPIRED: 'Expiré',
};

function BeneficiariesBlock({
  awards,
  planId: _planId,
  className,
}: {
  awards: ReadonlyArray<AwardListRow>;
  planId: string;
  className?: string;
}) {
  return (
    <div
      className={`bg-card border-border/50 flex flex-col gap-4 rounded-lg border p-6 ${className ?? ''}`}
    >
      <header className="flex items-baseline justify-between">
        <div>
          <p className="text-overline text-brass-500">BÉNÉFICIAIRES · DE CE PLAN</p>
          <h2 className="text-h3 text-ink-900 mt-1">
            {awards.length === 0
              ? 'Aucune attribution'
              : `${awards.length} ${awards.length > 1 ? 'attributions' : 'attribution'}`}
          </h2>
        </div>
        {awards.length > 0 ? (
          <Link
            href={`/dashboard/awards?planId=${_planId}`}
            className="text-brass-700 hover:text-brass-900 inline-flex items-center gap-1 text-xs font-medium"
          >
            Voir toutes
            <ArrowRight className="size-3" strokeWidth={1.5} />
          </Link>
        ) : null}
      </header>

      {awards.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-8">
          <p className="serif-italic text-ink-500 text-sm leading-relaxed">
            Aucune attribution n&apos;a encore été créée sur ce plan.
          </p>
        </div>
      ) : (
        <ul className="divide-paper-300 -mx-2 divide-y" role="list">
          {awards.slice(0, 8).map((award) => {
            const beneficiaryName = award.beneficiary
              ? `${award.beneficiary.first_name ?? ''} ${award.beneficiary.last_name ?? ''}`.trim() ||
                award.beneficiary.email
              : 'Bénéficiaire inconnu';
            const statusTone = AWARD_STATUS_TONE[award.status] ?? 'slate';
            const statusLabel = AWARD_STATUS_LABEL[award.status] ?? award.status;
            return (
              <li key={award.id}>
                <Link
                  href={`/dashboard/awards/${award.id}`}
                  className="hover:bg-paper-200/40 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-ink-900 truncate text-sm font-medium">
                        {beneficiaryName}
                      </span>
                      {award.award_number ? (
                        <span className="text-ink-500 font-mono text-[11px]">
                          {award.award_number}
                        </span>
                      ) : null}
                    </div>
                    {award.beneficiary?.email ? (
                      <p className="text-ink-500 truncate text-xs">{award.beneficiary.email}</p>
                    ) : null}
                  </div>
                  <div className="text-ink-900 shrink-0 text-right font-mono text-sm tabular-nums">
                    {formatNumber(award.units_granted)}
                    <span className="text-ink-400 ml-1 text-xs">u.</span>
                  </div>
                  <StatusBadge tone={statusTone} pattern="solid">
                    {statusLabel}
                  </StatusBadge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ============================================================================
// Bloc bas droit — Card "Conditions du plan" key-value
// ============================================================================

const PLAN_TYPE_LABEL: Record<string, string> = {
  BSPCE: 'BSPCE',
  AGA: 'AGA',
  STOCK_OPTION: 'Stock Option',
  PHANTOM: 'Phantom',
  BSA: 'BSA',
  RSU: 'RSU',
};

const SETTLEMENT_LABEL: Record<string, string> = {
  CASH: 'Cash',
  EQUITY: 'Equity',
};

const VESTING_TYPE_LABEL: Record<string, string> = {
  CLIFF_LINEAR: 'Cliff puis linéaire',
  CLIFF_ANNUAL: 'Cliff puis annuel',
  CLIFF_QUARTERLY: 'Cliff puis trimestriel',
  ANNUAL: 'Annuel',
  QUARTERLY: 'Trimestriel',
  MONTHLY: 'Mensuel',
  SINGLE: 'Tranche unique',
};

function PlanConditionsCard({
  detail,
  cliffDate,
  className,
}: {
  detail: PlanDetail;
  cliffDate: Date | null;
  className?: string;
}) {
  const rows: { label: string; value: string }[] = [];

  rows.push({
    label: 'Type',
    value: PLAN_TYPE_LABEL[detail.plan.plan_type] ?? detail.plan.plan_type,
  });
  if (detail.plan.settlement_type) {
    rows.push({
      label: 'Règlement',
      value: SETTLEMENT_LABEL[detail.plan.settlement_type] ?? detail.plan.settlement_type,
    });
  }
  if (detail.plan.exercise_price != null) {
    rows.push({
      label: 'Strike',
      value: `${formatNumber(detail.plan.exercise_price)} €`,
    });
  }
  if (detail.plan.reference_share_price != null) {
    rows.push({
      label: 'FMV référence',
      value: `${formatNumber(detail.plan.reference_share_price)} €`,
    });
  }
  rows.push({
    label: 'Date attribution',
    value: formatDateFr(parseIsoLocalDate(detail.plan.grant_date) ?? new Date()),
  });
  if (detail.plan.board_date) {
    rows.push({
      label: 'Conseil',
      value: formatDateFr(parseIsoLocalDate(detail.plan.board_date) ?? new Date()),
    });
  }
  if (detail.vestingSchedule?.vesting_type) {
    rows.push({
      label: 'Type vesting',
      value:
        VESTING_TYPE_LABEL[detail.vestingSchedule.vesting_type] ??
        detail.vestingSchedule.vesting_type,
    });
  }
  if (detail.vestingSchedule?.cliff_months) {
    rows.push({
      label: 'Cliff',
      value: cliffDate
        ? `${detail.vestingSchedule.cliff_months} m · ${formatDateFr(cliffDate)}`
        : `${detail.vestingSchedule.cliff_months} m`,
    });
  }
  if (detail.vestingSchedule?.total_months) {
    rows.push({
      label: 'Durée totale',
      value: `${detail.vestingSchedule.total_months} m`,
    });
  }
  if (detail.conditions.length > 0) {
    rows.push({
      label: 'Conditions perf.',
      value: `${detail.conditions.length} ${detail.conditions.length > 1 ? 'définies' : 'définie'}`,
    });
  }
  if (detail.leavers.length > 0) {
    rows.push({
      label: 'Règles départs',
      value: `${detail.leavers.length} ${detail.leavers.length > 1 ? 'définies' : 'définie'}`,
    });
  }

  return (
    <div
      className={`bg-card border-border/50 flex flex-col gap-4 rounded-lg border p-6 ${className ?? ''}`}
    >
      <header>
        <p className="text-overline text-brass-500">CONDITIONS · DU PLAN</p>
        <h2 className="text-h3 text-ink-900 mt-1">Récapitulatif</h2>
      </header>

      <dl className="divide-paper-300 -mx-2 divide-y">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3 px-2 py-2">
            <dt className="text-ink-500 text-xs uppercase tracking-wider">{r.label}</dt>
            <dd className="text-ink-900 font-mono text-sm tabular-nums">{r.value}</dd>
          </div>
        ))}
      </dl>
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
