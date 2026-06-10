'use client';

import { useState } from 'react';
import {
  Activity,
  Check,
  ChevronDown,
  ChevronRight,
  Edit3,
  Mail,
  Trash2,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { BeneficiaryDetailRow } from '@/server/queries/beneficiaries';
import type { Json } from '@equity/shared';

const EVENT_META: Record<string, { label: string; icon: typeof Activity; tone: string }> = {
  'beneficiary.created': {
    label: 'Création du bénéficiaire',
    icon: UserPlus,
    tone: 'text-emerald-600',
  },
  'beneficiary.updated': {
    label: 'Modification',
    icon: Edit3,
    tone: 'text-indigo-600',
  },
  'beneficiary.lifecycle_changed': {
    label: 'Transition lifecycle',
    icon: UserMinus,
    tone: 'text-amber-600',
  },
  'beneficiary.invited': {
    label: 'Invitation envoyée',
    icon: Mail,
    tone: 'text-sky-600',
  },
  'beneficiary.archived': {
    label: 'Archivage',
    icon: Trash2,
    tone: 'text-muted-foreground',
  },
};

function describe(event: { event_type: string; metadata: Json }): string {
  const m = (event.metadata ?? {}) as Record<string, unknown>;
  switch (event.event_type) {
    case 'beneficiary.created':
      return `Bénéficiaire créé${m.source ? ` (source: ${String(m.source)})` : ''}`;
    case 'beneficiary.updated':
      return `Modification de ${m.fields_count ?? '?'} champs`;
    case 'beneficiary.lifecycle_changed':
      return `Transition ${m.from ?? '?'} → ${m.to ?? '?'}${m.reason ? ` — ${String(m.reason)}` : ''}`;
    case 'beneficiary.invited':
      return `Invitation envoyée${m.invitation_count ? ` (#${m.invitation_count})` : ''}`;
    case 'beneficiary.archived':
      return `Bénéficiaire archivé${m.reason ? ` — ${String(m.reason)}` : ''}`;
    default:
      return event.event_type;
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `il y a ${days} j`;
  const months = Math.floor(days / 30);
  if (months < 12) return `il y a ${months} mois`;
  return `il y a ${Math.floor(months / 12)} an${Math.floor(months / 12) > 1 ? 's' : ''}`;
}

/**
 * Onglet Audit & history — Module 4 B4.
 *
 * Liste chronologique des audit_events avec icon + couleur selon event_type
 * + acteur + date relative + bouton "détails" qui expand inline le JSON
 * metadata.
 */
export function BeneficiaryAuditTab({ events }: { events: BeneficiaryDetailRow['auditEvents'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="size-4" />
          Historique & audit
        </CardTitle>
        <CardDescription>
          {events.length === 0
            ? 'Aucun événement enregistré pour ce bénéficiaire'
            : `${events.length} événement${events.length > 1 ? 's' : ''} (50 derniers)`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="text-muted-foreground bg-muted/20 rounded-lg border border-dashed p-8 text-center text-sm">
            <Check className="mx-auto mb-2 size-8 opacity-40" />
            <p>Aucun événement audit</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <AuditRow key={e.id} event={e} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AuditRow({ event }: { event: BeneficiaryDetailRow['auditEvents'][number] }) {
  const [expanded, setExpanded] = useState(false);
  const meta = EVENT_META[event.event_type] ?? {
    label: event.event_type,
    icon: Activity,
    tone: 'text-muted-foreground',
  };
  const Icon = meta.icon;

  return (
    <li
      className="border-border bg-muted/10 rounded-md border p-2"
      data-testid={`audit-event-${event.id}`}
    >
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="flex w-full items-start gap-2 text-left"
      >
        <Icon className={`mt-0.5 size-4 shrink-0 ${meta.tone}`} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium">{meta.label}</p>
          <p className="text-muted-foreground text-xs">{describe(event)}</p>
          <div className="text-muted-foreground/70 mt-1 flex items-center gap-2 text-[11px]">
            <span title={event.occurred_at}>{relativeTime(event.occurred_at)}</span>
            <span>·</span>
            <span>{event.user_email ?? 'system'}</span>
          </div>
        </div>
        {expanded ? (
          <ChevronDown className="text-muted-foreground mt-0.5 size-3" />
        ) : (
          <ChevronRight className="text-muted-foreground mt-0.5 size-3" />
        )}
      </button>
      {expanded ? (
        <pre className="bg-muted/40 mt-2 max-h-64 overflow-auto rounded p-2 font-mono text-[10px]">
          {JSON.stringify(event.metadata, null, 2)}
        </pre>
      ) : null}
    </li>
  );
}
