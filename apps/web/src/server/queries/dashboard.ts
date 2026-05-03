import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Json } from '@equity/shared';

/**
 * Server queries pour le Dashboard CFO — Étape 12 Design System V1.
 *
 * 5 KPIs + alertes conformité + plans actifs (la liste utilise
 * `listPlans({ status: ['ACTIVE'] })` du fichier `plans.ts`, pas dupliqué
 * ici). Toutes les queries respectent les RLS Supabase via
 * `createSupabaseServerClient()` — l'org_id est filtré automatiquement
 * par les policies.
 *
 * Aucun RPC ni vue Postgres créés (pas de migration). Agrégations en JS
 * — acceptable V1 pour des orgs < quelques milliers de plans/awards.
 *
 * Pattern de retour : chaque query est résiliente — en cas d'erreur,
 * elle retourne un objet "vide" cohérent (count=0, sparkline=[]) plutôt
 * que de throw, pour ne pas casser l'affichage du dashboard si une
 * source est temporairement indisponible.
 */

// ============================================================================
// Helpers internes — partagés entre KPIs
// ============================================================================

/** Retourne la date YYYY-MM-DD en local time. */
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Liste les 12 derniers mois (du plus ancien au plus récent), label "Mai 2025". */
function last12MonthLabels(now: Date): { iso: string; label: string; lastDay: string }[] {
  const months = [
    'Jan',
    'Fév',
    'Mar',
    'Avr',
    'Mai',
    'Juin',
    'Juil',
    'Août',
    'Sept',
    'Oct',
    'Nov',
    'Déc',
  ];
  const result: { iso: string; label: string; lastDay: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0); // dernier jour du mois
    const label =
      i === 0
        ? `${months[d.getMonth()]} ${d.getFullYear()}`
        : d.getFullYear() !== now.getFullYear()
          ? `${months[d.getMonth()]} ${d.getFullYear()}`
          : (months[d.getMonth()] ?? '');
    result.push({
      iso: toIsoDate(d),
      label,
      lastDay: toIsoDate(lastDay),
    });
  }
  return result;
}

/** Liste les 30 prochains jours (du plus proche au plus lointain). */
function next30DayLabels(now: Date): { iso: string; label: string }[] {
  const result: { iso: string; label: string }[] = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    result.push({
      iso: toIsoDate(d),
      label: `J+${i}`,
    });
  }
  return result;
}

/** Liste les 30 derniers jours (du plus ancien au plus récent). */
function last30DayLabels(now: Date): { iso: string; label: string }[] {
  const result: { iso: string; label: string }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    result.push({
      iso: toIsoDate(d),
      label: i === 0 ? 'Auj.' : `J-${i}`,
    });
  }
  return result;
}

// ============================================================================
// KPI 1 — Fair Value · IFRS 2 (hero)
// ============================================================================

export type FairValueSummary = {
  /** Total fair value (€) = SUM(pool_size × fair_value_per_instrument) sur plans ACTIVE. */
  totalEur: number;
  /** Variation % entre la valeur du dernier mois et celle du mois précédent. NULL si insuffisant. */
  variationMonthPct: number | null;
  /** Sparkline 12 mois cumulés. Pour chaque mois, somme des fair values disponibles à cette date. */
  sparkline: { label: string; value: number }[];
  /** Date ISO du dernier `valuation_runs.completed_at` (la plus récente cross-plans). */
  latestValuationAt: string | null;
};

