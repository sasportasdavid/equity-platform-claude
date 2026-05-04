'use client';

/**
 * Module 10 B4 — Wizard form `scenario-builder.tsx`.
 *
 * 1 form unique avec switch sur `scenarioType`. Chaque type a son
 * sub-form (champs spécifiques). Submit → `createScenario` Server Action.
 *
 * V1 simplifié : pas de wizard multi-step, juste un form qui s'adapte
 * au type sélectionné. V2 = wizard 3 steps + preview en temps réel.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { type CreateScenarioInput, SCENARIO_TYPES, type ScenarioType } from '@equity/shared';
import { createScenario } from '@/server/actions/cap-table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const SCENARIO_LABELS: Record<ScenarioType, string> = {
  NEW_ROUND: 'Nouvelle levée',
  POOL_TOPUP: 'Top-up du pool ESOP',
  BULK_EXERCISE: 'Exercice en masse',
  EXIT: 'Sortie de la société',
  COMBINED: 'Multi-étapes (V2)',
};

const SCENARIO_HINTS: Record<ScenarioType, string> = {
  NEW_ROUND: 'Modélise une levée hypothétique avec montant + valuation pre-money + lead investor.',
  POOL_TOPUP: 'Augmente le pool ESOP avant une levée (dilue founders) ou après (dilue tous).',
  BULK_EXERCISE: "Simule l'exercice de tous les BSPCE/SO vested. Convertit virtuels → COMMON.",
  EXIT: 'Calcul waterfall sur une valuation de sortie fixe. Liquidation preference appliquée.',
  COMBINED: 'Plusieurs scénarios en chaîne (V2 — pas implémenté V1).',
};

export function ScenarioBuilder() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Champs communs
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [scenarioType, setScenarioType] = useState<ScenarioType>('NEW_ROUND');

  // NEW_ROUND
  const [shareClassCode, setShareClassCode] = useState('PREF_B');
  const [preMoney, setPreMoney] = useState('20000000');
  const [amountRaised, setAmountRaised] = useState('5000000');
  const [pricePerShare, setPricePerShare] = useState('100');

  // POOL_TOPUP
  const [additionalUnits, setAdditionalUnits] = useState('5000');
  const [targetPoolPercent, setTargetPoolPercent] = useState('15');

  // EXIT
  const [exitValuation, setExitValuation] = useState('50000000');
  const [conversionStrategy, setConversionStrategy] = useState<
    'AUTO_BEST' | 'AS_PREFERRED' | 'AS_COMMON'
  >('AUTO_BEST');

  // BULK_EXERCISE
  const [onlyVested, setOnlyVested] = useState(true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let parameters: CreateScenarioInput['parameters'];
    if (scenarioType === 'NEW_ROUND') {
      parameters = {
        scenarioType: 'NEW_ROUND',
        shareClassCode,
        preMoney: Number(preMoney),
        amountRaised: Number(amountRaised),
        pricePerShare: Number(pricePerShare),
        antiDilutionApply: false,
        investorName: 'Hypothetical Lead',
      };
    } else if (scenarioType === 'POOL_TOPUP') {
      parameters = {
        scenarioType: 'POOL_TOPUP',
        additionalUnits: Number(additionalUnits),
        targetPoolPercentPost: Number(targetPoolPercent),
      };
    } else if (scenarioType === 'BULK_EXERCISE') {
      parameters = {
        scenarioType: 'BULK_EXERCISE',
        onlyVested,
      };
    } else if (scenarioType === 'EXIT') {
      parameters = {
        scenarioType: 'EXIT',
        exitValuation: Number(exitValuation),
        conversionStrategy,
      };
    } else {
      setError('Type COMBINED non supporté en V1');
      return;
    }

    startTransition(async () => {
      const result = await createScenario({
        name,
        description: description || undefined,
        isShared,
        parameters,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`/dashboard/captable/scenarios/${result.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Type de scénario</CardTitle>
          <CardDescription>{SCENARIO_HINTS[scenarioType]}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {SCENARIO_TYPES.filter((t) => t !== 'COMBINED').map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setScenarioType(t)}
              data-active={scenarioType === t}
              className={`flex flex-col items-start rounded-md border p-3 text-left text-sm transition-colors ${
                scenarioType === t
                  ? 'border-primary bg-primary/5'
                  : 'hover:border-primary/40 hover:bg-muted/30'
              }`}
            >
              <span className="font-medium">{SCENARIO_LABELS[t]}</span>
              <span className="text-muted-foreground mt-1 text-xs">{t}</span>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Métadonnées</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nom *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Series B 2027 hypothétique"
              required
              minLength={2}
              maxLength={100}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optionnel"
              maxLength={500}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="isShared"
              type="checkbox"
              checked={isShared}
              onChange={(e) => setIsShared(e.target.checked)}
              className="size-4"
            />
            <Label htmlFor="isShared" className="font-normal">
              Partager avec les autres admins de l&apos;org
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Sub-form spécifique au type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Paramètres {SCENARIO_LABELS[scenarioType]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {scenarioType === 'NEW_ROUND' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="shareClassCode">Code classe</Label>
                <Input
                  id="shareClassCode"
                  value={shareClassCode}
                  onChange={(e) => setShareClassCode(e.target.value.toUpperCase())}
                  placeholder="PREF_B"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="preMoney">Pre-money valuation (€) *</Label>
                <Input
                  id="preMoney"
                  type="number"
                  value={preMoney}
                  onChange={(e) => setPreMoney(e.target.value)}
                  required
                  min={1}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amountRaised">Amount raised (€) *</Label>
                <Input
                  id="amountRaised"
                  type="number"
                  value={amountRaised}
                  onChange={(e) => setAmountRaised(e.target.value)}
                  required
                  min={1}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pricePerShare">Price per share (€) *</Label>
                <Input
                  id="pricePerShare"
                  type="number"
                  step="any"
                  value={pricePerShare}
                  onChange={(e) => setPricePerShare(e.target.value)}
                  required
                  min={0.01}
                />
              </div>
            </div>
          )}

          {scenarioType === 'POOL_TOPUP' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="additionalUnits">Units à ajouter au pool *</Label>
                <Input
                  id="additionalUnits"
                  type="number"
                  value={additionalUnits}
                  onChange={(e) => setAdditionalUnits(e.target.value)}
                  required
                  min={1}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="targetPoolPercent">% pool cible post-topup</Label>
                <Input
                  id="targetPoolPercent"
                  type="number"
                  value={targetPoolPercent}
                  onChange={(e) => setTargetPoolPercent(e.target.value)}
                  step="0.1"
                  min={0}
                  max={100}
                />
              </div>
            </div>
          )}

          {scenarioType === 'EXIT' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="exitValuation">Valuation de sortie (€) *</Label>
                <Input
                  id="exitValuation"
                  type="number"
                  value={exitValuation}
                  onChange={(e) => setExitValuation(e.target.value)}
                  required
                  min={1}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="conversionStrategy">Stratégie conversion</Label>
                <select
                  id="conversionStrategy"
                  value={conversionStrategy}
                  onChange={(e) =>
                    setConversionStrategy(
                      e.target.value as 'AUTO_BEST' | 'AS_PREFERRED' | 'AS_COMMON',
                    )
                  }
                  className="border-input bg-background shadow-xs h-9 w-full rounded-md border px-3 text-sm"
                >
                  <option value="AUTO_BEST">AUTO_BEST (optimal pour preferred)</option>
                  <option value="AS_PREFERRED">AS_PREFERRED (liquidation pref)</option>
                  <option value="AS_COMMON">AS_COMMON (conversion 1:1)</option>
                </select>
              </div>
            </div>
          )}

          {scenarioType === 'BULK_EXERCISE' && (
            <div className="flex items-center gap-2">
              <input
                id="onlyVested"
                type="checkbox"
                checked={onlyVested}
                onChange={(e) => setOnlyVested(e.target.checked)}
                className="size-4"
              />
              <Label htmlFor="onlyVested" className="font-normal">
                Uniquement les vested (recommandé)
              </Label>
            </div>
          )}
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={pending || !name}>
          {pending ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
          Créer le scénario
        </Button>
      </div>
    </form>
  );
}
