'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import {
  cancelFundingRound,
  createFundingRound,
  createShareClass,
  deactivateShareClass,
} from '@/server/actions/cap-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Module 10 B2 — Sandbox client component.
 *
 * 3 presets pour tester rapidement les Server Actions cap-table sans
 * passer par l'UI complète (qui sera livrée en B3 avec page principale +
 * composants matrix).
 *
 * Pattern : chaque preset est une séquence de Server Action calls
 * documentée. Le résultat (ok/error) est affiché en bas.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ShareClassRow = {
  id: string;
  code: string;
  name: string;
  class_type: string;
  par_value: number | null;
  is_active: boolean;
  liquidation_preference_multiple: number | null;
  liquidation_preference_type: string | null;
  conversion_ratio: number | null;
  voting_rights_per_share: number | null;
  pool_total_units: number | null;
  created_at: string;
};

type RoundRow = {
  id: string;
  name: string;
  round_type: string;
  share_class_id: string;
  status: string;
  pre_money_valuation: number;
  amount_raised: number;
  price_per_share: number;
  total_shares_issued: number;
  post_money_valuation: number | null;
  closed_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  created_at: string;
};

type PositionRow = {
  id: string;
  stakeholder_type: string;
  stakeholder_name: string;
  share_class_id: string;
  units: number;
  source: string;
  acquired_at: string;
  position_closed_at: string | null;
  cost_basis_per_unit: number | null;
  cost_basis_total: number | null;
  created_at: string;
};

type AuditEvent = {
  id: string;
  event_type: string;
  resource_id: string | null;
  metadata: unknown;
  occurred_at: string;
  user_email: string | null;
};

type ActionLog = {
  preset: string;
  result: { ok: true } | { ok: false; error: string } | { ok: true; id: string };
  ts: string;
};

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/**
 * Preset 1 — Startup post-Seed.
 * Crée une COMMON class + une ESOP class + une Series Seed round 500K€
 * avec 2 angels.
 */
async function preset1Startup(): Promise<ActionLog[]> {
  const log: ActionLog[] = [];
  const ts = new Date().toISOString();

  const r1 = await createShareClass({
    code: `COMMON_TEST_${Date.now()}`,
    name: 'Common Stock (test)',
    classType: 'COMMON',
    parValue: 0.01,
  });
  log.push({ preset: 'Preset 1 — share_class COMMON', result: r1, ts });

  if (!r1.ok) return log;

  const r2 = await createShareClass({
    code: `ESOP_TEST_${Date.now()}`,
    name: 'ESOP Pool (test)',
    classType: 'ESOP',
    poolTotalUnits: 100_000,
  });
  log.push({ preset: 'Preset 1 — share_class ESOP', result: r2, ts });

  return log;
}

/**
 * Preset 2 — Series A.
 * Crée une Preferred A + une Series A round 5M€ avec 2 lead VCs.
 * Suppose qu'une COMMON existe déjà (Preset 1 doit avoir tourné).
 */
async function preset2SeriesA(): Promise<ActionLog[]> {
  const log: ActionLog[] = [];
  const ts = new Date().toISOString();

  const code = `PREF_A_${Date.now()}`;
  const r1 = await createShareClass({
    code,
    name: 'Preferred A (test)',
    classType: 'PREFERRED',
    parValue: 0.01,
    liquidationPreferenceMultiple: 1.0,
    liquidationPreferenceType: 'NON_PARTICIPATING',
    conversionRatio: 1.0,
  });
  log.push({ preset: 'Preset 2 — share_class PREF_A', result: r1, ts });

  if (!r1.ok) return log;

  const r2 = await createFundingRound({
    name: 'Series A 2026 (test)',
    roundType: 'SERIES_A',
    shareClassId: r1.id,
    preMoneyValuation: 20_000_000,
    amountRaised: 5_000_000,
    pricePerShare: 100,
    investors: [
      { name: 'Lead VC 1 (test)', units: 30_000, amount: 3_000_000 },
      { name: 'Lead VC 2 (test)', units: 20_000, amount: 2_000_000 },
    ],
  });
  log.push({ preset: 'Preset 2 — funding_round SERIES_A', result: r2, ts });

  return log;
}

/**
 * Preset 3 — Avant exit.
 * Tente d'annuler la dernière round DRAFT créée. Pour démontrer le
 * `cancelFundingRound` workflow.
 */
async function preset3CancelLastDraft(roundId: string | undefined): Promise<ActionLog[]> {
  const ts = new Date().toISOString();
  if (!roundId) {
    return [
      {
        preset: 'Preset 3 — cancelFundingRound',
        result: { ok: false, error: "Aucune round DRAFT disponible — créer d'abord avec Preset 2" },
        ts,
      },
    ];
  }
  const r1 = await cancelFundingRound({
    id: roundId,
    reason: 'Test sandbox — annulation post-création',
  });
  return [{ preset: 'Preset 3 — cancelFundingRound', result: r1, ts }];
}

/**
 * Preset 4 — Soft-delete d'une share class.
 * Tente de désactiver la dernière share class créée.
 */
