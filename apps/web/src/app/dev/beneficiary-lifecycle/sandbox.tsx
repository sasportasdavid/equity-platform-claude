'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Mail, Plus, RefreshCw, Trash2, UserCheck, UserMinus, UserX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  archiveBeneficiary,
  createBeneficiary,
  inviteBeneficiary,
  transitionBeneficiaryLifecycle,
} from '@/server/actions/beneficiaries';

type BeneRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  status: string;
  beneficiary_type: string;
  hire_date: string | null;
  termination_date: string | null;
  lifecycle_changed_at: string | null;
  lifecycle_change_reason: string | null;
  invited_at: string | null;
  invitation_count: number | null;
  first_login_at: string | null;
  deleted_at: string | null;
  created_at: string;
  activeAwardsCount: number;
};

type AuditRow = {
  id: string;
  event_type: string;
  resource_id: string | null;
  metadata: unknown;
  occurred_at: string;
  user_email: string | null;
};

const STATUS_TONE: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/40',
  on_leave: 'bg-amber-500/10 text-amber-700 border-amber-500/40',
  terminated: 'bg-destructive/10 text-destructive border-destructive/40',
};

/**
 * Sandbox lifecycle bénéficiaires — Module 4 B2.
 *
 * 6 sections :
 *   - Header + bouton "Créer test"
 *   - Form create test (collapsable)
 *   - Liste 20 bénéficiaires avec actions inline (transition / invite /
 *     archive selon état)
 *   - Audit events 20 derniers
 *
 * Toutes les actions appellent les Server Actions Module 4 B2.
 */
