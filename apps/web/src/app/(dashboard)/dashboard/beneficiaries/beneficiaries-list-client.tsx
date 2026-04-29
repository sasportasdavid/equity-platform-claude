'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  CheckCircle2,
  FileSpreadsheet,
  FilterX,
  Mail,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  UserCheck,
  UserMinus,
  UserX,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageShell } from '@/components/shared/PageShell';
import { BeneficiaryStatusBadge } from '@/components/shared/beneficiary-status-badge';
import { BeneficiaryTypeBadge } from '@/components/shared/beneficiary-type-badge';
import { TransitionLifecycleDialog } from '@/components/beneficiaries/TransitionLifecycleDialog';
import { archiveBeneficiary, inviteBeneficiary } from '@/server/actions/beneficiaries';
import type { BeneficiaryListRow, ListBeneficiariesFilters } from '@/server/queries/beneficiaries';

type Perms = {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canInvite: boolean;
  canLifecycle: boolean;
  canBulkImport: boolean;
};

const STATUS_OPTIONS: Array<{ value: 'active' | 'on_leave' | 'terminated'; label: string }> = [
  { value: 'active', label: 'Actifs' },
  { value: 'on_leave', label: 'En congé' },
  { value: 'terminated', label: 'Sortis' },
];

const TYPE_OPTIONS = [
  { value: 'EMPLOYEE', label: 'Salarié' },
  { value: 'OFFICER', label: 'Dirigeant' },
  { value: 'CONSULTANT', label: 'Consultant' },
  { value: 'ADVISOR', label: 'Advisor' },
  { value: 'OTHER', label: 'Autre' },
];

const CONTRACT_OPTIONS = [
  { value: 'CDI', label: 'CDI' },
  { value: 'CDD', label: 'CDD' },
  { value: 'STAGE', label: 'Stage' },
  { value: 'ALTERNANCE', label: 'Alternance' },
  { value: 'CONSULTANT', label: 'Consultant' },
  { value: 'MANDATAIRE_SOCIAL', label: 'Mandataire social' },
  { value: 'AUTRE', label: 'Autre' },
];

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
function debouncedUpdate(fn: () => void, ms = 300) {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(fn, ms);
}

