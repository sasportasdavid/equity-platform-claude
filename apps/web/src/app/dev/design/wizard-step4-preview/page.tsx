'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { FormProvider, useForm } from 'react-hook-form';
import type { PlanWizardData } from '@equity/shared';
import { Step4Performance } from '@/components/plans/wizard/steps/Step4Performance';

export const dynamic = 'force-dynamic';

/**
 * Sandbox /dev/design/wizard-step4-preview — Étape 13 commit 6/6.
 *
 * Rend le Step4Performance refondu (palette + typo Editorial Finance V1)
 * dans un FormProvider mock. Pas de boutons "Suivant/Précédent" — c'est
 * juste pour la validation visuelle du restyle.
 *
 * **Deux états affichés** :
 *  1. Step 4 sans conditions activées (toggle off) — état initial wizard
 *  2. Step 4 avec conditions activées + 1 condition NON_MARKET pré-remplie
 *
 * Pour la sandbox de test logique complète (40+ presets), voir
 * `/dev/wizard-step4` (Module 3a).
 */

const EMPTY_DEFAULTS: Partial<PlanWizardData> = {
  hasPerformanceConditions: false,
  combinationType: undefined,
  evaluationMoment: undefined,
  failureAction: undefined,
  conditions: [],
};

const ACTIVE_DEFAULTS: Partial<PlanWizardData> = {
  hasPerformanceConditions: true,
  combinationType: 'AND',
  evaluationMoment: 'END',
  failureAction: 'FORFEIT',
  conditions: [
    {
      id: 'cond-1',
      name: 'ARR > 12 M€',
      conditionType: 'NON_MARKET',
      category: 'FINANCIAL',
      weight: 100,
      enablePartialScoring: true,
    },
  ],
};

function MockFormWrapper({
  defaults,
  children,
}: {
  defaults: Partial<PlanWizardData>;
  children: React.ReactNode;
}) {
  const methods = useForm<PlanWizardData>({
    defaultValues: defaults as PlanWizardData,
    mode: 'onChange',
  });

  return <FormProvider {...methods}>{children}</FormProvider>;
}

export default function WizardStep4PreviewPage() {
  return (
    <div className="bg-background min-h-screen">
      <header className="border-paper-300 border-b px-8 py-4">
        <Link
          href="/dev/design"
          className="text-ink-500 hover:text-ink-900 inline-flex items-center text-sm"
        >
          <ArrowLeft className="mr-2 size-4" />
          /dev/design
        </Link>
        <p className="text-overline text-brass-500 mt-3">DESIGN SYSTEM V1 · SANDBOX</p>
        <h1 className="text-h1 text-ink-900">
          Wizard <span className="serif-italic text-brass-500">étape 4 · Performance</span>
        </h1>
        <div className="bg-brass-500 animate-draw-line mt-3 h-[2px] w-16" aria-hidden="true" />
        <p className="text-ink-500 mt-3 text-sm">
          Refonte editorial du Step 4 — palette + typo. Logique métier inchangée (conditions de
          performance, combinaison AND/OR/WEIGHTED, paramètres globaux, ConditionEditor pour chaque
          condition).
        </p>
        <p className="text-ink-400 mt-2 text-xs">
          ⚠ Mockup 5 a été dessiné en supposant un wizard «&nbsp;Conformité&nbsp;» avec ApprovalFlow
          et bannière d&apos;arbitrage. Le code actuel a un Step 4 «&nbsp;Performance&nbsp;».
          Fidélité visuelle complète déférée au Module 12 (Compliance V2 configurable + rules
          plan-in-edit + sélecteur de workflow). Voir{' '}
          <code className="bg-paper-200 rounded px-1 font-mono">
            memory/design_system_v1_recon.md
          </code>
          .
        </p>
      </header>

      <div className="space-y-16 p-8">
        {/* État 1 — Step 4 toggle off */}
        <section className="space-y-4">
          <div className="border-paper-300 border-l-[3px] pl-4">
            <p className="text-overline text-brass-500">CAS 1</p>
            <h2 className="text-h2 text-ink-900">
              Toggle <span className="serif-italic text-brass-500">désactivé</span>
            </h2>
            <p className="text-ink-500 mt-2 text-sm">
              État initial du wizard — l&apos;utilisateur n&apos;a pas encore activé les conditions
              de performance. Seuls le header et le toggle sont visibles.
            </p>
          </div>
          <div className="bg-card border-border/50 mx-auto max-w-4xl rounded-lg border p-6">
            <MockFormWrapper defaults={EMPTY_DEFAULTS}>
              <Step4Performance />
            </MockFormWrapper>
          </div>
        </section>

        {/* État 2 — Step 4 toggle on + 1 condition */}
        <section className="space-y-4">
          <div className="border-paper-300 border-l-[3px] pl-4">
            <p className="text-overline text-brass-500">CAS 2</p>
            <h2 className="text-h2 text-ink-900">
              Toggle <span className="serif-italic text-brass-500">activé</span> · 1 condition
            </h2>
            <p className="text-ink-500 mt-2 text-sm">
              Conditions activées avec paramètres globaux (combinaison AND, évaluation END, échec
              FORFEIT) + 1 condition NON_MARKET pré-remplie (ARR &gt; 12 M€).
            </p>
          </div>
          <div className="bg-card border-border/50 mx-auto max-w-4xl rounded-lg border p-6">
            <MockFormWrapper defaults={ACTIVE_DEFAULTS}>
              <Step4Performance />
            </MockFormWrapper>
          </div>
        </section>
      </div>
    </div>
  );
}