export function Sandbox({
  beneficiaries,
  auditEvents,
}: {
  beneficiaries: BeneRow[];
  auditEvents: AuditRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');

  function refresh() {
    router.refresh();
  }

  function handleCreate() {
    if (!newEmail || !newFirstName || !newLastName) return;
    startTransition(async () => {
      const res = await createBeneficiary({
        email: newEmail,
        firstName: newFirstName,
        lastName: newLastName,
        beneficiaryType: 'EMPLOYEE',
        country: 'FR',
        taxResidence: 'FR',
        isTaxResidentFrance: true,
      });
      if (res.ok) {
        toast.success(`Bénéficiaire créé : ${res.id.slice(0, 8)}…`);
        setNewEmail('');
        setNewFirstName('');
        setNewLastName('');
        setShowCreate(false);
        refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleTransition(id: string, toStatus: 'active' | 'on_leave' | 'terminated') {
    const reason = window.prompt(`Raison de la transition vers ${toStatus} (min 10 chars) :`);
    if (!reason || reason.length < 10) {
      toast.error('Raison requise (min 10 caractères)');
      return;
    }
    let terminationDate: string | undefined;
    if (toStatus === 'terminated') {
      const today = new Date().toISOString().slice(0, 10);
      const dt = window.prompt('Date de termination (YYYY-MM-DD) :', today);
      if (!dt) {
        toast.error('Date de termination requise');
        return;
      }
      terminationDate = dt;
    }
    startTransition(async () => {
      const res = await transitionBeneficiaryLifecycle({
        beneficiaryId: id,
        toStatus,
        reason,
        terminationDate,
      });
      if (res.ok) {
        toast.success(`Status → ${toStatus}`);
        refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleInvite(id: string, isReinvite: boolean) {
    startTransition(async () => {
      const res = await inviteBeneficiary({ beneficiaryId: id });
      if (res.ok) {
        toast.success(isReinvite ? 'Magic link renvoyé' : 'Invitation envoyée');
        refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleArchive(id: string, hasAwards: boolean) {
    if (hasAwards) {
      toast.error("Impossible d'archiver : awards actifs existants");
      return;
    }
    const reason = window.prompt("Raison de l'archivage :", 'Test sandbox');
    if (!reason) return;
    startTransition(async () => {
      const res = await archiveBeneficiary({ beneficiaryId: id, reason });
      if (res.ok) {
        toast.success('Bénéficiaire archivé');
        refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Dev · Beneficiary Lifecycle Sandbox
        </h1>
        <p className="text-muted-foreground text-sm">
          Module 4 B2 — Tester toutes les transitions du lifecycle, l&apos;invitation magic link, et
          l&apos;archive (avec/sans awards actifs). Page protégée par layout /dev/* en prod.
        </p>
      </header>

      <div className="flex justify-end">
        <Button onClick={() => setShowCreate((s) => !s)} variant="outline" size="sm">
          <Plus className="mr-2 size-4" />
          {showCreate ? 'Annuler' : 'Créer un bénéficiaire test'}
        </Button>
      </div>

      {showCreate ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Création test rapide</CardTitle>
            <CardDescription>EMPLOYEE / FR / résident fiscal FR par défaut.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-email">Email *</Label>
                <Input
                  id="new-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="test@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-first">Prénom *</Label>
                <Input
                  id="new-first"
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-last">Nom *</Label>
                <Input
                  id="new-last"
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button onClick={handleCreate} disabled={pending} size="sm">
                Créer
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">
                {beneficiaries.length} bénéficiaire{beneficiaries.length > 1 ? 's' : ''}
              </CardTitle>
              <CardDescription>20 derniers (créés DESC)</CardDescription>
            </div>
            <Button onClick={refresh} variant="ghost" size="icon-sm" disabled={pending}>
              <RefreshCw className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {beneficiaries.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucun bénéficiaire dans cette org.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground border-b text-left text-xs uppercase">
                  <tr>
                    <th className="px-2 py-2 font-medium">Email</th>
                    <th className="px-2 py-2 font-medium">Nom</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 text-right font-medium">Awards actifs</th>
                    <th className="px-2 py-2 font-medium">Invité</th>
                    <th className="px-2 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {beneficiaries.map((b) => (
                    <tr key={b.id} data-testid={`bene-row-${b.id}`}>
                      <td className="px-2 py-2 font-mono text-xs">{b.email}</td>
                      <td className="px-2 py-2">
                        {b.first_name} {b.last_name}
                      </td>
                      <td className="px-2 py-2">
                        <Badge
                          variant="outline"
                          className={`font-medium ${STATUS_TONE[b.status] ?? ''}`}
                        >
                          {b.status}
                        </Badge>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{b.activeAwardsCount}</td>
                      <td className="px-2 py-2 text-xs">
                        {b.invited_at ? (
                          <span className="text-muted-foreground">
                            ✓ ({b.invitation_count ?? 1}×)
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          {b.status === 'active' ? (
                            <>
                              <Button
                                size="icon-sm"
                                variant="outline"
                                title="→ on_leave"
                                onClick={() => handleTransition(b.id, 'on_leave')}
                                disabled={pending}
                              >
                                <UserMinus className="size-3 text-amber-600" />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="outline"
                                title="→ terminated"
                                onClick={() => handleTransition(b.id, 'terminated')}
                                disabled={pending}
                              >
                                <UserX className="text-destructive size-3" />
                              </Button>
                            </>
                          ) : null}
                          {b.status === 'on_leave' ? (
                            <>
                              <Button
                                size="icon-sm"
                                variant="outline"
                                title="→ active"
                                onClick={() => handleTransition(b.id, 'active')}
                                disabled={pending}
                              >
                                <UserCheck className="size-3 text-emerald-600" />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="outline"
                                title="→ terminated"
                                onClick={() => handleTransition(b.id, 'terminated')}
                                disabled={pending}
                              >
                                <UserX className="text-destructive size-3" />
                              </Button>
                            </>
                          ) : null}
                          {b.status !== 'terminated' ? (
                            <Button
                              size="icon-sm"
                              variant="outline"
                              title={b.invited_at ? 'Réinviter' : 'Inviter'}
                              onClick={() => handleInvite(b.id, !!b.invited_at)}
                              disabled={pending}
                            >
                              <Mail className="size-3" />
                            </Button>
                          ) : null}
                          <Button
                            size="icon-sm"
                            variant="outline"
                            title={
                              b.activeAwardsCount > 0
                                ? `${b.activeAwardsCount} award(s) actif(s) — bloqué`
                                : 'Archiver'
                            }
                            onClick={() => handleArchive(b.id, b.activeAwardsCount > 0)}
                            disabled={pending || b.activeAwardsCount > 0}
                          >
                            <Trash2 className="text-destructive size-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit events — 20 derniers (BENEFICIARY)</CardTitle>
        </CardHeader>
        <CardContent>
          {auditEvents.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucun audit event.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {auditEvents.map((ev) => (
                <li
                  key={ev.id}
                  className="bg-muted/30 flex items-start gap-2 rounded border p-2 font-mono"
                >
                  <span className="text-muted-foreground shrink-0">
                    {new Date(ev.occurred_at).toLocaleTimeString('fr-FR')}
                  </span>
                  <span className="text-primary shrink-0 font-semibold">{ev.event_type}</span>
                  <span className="truncate">
                    {ev.resource_id?.slice(0, 8) ?? '—'} · {ev.user_email ?? '—'} ·{' '}
                    {JSON.stringify(ev.metadata).slice(0, 100)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
