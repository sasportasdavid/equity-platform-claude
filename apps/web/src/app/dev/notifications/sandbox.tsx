'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Eye, FileText, Mail, PlayCircle, RefreshCw, Send, Zap } from 'lucide-react';
import type { Module7TemplateCode } from '@equity/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  insertManualNotification,
  renderPendingNotificationsBatch,
  triggerNotificationConsumer,
} from '@/server/actions/notifications';
import type { NotificationStats } from '@/server/queries/notifications';

type RenderResult =
  | { code: string; ok: true; subject: string; html: string; text: string }
  | { code: string; ok: false; error: string };

const MODULE_7_CODES: Module7TemplateCode[] = [
  'approval_pending',
  'approval_approved',
  'approval_rejected',
  'award_granted',
  'team_member_invite',
  'beneficiary_first_invite',
];

export function Sandbox({
  renders,
  stats,
  orgId,
  currentUserId,
  currentUserEmail,
}: {
  renders: RenderResult[];
  stats: NotificationStats;
  orgId: string;
  currentUserId: string;
  currentUserEmail: string;
}) {
  const router = useRouter();
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [view, setView] = useState<'html' | 'text'>('html');
  const open = renders.find((r) => r.code === openCode);

  // Test send form state
  const [pending, startTransition] = useTransition();
  const [sendCode, setSendCode] = useState<Module7TemplateCode>('approval_pending');
  const [sendEmail, setSendEmail] = useState<string>(currentUserEmail);
  const [sendVarsJson, setSendVarsJson] = useState<string>(() => {
    const found = renders.find((r) => r.code === 'approval_pending');
    return found && found.ok
      ? JSON.stringify(
          {
            recipientName: 'Marie Dupont',
            awardNumber: 'AWD-TEST-' + Date.now().toString().slice(-4),
            awardUnits: 1500,
            awardPlanType: 'BSPCE',
            creatorName: 'Jean Martin',
            appUrl: 'http://localhost:3000',
            approvalUrl: 'http://localhost:3000/dashboard/approvals/test',
          },
          null,
          2,
        )
      : '{}';
  });
  const [lastNotifId, setLastNotifId] = useState<string | null>(null);
  const [lastConsumerResult, setLastConsumerResult] = useState<unknown>(null);

  function handleSend() {
    let variables: Record<string, unknown>;
    try {
      variables = JSON.parse(sendVarsJson);
    } catch (err) {
      toast.error('Variables JSON invalide : ' + (err as Error).message);
      return;
    }
    startTransition(async () => {
      const res = await insertManualNotification({
        orgId,
        templateCode: sendCode,
        channel: 'EMAIL',
        recipientEmail: sendEmail,
        userId: currentUserId,
        variables,
      });
      if (res.ok) {
        toast.success(`Notif insérée PENDING (id=${res.notificationId.slice(0, 8)}…)`);
        setLastNotifId(res.notificationId);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleTriggerConsumer() {
    startTransition(async () => {
      const res = await triggerNotificationConsumer();
      if (res.ok) {
        toast.success(
          `Consumer : ${res.result.processed ?? 0} processed, ${res.result.succeeded ?? 0} OK, ${res.result.failed ?? 0} fail`,
        );
        setLastConsumerResult(res.result);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleRenderOrphans() {
    startTransition(async () => {
      const res = await renderPendingNotificationsBatch({ batchSize: 50 });
      if (res.ok) {
        toast.success(`Rendered : ${res.filled} OK, ${res.failed} échec(s)`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Dev Sandbox — Notifications (Module 7 B2 + B3)</h1>
        <p className="text-muted-foreground text-sm">
          6 templates V1 + preview HTML/text + test send via Resend (queue PENDING) + bypass cron
          via Trigger consumer.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="size-4" /> Stats J-7 + outils B5
          </CardTitle>
          <CardDescription>
            Compteurs sur les 7 derniers jours, scope = organisation courante. Le bouton ”Render
            orphan PENDING” fill subject/body sur les notifs insérées sans render (ex: Module 5 RPC
            IN_APP).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            <Stat label="Total" value={stats.totalLast7d} />
            <Stat label="Pending" value={stats.pending} />
            <Stat label="Sending" value={stats.sending} />
            <Stat label="Sent" value={stats.sent} />
            <Stat label="Delivered" value={stats.delivered} />
            <Stat label="Failed" value={stats.failed} tone="destructive" />
            <Stat label="Bounced" value={stats.bounced} tone="destructive" />
            <Stat label="Complained" value={stats.complained} tone="destructive" />
          </div>
          <Button onClick={handleRenderOrphans} disabled={pending} variant="outline">
            <RefreshCw className="mr-2 size-4" /> Render orphan PENDING (batch 50)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Templates Module 7</CardTitle>
          <CardDescription>{renders.length} templates disponibles.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {renders.map((r) => (
              <div
                key={r.code}
                className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm"
              >
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Mail className="size-4 text-slate-500" />
                    <code className="font-mono text-sm font-medium">{r.code}</code>
                    {r.ok ? (
                      <Badge variant="outline" className="text-[10px]">
                        OK
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[10px]">
                        ERROR
                      </Badge>
                    )}
                  </div>
                  {r.ok ? (
                    <div className="text-muted-foreground text-xs italic">Subject: {r.subject}</div>
                  ) : (
                    <div className="text-destructive text-xs">{r.error}</div>
                  )}
                </div>
                {r.ok ? (
                  <Button size="sm" variant="outline" onClick={() => setOpenCode(r.code)}>
                    <Eye className="mr-1 size-3" /> Preview
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {open && open.ok ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="size-4" />
              Preview — <code className="font-mono text-sm">{open.code}</code>
            </CardTitle>
            <CardDescription>
              <strong>Subject :</strong> {open.subject}
            </CardDescription>
            <div className="flex gap-2 pt-2">
              <Button
                size="sm"
                variant={view === 'html' ? 'default' : 'outline'}
                onClick={() => setView('html')}
              >
                <Eye className="mr-1 size-3" /> HTML
              </Button>
              <Button
                size="sm"
                variant={view === 'text' ? 'default' : 'outline'}
                onClick={() => setView('text')}
              >
                <FileText className="mr-1 size-3" /> Plain text
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpenCode(null)}>
                Fermer
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {view === 'html' ? (
              <iframe
                srcDoc={open.html}
                title={`Preview ${open.code}`}
                className="h-[700px] w-full rounded-md border bg-white"
              />
            ) : (
              <pre className="max-h-[700px] overflow-auto whitespace-pre-wrap rounded-md border bg-slate-50 p-3 text-xs text-slate-700">
                {open.text}
              </pre>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="size-4" /> Test send (B3 — queue PENDING)
          </CardTitle>
          <CardDescription>
            Insère une notification PENDING via insertManualNotification. Le cron consumer-tick (1
            min) ou le bouton ”Trigger consumer” en dessous va dépiler et envoyer via Resend.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="send-template" className="text-xs">
                Template
              </Label>
              <select
                id="send-template"
                value={sendCode}
                onChange={(e) => setSendCode(e.target.value as Module7TemplateCode)}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                {MODULE_7_CODES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="send-email" className="text-xs">
                Recipient email
              </Label>
              <Input
                id="send-email"
                type="email"
                value={sendEmail}
                onChange={(e) => setSendEmail(e.target.value)}
                placeholder="vous@example.com"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="send-vars" className="text-xs">
              Variables JSON (modifiable)
            </Label>
            <textarea
              id="send-vars"
              value={sendVarsJson}
              onChange={(e) => setSendVarsJson(e.target.value)}
              rows={10}
              className="border-input bg-background w-full rounded-md border px-3 py-2 font-mono text-xs"
            />
          </div>
          <Button onClick={handleSend} disabled={pending || !sendEmail}>
            <Send className="mr-2 size-4" /> Insérer comme PENDING
          </Button>
          {lastNotifId ? (
            <div className="text-muted-foreground text-xs">
              Dernier notif id : <code className="font-mono">{lastNotifId}</code>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="size-4" /> Trigger consumer manually (bypass cron)
          </CardTitle>
          <CardDescription>
            Invoke la EF notifications-consumer directement (skip le tick 1-min). Utile pour tester
            immédiatement après une insertion PENDING.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button onClick={handleTriggerConsumer} disabled={pending} variant="outline">
            <PlayCircle className="mr-2 size-4" /> Trigger consumer now
          </Button>
          {lastConsumerResult ? (
            <pre className="rounded-md border bg-slate-50 p-2 font-mono text-[11px] text-slate-800">
              {JSON.stringify(lastConsumerResult, null, 2)}
            </pre>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'destructive';
}) {
  return (
    <div
      className={
        'rounded-md border px-3 py-2 ' +
        (tone === 'destructive' ? 'border-red-200 bg-red-50' : 'bg-slate-50')
      }
    >
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}
