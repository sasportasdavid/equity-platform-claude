'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PageShell } from '@/components/shared/PageShell';
import {
  cancelPendingNotification,
  renderPendingNotificationsBatch,
} from '@/server/actions/notifications';
import type { NotificationRow, NotificationStats } from '@/server/queries/notifications';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'secondary',
  SENDING: 'secondary',
  SENT: 'default',
  DELIVERED: 'default',
  FAILED: 'destructive',
  BOUNCED: 'destructive',
  COMPLAINED: 'destructive',
};

const STATUSES = ['PENDING', 'SENDING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED', 'COMPLAINED'];
const CHANNELS = ['EMAIL', 'IN_APP', 'SMS'];
const TEMPLATES = [
  'magic_link_login',
  'beneficiary_invitation',
  'document_signed_creator',
  'workflow_approved_target',
  'workflow_rejected_target',
  'approval_pending',
  'approval_approved',
  'approval_rejected',
  'award_granted',
];

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export function NotificationsAdminClient({
  stats,
  rows,
  canAct,
  initialFilters,
}: {
  stats: NotificationStats;
  rows: NotificationRow[];
  canAct: boolean;
  initialFilters: { status: string; channel: string; templateCode: string; recipient: string };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filters, setFilters] = useState(initialFilters);
  const [previewRow, setPreviewRow] = useState<NotificationRow | null>(null);

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.channel) params.set('channel', filters.channel);
    if (filters.templateCode) params.set('template', filters.templateCode);
    if (filters.recipient) params.set('recipient', filters.recipient);
    startTransition(() => {
      router.push(`/dashboard/settings/notifications?${params.toString()}`);
    });
  };

  const resetFilters = () => {
    setFilters({ status: '', channel: '', templateCode: '', recipient: '' });
    startTransition(() => {
      router.push('/dashboard/settings/notifications');
    });
  };

  const handleCancel = (id: string) => {
    startTransition(async () => {
      const res = await cancelPendingNotification({ notificationId: id });
      if (res.ok) {
        toast.success('Notification annulée');
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  const handleRenderBatch = () => {
    startTransition(async () => {
      const res = await renderPendingNotificationsBatch({ batchSize: 50 });
      if (res.ok) {
        toast.success(`Rendu : ${res.filled} OK, ${res.failed} échec(s)`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <PageShell
      title="Notifications"
      description="Statistiques sur les 7 derniers jours et historique des envois (100 derniers)."
      actions={
        canAct ? (
          <Button variant="outline" onClick={handleRenderBatch} disabled={isPending}>
            Rendre les notifs orphelines
          </Button>
        ) : null
      }
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        <StatCard label="Total 7 j" value={stats.totalLast7d} />
        <StatCard label="En attente" value={stats.pending} variant="secondary" />
        <StatCard label="Envoi…" value={stats.sending} variant="secondary" />
        <StatCard label="Envoyée" value={stats.sent} />
        <StatCard label="Délivrée" value={stats.delivered} variant="default" />
        <StatCard label="Échec" value={stats.failed} variant="destructive" />
        <StatCard label="Bounce" value={stats.bounced} variant="destructive" />
        <StatCard label="Spam" value={stats.complained} variant="destructive" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filtres</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div>
              <Label htmlFor="filter-status">Statut</Label>
              <Select
                value={filters.status || 'all'}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, status: v === 'all' ? '' : (v ?? '') }))
                }
              >
                <SelectTrigger id="filter-status">
                  <SelectValue placeholder="Tous" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="filter-channel">Canal</Label>
              <Select
                value={filters.channel || 'all'}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, channel: v === 'all' ? '' : (v ?? '') }))
                }
              >
                <SelectTrigger id="filter-channel">
                  <SelectValue placeholder="Tous" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="filter-template">Template</Label>
              <Select
                value={filters.templateCode || 'all'}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, templateCode: v === 'all' ? '' : (v ?? '') }))
                }
              >
                <SelectTrigger id="filter-template">
                  <SelectValue placeholder="Tous" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {TEMPLATES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="filter-recipient">Destinataire</Label>
              <Input
                id="filter-recipient"
                placeholder="email@…"
                value={filters.recipient}
                onChange={(e) => setFilters((f) => ({ ...f, recipient: e.target.value }))}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={applyFilters} disabled={isPending}>
                Appliquer
              </Button>
              <Button variant="outline" onClick={resetFilters} disabled={isPending}>
                Réinitialiser
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Historique{' '}
            <span className="text-muted-foreground text-sm font-normal">({rows.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Statut</TableHead>
                <TableHead>Canal</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Destinataire</TableHead>
                <TableHead>Sujet</TableHead>
                <TableHead>Créée</TableHead>
                <TableHead>Envoyée</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground py-8 text-center">
                    Aucune notification trouvée.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[row.status] ?? 'outline'}>{row.status}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.channel}</TableCell>
                    <TableCell className="font-mono text-xs">{row.template_code ?? '—'}</TableCell>
                    <TableCell className="text-xs">{row.recipient_email ?? '—'}</TableCell>
                    <TableCell className="max-w-xs truncate text-xs">
                      {row.subject ?? (
                        <span className="text-muted-foreground italic">orphelin</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{fmtDate(row.created_at)}</TableCell>
                    <TableCell className="text-xs">{fmtDate(row.sent_at)}</TableCell>
                    <TableCell className="space-x-1 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setPreviewRow(row)}>
                        Détails
                      </Button>
                      {canAct && row.status === 'PENDING' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancel(row.id)}
                          disabled={isPending}
                        >
                          Annuler
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={previewRow !== null} onOpenChange={(o) => !o && setPreviewRow(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewRow?.subject ?? 'Notification'}</DialogTitle>
            <DialogDescription>
              {previewRow?.template_code ?? '—'} · {previewRow?.recipient_email ?? '—'}
            </DialogDescription>
          </DialogHeader>
          {previewRow ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Statut</span> :{' '}
                  <Badge variant={STATUS_VARIANT[previewRow.status] ?? 'outline'}>
                    {previewRow.status}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Retries</span> : {previewRow.retry_count}
                </div>
                <div>
                  <span className="text-muted-foreground">Créée</span> :{' '}
                  {fmtDate(previewRow.created_at)}
                </div>
                <div>
                  <span className="text-muted-foreground">Envoyée</span> :{' '}
                  {fmtDate(previewRow.sent_at)}
                </div>
                <div>
                  <span className="text-muted-foreground">Délivrée</span> :{' '}
                  {fmtDate(previewRow.delivered_at)}
                </div>
                <div>
                  <span className="text-muted-foreground">Échec à</span> :{' '}
                  {fmtDate(previewRow.failed_at)}
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Resend ID</span> :{' '}
                  <span className="font-mono">{previewRow.resend_email_id ?? '—'}</span>
                </div>
              </div>
              {previewRow.failure_reason ? (
                <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">
                  <strong>Raison de l’échec :</strong> {previewRow.failure_reason}
                </div>
              ) : null}
              {previewRow.body ? (
                <div className="rounded border bg-white">
                  <iframe
                    srcDoc={previewRow.body}
                    title="Aperçu HTML"
                    className="h-[400px] w-full"
                    sandbox=""
                  />
                </div>
              ) : (
                <p className="text-muted-foreground italic">
                  Notification orpheline — body absent, à rendre via « Rendre les notifs orphelines
                  ».
                </p>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function StatCard({
  label,
  value,
  variant = 'outline',
}: {
  label: string;
  value: number;
  variant?: 'default' | 'secondary' | 'destructive' | 'outline';
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-3">
        <p className="text-muted-foreground text-xs">{label}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold">{value}</span>
          <Badge variant={variant} className="text-xs">
            7 j
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
