'use client';

import { KPICard, type SparklinePoint } from '@/components/shared/kpi-card';
import {
  ScalesIllustration,
  PlumeIllustration,
  SignatureIllustration,
} from '@/components/shared/illustrations';
import type {
  ActiveBeneficiariesSummary,
  AwardsAwaitingApprovalSummary,
  ComplianceAlertsSummary,
  VestingNext30DaysSummary,
} from '@/server/queries/dashboard';

/**
 * 4 cards satellites du Dashboard CFO — Étape 12.
 *
 * Chacune wrap un `KPICard` avec un mapping métier-spécifique qui
 * convertit les types `*Summary` retournés par les queries dashboard
 * en props `KPICard`.
 *
 * Pourquoi 4 wrappers et pas 1 générique : le mapping (sparkline,
 * unité, contextLine, empty illustration) est trop différent par KPI
 * pour rentrer dans une signature unique sans devenir verbeuse.
 */

// ---------------------------------------------------------------------------
// 1) Alertes Conformité — pas de sparkline (cf. arbitrage user)
// ---------------------------------------------------------------------------

export function ComplianceAlertsKPI({
  data,
  href = '/dashboard/plans?compliance=true',
}: {
  data: ComplianceAlertsSummary;
  href?: string;
}) {
  const totalCount = data.errorCount + data.warningCount;
  const isEmpty = totalCount === 0;

  // contextLine étoffée pour combler l'absence de sparkline
  const contextLine = (() => {
    if (isEmpty) return null;
    const parts: string[] = [];
    if (data.errorCount > 0) {
      parts.push(`${data.errorCount} ${data.errorCount > 1 ? 'erreurs' : 'erreur'}`);
    }
    if (data.warningCount > 0) {
      parts.push(
        `${data.warningCount} ${data.warningCount > 1 ? 'avertissements' : 'avertissement'}`,
      );
    }
    if (data.lastCheckAt) {
      const age = relativeAge(data.lastCheckAt);
      parts.push(`dernier check ${age}`);
    }
    return parts.join(' · ');
  })();

  return (
    <KPICard
      label="ALERTES · CONFORMITÉ"
      value={isEmpty ? null : totalCount}
      contextLine={contextLine ?? undefined}
      href={!isEmpty ? href : undefined}
      ctaLabel={!isEmpty ? 'Examiner les alertes' : undefined}
      statusBadge={
        data.errorCount > 0
          ? { tone: 'title', pattern: 'pulse', label: 'CRITIQUE' }
          : data.warningCount > 0
            ? { tone: 'saffron', pattern: 'dotted', label: 'WARNING' }
            : undefined
      }
      emptyState={{
        illustration: <ScalesIllustration size={56} />,
        copy: 'Tous les contrôles de conformité sont validés.',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// 2) Vesting · 30 jours
// ---------------------------------------------------------------------------

export function VestingNext30DaysKPI({
  data,
  href = '/dashboard/awards',
}: {
  data: VestingNext30DaysSummary;
  href?: string;
}) {
  const isEmpty = data.totalUnits === 0;
  const sparklineData: SparklinePoint[] = data.sparkline.map((p) => ({
    x: p.label,
    y: p.value,
  }));

  return (
    <KPICard
      label="VESTING · 30 JOURS"
      value={isEmpty ? null : new Intl.NumberFormat('fr-FR').format(data.totalUnits)}
      unit="u."
      contextLine={!isEmpty ? `Cumulés sur les 30 prochains jours` : undefined}
      sparklineData={!isEmpty ? sparklineData : undefined}
      href={!isEmpty ? href : undefined}
      ctaLabel={!isEmpty ? 'Voir les attributions' : undefined}
      emptyState={{
        copy: "Aucune tranche de vesting n'arrive à échéance dans les 30 prochains jours.",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// 3) Bénéficiaires actifs — sparkline 12 mois cumulés
// ---------------------------------------------------------------------------

export function ActiveBeneficiariesKPI({
  data,
  href = '/dashboard/beneficiaries',
}: {
  data: ActiveBeneficiariesSummary;
  href?: string;
}) {
  const isEmpty = data.count === 0;
  const sparklineData: SparklinePoint[] = data.sparkline.map((p) => ({
    x: p.label,
    y: p.value,
  }));

  return (
    <KPICard
      label="BÉNÉFICIAIRES · ACTIFS"
      value={isEmpty ? null : data.count}
      delta={
        data.variation30dCount > 0
          ? {
              // On exprime en valeur absolue ici, pas en %
              // (KPICardDelta affiche un %, donc on passe la valeur brute *100/count?
              // Plus propre : calculer un pseudo-pct ou utiliser contextLine.)
              value:
                data.count > 0
                  ? (data.variation30dCount / Math.max(data.count - data.variation30dCount, 1)) *
                    100
                  : 0,
              period: 'sur 30j',
              direction: 'up',
            }
          : undefined
      }
      contextLine={
        !isEmpty
          ? `+${data.variation30dCount} ${data.variation30dCount > 1 ? 'nouveaux' : 'nouveau'} ces 30 derniers jours`
          : undefined
      }
      sparklineData={!isEmpty ? sparklineData : undefined}
      href={!isEmpty ? href : undefined}
      ctaLabel={!isEmpty ? 'Voir les bénéficiaires' : undefined}
      emptyState={{
        illustration: <PlumeIllustration size={56} />,
        copy: 'Aucun bénéficiaire actif. Invitez votre premier collaborateur.',
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// 4) Awards en attente d'approbation (swap Cap libre ESOP)
// ---------------------------------------------------------------------------

export function AwardsAwaitingApprovalKPI({
  data,
  href = '/dashboard/approvals',
}: {
  data: AwardsAwaitingApprovalSummary;
  href?: string;
}) {
  const isEmpty = data.count === 0;
  const sparklineData: SparklinePoint[] = data.sparkline.map((p) => ({
    x: p.label,
    y: p.value,
  }));

  return (
    <KPICard
      label="EN ATTENTE · APPROBATION"
      value={isEmpty ? null : data.count}
      contextLine={
        !isEmpty ? `${data.count} ${data.count > 1 ? 'requêtes' : 'requête'} à traiter` : undefined
      }
      sparklineData={!isEmpty ? sparklineData : undefined}
      href={!isEmpty ? href : undefined}
      ctaLabel={!isEmpty ? "Ouvrir l'inbox" : undefined}
      statusBadge={
        data.count > 5 ? { tone: 'saffron', pattern: 'pulse', label: 'CHARGE' } : undefined
      }
      emptyState={{
        illustration: <SignatureIllustration size={56} />,
        copy: "Aucune requête d'approbation en attente. Pipeline traité.",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Helper interne — âge relatif d'une date ISO ("il y a 4 h", "il y a 2 j")
// ---------------------------------------------------------------------------

function relativeAge(iso: string): string {
  const now = Date.now();
  const past = Date.parse(iso);
  const diffSec = Math.max(0, Math.floor((now - past) / 1000));
  if (diffSec < 60) return "à l'instant";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `il y a ${diffD} j`;
  const diffW = Math.floor(diffD / 7);
  return `il y a ${diffW} sem`;
}
