'use client';

/**
 * Module 12 B4 — Dialog d'édition des seuils d'une rule paramétrique.
 *
 * Form généré dynamiquement depuis `rule.params_schema`. Validation
 * client-side selon les types/bornes ; validation cross-field pour
 * `ESOP_PERCENT_BEST_PRACTICE` (minPct < maxPct).
 *
 * Bouton "Réinitialiser aux défauts" remet les inputs aux `rule.default_params`.
 *
 * Submit → updateComplianceRuleOverride. Toast success/error + onSuccess.
 *
 * V1 : pas de what-if simulator (différé B5).
 */

import { useEffect, useState, useTransition, type FormEvent } from 'react';
import { toast } from 'sonner';
import type { EffectiveRuleFull, ParamField } from '@equity/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateComplianceRuleOverride } from '@/server/actions/complianceRules';
import { validateCrossField, validateField } from './helpers';

export type ComplianceRuleEditDialogProps = {
  rule: EffectiveRuleFull;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

type Values = Record<string, number | string | boolean>;

function getInitialValues(rule: EffectiveRuleFull): Values {
  const out: Values = {};
  for (const [key] of Object.entries(rule.params_schema)) {
    const v = rule.effective_params[key];
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') out[key] = v;
  }
  return out;
}

export function ComplianceRuleEditDialog({
  rule,
  open,
  onOpenChange,
  onSuccess,
}: ComplianceRuleEditDialogProps) {
  const [values, setValues] = useState<Values>(() => getInitialValues(rule));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  // Reset values quand le dialog s'ouvre/ferme avec une nouvelle rule
  useEffect(() => {
    if (open) {
      setValues(getInitialValues(rule));
      setErrors({});
    }
  }, [open, rule]);

  const fields = Object.entries(rule.params_schema);

  function setField(key: string, value: number | string | boolean) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function resetToDefaults() {
    const defaults: Values = {};
    for (const [key] of fields) {
      const v = rule.default_params[key];
      if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string')
        defaults[key] = v;
    }
    setValues(defaults);
    setErrors({});
  }

  function validateAll(): boolean {
    const newErrors: Record<string, string> = {};
    // Convert strings → numbers pour les champs typés number/integer avant
    // la validation cross-field (sinon le check `typeof === 'number'`
    // ignorerait les inputs).
    const typedValues: Record<string, number | string | boolean> = {};
    for (const [key, fieldRaw] of fields) {
      const field = fieldRaw as ParamField;
      const err = validateField(field, values[key]);
      if (err) newErrors[key] = err;
      const raw = values[key];
      if (field.type === 'integer' || field.type === 'number') {
        const n = Number(raw);
        typedValues[key] = Number.isFinite(n) ? n : (raw as never);
      } else {
        typedValues[key] = raw as number | string | boolean;
      }
    }
    const cross = validateCrossField(rule.rule_code, typedValues);
    if (cross) newErrors._cross = cross;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validateAll()) return;

    // Construit paramsOverride avec les types corrects (number pour integer/number)
    const paramsOverride: Record<string, number | boolean | string> = {};
    for (const [key, field] of fields) {
      const raw = values[key];
      if (field.type === 'integer' || field.type === 'number') {
        paramsOverride[key] = Number(raw);
      } else {
        paramsOverride[key] = raw as number | boolean | string;
      }
    }

    startTransition(async () => {
      const res = await updateComplianceRuleOverride({
        ruleCode: rule.rule_code,
        isActive: rule.is_active,
        paramsOverride,
        notes: rule.override_notes,
      });
      if (!res.ok) {
        toast.error(`Erreur : ${res.error}`);
        return;
      }
      toast.success('Seuils mis à jour');
      onOpenChange(false);
      onSuccess();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="edit-dialog">
        <DialogHeader>
          <DialogTitle>Modifier les seuils</DialogTitle>
          <DialogDescription>
            <span className="text-ink-900 font-mono text-xs">{rule.rule_code}</span> ·{' '}
            {rule.description_fr}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map(([key, schemaRaw]) => {
            const schema = schemaRaw as ParamField;
            const fieldErr = errors[key];
            const inputType =
              schema.type === 'integer' || schema.type === 'number' ? 'number' : 'text';
            return (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`field-${key}`}>{schema.label_fr ?? key}</Label>
                <Input
                  id={`field-${key}`}
                  type={inputType}
                  value={String(values[key] ?? '')}
                  onChange={(e) => setField(key, e.target.value)}
                  min={schema.min}
                  max={schema.max}
                  step={schema.type === 'integer' ? 1 : 'any'}
                  disabled={isPending}
                  data-testid={`input-${key}`}
                  aria-invalid={fieldErr ? 'true' : undefined}
                />
                {fieldErr ? (
                  <p className="text-destructive text-xs" data-testid={`error-${key}`}>
                    {fieldErr}
                  </p>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Plage : {schema.min ?? '−∞'} → {schema.max ?? '+∞'}
                    {schema.unit ? ` ${schema.unit}` : ''}
                  </p>
                )}
              </div>
            );
          })}

          {errors._cross ? (
            <p
              className="text-destructive bg-destructive/10 rounded p-2 text-xs"
              data-testid="error-cross"
            >
              {errors._cross}
            </p>
          ) : null}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetToDefaults}
              disabled={isPending}
              data-testid="reset-defaults"
            >
              Réinitialiser aux défauts
            </Button>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={isPending}>
                  Annuler
                </Button>
              }
            />
            <Button type="submit" disabled={isPending} data-testid="submit-edit">
              {isPending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
