'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Award, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AwardStatusBadge } from '@/components/awards/AwardStatusBadge';
import { CreateAwardModal } from '@/components/awards/CreateAwardModal';
import { PlanTypeBadge } from '@/components/plans/shared/PlanTypeBadge';
import type { BeneficiaryDetailRow } from '@/server/queries/beneficiaries';
import type { PlanForCreation } from '@/server/queries/awards';
import type { AwardStatus } from '@equity/shared';

/**
 * Onglet Awards — Module 4 B4.
 *
 * Stats banner (4 cards) + tableau awards + bouton "Nouvelle attribution"
 * (ouvre CreateAwardModal Module 3b avec bénéficiaire pré-sélectionné via
 * `initialBeneficiaryId`).
 */
export function BeneficiaryAwardsTab({
  detail,
  plans,
  canPropose,
}: {
  detail: BeneficiaryDetailRow;
  plans: PlanForCreation[];
  canPropose: boolean;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const { awards, stats, beneficiary } = detail;

  const beneFullName =
    `${beneficiary.first_name} ${beneficiary.last_name}`.trim() || beneficiary.email;

  return (
    <>
      <div className="space-y-4">
        {/* Stats banner */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Awards actifs"
            value={stats.activeAwardsCount.toString()}
            tone="emerald"
          />
          <StatCard
            label="Total attribué"
            value={stats.totalUnitsGranted.toLocaleString('fr-FR')}
          />
          <StatCard label="Total acquis" value={stats.totalUnitsVested.toLocaleString('fr-FR')} />
          <StatCard label="En cours" value={stats.totalUnitsOutstanding.toLocaleString('fr-FR')} />
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Award className="size-4" />
                  Attributions ({awards.length})
                </CardTitle>
                <CardDescription>
                  {stats.firstGrantDate
                    ? `Premier grant : ${formatDate(stats.firstGrantDate)} · Dernier : ${formatDate(stats.latestGrantDate)}`
                    : 'Aucune attribution pour ce bénéficiaire'}
                </CardDescription>
              </div>
              {canPropose ? (
                <Button
                  size="sm"
                  onClick={() => setCreateOpen(true)}
                  data-testid="new-award-from-beneficiary"
                  disabled={plans.length === 0}
                  title={plans.length === 0 ? 'Aucun plan actif disponible' : ''}
                >
                  <Plus className="mr-2 size-4" />
                  Nouvelle attribution
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {awards.length === 0 ? (
              <div className="text-muted-foreground bg-muted/20 rounded-lg border border-dashed p-8 text-center text-sm">
                <Award className="mx-auto mb-2 size-8 opacity-40" />
                <p className="font-medium">Aucune attribution</p>
                <p className="mt-1 text-xs">
                  {canPropose
                    ? 'Cliquez sur « Nouvelle attribution » pour créer la première.'
                    : 'Permission `awards.propose` requise pour créer une attribution.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground border-b text-left text-xs uppercase">
                    <tr>
                      <th className="px-3 py-2 font-medium">Award #</th>
                      <th className="px-3 py-2 font-medium">Plan</th>
                      <th className="px-3 py-2 font-medium">Statut</th>
                      <th className="px-3 py-2 text-right font-medium">Units</th>
                      <th className="px-3 py-2 text-right font-medium">Acquis</th>
                      <th className="px-3 py-2 font-medium">Date attribution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {awards.map((a) => (
                      <tr key={a.id}>
                        <td className="px-3 py-2 font-mono text-xs">
                          <Link
                            href={`/dashboard/awards/${a.id}`}
                            className="text-primary hover:underline"
                          >
                            {a.award_number ?? a.id.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          {a.plan ? (
                            <Link
                              href={`/dashboard/plans/${a.plan.id}`}
                              className="inline-flex items-center gap-1.5 hover:underline"
                            >
                              <span>{a.plan.name}</span>
                              <PlanTypeBadge planType={a.plan.plan_type} />
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <AwardStatusBadge status={a.status as AwardStatus} />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {Number(a.units_granted).toLocaleString('fr-FR')}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {a.units_vested != null
                            ? Number(a.units_vested).toLocaleString('fr-FR')
                            : '—'}
                        </td>
                        <td className="text-muted-foreground px-3 py-2 font-mono text-xs">
                          {formatDate(a.grant_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {canPropose && plans.length > 0 ? (
        <CreateAwardModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          plans={plans}
          initialBeneficiary={{
            id: beneficiary.id,
            fullName: beneFullName,
            email: beneficiary.email,
          }}
          onSuccess={() => router.refresh()}
        />
      ) : null}
    </>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'emerald' }) {
  const toneCls =
    tone === 'emerald'
      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400'
      : 'border-border bg-muted/20';
  return (
    <div className={`rounded-md border p-3 ${toneCls}`}>
      <div className="text-muted-foreground text-[10px] uppercase">{label}</div>
      <div className="font-mono text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
