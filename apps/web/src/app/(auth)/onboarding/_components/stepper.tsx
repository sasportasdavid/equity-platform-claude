import { cn } from '@/lib/utils';

/**
 * Module 14 PR #43 §B2 — Stepper visuel onboarding 4 étapes.
 *
 * DS V1 Editorial Finance : 4 cercles horizontaux + libellé + barre brass-500
 * pour les étapes complétées. Animation transition `width 350ms ease`
 * sur la barre de progression. Respecte `prefers-reduced-motion` (les
 * cercles sont rendus sans transform animé).
 *
 * Étapes V1 :
 *   1. Profil   (/onboarding/profile)
 *   2. Organisation (/onboarding/company)
 *   3. Permissions (inline dans /welcome)
 *   4. Bienvenue (/onboarding/welcome)
 *
 * Le stepper accepte un `currentStep` 1-4. Les cercles 1..currentStep-1
 * sont marqués "done" (background brass), `currentStep` est "current"
 * (border brass + dot interne), et les suivants sont "pending" (slate).
 */
type Props = {
  currentStep: 1 | 2 | 3 | 4;
};

const STEP_LABELS = ['Profil', 'Organisation', 'Permissions', 'Bienvenue'] as const;

export function OnboardingStepper({ currentStep }: Props) {
  const progressPercent = ((currentStep - 1) / (STEP_LABELS.length - 1)) * 100;
  return (
    <div className="w-full max-w-md" data-testid="onboarding-stepper">
      <div className="text-muted-foreground mb-3 flex items-baseline justify-between text-xs">
        <span className="font-mono uppercase tracking-wider">
          Étape <strong className="text-foreground">{currentStep}</strong> / {STEP_LABELS.length}
        </span>
        <span className="serif-italic text-brass-500">{STEP_LABELS[currentStep - 1]}</span>
      </div>
      <div className="bg-muted/40 relative h-1.5 overflow-hidden rounded-full">
        <div
          className="bg-brass-500 absolute inset-y-0 left-0 h-full duration-[350ms] ease-out motion-safe:transition-[width]"
          style={{ width: `${progressPercent}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="mt-2 flex justify-between">
        {STEP_LABELS.map((label, idx) => {
          const stepNum = idx + 1;
          const isDone = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;
          return (
            <div key={label} className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  'flex size-5 items-center justify-center rounded-full border font-mono text-[10px] font-semibold',
                  isDone && 'bg-brass-500 border-brass-500 text-white',
                  isCurrent && 'border-brass-500 text-brass-500 bg-background',
                  !isDone &&
                    !isCurrent &&
                    'border-muted-foreground/30 text-muted-foreground bg-background',
                )}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {isDone ? '✓' : stepNum}
              </span>
              <span
                className={cn(
                  'text-[10px] uppercase tracking-wider',
                  isCurrent ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