export function BeneficiariesListClient({
  beneficiaries,
  filters,
  perms,
}: {
  beneficiaries: BeneficiaryListRow[];
  filters: ListBeneficiariesFilters;
  perms: Perms;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function setParam(key: string, value: string | undefined) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value) params.delete(key);
    else params.set(key, value);
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  }

  function toggleListParam(key: string, value: string, currentValues: string[] | undefined) {
    const set = new Set(currentValues ?? []);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    setParam(key, set.size === 0 ? undefined : Array.from(set).join(','));
  }

  const activeStatusSet = useMemo(() => new Set(filters.statuses ?? []), [filters.statuses]);
  const activeTypeSet = useMemo(() => new Set(filters.types ?? []), [filters.types]);
  const activeContractSet = useMemo(
    () => new Set(filters.contractTypes ?? []),
    [filters.contractTypes],
  );

  const hasActiveFilters =
    !!filters.search ||
    activeStatusSet.size > 0 ||
    activeTypeSet.size > 0 ||
    activeContractSet.size > 0 ||
    !!filters.hasAwards ||
    !!filters.taxResidentFrance ||
    !!filters.hireDateFrom ||
    !!filters.hireDateTo;

  return (
    <PageShell
      title="Bénéficiaires"
      description={`${beneficiaries.length} bénéficiaire${beneficiaries.length > 1 ? 's' : ''} affiché${beneficiaries.length > 1 ? 's' : ''}`}
      actions={
        <div className="flex gap-2">
          {perms.canBulkImport ? (
            <Button variant="outline" disabled title="Disponible en B5">
              <FileSpreadsheet className="mr-2 size-4" />
              Import CSV
            </Button>
          ) : null}
          {perms.canCreate ? (
            <Button disabled title="Disponible en B5" data-testid="new-beneficiary-button">
              <Plus className="mr-2 size-4" />
              Nouveau bénéficiaire
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Filtres */}
        <div className="bg-card space-y-3 rounded-lg border p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="relative">
              <Search className="text-muted-foreground absolute left-2 top-1/2 size-4 -translate-y-1/2" />
              <Input
                type="text"
                placeholder="Recherche nom / email / poste"
                defaultValue={filters.search ?? ''}
                onChange={(e) =>
                  debouncedUpdate(() => setParam('search', e.target.value || undefined))
                }
                className="pl-8"
                data-testid="beneficiaries-search"
              />
            </div>
            <select
              value={filters.hasAwards ?? ''}
              onChange={(e) => setParam('hasAwards', e.target.value || undefined)}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              data-testid="filter-has-awards"
            >
              <option value="">Tous (avec / sans awards)</option>
              <option value="with">Avec attributions</option>
              <option value="without">Sans attribution</option>
            </select>
            <select
              value={filters.taxResidentFrance ?? ''}
              onChange={(e) => setParam('taxFR', e.target.value || undefined)}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              data-testid="filter-tax-fr"
            >
              <option value="">Résidence fiscale (toutes)</option>
              <option value="yes">Résident FR</option>
              <option value="no">Non-résident</option>
            </select>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-[11px] uppercase">Embauché entre</Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={filters.hireDateFrom ?? ''}
                  onChange={(e) => setParam('hireFrom', e.target.value || undefined)}
                  className="h-8"
                  data-testid="filter-hire-from"
                />
                <Input
                  type="date"
                  value={filters.hireDateTo ?? ''}
                  onChange={(e) => setParam('hireTo', e.target.value || undefined)}
                  className="h-8"
                  data-testid="filter-hire-to"
                />
              </div>
            </div>
            {hasActiveFilters ? (
              <div className="flex items-end justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.replace(pathname)}
                  data-testid="filters-clear"
                >
                  <FilterX className="mr-2 size-4" />
                  Réinitialiser tous les filtres
                </Button>
              </div>
            ) : null}
          </div>

          {/* Status / Type / Contract toggles */}
          <FilterToggleGroup
            label="Statut"
            options={STATUS_OPTIONS}
            activeSet={activeStatusSet}
            onToggle={(v) => toggleListParam('status', v, filters.statuses)}
            testIdPrefix="status"
          />
          <FilterToggleGroup
            label="Type"
            options={TYPE_OPTIONS}
            activeSet={activeTypeSet}
            onToggle={(v) => toggleListParam('type', v, filters.types)}
            testIdPrefix="type"
          />
          <FilterToggleGroup
            label="Contrat"
            options={CONTRACT_OPTIONS}
            activeSet={activeContractSet}
            onToggle={(v) => toggleListParam('contract', v, filters.contractTypes)}
            testIdPrefix="contract"
          />
        </div>

        {/* Table or Empty state */}
        {beneficiaries.length === 0 ? (
          <div className="text-muted-foreground bg-muted/20 rounded-lg border border-dashed p-12 text-center">
            <Users className="mx-auto mb-3 size-10 opacity-50" />
            <p className="font-medium">
              {hasActiveFilters
                ? 'Aucun bénéficiaire ne correspond aux filtres'
                : 'Aucun bénéficiaire'}
            </p>
            <p className="mt-1 text-sm">
              {hasActiveFilters
                ? 'Essayez de réinitialiser les filtres ou élargir la recherche.'
                : 'Commencez par créer votre premier bénéficiaire ou importer une liste CSV.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground bg-muted/30 border-b text-left text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">Nom</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Statut</th>
                  <th className="px-3 py-2 font-medium">Contrat</th>
                  <th className="px-3 py-2 font-medium">Embauche</th>
                  <th className="px-3 py-2 text-right font-medium">Awards</th>
                  <th className="px-3 py-2 text-center font-medium">Tax FR</th>
                  <th className="px-3 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {beneficiaries.map((b) => (
                  <BeneficiaryRow key={b.id} bene={b} perms={perms} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// FilterToggleGroup
// ---------------------------------------------------------------------------

function FilterToggleGroup({
  label,
  options,
  activeSet,
  onToggle,
  testIdPrefix,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  activeSet: Set<string>;
  onToggle: (v: string) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted-foreground pr-1 text-[11px] font-medium uppercase">{label}</span>
      {options.map((opt) => {
        const checked = activeSet.has(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            className={[
              'rounded border px-2 py-0.5 transition',
              checked
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted',
            ].join(' ')}
            data-testid={`filter-${testIdPrefix}-${opt.value}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// BeneficiaryRow + Row Actions
// ---------------------------------------------------------------------------

function BeneficiaryRow({ bene, perms }: { bene: BeneficiaryListRow; perms: Perms }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [lifecycleOpen, setLifecycleOpen] = useState<null | 'active' | 'on_leave' | 'terminated'>(
    null,
  );

  const fullName = `${bene.first_name} ${bene.last_name}`.trim() || bene.email;
  const wasInvited = !!bene.invited_at;
  const hasLoggedIn = !!bene.first_login_at;
  const isTerminated = bene.status === 'terminated';
  const isActive = bene.status === 'active';
  const isOnLeave = bene.status === 'on_leave';

  function handleInvite() {
    startTransition(async () => {
      const res = await inviteBeneficiary({ beneficiaryId: bene.id });
      if (res.ok) toast.success(wasInvited ? 'Magic link renvoyé' : 'Invitation envoyée');
      else toast.error(res.error);
    });
  }

  function handleArchiveConfirm() {
    if (archiveReason.trim().length < 1) {
      toast.error('Raison requise');
      return;
    }
    startTransition(async () => {
      const res = await archiveBeneficiary({
        beneficiaryId: bene.id,
        reason: archiveReason.trim(),
      });
      if (res.ok) {
        toast.success(`${fullName} archivé`);
        setArchiveOpen(false);
        setArchiveReason('');
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      <tr data-testid={`beneficiary-row-${bene.id}`}>
        <td className="px-3 py-2">
          <Link
            href={`/dashboard/beneficiaries/${bene.id}`}
            className="font-medium hover:underline"
            data-testid={`beneficiary-link-${bene.id}`}
          >
            {fullName}
          </Link>
          {bene.job_title ? (
            <p className="text-muted-foreground text-xs">{bene.job_title}</p>
          ) : null}
        </td>
        <td className="px-3 py-2 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-mono">{bene.email}</span>
            {wasInvited ? (
              <Mail
                className="text-muted-foreground size-3"
                aria-label={`Invité ${bene.invitation_count ?? 1}× le ${bene.invited_at}`}
              />
            ) : null}
            {hasLoggedIn ? (
              <CheckCircle2 className="size-3 text-emerald-600" aria-label="A déjà connecté" />
            ) : null}
          </div>
        </td>
        <td className="px-3 py-2">
          <BeneficiaryTypeBadge type={bene.beneficiary_type} />
        </td>
        <td className="px-3 py-2">
          <BeneficiaryStatusBadge status={bene.status} />
        </td>
        <td className="text-muted-foreground px-3 py-2 text-xs">{bene.contract_type ?? '—'}</td>
        <td className="text-muted-foreground px-3 py-2 font-mono text-xs">
          {formatDate(bene.hire_date)}
        </td>
        <td className="px-3 py-2 text-right">
          {bene.awards_count > 0 ? (
            <Link
              href={`/dashboard/awards?beneficiaryId=${bene.id}`}
              className="font-mono tabular-nums hover:underline"
            >
              {bene.awards_count}
            </Link>
          ) : (
            <span className="text-muted-foreground/60 font-mono">0</span>
          )}
        </td>
        <td className="text-center text-xs">
          {bene.is_tax_resident_france ? (
            <span className="text-emerald-600">✓</span>
          ) : (
            <span className="text-muted-foreground/60">—</span>
          )}
        </td>
        <td className="px-3 py-2 text-right">
          <DropdownMenu>
            <DropdownMenuTrigger
              className="hover:bg-muted text-muted-foreground inline-flex size-8 items-center justify-center rounded-md transition-colors"
              aria-label={`Actions pour ${fullName}`}
              data-testid={`beneficiary-actions-${bene.id}`}
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[210px]">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="truncate">{fullName}</DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={() => router.push(`/dashboard/beneficiaries/${bene.id}`)}
                data-testid={`view-detail-${bene.id}`}
              >
                Voir détail
              </DropdownMenuItem>

              {perms.canUpdate ? (
                <DropdownMenuItem disabled title="Modale Edit livrée en B4">
                  Modifier
                </DropdownMenuItem>
              ) : null}

              {perms.canInvite && !isTerminated ? (
                <DropdownMenuItem onClick={handleInvite} data-testid={`invite-${bene.id}`}>
                  <Mail className="mr-2 size-3.5" />
                  {wasInvited ? 'Réinviter au portail' : 'Inviter au portail'}
                </DropdownMenuItem>
              ) : null}

              {perms.canLifecycle ? (
                <>
                  <DropdownMenuSeparator />
                  {isActive ? (
                    <>
                      <DropdownMenuItem
                        onClick={() => setLifecycleOpen('on_leave')}
                        data-testid={`transition-on-leave-${bene.id}`}
                      >
                        <UserMinus className="mr-2 size-3.5 text-amber-600" />
                        Mettre en congé
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setLifecycleOpen('terminated')}
                        className="text-destructive focus:text-destructive"
                        data-testid={`transition-terminated-${bene.id}`}
                      >
                        <UserX className="mr-2 size-3.5" />
                        Marquer comme parti
                      </DropdownMenuItem>
                    </>
                  ) : null}
                  {isOnLeave ? (
                    <>
                      <DropdownMenuItem
                        onClick={() => setLifecycleOpen('active')}
                        data-testid={`transition-active-${bene.id}`}
                      >
                        <UserCheck className="mr-2 size-3.5 text-emerald-600" />
                        Réactiver
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setLifecycleOpen('terminated')}
                        className="text-destructive focus:text-destructive"
                        data-testid={`transition-terminated-${bene.id}`}
                      >
                        <UserX className="mr-2 size-3.5" />
                        Marquer comme parti
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </>
              ) : null}

              {perms.canDelete && !isTerminated ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setArchiveOpen(true)}
                    disabled={bene.awards_count > 0}
                    title={
                      bene.awards_count > 0
                        ? `${bene.awards_count} award(s) actif(s) — utilisez "Marquer comme parti"`
                        : 'Archiver le bénéficiaire'
                    }
                    className="text-destructive focus:text-destructive"
                    data-testid={`archive-${bene.id}`}
                  >
                    <Trash2 className="mr-2 size-3.5" />
                    Archiver
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      </tr>

      {/* Archive AlertDialog */}
      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiver {fullName} ?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;archivage est un soft-delete. Le bénéficiaire disparaît des listes mais peut
              être restauré (corbeille à venir). Action bloquée par la DB si des awards actifs
              existent — utiliser le statut &laquo; sorti &raquo; à la place.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor={`archive-reason-${bene.id}`}>Raison *</Label>
            <Input
              id={`archive-reason-${bene.id}`}
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              placeholder="Ex. Doublon avec un autre profil"
              data-testid={`archive-reason-${bene.id}`}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArchiveConfirm}
              disabled={archiveReason.trim().length < 1}
              data-testid={`archive-confirm-${bene.id}`}
            >
              Archiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lifecycle Dialog */}
      {lifecycleOpen ? (
        <TransitionLifecycleDialog
          open={lifecycleOpen != null}
          onOpenChange={(o) => !o && setLifecycleOpen(null)}
          beneficiaryId={bene.id}
          beneficiaryName={fullName}
          toStatus={lifecycleOpen}
        />
      ) : null}
    </>
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