export async function getOrgFairValueSummary(now: Date = new Date()): Promise<FairValueSummary> {
  const supabase = await createSupabaseServerClient();

  // 1. Charger les plans ACTIVE avec leur dernier valuation_run DONE et son résultat
  const { data: plans, error: plansError } = await supabase
    .from('plans')
    .select(
      `id, name, pool_size,
       valuation_runs!valuation_runs_plan_id_fkey (
         id, status, completed_at,
         valuation_results ( fair_value_per_instrument )
       )`,
    )
    .eq('status', 'ACTIVE')
    .is('deleted_at', null);

  if (plansError || !plans) {
    return { totalEur: 0, variationMonthPct: null, sparkline: [], latestValuationAt: null };
  }

  // 2. Pour chaque plan, sélectionner son dernier valuation_run DONE et calculer
  //    fair_value_total = pool_size × fair_value_per_instrument
  type PlanRow = {
    id: string;
    pool_size: number;
    valuation_runs: Array<{
      id: string;
      status: string;
      completed_at: string | null;
      valuation_results: Array<{ fair_value_per_instrument: number | null }> | null;
    }> | null;
  };

  let totalEur = 0;
  let latestValuationAt: string | null = null;
  /** Map planId → liste des runs DONE triés par date avec fair_value_per_instrument */
  const planValuationsByMonth: Map<
    string,
    Array<{ at: string; fvPerUnit: number; pool: number }>
  > = new Map();

  for (const p of plans as PlanRow[]) {
    const runs = (p.valuation_runs ?? [])
      .filter((r) => r.status === 'DONE' && r.completed_at)
      .sort((a, b) => Date.parse(b.completed_at!) - Date.parse(a.completed_at!));

    if (runs.length === 0) continue;

    const planRuns: Array<{ at: string; fvPerUnit: number; pool: number }> = [];
    for (const r of runs) {
      const fv = r.valuation_results?.[0]?.fair_value_per_instrument;
      if (fv == null || r.completed_at == null) continue;
      planRuns.push({ at: r.completed_at, fvPerUnit: fv, pool: p.pool_size });
    }

    if (planRuns.length === 0) continue;
    planValuationsByMonth.set(p.id, planRuns);

    // Total = somme du dernier run de chaque plan
    const latestRun = planRuns[0]!;
    totalEur += latestRun.fvPerUnit * latestRun.pool;
    if (!latestValuationAt || Date.parse(latestRun.at) > Date.parse(latestValuationAt)) {
      latestValuationAt = latestRun.at;
    }
  }

  // 3. Sparkline 12 mois — pour chaque mois, somme des fair values cumulées à
  //    la fin du mois (i.e. dernier run de chaque plan ≤ lastDay)
  const months = last12MonthLabels(now);
  const sparkline = months.map((m) => {
    const monthEndMs = Date.parse(`${m.lastDay}T23:59:59`);
    let monthTotal = 0;
    for (const planRuns of planValuationsByMonth.values()) {
      // Premier run ≤ monthEnd (les runs sont triés desc par date)
      const eligible = planRuns.find((r) => Date.parse(r.at) <= monthEndMs);
      if (eligible) {
        monthTotal += eligible.fvPerUnit * eligible.pool;
      }
    }
    return { label: m.label, value: monthTotal };
  });

  // 4. Variation mois sur mois
  const lastValue = sparkline[sparkline.length - 1]?.value ?? 0;
  const prevValue = sparkline[sparkline.length - 2]?.value ?? 0;
  const variationMonthPct = prevValue > 0 ? ((lastValue - prevValue) / prevValue) * 100 : null;

  return { totalEur, variationMonthPct, sparkline, latestValuationAt };
}

// ============================================================================
// KPI 2 — Alertes Conformité (no sparkline)
// ============================================================================

export type ComplianceAlertItem = {
  resourceType: 'PLAN' | 'AWARD';
  resourceId: string;
  resourceName: string;
  severity: 'ERROR' | 'WARNING';
  code: string;
  message: string;
};

export type ComplianceAlertsSummary = {
  errorCount: number;
  warningCount: number;
  /** Date ISO du dernier audit_event lié à compliance_checked. NULL si jamais. */
  lastCheckAt: string | null;
  /** Top alertes triées par severity (ERROR > WARNING) puis ordre d'apparition. Limit 10. */
  topAlerts: ComplianceAlertItem[];
};

type ComplianceWarningEntry = { severity?: string; code?: string; message?: string };

function parseWarnings(raw: Json | null | undefined): ComplianceWarningEntry[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).filter(
    (e): e is ComplianceWarningEntry => typeof e === 'object' && e !== null,
  );
}

