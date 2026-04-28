// =============================================================================
// Module 3a B5.6 — Edge Function compute-ifrs2-expense
// =============================================================================
//
// Pipeline déclenché par compute-valuation après un run DONE. Calcule le
// calendrier de charges IFRS 2 pour le plan + le persiste en DB :
//
//   1. Charge le contexte (run + plan + tranches + valuation_results)
//   2. Pour chaque tranche, étale la charge linéairement (straight-line)
//      sur le service period (grant_date → vesting_date)
//   3. Aggrège mois par mois sur l'horizon couvrant toutes les tranches
//   4. UPSERT idempotent : remplace le schedule existant pour ce run si
//      présent (replay-friendly)
//
// Méthode IFRS 2 §10-22 implémentée :
//   - Charge totale = pool_size × portion × fair_value_per_instrument × P_non_market
//   - Étalement = straight-line sur service period (= linear pro-rata mois)
//   - P_non_market = 1.0 par défaut V1 (les vesting_probability_real du
//     moteur incluent déjà les leavers — à brancher en V2 quand le moteur
//     gérera des assumptions explicites)
//   - Conditions MARKET déjà incluses dans fair_value_per_instrument côté
//     moteur (via fair_value_market_only Monte Carlo)
//
// Erreurs : best-effort, pas de status sur le run principal (on ne veut pas
// faire échouer une valuation parce que l'IFRS 2 a planté). Log + skip.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ExpensePeriod = {
  schedule_id: string;
  period_start: string; // YYYY-MM-DD
  period_end: string;
  expense_amount: number;
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  try {
    const body = (await req.json().catch(() => ({}))) as { run_id?: string };
    const runId = body.run_id;
    if (!runId) {
      return jsonError(400, 'run_id requis');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    // 1. Charger le contexte (run + plan + tranches + result)
    const ctx = await loadIfrs2Context(supabase, runId);
    if (!ctx) {
      return jsonError(404, `Contexte IFRS 2 incomplet pour run ${runId}`);
    }

    // 2. Compute le calendrier de charges
    const computed = computeExpenseSchedule(ctx);
    if (computed.totalExpense === 0 || computed.periods.length === 0) {
      return new Response(
        JSON.stringify({ success: true, run_id: runId, periods: 0, total: 0, skipped: true }),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    // 3. Idempotence : DELETE l'éventuel schedule existant (cascade DELETE
    //    sur periods via FK schedule_id ON DELETE CASCADE — cf. migration
    //    00018). Un run ne devrait avoir qu'un seul schedule.
    await supabase.from('ifrs2_expense_schedules').delete().eq('valuation_run_id', runId);

    // 4. INSERT header
    const { data: header, error: headerError } = await supabase
      .from('ifrs2_expense_schedules')
      .insert({
        org_id: ctx.orgId,
        valuation_run_id: runId,
        plan_id: ctx.planId,
        award_id: null, // Module 3b alimentera quand grants individuels
        total_expense: computed.totalExpense,
        parameters: {
          method: 'STRAIGHT_LINE_MONTHLY',
          fair_value_per_instrument: ctx.fairValuePerInstrument,
          pool_size: ctx.poolSize,
          tranche_count: ctx.tranches.length,
          non_market_probability: 1.0, // V1 default
          grant_date: ctx.grantDate,
        },
      })
      .select('id')
      .single();

    if (headerError || !header) {
      return jsonError(500, `INSERT schedule échoué : ${headerError?.message ?? 'inconnu'}`);
    }

    // 5. INSERT periods batch
    const rows: ExpensePeriod[] = computed.periods.map((p) => ({
      schedule_id: header.id,
      period_start: p.period_start,
      period_end: p.period_end,
      expense_amount: p.expense_amount,
    }));
    const { error: periodsError } = await supabase.from('ifrs2_expense_periods').insert(rows);
    if (periodsError) {
      return jsonError(500, `INSERT periods échoué : ${periodsError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        run_id: runId,
        schedule_id: header.id,
        periods: rows.length,
        total: computed.totalExpense,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('[compute-ifrs2-expense]', errorMessage);
    return jsonError(500, errorMessage);
  }
});

// =============================================================================
// Helpers
// =============================================================================

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Ifrs2Context = {
  orgId: string;
  planId: string;
  grantDate: string; // YYYY-MM-DD
  poolSize: number;
  fairValuePerInstrument: number;
  tranches: Array<{
    sort_order: number;
    vesting_date: string; // YYYY-MM-DD
    percentage_of_award: number;
  }>;
};

async function loadIfrs2Context(
  supabase: ReturnType<typeof createClient>,
  runId: string,
): Promise<Ifrs2Context | null> {
  // Run + plan_id + org_id
  const { data: run } = await supabase
    .from('valuation_runs')
    .select('id, plan_id, org_id')
    .eq('id', runId)
    .maybeSingle();
  if (!run?.plan_id || !run.org_id) return null;

  // Plan + tranches + result en parallèle
  const [planRes, tranchesRes, resultRes] = await Promise.all([
    supabase.from('plans').select('id, grant_date, pool_size').eq('id', run.plan_id).maybeSingle(),
    supabase
      .from('vesting_schedules')
      .select('vesting_tranches ( sort_order, vesting_date, percentage_of_award )')
      .eq('plan_id', run.plan_id)
      .maybeSingle(),
    supabase
      .from('valuation_results')
      .select('fair_value_per_instrument')
      .eq('valuation_run_id', runId)
      .maybeSingle(),
  ]);

  const plan = planRes.data;
  if (!plan?.grant_date || plan.pool_size == null) return null;

  const fv = resultRes.data?.fair_value_per_instrument;
  if (fv == null || fv <= 0) return null;

  const tranches = (tranchesRes.data?.vesting_tranches ?? []) as Array<{
    sort_order: number;
    vesting_date: string;
    percentage_of_award: number;
  }>;
  if (tranches.length === 0) return null;

  return {
    orgId: run.org_id,
    planId: run.plan_id,
    grantDate: plan.grant_date,
    poolSize: Number(plan.pool_size),
    fairValuePerInstrument: Number(fv),
    tranches: tranches.sort((a, b) => a.sort_order - b.sort_order),
  };
}

/**
 * Calcule le calendrier IFRS 2 mensuel par étalement linéaire.
 *
 * Pour chaque tranche :
 *   - Service period = grant_date → vesting_date
 *   - Charge totale tranche = pool_size × (portion/100) × fair_value × P_non_market
 *   - Étalement uniforme mois par mois sur la durée du service period
 *
 * On agrège ensuite mois par mois sur l'horizon couvrant toutes les tranches.
 * Output : 1 row par mois entre [grant_date, last_vesting_date].
 *
 * Edge case : si vesting_date == grant_date (cliff zero), on impute la totalité
 * sur le mois du grant. Si vesting_date < grant_date (donnée corrompue), on
 * skip la tranche (pas négatif).
 */
function computeExpenseSchedule(ctx: Ifrs2Context): {
  totalExpense: number;
  periods: Array<{ period_start: string; period_end: string; expense_amount: number }>;
} {
  const grantDate = parseDate(ctx.grantDate);
  if (!grantDate) return { totalExpense: 0, periods: [] };

  // 1. Découpe en allocations mensuelles par tranche
  const monthlyMap = new Map<string, number>(); // key = "YYYY-MM", value = amount

  for (const t of ctx.tranches) {
    const vestDate = parseDate(t.vesting_date);
    if (!vestDate || vestDate.getTime() < grantDate.getTime()) continue;

    const totalTrancheExpense =
      ctx.poolSize * (Number(t.percentage_of_award) / 100) * ctx.fairValuePerInstrument;

    // Nb de mois entre grant et vest (au moins 1, arrondi sup pour couvrir
    // les vestings qui ne tombent pas pile sur fin de mois)
    const months = monthsBetween(grantDate, vestDate);
    const monthCount = Math.max(1, months);
    const perMonth = totalTrancheExpense / monthCount;

    // Distribution : 1ère période = mois du grant_date ; on incrémente
    // jusqu'à monthCount périodes
    for (let i = 0; i < monthCount; i++) {
      const periodDate = addMonths(grantDate, i);
      const key = monthKey(periodDate);
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + perMonth);
    }
  }

  // 2. Conversion en array trié + arrondi à 2 décimales (centimes)
  const periods = Array.from(monthlyMap.entries())
    .map(([key, amount]) => {
      const [yearStr, monthStr] = key.split('-');
      const y = parseInt(yearStr ?? '0', 10);
      const m = parseInt(monthStr ?? '1', 10);
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 0)); // dernier jour du mois
      return {
        period_start: isoDate(start),
        period_end: isoDate(end),
        expense_amount: Math.round(amount * 100) / 100,
      };
    })
    .sort((a, b) => a.period_start.localeCompare(b.period_start));

  const totalExpense = Math.round(periods.reduce((s, p) => s + p.expense_amount, 0) * 100) / 100;

  return { totalExpense, periods };
}

// ---------------------------------------------------------------------------
// Date utils — pas de date-fns ni dayjs ici (Edge runtime, on garde minimal)
// ---------------------------------------------------------------------------

function parseDate(iso: string): Date | null {
  // YYYY-MM-DD strict (cf. wizard isoDateRegex). On évite Date.parse qui
  // accepte des trucs trop laxistes.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m || !m[1] || !m[2] || !m[3]) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function monthsBetween(start: Date, end: Date): number {
  return (
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth())
  );
}

function addMonths(date: Date, n: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1));
}

function monthKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
