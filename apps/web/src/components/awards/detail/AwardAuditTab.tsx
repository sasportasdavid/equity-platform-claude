'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Edit,
  History,
  Plus,
  RotateCcw,
  UserMinus,
  XCircle,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { AwardDetailRow } from '@/server/queries/awards';

/**
 * Onglet Audit & History — Module 3b B4.
 *
 * Liste chronologique des audit_events (50 derniers, filtre award.*) avec
 * icon coloré + acteur + action descriptive + expand inline pour metadata
 * JSON brut.
 */
export function AwardAuditTab({ detail }: { detail: AwardDetailRow }) {
  const { auditEvents } = detail;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4" />
          Audit & historique ({auditEvents.length})
        </CardTitle>
        <CardDescription>
          Tous les événements concernant cet award (50 derniers max). Notifications + documents
          signés arriveront avec les Modules 6 et 7.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {auditEvents.length === 0 ? (
          <div className="text-muted-foreground bg-muted/20 rounded-lg border border-dashed p-8 text-center text-sm">
            Aucun événement audit pour cet award.
          </div>
        ) : (
          <ul className="divide-y">
            {auditEvents.map((ev) => {
              const isOpen = expanded.has(ev.id);
              const cfg = describeEvent(ev.event_type, ev.metadata);
              return (
                <li key={ev.id} className="py-3">
                  <button
                    type="button"
                    onClick={() => toggle(ev.id)}
                    className="flex w-full items-start gap-3 text-left"
                    aria-expanded={isOpen}
                  >
                    <span
                      className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${cfg.bg}`}
                    >
                      <cfg.Icon className={`size-3.5 ${cfg.fg}`} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-medium">{cfg.label}</span>
                        <span className="text-muted-foreground text-xs">
                          {formatRelative(ev.occurred_at)}
                        </span>
                      </div>
                      <div className="text-muted-foreground text-xs">
                        <span title={ev.user_id ?? ''}>{ev.user_email ?? 'Système'}</span>
                        <span className="mx-1.5">·</span>
                        <span className="font-mono" title={new Date(ev.occurred_at).toISOString()}>
                          {formatDateTime(ev.occurred_at)}
                        </span>
                      </div>
                    </div>
                    {isOpen ? (
                      <ChevronDown className="text-muted-foreground mt-1 size-4 shrink-0" />
                    ) : (
                      <ChevronRight className="text-muted-foreground mt-1 size-4 shrink-0" />
                    )}
                  </button>
                  {isOpen ? (
                    <pre className="bg-muted/40 ml-10 mt-2 max-h-64 overflow-auto rounded p-3 font-mono text-[10px]">
                      {JSON.stringify(ev.metadata, null, 2)}
                    </pre>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Mapping event_type → icon + label + couleur
// ---------------------------------------------------------------------------

function describeEvent(
  eventType: string,
  metadata: unknown,
): {
  Icon: typeof Plus;
  bg: string;
  fg: string;
  label: string;
} {
  const md = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, unknown>;
  switch (eventType) {
    case 'award.created':
      return {
        Icon: Plus,
        bg: 'bg-emerald-100 dark:bg-emerald-950/40',
        fg: 'text-emerald-700 dark:text-emerald-300',
        label: `Création de l'award${md.initial_status ? ` (${md.initial_status})` : ''}`,
      };
    case 'award.status_changed':
      return {
        Icon: RotateCcw,
        bg: 'bg-indigo-100 dark:bg-indigo-950/40',
        fg: 'text-indigo-700 dark:text-indigo-300',
        label: `Transition ${md.from ?? '?'} → ${md.to ?? '?'}${md.reason ? ` (${md.reason})` : ''}`,
      };
    case 'award.updated':
      return {
        Icon: Edit,
        bg: 'bg-amber-100 dark:bg-amber-950/40',
        fg: 'text-amber-700 dark:text-amber-300',
        label: 'Modification du brouillon',
      };
    case 'award.modified':
      return {
        Icon: Edit,
        bg: 'bg-amber-100 dark:bg-amber-950/40',
        fg: 'text-amber-700 dark:text-amber-300',
        label: `Modification IFRS 2 (${md.modification_type ?? '?'})`,
      };
    case 'award.forfeited':
      return {
        Icon: UserMinus,
        bg: 'bg-rose-100 dark:bg-rose-950/40',
        fg: 'text-rose-700 dark:text-rose-300',
        label: `Forfeit (${md.leaver_type ?? '?'}) — ${md.units_forfeited ?? 0} units`,
      };
    case 'award.cancelled':
      return {
        Icon: XCircle,
        bg: 'bg-rose-100 dark:bg-rose-950/40',
        fg: 'text-rose-700 dark:text-rose-300',
        label: 'Annulation',
      };
    case 'award.vesting_materialized':
      return {
        Icon: Zap,
        bg: 'bg-sky-100 dark:bg-sky-950/40',
        fg: 'text-sky-700 dark:text-sky-300',
        label: `Vesting matérialisé (${md.events_count ?? '?'} tranches)`,
      };
    case 'award.bulk_imported':
      return {
        Icon: Plus,
        bg: 'bg-emerald-100 dark:bg-emerald-950/40',
        fg: 'text-emerald-700 dark:text-emerald-300',
        label: `Import bulk (${md.count ?? '?'} awards)`,
      };
    default:
      return {
        Icon: History,
        bg: 'bg-muted',
        fg: 'text-muted-foreground',
        label: eventType,
      };
  }
}

// ---------------------------------------------------------------------------
// Helpers — date relative + absolue
// ---------------------------------------------------------------------------

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  const rtf = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' });
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return rtf.format(-diffMin, 'minute');
  if (diffH < 24) return rtf.format(-diffH, 'hour');
  if (diffD < 30) return rtf.format(-diffD, 'day');
  if (diffD < 365) return rtf.format(-Math.floor(diffD / 30), 'month');
  return rtf.format(-Math.floor(diffD / 365), 'year');
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}
