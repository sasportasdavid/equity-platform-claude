import { AlertTriangle, Calendar, ListChecks, UserMinus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AwardDetailRow } from '@/server/queries/awards';

/**
 * Onglet Plan rules — Module 3b B4.
 *
 * 3 sub-cards en lecture seule rendant les snapshots JSONB figés au
 * moment du grant :
 *   1. Vesting schedule snapshot (table tranches)
 *   2. Performance conditions snapshot
 *   3. Leaver rules snapshot (8 cards)
 *
 * Banner d'info en bas :
 *   - Toujours : « ces règles ont été figées au moment du grant »
 *   - Si plan.version > award.plan_version : avertissement « le plan parent
 *     a été modifié depuis ; pour appliquer les nouvelles règles, créer
 *     une modification IFRS 2 (B6) »
 */
export function AwardPlanRulesTab({ detail }: { detail: AwardDetailRow }) {
  const { award, plan } = detail;
  const vestingSnap = (award.vesting_schedule_snapshot as VestingSnap | null) ?? null;
  const conditionsSnap = (award.performance_conditions_snapshot as ConditionSnap[] | null) ?? [];
  const leaversSnap = (award.leaver_rules_snapshot as LeaverSnap[] | null) ?? [];

  const planOutOfSync = plan && award.plan_version != null && plan.version > award.plan_version;

  return (
    <div className="space-y-4">
      <VestingSnapshotCard snap={vestingSnap} />
      <ConditionsSnapshotCard conditions={conditionsSnap} />
      <LeaversSnapshotCard leavers={leaversSnap} />

      <Card className={planOutOfSync ? 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/20' : ''}>
        <CardContent className="py-3 text-sm">
          {planOutOfSync ? (
            <div className="flex items-start gap-2 text-amber-800 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                <strong>Plan parent modifié</strong> : la version actuelle est v{plan.version}, cet
                award est figé sur la v{award.plan_version}. Pour appliquer les nouvelles règles,
                créez une modification IFRS 2 (disponible en B6).
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              Ces règles ont été figées au moment du grant
              {award.granted_at ? ` (${formatDate(award.granted_at)})` : ''} pour la version{' '}
              <strong>v{award.plan_version ?? 1}</strong> du plan{' '}
              <strong>{plan?.name ?? '—'}</strong>. Toute modification du plan parent ne
              s&apos;appliquera pas à cet award sans modification IFRS 2 explicite.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-card 1 : Vesting schedule
// ---------------------------------------------------------------------------

type VestingSnap = {
  schedule?: {
    vesting_type?: string;
    cliff_months?: number;
    cliff_percentage?: number;
    total_months?: number;
    frequency?: string;
    single_vesting_date?: string;
  };
  tranches?: Array<{
    id?: string;
    sort_order?: number;
    vesting_date?: string;
    percentage_of_award?: number;
  }>;
};

function VestingSnapshotCard({ snap }: { snap: VestingSnap | null }) {
  const tranches = snap?.tranches ?? [];
  const totalPct = tranches.reduce((s, t) => s + Number(t.percentage_of_award ?? 0), 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="size-4" />
          Calendrier de vesting (snapshot)
        </CardTitle>
        <CardDescription>
          {snap?.schedule?.vesting_type
            ? `Type : ${snap.schedule.vesting_type}`
            : 'Pas de schedule snapshoté'}
          {snap?.schedule?.total_months ? ` · ${snap.schedule.total_months} mois total` : ''}
          {snap?.schedule?.cliff_months ? ` · cliff ${snap.schedule.cliff_months}m` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {tranches.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucune tranche enregistrée.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground border-b text-left text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 text-right font-medium">% du total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tranches.map((t, idx) => (
                  <tr key={t.id ?? idx}>
                    <td className="px-3 py-2 font-mono text-xs">#{t.sort_order ?? idx + 1}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {formatDate(t.vesting_date ?? null)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {Number(t.percentage_of_award ?? 0).toFixed(2)} %
                    </td>
                  </tr>
                ))}
                <tr className="bg-muted/30 font-medium">
                  <td className="px-3 py-2" colSpan={2}>
                    Total
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {totalPct.toFixed(2)} %
                    {Math.abs(totalPct - 100) > 0.01 ? (
                      <span className="text-destructive ml-1 text-xs">(≠ 100 %)</span>
                    ) : null}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-card 2 : Performance conditions
// ---------------------------------------------------------------------------

type ConditionSnap = {
  name?: string;
  condition_type?: string;
  category?: string;
  market_metric_type?: string;
  metric?: string;
  target_value?: string | number;
  target_unit?: string;
  comparison_operator?: string;
  threshold_min?: number;
  threshold_max?: number;
  measurement_period_years?: number;
};

function ConditionsSnapshotCard({ conditions }: { conditions: ConditionSnap[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="size-4" />
          Conditions de performance (snapshot)
        </CardTitle>
        <CardDescription>
          {conditions.length === 0
            ? 'Aucune condition de performance — vesting purement temporel'
            : `${conditions.length} condition${conditions.length > 1 ? 's' : ''} figée${conditions.length > 1 ? 's' : ''}`}
        </CardDescription>
      </CardHeader>
      {conditions.length > 0 ? (
        <CardContent className="space-y-2">
          {conditions.map((c, idx) => (
            <div key={idx} className="rounded border p-3 text-sm">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <strong>{c.name ?? `Condition #${idx + 1}`}</strong>
                {c.condition_type ? (
                  <Badge variant="outline" className="text-xs">
                    {c.condition_type}
                  </Badge>
                ) : null}
                {c.market_metric_type ? (
                  <Badge variant="outline" className="text-xs">
                    {c.market_metric_type}
                  </Badge>
                ) : null}
              </div>
              <dl className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {c.metric ? (
                  <>
                    <dt>Métrique</dt>
                    <dd className="font-mono">{c.metric}</dd>
                  </>
                ) : null}
                {c.comparison_operator || c.target_value ? (
                  <>
                    <dt>Cible</dt>
                    <dd className="font-mono">
                      {c.comparison_operator ?? ''} {String(c.target_value ?? '')}{' '}
                      {c.target_unit ?? ''}
                    </dd>
                  </>
                ) : null}
                {c.threshold_min != null || c.threshold_max != null ? (
                  <>
                    <dt>Seuils</dt>
                    <dd className="font-mono">
                      {c.threshold_min ?? '—'} → {c.threshold_max ?? '—'}
                    </dd>
                  </>
                ) : null}
                {c.measurement_period_years ? (
                  <>
                    <dt>Période</dt>
                    <dd className="font-mono">{c.measurement_period_years} ans</dd>
                  </>
                ) : null}
              </dl>
            </div>
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Sub-card 3 : Leaver rules (8 cards)
// ---------------------------------------------------------------------------

type LeaverSnap = {
  leaver_type?: string;
  treatment?: string;
  acceleration_months?: number;
  exercise_window_days?: number;
};

const LEAVER_LABELS: Record<string, string> = {
  resignation: 'Démission',
  termination_cause: 'Licenciement (faute)',
  termination_no_cause: 'Licenciement (sans faute)',
  death: 'Décès',
  retirement: 'Retraite',
  company_sale: 'Cession société',
  mutual_agreement: 'Rupture conventionnelle',
  end_of_contract: 'Fin de contrat',
};

const TREATMENT_LABELS: Record<string, string> = {
  forfeit_all: 'Tout forfait',
  keep_vested: 'Garde acquis',
  full_accelerate: 'Accélération totale',
  pro_rata_accelerate: 'Accélération pro-rata',
};

function LeaversSnapshotCard({ leavers }: { leavers: LeaverSnap[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserMinus className="size-4" />
          Règles départs (snapshot)
        </CardTitle>
        <CardDescription>
          {leavers.length} règle{leavers.length > 1 ? 's' : ''} figée{leavers.length > 1 ? 's' : ''}{' '}
          au moment du grant
        </CardDescription>
      </CardHeader>
      <CardContent>
        {leavers.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucune règle de départ snapshotée.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {leavers.map((l, idx) => (
              <div key={l.leaver_type ?? idx} className="rounded border p-2 text-xs">
                <div className="font-medium">
                  {LEAVER_LABELS[l.leaver_type ?? ''] ?? l.leaver_type ?? '—'}
                </div>
                <div className="text-muted-foreground mt-1">
                  {TREATMENT_LABELS[l.treatment ?? ''] ?? l.treatment ?? '—'}
                </div>
                {(l.acceleration_months ?? 0) > 0 ? (
                  <div className="text-muted-foreground mt-0.5">
                    Accel : {l.acceleration_months}m
                  </div>
                ) : null}
                {(l.exercise_window_days ?? 0) > 0 ? (
                  <div className="text-muted-foreground mt-0.5">
                    Exercice : {l.exercise_window_days}j
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
