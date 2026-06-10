'use client';

/**
 * Module 12 B4 — Card individuelle d'une compliance rule.
 *
 * Affiche le code, severity, description, params actuels (si paramétriques),
 * badges (Personnalisée, Comportement mixte pour HIRE_DATE_REASONABLE).
 *
 * Toggle is_active inline (call updateComplianceRuleOverride directement).
 * Boutons "Modifier les seuils" + "Historique" ouvrent les dialogs respectifs.
 *
 * `canEdit` : si false, tous les boutons d'édition sont disabled (lecture seule).
 */

import { useState, useTransition } from 'react';
import { AlertTriangle, History, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { EffectiveRuleFull } from '@equity/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { updateComplianceRuleOverride } from '@/server/actions/complianceRules';
import { ComplianceRuleEditDialog } from './ComplianceRuleEditDialog';
import { ComplianceRuleAuditDialog } from './ComplianceRuleAuditDialog';
import { formatParamValue, isMixedSeverity } from './helpers';

export type ComplianceRuleCardProps = {
  rule: EffectiveRuleFull;
  canEdit: boolean;
  onUpdate: () => void;
};

export function ComplianceRuleCard({ rule, canEdit, onUpdate }: ComplianceRuleCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const hasParams = Object.keys(rule.params_schema).length > 0;
  const ruleHasMixedSeverity = isMixedSeverity(rule.rule_code);

  function handleToggle(nextActive: boolean) {
    if (!canEdit) return;
    // Appel direct updateComplianceRuleOverride avec params actuels conservés
    const paramsOverride: Record<string, number | boolean | string> = {};
    if (rule.params_override) {
      for (const [k, v] of Object.entries(rule.params_override)) {
        if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') {
          paramsOverride[k] = v;
        }
      }
    }

    startTransition(async () => {
      const res = await updateComplianceRuleOverride({
        ruleCode: rule.rule_code,
        isActive: nextActive,
        paramsOverride,
        notes: rule.override_notes,
      });
      if (!res.ok) {
        toast.error(`Erreur : ${res.error}`);
        return;
      }
      toast.success(nextActive ? 'Règle activée' : 'Règle désactivée');
      onUpdate();
    });
  }

  return (
    <article
      className="border-paper-300 bg-paper-50 rounded-md border p-4"
      data-testid={`rule-card-${rule.rule_code}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Header line : code + severity + flags */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-ink-900 font-mono text-xs font-semibold">{rule.rule_code}</span>
            {rule.effective_severity === 'error' ? (
              <Badge className="border-rose-300 bg-rose-100 font-mono text-[10px] text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100">
                ERROR
              </Badge>
            ) : (
              <Badge className="border-amber-300 bg-amber-100 font-mono text-[10px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                WARNING
              </Badge>
            )}
            {rule.is_overridden ? (
              <Badge
                className="bg-brass-100 text-brass-900 border-brass-300 font-mono text-[10px]"
                data-testid="badge-overridden"
              >
                Personnalisée
              </Badge>
            ) : null}
            {!rule.is_active ? (
              <Badge variant="outline" className="font-mono text-[10px]">
                DÉSACTIVÉE
              </Badge>
            ) : null}
            {ruleHasMixedSeverity ? (
              <span
                className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-400"
                title="Cette règle est de type warning par défaut, mais peut bloquer si l'année d'embauche est < 1900 (validation absurde). Sera scindée en 2 règles distinctes en V2."
                data-testid="badge-mixed-severity"
              >
                <AlertTriangle className="size-3.5" strokeWidth={1.75} />
                <span className="text-[10px]">Comportement mixte</span>
              </span>
            ) : null}
          </div>

          {/* Description */}
          <p className="text-ink-700 mt-1.5 text-sm">{rule.description_fr}</p>

          {/* Params actuels si paramétriques */}
          {hasParams ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-xs">
              {Object.entries(rule.params_schema).map(([key, schema]) => {
                const current = rule.effective_params[key];
                const label = schema.label_fr ?? key;
                return (
                  <span
                    key={key}
                    className="border-paper-300 bg-paper-100 inline-flex items-center gap-1 rounded border px-2 py-0.5"
                  >
                    <span className="text-ink-500">{label}:</span>
                    <span className="text-ink-900 font-semibold">{formatParamValue(current)}</span>
                  </span>
                );
              })}
            </div>
          ) : null}

          {/* Notes override si présentes */}
          {rule.override_notes ? (
            <p className="text-muted-foreground mt-2 text-xs italic">« {rule.override_notes} »</p>
          ) : null}
        </div>

        {/* Right column : toggle + actions */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={rule.is_active}
              onCheckedChange={(c) => handleToggle(c === true)}
              disabled={!canEdit || isPending}
              data-testid={`toggle-${rule.rule_code}`}
            />
            <span className="text-muted-foreground text-xs">
              {rule.is_active ? 'Active' : 'Inactive'}
            </span>
          </label>
          {hasParams ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditOpen(true)}
              disabled={!canEdit || isPending}
              data-testid={`edit-${rule.rule_code}`}
            >
              <Pencil className="mr-1.5 size-3.5" strokeWidth={1.75} />
              Modifier
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAuditOpen(true)}
            data-testid={`audit-${rule.rule_code}`}
          >
            <History className="mr-1.5 size-3.5" strokeWidth={1.75} />
            Historique
          </Button>
        </div>
      </div>

      {hasParams ? (
        <ComplianceRuleEditDialog
          rule={rule}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSuccess={onUpdate}
        />
      ) : null}
      <ComplianceRuleAuditDialog
        ruleCode={rule.rule_code}
        ruleLabel={rule.description_fr}
        open={auditOpen}
        onOpenChange={setAuditOpen}
      />
    </article>
  );
}
