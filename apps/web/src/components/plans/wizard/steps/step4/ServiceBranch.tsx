'use client';

import { Info } from 'lucide-react';

/**
 * MODULE_03A_PLANS Step 4.3 — branche SERVICE d'une condition.
 *
 * Une condition de type SERVICE est satisfaite si le bénéficiaire est
 * toujours présent à la date de vesting. Elle n'a pas de champs propres :
 *  - la durée de présence est définie côté Step 3 (vesting)
 *  - les règles de départ sont définies côté Step 5 (leavers)
 *
 * Le composant rend uniquement un bandeau explicatif. Les champs
 * partagés (nom, catégorie, poids, dates de mesure optionnelles) sont
 * gérés par `ConditionEditor`.
 */
export function ServiceBranch({ index }: { index: number }) {
  return (
    <div
      className="flex gap-3 rounded-md border border-dashed border-emerald-200 bg-emerald-50/40 p-3 text-xs dark:border-emerald-900/50 dark:bg-emerald-950/20"
      data-testid={`service-branch-${index}`}
    >
      <Info className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <div className="text-foreground space-y-1.5">
        <p className="font-medium">Condition de présence</p>
        <p className="text-muted-foreground">
          Cette condition est satisfaite si le bénéficiaire est toujours présent à la date de
          vesting. <strong>La durée de présence est définie dans l’étape Vesting (Step 3)</strong>{' '}
          et les règles de départ dans l’étape Leavers (Step 5). Aucun champ supplémentaire à
          renseigner ici.
        </p>
      </div>
    </div>
  );
}
