'use client';

import { AlertTriangle, ShieldAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ComplianceIssue } from '@/lib/compliance/types';

/**
 * Dialog d'affichage des compliance issues — Module 3b B7.
 *
 * Réutilisable par toute Server Action qui peut retourner
 * `complianceIssues` dans son ActionError. La modale appelante détecte
 * la présence du champ et monte ce dialog en réaction.
 */
export function ComplianceIssuesDialog({
  open,
  onOpenChange,
  issues,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issues: ComplianceIssue[];
  title?: string;
}) {
  const errorCount = issues.filter((i) => i.severity === 'ERROR').length;
  const warningCount = issues.filter((i) => i.severity === 'WARNING').length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="text-destructive size-5" />
            {title ?? 'Conformité — règles bloquantes'}
          </DialogTitle>
          <DialogDescription>
            {errorCount > 0 ? (
              <>
                {errorCount} erreur{errorCount > 1 ? 's' : ''} bloquante
                {errorCount > 1 ? 's' : ''}
                {warningCount > 0
                  ? ` · ${warningCount} avertissement${warningCount > 1 ? 's' : ''}`
                  : ''}
              </>
            ) : (
              <>
                {warningCount} avertissement{warningCount > 1 ? 's' : ''} non bloquant
                {warningCount > 1 ? 's' : ''}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {issues.map((issue, i) => (
            <li
              key={`${issue.code}-${i}`}
              className={[
                'rounded-md border p-3 text-sm',
                issue.severity === 'ERROR'
                  ? 'border-destructive/40 bg-destructive/5'
                  : 'border-amber-500/40 bg-amber-50 dark:bg-amber-500/10',
              ].join(' ')}
              data-testid={`compliance-issue-${issue.code}`}
            >
              <div className="flex items-start gap-2">
                {issue.severity === 'ERROR' ? (
                  <X className="text-destructive mt-0.5 size-4 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                )}
                <div className="space-y-1">
                  <p className="font-mono text-[10px] uppercase opacity-60">{issue.code}</p>
                  <p className="font-medium">{issue.message}</p>
                  {issue.suggestedAction ? (
                    <p className="text-muted-foreground text-xs italic">
                      → {issue.suggestedAction}
                    </p>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