async function preset4Deactivate(shareClassId: string | undefined): Promise<ActionLog[]> {
  const ts = new Date().toISOString();
  if (!shareClassId) {
    return [
      {
        preset: 'Preset 4 — deactivateShareClass',
        result: { ok: false, error: 'Aucune share class disponible' },
        ts,
      },
    ];
  }
  const r1 = await deactivateShareClass(shareClassId);
  return [{ preset: 'Preset 4 — deactivateShareClass', result: r1, ts }];
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------

export function Sandbox({
  shareClasses,
  fundingRounds,
  positions,
  auditEvents,
}: {
  shareClasses: ShareClassRow[];
  fundingRounds: RoundRow[];
  positions: PositionRow[];
  auditEvents: AuditEvent[];
}) {
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [pending, startTransition] = useTransition();

  function appendLogs(newLogs: ActionLog[]) {
    setLogs((prev) => [...newLogs, ...prev].slice(0, 50));
  }

  // Dernière round DRAFT (pour cancel preset)
  const lastDraftRoundId = fundingRounds.find((r) => r.status === 'DRAFT')?.id;
  // Dernière share class active (pour deactivate preset)
  const lastActiveShareClassId = shareClasses.find((c) => c.is_active)?.id;

  return (
    <div className="container mx-auto max-w-6xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-bold">Cap Table Builder Sandbox</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Module 10 B2 — test des Server Actions cap-table V1 (CRUD share_classes + funding_rounds).
          Aucune UI cliente complète — la page principale arrive en B3.
        </p>
      </div>

      {/* Presets */}
      <Card>
        <CardHeader>
          <CardTitle>Presets E2E</CardTitle>
          <CardDescription>
            Chaque preset enchaîne des appels Server Action et logue les Result {'{ok|error}'}. ⚠️
            Les presets écrivent dans la DB cloud — utiliser sur une org de test uniquement.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Button
            onClick={() =>
              startTransition(async () => {
                const r = await preset1Startup();
                appendLogs(r);
              })
            }
            disabled={pending}
            variant="outline"
          >
            {pending ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
            Preset 1 — Startup post-Seed (COMMON + ESOP)
          </Button>
          <Button
            onClick={() =>
              startTransition(async () => {
                const r = await preset2SeriesA();
                appendLogs(r);
              })
            }
            disabled={pending}
            variant="outline"
          >
            Preset 2 — Series A (PREF_A + 5M€ round)
          </Button>
          <Button
            onClick={() =>
              startTransition(async () => {
                const r = await preset3CancelLastDraft(lastDraftRoundId);
                appendLogs(r);
              })
            }
            disabled={pending || !lastDraftRoundId}
            variant="outline"
          >
            Preset 3 — Annuler dernière round DRAFT
            {!lastDraftRoundId ? ' (aucune)' : ''}
          </Button>
          <Button
            onClick={() =>
              startTransition(async () => {
                const r = await preset4Deactivate(lastActiveShareClassId);
                appendLogs(r);
              })
            }
            disabled={pending || !lastActiveShareClassId}
            variant="outline"
          >
            Preset 4 — Désactiver dernière share class
            {!lastActiveShareClassId ? ' (aucune)' : ''}
          </Button>
        </CardContent>
      </Card>

      {/* Logs */}
      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Logs ({logs.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {logs.map((log, idx) => (
                <div key={`${log.ts}-${idx}`} className="rounded-md border p-3 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant={log.result.ok ? 'default' : 'destructive'}>
                      {log.result.ok ? 'OK' : 'ERROR'}
                    </Badge>
                    <span className="font-mono">{log.preset}</span>
                    <span className="text-muted-foreground ml-auto">
                      {new Date(log.ts).toLocaleTimeString('fr-FR')}
                    </span>
                  </div>
                  <pre className="bg-muted/50 mt-2 overflow-x-auto rounded p-2 text-[11px]">
                    {JSON.stringify(log.result, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats actuelles */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Share classes</CardTitle>
            <CardDescription>{shareClasses.length} (active + inactive)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-xs">
              {shareClasses.slice(0, 8).map((sc) => (
                <div key={sc.id} className="flex items-center gap-2 font-mono">
                  <Badge variant={sc.is_active ? 'default' : 'secondary'}>{sc.class_type}</Badge>
                  <span>{sc.code}</span>
                  <span className="text-muted-foreground ml-auto">
                    {sc.pool_total_units ? `${sc.pool_total_units} units` : (sc.par_value ?? '—')}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Funding rounds</CardTitle>
            <CardDescription>{fundingRounds.length}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-xs">
              {fundingRounds.slice(0, 8).map((r) => (
                <div key={r.id} className="flex items-center gap-2 font-mono">
                  <Badge
                    variant={
                      r.status === 'CLOSED'
                        ? 'default'
                        : r.status === 'CANCELLED'
                          ? 'destructive'
                          : 'secondary'
                    }
                  >
                    {r.status}
                  </Badge>
                  <span className="truncate">{r.name}</span>
                  <span className="text-muted-foreground ml-auto">
                    {(r.amount_raised / 1_000_000).toFixed(1)}M€
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Positions actives</CardTitle>
            <CardDescription>{positions.length}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-xs">
              {positions.slice(0, 8).map((p) => (
                <div key={p.id} className="flex items-center gap-2 font-mono">
                  <Badge variant="outline">{p.stakeholder_type}</Badge>
                  <span className="truncate">{p.stakeholder_name}</span>
                  <span className="text-muted-foreground ml-auto">{p.units} u.</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Audit log */}
      {auditEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Audit events captable.* ({auditEvents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 text-xs">
              {auditEvents.slice(0, 10).map((e) => (
                <div key={e.id} className="flex items-center gap-2 font-mono">
                  <Badge variant="outline">{e.event_type}</Badge>
                  <span className="text-muted-foreground truncate">{e.user_email ?? 'system'}</span>
                  <span className="text-muted-foreground ml-auto text-[10px]">
                    {new Date(e.occurred_at).toLocaleString('fr-FR')}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
