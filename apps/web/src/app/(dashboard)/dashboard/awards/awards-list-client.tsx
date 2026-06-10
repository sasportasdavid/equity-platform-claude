'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FileSpreadsheet, FileX, FilterX, Plus, Search } from 'lucide-react';
import { PlanTypeBadge } from '@/components/plans/shared/PlanTypeBadge';
import { PageShell } from '@/components/shared/PageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AwardStatusBadge,
  AWARD_STATUS_GROUPS,
  AWARD_STATUS_LABELS,
} from '@/components/awards/AwardStatusBadge';
import { AwardRowActions } from '@/components/awards/AwardRowActions';
import { CreateAwardModal } from '@/components/awards/CreateAwardModal';
import { BulkImportModal } from '@/components/awards/BulkImportModal';
import type { AwardListRow, PlanForCreation } from '@/server/queries/awards';
import type { AwardStatus } from '@equity/shared';

const BENEFICIARY_TYPES = [
  { value: 'EMPLOYEE', label: 'Employé' },
  { value: 'OFFICER', label: 'Dirigeant' },
  { value: 'CONSULTANT', label: 'Consultant' },
  { value: 'ADVISOR', label: 'Advisor' },
  { value: 'OTHER', label: 'Autre' },
];

/**
 * Page liste /dashboard/awards — Module 3b B3.
 *
 * Filtres : recherche debounce 300ms, status multi-groupes, plan, type
 * bénéficiaire. Filtres synchronisés avec searchParams (back-button OK).
 *
 * DataTable simplifié : table HTML pure (la lib TanStack utilisée pour
 * /dashboard/plans est overkill ici, on a juste besoin du tri par défaut
 * créé côté serveur).
 */
