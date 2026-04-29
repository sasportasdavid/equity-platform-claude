'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Edit3, Mail, MoreHorizontal, Trash2, UserCheck, UserMinus, UserX } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TransitionLifecycleDialog } from '@/components/beneficiaries/TransitionLifecycleDialog';
import { EditBeneficiaryModal } from '@/components/beneficiaries/EditBeneficiaryModal';
import { BeneficiaryProfileTab } from '@/components/beneficiaries/detail/BeneficiaryProfileTab';
import { BeneficiaryAwardsTab } from '@/components/beneficiaries/detail/BeneficiaryAwardsTab';
import { BeneficiaryDocumentsTab } from '@/components/beneficiaries/detail/BeneficiaryDocumentsTab';
import { BeneficiaryAuditTab } from '@/components/beneficiaries/detail/BeneficiaryAuditTab';
import { archiveBeneficiary, inviteBeneficiary } from '@/server/actions/beneficiaries';
import type { BeneficiaryDetailRow } from '@/server/queries/beneficiaries';
import type { PlanForCreation } from '@/server/queries/awards';

type Perms = {
  canUpdate: boolean;
  canDelete: boolean;
  canInvite: boolean;
  canLifecycle: boolean;
  canPropose: boolean;
};

export function BeneficiaryDetailClient({
  detail,
  plans,
  perms,
}: {
  detail: BeneficiaryDetailRow;
  plans: PlanForCreation[];
  perms: Perms;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [lifecycleOpen, setLifecycleOpen] = useState<null | 'active' | 'on_leave' | 'terminated'>(
    null,
  );

  const bene = detail.beneficiary;
  const fullName = `${bene.first_name} ${bene.last_name}`.trim() || bene.email;
  const wasInvited = !!bene.invited_at;
  const isTerminated = bene.status === 'terminated';
  const isActive = bene.status === 'active';
  const isOnLeave = bene.status === 'on_leave';
  const hasActiveAwards = detail.stats.activeAwardsCount > 0;

  function handleInvite() {
    startTransition(async () => {
      const res = await inviteBeneficiary({ beneficiaryId: bene.id });
      if (res.ok) {
        toast.success(wasInvited ? 'Magic link renvoyé' : 'Invitation envoyée');
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleArchiveConfirm() {
    if (archiveReason.trim().length < 1) return;
    startTransition(async () => {
      const res = await archiveBeneficiary({
        beneficiaryId: bene.id,
        reason: archiveReason.trim(),
      });
      if (res.ok) {
        toast.success('Bénéficiaire archivé');
        router.push('/dashboard/beneficiaries');
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Actions header */}
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="hover:bg-muted text-muted-foreground inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors"
            aria-label={`Actions pour ${fullName}`}
            data-testid="beneficiary-detail-actions"
          >
            <MoreHorizontal className="size-4" />
            Actions
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[210px]">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="truncate">{fullName}</DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />

            {perms.canUpdate ? (
              <DropdownMenuItem onClick={() => setEditOpen(true)} data-testid="action-edit">
                <Edit3 className="mr-2 size-3.5" />
                Modifier
              </DropdownMenuItem>
            ) : null}

            {perms.canInvite && !isTerminated ? (
              <DropdownMenuItem onClick={handleInvite} data-testid="action-invite">
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
                      data-testid="action-on-leave"
                    >
                      <UserMinus className="mr-2 size-3.5 text-amber-600" />
                      Mettre en congé
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setLifecycleOpen('terminated')}
                      className="text-destructive focus:text-destructive"
                      data-testid="action-terminated"
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
                      data-testid="action-reactivate"
                    >
                      <UserCheck className="mr-2 size-3.5 text-emerald-600" />
                      Réactiver
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setLifecycleOpen('terminated')}
                      className="text-destructive focus:text-destructive"
                      data-testid="action-terminated"
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
                  disabled={hasActiveAwards}
                  title={
                    hasActiveAwards
                      ? `${detail.stats.activeAwardsCount} award(s) actif(s) — utiliser "Marquer comme parti"`
                      : 'Archiver le bénéficiaire'
                  }
                  className="text-destructive focus:text-destructive"
                  data-testid="action-archive"
                >
                  <Trash2 className="mr-2 size-3.5" />
                  Archiver
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile" data-testid="tab-profile">
            Profil
          </TabsTrigger>
          <TabsTrigger value="awards" data-testid="tab-awards">
            Awards ({detail.stats.totalAwardsCount})
          </TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents">
            Documents
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit">
            Audit ({detail.auditEvents.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <BeneficiaryProfileTab
            detail={detail}
            canUpdate={perms.canUpdate}
            onEdit={() => setEditOpen(true)}
          />
        </TabsContent>
        <TabsContent value="awards">
          <BeneficiaryAwardsTab detail={detail} plans={plans} canPropose={perms.canPropose} />
        </TabsContent>
        <TabsContent value="documents">
          <BeneficiaryDocumentsTab />
        </TabsContent>
        <TabsContent value="audit">
          <BeneficiaryAuditTab events={detail.auditEvents} />
        </TabsContent>
      </Tabs>

      {/* Edit modal */}
      {perms.canUpdate ? (
        <EditBeneficiaryModal
          open={editOpen}
          onOpenChange={setEditOpen}
          beneficiary={bene}
          onSuccess={() => router.refresh()}
        />
      ) : null}

      {/* Archive AlertDialog */}
      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiver {fullName} ?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;archivage est un soft-delete. Bloqué par la DB si des awards actifs existent —
              utiliser le statut &laquo; sorti &raquo; à la place.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="archive-reason-detail">Raison *</Label>
            <Input
              id="archive-reason-detail"
              value={archiveReason}
              onChange={(e) => setArchiveReason(e.target.value)}
              placeholder="Ex. Doublon avec un autre profil"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArchiveConfirm}
              disabled={archiveReason.trim().length < 1}
            >
              Archiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lifecycle dialog */}
      {lifecycleOpen ? (
        <TransitionLifecycleDialog
          open={lifecycleOpen != null}
          onOpenChange={(o) => !o && setLifecycleOpen(null)}
          beneficiaryId={bene.id}
          beneficiaryName={fullName}
          toStatus={lifecycleOpen}
          onSuccess={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
