import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, Coins, Layers } from 'lucide-react';
import { uuidSchema } from '@equity/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePermission } from '@/lib/auth/rbac';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Plan · Capiwise',
};

/**
 * Route /dashboard/plans/[id] — placeholder B2.
 *
 * Cette page est livrée en B2 uniquement pour clore proprement le flow
 * de création (le wizard redirige ici après succès du RPC `create_plan_full`).
 * La vue détail complète (8 onglets — Synthèse / Snapshot / Performance /
 * IFRS2 / Hypotheses / Leavers / Versions / Grants) arrive en B4
 * (cf. MODULE_03A_PLANS.md §7).
 *
 * Pour B2, on affiche :
 *  - 1 carte « Plan créé ✓ » avec les méta-données essentielles (nom,
 *    type, pool, dates, status DRAFT)
 *  - 1 carte « Cascade DB » résumant ce qui a été inséré (count vesting
 *    schedules / conditions / leavers / hypothesis_sets) — preuve que
 *    le RPC a fait son boulot
 *  - 1 bandeau placeholder pour les onglets B4
 *  - lien retour vers /dashboard
 *
 * Server Component qui résout le plan via Supabase RLS (le user ne voit
 * que les plans de son org active grâce à la policy `plans_select` du
 * 00002_rls_policies). 404 si le plan n'existe pas / pas accessible.
 */
export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('plans.read');

  const { id: rawId } = await params;
  const idCheck = uuidSchema.safeParse(rawId);
  if (!idCheck.success) redirect('/dashboard');

  const supabase = await createSupabaseServerClient();

  const { data: plan, error } = await supabase
    .from('plans')
    .select(
      'id, name, description, plan_type, status, pool_size, exercise_price, board_date, grant_date, created_at, compliance_warnings, version, is_locked',
    )
    .eq('id', idCheck.data)
    .maybeSingle();

  if (error || !plan) notFound();

  // Counts de la cascade — preuve que le RPC a tout inséré
  const [vestingSchedules, conditions, leavers, hypothesisSets] = await Promise.all([
    supabase
      .from('vesting_schedules')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', plan.id),
    supabase
      .from('performance_conditions')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', plan.id),
    supabase
      .from('early_termination_rules')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', plan.id),
    supabase
      .from('hypothesis_sets')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', plan.id),
  ]);

  const warnings =
    (plan.compliance_warnings as Array<{ message?: string; severity?: string }> | null) ?? [];

  return (
    <div className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground inline-flex items-center text-sm"
        >
          <ArrowLeft className="mr-2 size-4" />
          Retour au tableau de bord
        </Link>
        <Badge variant="outline" className="font-mono text-xs">
          v{plan.version} · {plan.status}
        </Badge>
      </div>

      <Card data-testid="plan-detail-summary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <CheckCircle2 className="size-5 text-emerald-500" />
            Plan créé
          </CardTitle>
          <CardDescription>
            La cascade DB a été exécutée atomiquement par <code>create_plan_full</code> (RPC B2). La
            vue détail complète (8 onglets) arrive en B4.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{plan.name}</h2>
            {plan.description ? (
              <p className="text-muted-foreground mt-1 text-sm">{plan.description}</p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <KeyValue icon={<Layers className="size-4" />} label="Type" value={plan.plan_type} />
            <KeyValue
              icon={<Coins className="size-4" />}
              label="Pool"
              value={plan.pool_size.toLocaleString('fr-FR')}
            />
            {plan.exercise_price != null ? (
              <KeyValue
                icon={<Coins className="size-4" />}
                label="Prix d’exercice"
                value={`${plan.exercise_price} €`}
              />
            ) : null}
            <KeyValue
              icon={<CalendarDays className="size-4" />}
              label="Date conseil"
              value={formatDate(plan.board_date)}
            />
            <KeyValue
              icon={<CalendarDays className="size-4" />}
              label="Date attribution"
              value={formatDate(plan.grant_date)}
            />
            <KeyValue
              icon={<CalendarDays className="size-4" />}
              label="Créé le"
              value={formatDateTime(plan.created_at)}
            />
          </div>
        </CardContent>
      </Card>

      <Card data-testid="plan-detail-cascade">
        <CardHeader>
          <CardTitle className="text-base">Entités créées en cascade</CardTitle>
          <CardDescription>
            Insérées dans la même transaction PL/pgSQL — rollback total si une étape échoue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-4">
            <CountTile label="Vesting schedules" count={vestingSchedules.count ?? 0} />
            <CountTile label="Conditions perf" count={conditions.count ?? 0} />
            <CountTile label="Règles leavers" count={leavers.count ?? 0} />
            <CountTile label="Hypothesis sets" count={hypothesisSets.count ?? 0} />
          </div>
        </CardContent>
      </Card>

      {warnings.length > 0 ? (
        <Card
          data-testid="plan-detail-warnings"
          className="border-amber-300/40 bg-amber-50/40 dark:bg-amber-950/20"
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-amber-600" />
              Avertissements de conformité
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {warnings.map((w, i) => (
              <p key={i} className="text-sm text-amber-900 dark:text-amber-200">
                {w.message ?? JSON.stringify(w)}
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-dashed">
        <CardContent className="text-muted-foreground py-6 text-sm">
          <p className="font-medium">À venir (Module 3a B4 — vue détail complète)</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            <li>Onglet Synthèse · Snapshot · Performance</li>
            <li>Onglet IFRS2 · Hypotheses · Leavers</li>
            <li>Onglet Versions (lineage) · Grants (preview Module 3b)</li>
            <li>Actions Lock / Archive / Duplicate</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function KeyValue({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {icon}
        {label}
      </p>
      <p className="font-mono text-sm">{value}</p>
    </div>
  );
}

function CountTile({ label, count }: { label: string; count: number }) {
  return (
    <div className="bg-muted/30 rounded-md border p-3 text-center">
      <p className="text-2xl font-semibold tabular-nums">{count}</p>
      <p className="text-muted-foreground mt-1 text-xs">{label}</p>
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('fr-FR');
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}
