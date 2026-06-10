'use client';

/**
 * Module 12 B4 — Dialog d'historique d'une compliance rule.
 *
 * Charge les 50 derniers `audit_events` compliance_rule.* pour la rule via
 * `getComplianceRuleAuditLog`. Affichage timeline avec date FR + email user
 * + type d'événement (icône + couleur) + diff + notes.
 *
 * V1 : pas de pagination (50 events suffisent pour la plupart des orgs en V1).
 * V2 : pagination keyset si volumetrie élevée.
 */

import { useEffect, useState } from 'react';
import { Check, History, Pencil, RotateCcw, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getComplianceRuleAuditLog, type AuditLogEntry } from '@/server/actions/complianceRules';

export type ComplianceRuleAuditDialogProps = {
  ruleCode: string;
  ruleLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function eventIcon(eventType: string) {
  if (eventType === 'compliance_rule.activated')
    return <Check className="size-4 text-emerald-700" />;
  if (eventType === 'compliance_rule.deactivated') return <X className="size-4 text-rose-700" />;
  if (eventType === 'compliance_rule.params_updated')
    return <Pencil className="text-brass-700 size-4" />;
  if (eventType === 'compliance_rule.reset_all')
    return <RotateCcw className="size-4 text-amber-700" />;
  return <History className="text-ink-500 size-4" />;
}

function eventLabel(eventType: string): string {
  if (eventType === 'compliance_rule.activated') return 'Activée';
  if (eventType === 'compliance_rule.deactivated') return 'Désactivée';
  if (eventType === 'compliance_rule.params_updated') return 'Paramètres modifiés';
  if (eventType === 'compliance_rule.reset_all') return 'Réinitialisation globale';
  return eventType;
}

export function ComplianceRuleAuditDialog({
  ruleCode,
  ruleLabel,
  open,
  onOpenChange,
}: ComplianceRuleAuditDialogProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Fetch du journal d'audit à l'ouverture : on bascule en état "loading"
    // avant l'appel async. Synchro one-shot sur `open`, pas une boucle.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading state before async fetch on open
    setLoading(true);
    setError(null);
    getComplianceRuleAuditLog(ruleCode)
      .then((res) => {
        if (!res.ok) {
          setError(res.error);
          setEntries([]);
        } else {
          setEntries(res.entries);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Erreur inconnue');
      })
      .finally(() => setLoading(false));
  }, [open, ruleCode]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" data-testid="audit-dialog">
        <DialogHeader>
          <DialogTitle>Historique des modifications</DialogTitle>
          <DialogDescription>
            <span className="text-ink-900 font-mono text-xs">{ruleCode}</span> · {ruleLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <p
              className="text-muted-foreground py-6 text-center text-sm"
              data-testid="audit-loading"
            >
              Chargement…
            </p>
          ) : error ? (
            <p className="text-destructive py-6 text-center text-sm">Erreur : {error}</p>
          ) : entries.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm" data-testid="audit-empty">
              Aucune modification depuis la configuration par défaut.
            </p>
          ) : (
            <ol className="space-y-4">
              {entries.map((entry) => {
                const date = new Date(entry.occurredAt);
                const diff = (entry.metadata?.diff ?? null) as Record<
                  string,
                  { from: unknown; to: unknown }
                > | null;
                const notes = (entry.metadata?.notes ?? null) as string | null;
                return (
                  <li
                    key={entry.id}
                    className="border-paper-300 border-l-2 pl-4"
                    data-testid={`audit-entry-${entry.id}`}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      {eventIcon(entry.eventType)}
                      <span className="font-medium">{eventLabel(entry.eventType)}</span>
                      <span className="text-muted-foreground text-xs">
                        {dateFormatter.format(date)}
                      </span>
                    </div>
                    {entry.userEmail ? (
                      <p className="text-muted-foreground mt-0.5 text-xs">{entry.userEmail}</p>
                    ) : null}
                    {diff && Object.keys(diff).length > 0 ? (
                      <div className="mt-2 space-y-0.5 font-mono text-xs">
                        {Object.entries(diff).map(([key, change]) => (
                          <div key={key}>
                            <span className="text-ink-500">{key}:</span>{' '}
                            <span className="text-rose-700 line-through">
                              {String(change.from)}
                            </span>{' '}
                            → <span className="text-emerald-700">{String(change.to)}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {notes ? (
                      <p className="text-muted-foreground mt-1 text-xs italic">« {notes} »</p>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