export async function getOrgComplianceAlertsSummary(): Promise<ComplianceAlertsSummary> {
  const supabase = await createSupabaseServerClient();

  // 1. Plans avec compliance_warnings non vide
  const { data: plansWithWarnings } = await supabase
    .from('plans')
    .select('id, name, compliance_warnings')
    .is('deleted_at', null)
    .not('compliance_warnings', 'eq', '[]')
    .limit(200);

  // 2. Awards avec compliance_warnings non vide (joint plan pour le name)
  const { data: awardsWithWarnings } = await supabase
    .from('awards')
    .select(
      `id, award_number, compliance_warnings,
       plan:plans!awards_plan_id_fkey ( name )`,
    )
    .is('deleted_at', null)
    .not('compliance_warnings', 'eq', '[]')
    .limit(200);

  // 3. Dernier audit_event compliance.checked (best effort, NULL si jamais)
  const { data: auditEvents } = await supabase
    .from('audit_events')
    .select('occurred_at')
    .like('event_type', 'compliance.%')
    .order('occurred_at', { ascending: false })
    .limit(1);

  let errorCount = 0;
  let warningCount = 0;
  const collected: ComplianceAlertItem[] = [];

  for (const p of plansWithWarnings ?? []) {
    const warnings = parseWarnings(p.compliance_warnings);
    for (const w of warnings) {
      const severity =
        w.severity === 'ERROR' ? 'ERROR' : w.severity === 'WARNING' ? 'WARNING' : null;
      if (!severity) continue;
      if (severity === 'ERROR') errorCount++;
      else warningCount++;
      collected.push({
        resourceType: 'PLAN',
        resourceId: p.id,
        resourceName: p.name,
        severity,
        code: w.code ?? 'UNKNOWN',
        message: w.message ?? '',
      });
    }
  }

  for (const a of awardsWithWarnings ?? []) {
    const warnings = parseWarnings(a.compliance_warnings);
    const planName =
      typeof a.plan === 'object' && a.plan !== null && 'name' in a.plan
        ? (a.plan as { name: string }).name
        : 'Plan inconnu';
    for (const w of warnings) {
      const severity =
        w.severity === 'ERROR' ? 'ERROR' : w.severity === 'WARNING' ? 'WARNING' : null;
      if (!severity) continue;
      if (severity === 'ERROR') errorCount++;
      else warningCount++;
      collected.push({
        resourceType: 'AWARD',
        resourceId: a.id,
        resourceName: a.award_number ? `${planName} · ${a.award_number}` : planName,
        severity,
        code: w.code ?? 'UNKNOWN',
        message: w.message ?? '',
      });
    }
  }

  // Trier ERROR avant WARNING
  collected.sort((x, y) => {
    if (x.severity === y.severity) return 0;
    return x.severity === 'ERROR' ? -1 : 1;
  });

  return {
    errorCount,
    warningCount,
    lastCheckAt: auditEvents?.[0]?.occurred_at ?? null,
    topAlerts: collected.slice(0, 10),
  };
}

// ============================================================================
// KPI 3 — Vesting · 30 jours
// ============================================================================

export type VestingNext30DaysSummary = {
  /** SUM units_to_vest entre today et today+30 (inclus), status='PENDING'. */
  totalUnits: number;
  /** Sparkline cumul jour par jour sur 30 jours. */
  sparkline: { label: string; value: number }[];
};

export async function getOrgVestingNext30Days(
  now: Date = new Date(),
): Promise<VestingNext30DaysSummary> {
  const supabase = await createSupabaseServerClient();

  const today = toIsoDate(now);
  const in30Days = toIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30));

  const { data: events } = await supabase
    .from('vesting_events')
    .select('scheduled_date, units_to_vest, status')
    .gte('scheduled_date', today)
    .lte('scheduled_date', in30Days)
    .eq('status', 'PENDING');

  const totalUnits = (events ?? []).reduce((sum, e) => sum + (e.units_to_vest ?? 0), 0);

  // Sparkline cumul jour par jour
  const days = next30DayLabels(now);
  let cumulative = 0;
  const sparkline = days.map((d) => {
    const dayUnits = (events ?? [])
      .filter((e) => e.scheduled_date === d.iso)
      .reduce((s, e) => s + (e.units_to_vest ?? 0), 0);
    cumulative += dayUnits;
    return { label: d.label, value: cumulative };
  });

  return { totalUnits, sparkline };
}

