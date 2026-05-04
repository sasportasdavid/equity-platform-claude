import type { Metadata } from 'next';
import Link from 'next/link';
import { Coins, Info, ShieldAlert } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { requireUser } from '@/lib/auth/rbac';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const metadata: Metadata = {
  title: 'Mes positions · Capiwise',
};

/**
 * Module 10 B6 — Portail bénéficiaire — `/portal/positions`.
 *
 * Server Component qui charge les positions du BENEFICIARY courant via
 * **admin client** (pattern aligné sur M8 portal layout) :
 *   1. Lookup beneficiaries via user_id (admin bypass RLS)
 *   2. Query cap_table_positions filtrée par stakeholder_id + org_id
 *
 * Pourquoi admin et pas RLS standard : un BENEFICIARY pur (sans membership
 * ACTIVE) peut avoir un JWT sans `active_org_id`, ce qui rend
 * `current_org_id()` NULL et bloque toutes les RLS positions/share_classes.
 * Cf dette M8 #85.
 *
 * V1 affiche : units, cost basis total agrégés par share_class.
 *
 * V2 (dette #95) : ajouter % consolidé via RPC SECURITY DEFINER
 * `get_org_total_units_for_portal(p_user_id)`. Pour l'instant pas affiché.
 */
export default async function PortalPositionsPage() {
  const user = await requireUser();
  const admin = getSupabaseAdminClient();

  const { data: beneficiary } = await admin
    .from('beneficiaries')
    .select('id, org_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (!beneficiary) {
    // Layout /portal/layout.tsx redirige déjà — fallback safety
    return (
      <div className="space-y-2">
        <p className="text-ink-500 text-sm">Aucun profil bénéficiaire associé à votre compte.</p>
      </div>
    );
  }

  const { data: positions } = await admin
    .from('cap_table_positions')
    .select(
      'id, share_class_id, units, cost_basis_per_unit, cost_basis_total, acquired_at, source, stakeholder_name',
    )
    .eq('org_id', beneficiary.org_id)
    .eq('stakeholder_type', 'BENEFICIARY')
    .eq('stakeholder_id', beneficiary.id)
    .is('position_closed_at', null);

  const list = positions ?? [];

  // Charger les share_classes liées via admin (cohérence accès)
  const classIds = Array.from(new Set(list.map((p) => p.share_class_id)));
  const classByIdMap = new Map<string, { code: string; name: string; class_type: string }>();
  if (classIds.length > 0) {
    const { data: classes } = await admin
      .from('share_classes')
      .select('id, code, name, class_type')
      .in('id', classIds);
    for (const c of classes ?? []) {
      classByIdMap.set(c.id, { code: c.code, name: c.name, class_type: c.class_type });
    }
  }

  // Agrégation par share_class : sum(units), sum(cost_basis_total)
  type Aggregate = {
    code: string;
    name: string;
    classType: string;
    units: number;
    costBasisTotal: number;
    costBasisAvg: number | null;
    earliestAcquired: string;
    sources: Set<string>;
  };
  const aggMap = new Map<string, Aggregate>();
  for (const p of list) {
    const klass = classByIdMap.get(p.share_class_id);
    if (!klass) continue;
    const existing = aggMap.get(p.share_class_id);
    const units = Number(p.units);
    const cbTotal = Number(p.cost_basis_total ?? 0);
    if (existing) {
      existing.units += units;
      existing.costBasisTotal += cbTotal;
      if (p.acquired_at < existing.earliestAcquired) {
        existing.earliestAcquired = p.acquired_at;
      }
      existing.sources.add(p.source);
    } else {
      aggMap.set(p.share_class_id, {
        code: klass.code,
        name: klass.name,
        classType: klass.class_type,
        units,
        costBasisTotal: cbTotal,
        costBasisAvg: null,
        earliestAcquired: p.acquired_at,
        sources: new Set([p.source]),
      });
    }
  }
  for (const agg of aggMap.values()) {
    agg.costBasisAvg = agg.units > 0 ? agg.costBasisTotal / agg.units : null;
  }
  const aggregates = Array.from(aggMap.values()).sort((a, b) => b.units - a.units);

  const totalUnits = aggregates.reduce((s, a) => s + a.units, 0);
  const totalCostBasis = aggregates.reduce((s, a) => s + a.costBasisTotal, 0);

  const formatUnits = (n: number) =>
    new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n);
  const formatEUR = (n: number) =>
    new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div className="space-y-8" data-testid="portal-positions-list">
      {/* Hero éditorial */}
      <header className="space-y-2">
        <p className="text-overline text-brass-500">VOS POSITIONS</p>
        <h1 className="text-h1 text-ink-900">
          Cap table — <span className="serif-italic text-brass-500">vos titres au registre</span>
        </h1>
        <div className="bg-brass-500 animate-draw-line mt-3 h-[2px] w-16" aria-hidden="true" />
        <p className="text-ink-500 mt-3 max-w-2xl text-sm leading-relaxed">
          Actions et titres effectivement détenus à votre nom. Distinct de vos attributions BSPCE/SO
          qui restent virtuelles tant que non exercées.
        </p>
      </header>

      {aggregates.length === 0 ? (
        <Card className="border-paper-300">
          <CardContent className="py-12 text-center">
            <Coins className="text-ink-300 mx-auto size-12" strokeWidth={1.25} />
            <h2 className="text-ink-900 mt-4 text-lg font-medium">
              Vous n&apos;avez pas encore d&apos;actions au registre
            </h2>
            <p className="text-ink-500 mx-auto mt-2 max-w-md text-sm">
              Vos options BSPCE, AGA ou stock-options figurent dans{' '}
              <Link
                href="/portal/awards"
                className="text-brass-700 underline-offset-4 hover:underline"
              >
                Mes attributions
              </Link>
              . Elles deviennent des positions cap table une fois exercées (ou converties pour les
              AGA).
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats globales */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Synthèse de vos positions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <div className="text-overline text-ink-500">Total units</div>
                  <div className="font-mono text-2xl">{formatUnits(totalUnits)}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-overline text-ink-500">Coût d&apos;acquisition</div>
                  <div className="font-mono text-2xl">
                    {totalCostBasis > 0 ? formatEUR(totalCostBasis) : '—'}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-overline text-ink-500">Classes détenues</div>
                  <div className="font-mono text-2xl">{aggregates.length}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cards par share_class */}
          <div className="grid gap-3 md:grid-cols-2">
            {aggregates.map((agg) => (
              <Card key={agg.code} className="border-paper-300">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      <span className="font-mono">{agg.code}</span> —{' '}
                      <span className="font-normal">{agg.name}</span>
                    </CardTitle>
                    <Badge variant="outline" className="text-xs">
                      {agg.classType}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-overline text-ink-500">Units</div>
                      <div className="font-mono text-lg">{formatUnits(agg.units)}</div>
                    </div>
                    <div>
                      <div className="text-overline text-ink-500">Coût total</div>
                      <div className="font-mono text-lg">
                        {agg.costBasisTotal > 0 ? formatEUR(agg.costBasisTotal) : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-overline text-ink-500">Coût moyen / unit</div>
                      <div className="font-mono text-sm">
                        {agg.costBasisAvg
                          ? new Intl.NumberFormat('fr-FR', {
                              style: 'currency',
                              currency: 'EUR',
                              maximumFractionDigits: 4,
                            }).format(agg.costBasisAvg)
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-overline text-ink-500">Acquis depuis</div>
                      <div className="font-mono text-sm">
                        {new Date(agg.earliestAcquired).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                  </div>

                  <div className="text-ink-500 flex items-start gap-1.5 text-xs">
                    <Info className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
                    <span>Sources : {Array.from(agg.sources).join(', ')}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Disclaimer V1 */}
          <Card className="border-saffron-500 bg-saffron-50 border-l-[3px]">
            <CardContent className="flex items-start gap-3 py-4">
              <ShieldAlert className="text-saffron-600 mt-0.5 size-5 shrink-0" strokeWidth={1.5} />
              <div className="space-y-1 text-sm">
                <p className="text-ink-900 font-medium">Information importante</p>
                <p className="text-ink-500 text-xs leading-relaxed">
                  Les valeurs ci-dessus sont basées sur votre coût d&apos;acquisition (prix
                  d&apos;émission ou d&apos;exercice). La valeur de marché d&apos;une action non
                  cotée n&apos;est pas garantie : sa réalisation effective dépend d&apos;un
                  événement de liquidité (sortie, levée secondaire, rachat).
                </p>
                <p className="text-ink-500 text-xs leading-relaxed">
                  La part du capital (% consolidé) sera disponible en V2 — elle nécessite une
                  autorisation employeur pour le calcul.
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Link
              href="/portal/awards"
              className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
            >
              Voir mes attributions
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
