'use client';

import { useFormContext } from 'react-hook-form';
import { Check, Lock } from 'lucide-react';
import { CONDITION_TYPE_UI_LABELS, PLAN_TYPE_UI_LABELS, type PlanWizardData } from '@equity/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { isStepLogicallyEmpty, type WizardStepDef, type WizardStepId } from './lib/wizard-steps';

/**
 * Sidebar de navigation des 7 étapes du wizard.
 *
 * Pour chaque étape :
 *  - Indicateur visuel : courante (indigo) / complétée (✓ vert) /
 *    visitée mais incomplète (gris) / non visitée (cadenas).
 *  - Résumé contextuel court selon le form state (planType, nbConditions,
 *    underlyingModel, etc.) — donne un coup d'œil rapide.
 *  - Click pour naviguer si visited (le hook refusera les sauts en
 *    avant non visités).
 */
export function WizardSidebar({
  steps,
  currentStep,
  visitedSteps,
  onStepClick,
  isStepCompleted,
}: {
  steps: ReadonlyArray<WizardStepDef>;
  currentStep: WizardStepId;
  visitedSteps: Set<WizardStepId>;
  onStepClick: (id: WizardStepId) => void;
  isStepCompleted: (id: WizardStepId) => boolean;
}) {
  const { watch } = useFormContext<PlanWizardData>();
  const data = watch();

  return (
    <nav aria-label="Navigation du wizard" className="w-full lg:w-72">
      <ol className="space-y-1.5">
        {steps.map((step) => {
          const isCurrent = step.id === currentStep;
          const isCompleted = isStepCompleted(step.id);
          const isVisited = visitedSteps.has(step.id);
          const isLocked = !isVisited && step.id > currentStep;
          const summary = stepSummary(step.id, data);
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onStepClick(step.id)}
                disabled={isLocked}
                aria-current={isCurrent ? 'step' : undefined}
                className={cn(
                  'group/step flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors',
                  isCurrent && 'border-primary bg-primary/5',
                  !isCurrent && !isLocked && 'hover:bg-muted/40',
                  isLocked && 'cursor-not-allowed opacity-50',
                )}
                data-testid={`wizard-step-nav-${step.id}`}
                data-current={isCurrent ? 'true' : undefined}
                data-completed={isCompleted ? 'true' : undefined}
              >
                <span
                  className={cn(
                    'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                    isCurrent && 'border-primary bg-primary text-primary-foreground',
                    !isCurrent && isCompleted && 'border-emerald-500 bg-emerald-500 text-white',
                    !isCurrent && !isCompleted && 'border-border text-muted-foreground',
                  )}
                >
                  {isCompleted ? (
                    <Check className="size-3.5" />
                  ) : isLocked ? (
                    <Lock className="size-3" />
                  ) : (
                    step.id
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium leading-tight">{step.title}</span>
                  {summary ? (
                    <span className="text-muted-foreground truncate text-xs">{summary}</span>
                  ) : (
                    <span className="text-muted-foreground text-xs italic">{step.description}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Résumé contextuel d'une étape — affiché sous le titre dans la sidebar.
 * Renvoie `null` si pas de donnée pertinente (= placeholder description).
 */
function stepSummary(stepId: WizardStepId, data: Partial<PlanWizardData>): string | null {
  switch (stepId) {
    case 1:
      return data.planType ? PLAN_TYPE_UI_LABELS[data.planType] : null;
    case 2:
      return data.name?.trim() ? data.name : null;
    case 3:
      if (data.vestingType === 'single') return 'Vesting unique';
      if (data.vestingType === 'tranches') {
        const n = data.vestingTranches?.length ?? 0;
        return n > 0 ? `${n} tranche(s)` : null;
      }
      if (data.vestingType === 'cliff_linear') {
        const cliff = data.cliffMonths ?? 0;
        const total = data.totalMonths ?? 0;
        if (cliff || total) return `Cliff ${cliff} / Total ${total} mois`;
        return null;
      }
      return null;
    case 4:
      if (isStepLogicallyEmpty(stepId, data)) return 'Désactivé (sans condition)';
      if (!data.conditions?.length) return null;
      // Compte par type
      const byType: Record<string, number> = {};
      for (const c of data.conditions) byType[c.conditionType] = (byType[c.conditionType] ?? 0) + 1;
      const parts = Object.entries(byType).map(
        ([t, n]) => `${n}× ${CONDITION_TYPE_UI_LABELS[t as keyof typeof CONDITION_TYPE_UI_LABELS]}`,
      );
      return parts.join(', ');
    case 5: {
      const rules = data.leaverRules ?? {};
      const definedCount = Object.values(rules).filter((r) => r && r.treatment).length;
      return definedCount > 0 ? `${definedCount} / 8 règles définies` : null;
    }
    case 6: {
      const parts: string[] = [];
      if (data.underlyingModel) parts.push(data.underlyingModel);
      if (data.volatility != null) parts.push(`σ ${data.volatility}%`);
      if (data.riskFreeRate != null) parts.push(`rfr ${data.riskFreeRate}%`);
      return parts.length > 0 ? parts.join(' · ') : null;
    }
    case 7:
      return null;
    default:
      return null;
  }
}

/**
 * Variante alternative à intégrer plus tard : badge récapitulatif
 * (compactor) — exporté pour réutilisation côté Step7Review.
 */
export function StepBadge({ count, label }: { count: number; label: string }) {
  return (
    <Badge variant="outline" className="font-mono">
      {count} {label}
    </Badge>
  );
}