// ============================================================================
// KPI 4 — Bénéficiaires actifs
// ============================================================================

export type ActiveBeneficiariesSummary = {
  /** Count des bénéficiaires status='active' (non terminated, non deleted). */
  count: number;
  /** Bénéficiaires créés sur les 30 derniers jours (delta). */
  variation30dCount: number;
  /** Sparkline 12 mois — count cumulés (count des actifs au dernier jour de chaque mois). */
  sparkline: { label: string; value: number }[];
};

export async function getOrgActiveBeneficiaries(
  now: Date = new Date(),
): Promise<ActiveBeneficiariesSummary> {
  const supabase = await createSupabaseServerClient();

  // Tous les bénéficiaires non-deleted, avec leur created_at + status
  // On charge tout l'historique pour calculer cumul mensuel côté JS.
  // Limit 5000 — au-delà il faudrait un RPC dédié (V2).
  const { data: all } = await supabase
    .from('beneficiaries')
    .select('id, created_at, status, deleted_at')
    .is('deleted_at', null)
    .limit(5000);

  const beneficiaries = all ?? [];

  const count = beneficiaries.filter((b) => b.status === 'active').length;

  // Variation +30j : count créés ces 30 derniers jours
  const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
  const variation30dCount = beneficiaries.filter(
    (b) => Date.parse(b.created_at) >= thirtyDaysAgo.getTime(),
  ).length;

  // Sparkline 12 mois cumulés (count bénéficiaires existants à la fin de chaque mois)
  const months = last12MonthLabels(now);
  const sparkline = months.map((m) => {
    const monthEndMs = Date.parse(`${m.lastDay}T23:59:59`);
    const cumulCount = beneficiaries.filter(
      (b) => Date.parse(b.created_at) <= monthEndMs && b.status === 'active',
    ).length;
    return { label: m.label, value: cumulCount };
  });

  return { count, variation30dCount, sparkline };
}

// ============================================================================
// KPI 5 — Awards en attente d'approbation (swap de Cap libre ESOP)
// ============================================================================

export type AwardsAwaitingApprovalSummary = {
  /** Count des `approval_requests.status='IN_PROGRESS'` cross-org (RLS filter). */
  count: number;
  /** Sparkline 30 jours — count d'approval_requests créés par jour. */
  sparkline: { label: string; value: number }[];
};

export async function getOrgAwardsAwaitingApproval(
  now: Date = new Date(),
): Promise<AwardsAwaitingApprovalSummary> {
  const supabase = await createSupabaseServerClient();

  // Count count des IN_PROGRESS (état actuel)
  const { count: countNum } = await supabase
    .from('approval_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'IN_PROGRESS');

  // Sparkline 30 jours — approval_requests créés par jour
  const thirtyDaysAgo = toIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
  const tomorrow = toIsoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

  const { data: created } = await supabase
    .from('approval_requests')
    .select('created_at')
    .gte('created_at', thirtyDaysAgo)
    .lt('created_at', tomorrow);

  const days = last30DayLabels(now);
  const sparkline = days.map((d) => {
    const dayStart = `${d.iso}T00:00:00`;
    const dayEnd = `${d.iso}T23:59:59`;
    const dayStartMs = Date.parse(dayStart);
    const dayEndMs = Date.parse(dayEnd);
    const dayCount = (created ?? []).filter((r) => {
      const t = Date.parse(r.created_at);
      return t >= dayStartMs && t <= dayEndMs;
    }).length;
    return { label: d.label, value: dayCount };
  });

  return { count: countNum ?? 0, sparkline };
}
