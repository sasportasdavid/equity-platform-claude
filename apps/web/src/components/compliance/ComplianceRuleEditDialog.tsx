'use client';

/**
 * Module 12 B4 + B5 — Dialog d'édition des seuils d'une rule paramétrique.
 *
 * Form généré dynamiquement depuis `rule.params_schema`. Validation
 * client-side selon les types/bornes ; validation cross-field pour
 * `ESOP_PERCENT_BEST_PRACTICE` (minPct < maxPct).
 *
 * Bouton "Réinitialiser aux défauts" remet les inputs aux `rule.default_params`.
 *
 * B5 — What-if simulator :
 *   Bouton "Calculer l'impact" qui appelle `simulateComplianceChange()`
 *   et affiche un panneau avec les counts current vs after + sample des
 *   "newly blocked". Disponible uniquement quand la rule est simulable
 *   (4 rules V1) ET les params ont changé (sinon aucun delta à simuler).
 *
 * Submit → updateComplianceRuleOverride. Toast success/error + onSuccess.
 */

import { useEffect, useState, useTransition, type FormEvent } from 'react';
import { AlertTriangle, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import type { EffectiveRuleFull, ParamField, SimulationResult } from '@equity/shared';
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
import {
  simulateComplianceChange,
  updateComplianceRuleOverride,
} from '@/server/actions/complianceRules';
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

  // B5 — what-if simulator state
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [isSimulating, startSimulating] = useTransition();

  // Reset values quand le dialog s'ouvre/ferme avec une nouvelle rule
  useEffect(() => {
    if (open) {
      setValues(getInitialValues(rule));
      setErrors({});
      setSimulation(null);
      setSimulationError(null);
    }
  }, [open, rule]);

  // Détection si les params ont changé vs effective_params actuels.
  const initialValues = getInitialValues(rule);
  const paramsChanged = JSON.stringify(values) !== JSON.stringify(initialValues);

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

  /** Build paramsOverride typed (number for integer/number) depuis les values du form. */
  function buildTypedParams(): Record<string, number | boolean | string> {
    const paramsOverride: Record<string, number | boolean | string> = {};
    for (const [key, field] of fields) {
      const raw = values[key];
      if (field.type === 'integer' || field.type === 'number') {
        paramsOverride[key] = Number(raw);
      } else {
        paramsOverride[key] = raw as number | boolean | string;
      }
    }
    return paramsOverride;
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!validateAll()) return;
    const paramsOverride = buildTypedParams();

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

  function handleSimulate() {
    if (!validateAll()) return;
    const paramsOverride = buildTypedParams();
    setSimulationError(null);
    startSimulating(async () => {
      const res = await simulateComplianceChange({
        ruleCode: rule.rule_code,
        isActive: rule.is_active,
        paramsOverride,
        notes: rule.override_notes,
      });
      if (!res.ok) {
        setSimulationError(res.error);
        setSimulation(null);
        return;
      }
      setSimulation(res.simulation);
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

          {/* B5 — Panneau what-if simulator */}
          <div className="border-paper-300 space-y-2 border-t pt-3" data-testid="simulator-panel">
            <div className="flex items-center justify-between gap-2">
              <p className="text-overline text-ink-500 inline-flex items-center gap-1.5">
                <BarChart3 className="size-3.5" strokeWidth={1.75} />
                Aperçu impact
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleSimulate}
                disabled={!paramsChanged || isSimulating || isPending}
                data-testid="simulate-button"
              >
                {isSimulating ? 'Calcul…' : "Calculer l'impact"}
              </Button>
            </div>

            {!paramsChanged ? (
              <p className="text-muted-foreground text-xs">
                Modifiez un seuil ci-dessus pour activer la simulation.
              </p>
            ) : simulationError ? (
              <p className="text-destructive bg-destructive/10 rounded p-2 text-xs">
                Erreur simulation : {simulationError}
              </p>
            ) : simulation ? (
              !simulation.simulationSupported ? (
                <p
                  className="text-muted-foreground bg-paper-100 rounded p-2 text-xs"
                  data-testid="simulation-not-supported"
                >
                  {simulation.notSupportedReason ?? 'Simulation non applicable.'}
                </p>
              ) : (
                <div
                  className={`rounded border p-2 text-xs ${
                    simulation.newlyBlocked > 0
                      ? 'border-amber-300 bg-amber-50'
                      : 'border-emerald-300 bg-emerald-50'
                  }`}
                  data-testid="simulation-result"
                >
                  <p className="font-medium">
                    {simulation.newlyBlocked > 0 ? (
                      <span className="inline-flex items-center gap-1 text-amber-900">
                        <AlertTriangle className="size-3.5" strokeWidth={1.75} />
                        {simulation.newlyBlocked} entité
                        {simulation.newlyBlocked > 1 ? 's' : ''} nouvellement bloquée
                        {simulation.newlyBlocked > 1 ? 's' : ''}
                      </span>
                    ) : (
                      <span className="text-emerald-900">Aucune entité nouvellement bloquée</span>
                    )}
                  </p>
                  <p className="text-muted-foreground mt-1">
                    {simulation.afterCompliant} conformes · {simulation.afterNonCompliant} non
                    conformes{' '}
                    <span className="text-ink-400">(sur {simulation.totalEvaluated})</span>
                    {simulation.newlyUnblocked > 0
                      ? ` · ${simulation.newlyUnblocked} re-débloqué${
                          simulation.newlyUnblocked > 1 ? 's' : ''
                        }`
                      : ''}
                  </p>
                  {simulation.sampleNewlyBlocked.length > 0 ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs">
                        Aperçu des entités impactées ({simulation.sampleNewlyBlocked.length})
                      </summary>
                      <ul className="text-muted-foreground mt-1.5 space-y-0.5 text-xs">
                        {simulation.sampleNewlyBlocked.map((s) => (
                          <li key={s.id} data-testid={`sample-${s.id}`}>
                            • <strong className="text-ink-700">{s.label}</strong> — {s.reason}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  <p className="text-ink-400 mt-2 text-[10px] italic">
                    Effet prospectif : les transitions déjà effectuées ne sont pas affectées.
                  </p>
                </div>
              )
            ) : (
              <p className="text-muted-foreground text-xs">
                Cliquez sur « Calculer l&apos;impact » pour estimer l&apos;effet du changement.
              </p>
            )}
          </div>

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
