'use client';

import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * Bandeau qui matérialise la contrainte « somme des poids = 100 % » du
 * mode `WEIGHTED` (Module 3a §2.5 Step 4).
 *
 * Affiché uniquement quand au moins une condition existe et que le mode
 * de combinaison est `WEIGHTED` ; reste rendu même si OK pour donner un
 * feedback positif (vert) — utile sur les wizards où l'utilisateur ajuste
 * fréquemment les poids et veut un repère immédiat.
 */
export function WeightValidationBanner({
  total,
  conditionsCount,
}: {
  total: number;
  conditionsCount: number;
}) {
  const ok = Math.abs(total - 100) < 0.01;
  const drift = total - 100;

  if (conditionsCount === 0) return null;

  if (ok) {
    return (
      <Alert
        data-testid="weight-validation-banner"
        data-ok="true"
        className="border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-100"
      >
        <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
        <AlertTitle>Pondération valide</AlertTitle>
        <AlertDescription className="text-emerald-800 dark:text-emerald-200">
          Total des poids = <strong>100 %</strong> sur {conditionsCount} condition
          {conditionsCount > 1 ? 's' : ''}.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive" data-testid="weight-validation-banner" data-ok="false">
      <TriangleAlert className="size-4" />
      <AlertTitle>Pondération invalide</AlertTitle>
      <AlertDescription>
        La somme des poids des {conditionsCount} conditions vaut{' '}
        <strong>{total.toFixed(2)} %</strong> ({drift >= 0 ? '+' : ''}
        {drift.toFixed(2)} % d’écart). Le mode <strong>WEIGHTED</strong> exige exactement{' '}
        <strong>100 %</strong>.
      </AlertDescription>
    </Alert>
  );
}