export function AwardsListClient({
  awards,
  plans,
  filters,
  canPropose,
  canCancel,
  canModify,
  canBulkImport,
}: {
  awards: AwardListRow[];
  plans: PlanForCreation[];
  filters: {
    search?: string;
    status?: string[];
    planId?: string;
    beneficiaryType?: string;
  };
  canPropose: boolean;
  canCancel: boolean;
  canModify: boolean;
  canBulkImport: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  // Update searchParams helper (debounced search via direct call onChange)
  function setParam(key: string, value: string | undefined) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === undefined || value === '') params.delete(key);
    else params.set(key, value);
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }

  function setStatusParam(values: string[]) {
    if (values.length === 0) setParam('status', undefined);
    else setParam('status', values.join(','));
  }

  const activeStatusSet = useMemo(() => new Set(filters.status ?? []), [filters.status]);
  const hasActiveFilters =
    !!filters.search || activeStatusSet.size > 0 || !!filters.planId || !!filters.beneficiaryType;

  return (
    <PageShell
      title="Attributions"
      description={`${awards.length} attribution${awards.length > 1 ? 's' : ''} affichée${awards.length > 1 ? 's' : ''}`}
      actions={
        <div className="flex gap-2">
          {canBulkImport ? (
            <Button
              variant="outline"
              onClick={() => setBulkOpen(true)}
              data-testid="bulk-import-button"
            >
              <FileSpreadsheet className="mr-2 size-4" />
              Import CSV
            </Button>
          ) : null}
          {canPropose ? (
            <Button onClick={() => setCreateOpen(true)} data-testid="new-award-button">
              <Plus className="mr-2 size-4" />
              Nouvelle attribution
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Filtres */}
        <div className="bg-card space-y-3 rounded-lg border p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="text-muted-foreground absolute left-2 top-1/2 size-4 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="Recherche nom / email / attribution #"
                defaultValue={filters.search ?? ''}
                onChange={(e) => debouncedUpdate(() => setParam('search', e.target.value))}
                className="pl-8"
                data-testid="awards-search-input"
              />
            </div>
            <select
              value={filters.planId ?? ''}
              onChange={(e) => setParam('planId', e.target.value || undefined)}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              data-testid="awards-plan-filter"
            >
              <option value="">Tous les plans</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.plan_type})
                </option>
              ))}
            </select>
            <select
              value={filters.beneficiaryType ?? ''}
              onChange={(e) => setParam('beneficiaryType', e.target.value || undefined)}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              data-testid="awards-type-filter"
            >
              <option value="">Tous types bénéficiaires</option>
              {BENEFICIARY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            {hasActiveFilters ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.replace(pathname)}
                className="justify-start"
              >
                <FilterX className="mr-2 size-4" />
                Réinitialiser
              </Button>
            ) : null}
          </div>

          {/* Status group toggles */}
          <div className="flex flex-wrap gap-1.5 text-xs">
            {Object.entries(AWARD_STATUS_GROUPS).map(([groupName, statuses]) => (
              <div key={groupName} className="flex flex-wrap gap-1">
                <span className="text-muted-foreground self-center pr-1 text-[11px] font-medium uppercase">
                  {groupName}
                </span>
                {statuses.map((s) => {
                  const checked = activeStatusSet.has(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        const next = new Set(activeStatusSet);
                        if (checked) next.delete(s);
                        else next.add(s);
                        setStatusParam(Array.from(next));
                      }}
                      className={[
                        'rounded border px-2 py-0.5 transition',
                        checked
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted',
                      ].join(' ')}
                      data-testid={`status-toggle-${s}`}
                    >
                      {AWARD_STATUS_LABELS[s]}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Table / empty state */}
        {awards.length === 0 ? (
          <div className="text-muted-foreground bg-muted/20 rounded-lg border border-dashed p-12 text-center">
            <FileX className="mx-auto mb-3 size-10 opacity-50" />
            <p className="font-medium">Aucune attribution</p>
            <p className="mt-1 text-sm">
              {hasActiveFilters
                ? 'Essayez de réinitialiser les filtres.'
                : 'Commencez par créer un plan, puis attribuez à un bénéficiaire.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground bg-muted/30 border-b text-left text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">Award #</th>
                  <th className="px-3 py-2 font-medium">Bénéficiaire</th>
                  <th className="px-3 py-2 font-medium">Plan</th>
                  <th className="px-3 py-2 font-medium">Statut</th>
                  <th className="px-3 py-2 text-right font-medium">Units</th>
                  <th className="px-3 py-2 font-medium">Vesting</th>
                  <th className="px-3 py-2 font-medium">Attribué le</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {awards.map((a) => (
                  <AwardRow
                    key={a.id}
                    award={a}
                    canCancel={canCancel}
                    canModify={canModify}
                    canPropose={canPropose}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modale création */}
      {canPropose ? (
        <CreateAwardModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          plans={plans}
          onSuccess={() => router.refresh()}
        />
      ) : null}

      {/* Modale bulk import — Module 3b B5 */}
      {canBulkImport ? (
        <BulkImportModal
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          plans={plans}
          onSuccess={() => router.refresh()}
        />
      ) : null}
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// AwardRow — 1 ligne du tableau
// ---------------------------------------------------------------------------
function AwardRow({
  award,
  canCancel,
  canModify,
  canPropose,
}: {
  award: AwardListRow;
  canCancel: boolean;
  canModify: boolean;
  canPropose: boolean;
}) {
  const beneficiaryName =
    `${award.beneficiary?.first_name ?? ''} ${award.beneficiary?.last_name ?? ''}`.trim() ||
    award.beneficiary?.email ||
    '—';
  const vestedPct =
    award.units_vested != null && award.units_granted > 0
      ? Math.min(100, Math.round((Number(award.units_vested) / Number(award.units_granted)) * 100))
      : 0;

  return (
    <tr>
      <td className="px-3 py-2 font-mono text-xs">
        <Link
          href={`/dashboard/awards/${award.id}`}
          className="hover:underline"
          data-testid={`award-link-${award.id}`}
        >
          {award.award_number ?? award.id.slice(0, 8)}
        </Link>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col">
          <span>{beneficiaryName}</span>
          <span className="text-muted-foreground text-xs">{award.beneficiary?.email ?? '—'}</span>
        </div>
      </td>
      <td className="px-3 py-2">
        {award.plan ? (
          <Link
            href={`/dashboard/plans/${award.plan.id}`}
            className="inline-flex items-center gap-1.5 hover:underline"
          >
            <span>{award.plan.name}</span>
            <PlanTypeBadge planType={award.plan.plan_type} />
          </Link>
        ) : (
          '—'
        )}
      </td>
      <td className="px-3 py-2">
        <AwardStatusBadge status={award.status as AwardStatus} />
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {award.units_granted.toLocaleString('fr-FR')}
      </td>
      <td className="px-3 py-2">
        {award.units_vested != null && award.units_granted > 0 ? (
          <div className="flex flex-col gap-0.5">
            <div className="text-xs">
              {Number(award.units_vested).toLocaleString('fr-FR')} /{' '}
              {award.units_granted.toLocaleString('fr-FR')}
            </div>
            <div className="bg-muted h-1.5 w-24 overflow-hidden rounded-full">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${vestedPct}%` }}
                aria-label={`${vestedPct} % vesté`}
              />
            </div>
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </td>
      <td className="text-muted-foreground px-3 py-2 text-xs">{formatDate(award.grant_date)}</td>
      <td className="px-3 py-2 text-right">
        <AwardRowActions
          awardId={award.id}
          status={award.status as AwardStatus}
          canCancel={canCancel}
          canModify={canModify}
          canPropose={canPropose}
        />
      </td>
    </tr>
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

// Debounce simple module-scope (1 timer global suffit pour le cas single-input)
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedUpdate(fn: () => void, ms = 300) {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(fn, ms);
}
