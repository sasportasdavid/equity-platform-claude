'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Eye, Loader2, MoreHorizontal, UserMinus, XCircle, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { cancelAward, forfeitAward, transitionAward } from '@/server/actions/awards';
import {
  getAllowedTransitions,
  isCancellable,
  isPostGrantStatus,
  type AwardStatus,
} from '@/lib/stateMachines/awardStateMachine';
import { AWARD_STATUS_LABELS } from './AwardStatusBadge';

const LEAVER_TYPES = [
  { value: 'resignation', label: 'Démission' },
  { value: 'termination_cause', label: 'Licenciement (faute)' },
  { value: 'termination_no_cause', label: 'Licenciement (sans faute)' },
  { value: 'death', label: 'Décès' },
  { value: 'retirement', label: 'Retraite' },
  { value: 'company_sale', label: 'Cession société' },
  { value: 'mutual_agreement', label: 'Rupture conventionnelle' },
  { value: 'end_of_contract', label: 'Fin de contrat' },
] as const;

type LeaverType = (typeof LEAVER_TYPES)[number]['value'];

/**
 * Dropdown actions par ligne — Module 3b B3.
 *
 * Actions affichées conditionnellement selon le status + permissions :
 *   - Voir détail (lien — page B4)
 *   - Cancel (si isCancellable + canCancel)
 *   - Forfeit (si isPostGrantStatus + canModify)
 *   - Forcer transition (admin debug — sous-menu avec
 *     getAllowedTransitions(current))
 */
export function AwardRowActions({
  awardId,
  status,
  canCancel,
  canModify,
  canPropose,
}: {
  awardId: string;
  status: AwardStatus;
  canCancel: boolean;
  canModify: boolean;
  canPropose: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [forfeitOpen, setForfeitOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [leaverType, setLeaverType] = useState<LeaverType>('resignation');
  const [eventDate, setEventDate] = useState(new Date().toISOString().slice(0, 10));
  const [forfeitReason, setForfeitReason] = useState('');

  const transitions = getAllowedTransitions(status);
  const showCancel = canCancel && isCancellable(status);
  const showForfeit = canModify && isPostGrantStatus(status) && status !== 'FORFEITED';

  function handleConfirmCancel() {
    startTransition(async () => {
      const res = await cancelAward({ awardId, reason: cancelReason });
      if (res.ok) {
        toast.success('Attribution annulée');
        setCancelOpen(false);
        setCancelReason('');
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleConfirmForfeit() {
    startTransition(async () => {
      const res = await forfeitAward({
        awardId,
        leaverType,
        eventDate,
        reason: forfeitReason || undefined,
      });
      if (res.ok) {
        toast.success('Attribution confisquée (forfeit)');
        setForfeitOpen(false);
        setForfeitReason('');
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleTransition(toStatus: AwardStatus) {
    startTransition(async () => {
      const res = await transitionAward({ awardId, toStatus });
      if (res.ok) {
        toast.success(`Transition → ${AWARD_STATUS_LABELS[toStatus]}`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={pending}
              data-testid={`award-actions-${awardId}`}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MoreHorizontal className="size-4" />
              )}
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-[200px]">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Award</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => router.push(`/dashboard/awards/${awardId}`)}
            data-testid={`view-detail-${awardId}`}
          >
            <Eye className="mr-2 size-4" />
            Voir le détail
          </DropdownMenuItem>

          {canPropose && transitions.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-muted-foreground text-[10px] uppercase">
                  Forcer transition (debug)
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              {transitions.map((to) => (
                <DropdownMenuItem
                  key={to}
                  onClick={() => handleTransition(to)}
                  disabled={pending}
                  data-testid={`force-transition-${to}`}
                >
                  <ChevronDown className="mr-2 size-4 -rotate-90" />→ {AWARD_STATUS_LABELS[to]}
                </DropdownMenuItem>
              ))}
            </>
          ) : null}

          {showCancel ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setCancelOpen(true)}
                className="text-destructive focus:text-destructive"
                data-testid={`cancel-${awardId}`}
              >
                <XCircle className="mr-2 size-4" />
                Annuler
              </DropdownMenuItem>
            </>
          ) : null}

          {showForfeit ? (
            <>
              {!showCancel ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                onClick={() => setForfeitOpen(true)}
                className="text-orange-600 focus:text-orange-700"
                data-testid={`forfeit-${awardId}`}
              >
                <UserMinus className="mr-2 size-4" />
                Forfeit (leaver)
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Cancel AlertDialog */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler cette attribution ?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;attribution passera en statut CANCELLED. Cette action est définitive — les
              awards annulés ne peuvent pas être restaurés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5 py-2">
            <Label htmlFor="cancel-reason">Raison *</Label>
            <Input
              id="cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Ex. Erreur de saisie, retrait demandé…"
              data-testid="cancel-reason-input"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Retour</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCancel}
              disabled={!cancelReason.trim() || pending}
              data-testid="cancel-confirm"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : 'Confirmer cancel'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Forfeit Dialog */}
      <Dialog open={forfeitOpen} onOpenChange={setForfeitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Zap className="mr-2 inline size-5 text-orange-500" />
              Forfeit (leaver event)
            </DialogTitle>
            <DialogDescription>
              Confisque l&apos;attribution suite à un événement leaver. Les units non-vested partent
              ; le treatment fin (forfeit_all/keep_vested/pro_rata) sera appliqué au Module 9.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="leaver-type">Type d&apos;événement *</Label>
              <select
                id="leaver-type"
                value={leaverType}
                onChange={(e) => setLeaverType(e.target.value as LeaverType)}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                {LEAVER_TYPES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event-date">Date événement *</Label>
              <Input
                id="event-date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="forfeit-reason">Commentaire (optionnel)</Label>
              <Input
                id="forfeit-reason"
                value={forfeitReason}
                onChange={(e) => setForfeitReason(e.target.value)}
                placeholder="Précisions internes…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForfeitOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button
              onClick={handleConfirmForfeit}
              disabled={pending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : 'Confirmer forfeit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
