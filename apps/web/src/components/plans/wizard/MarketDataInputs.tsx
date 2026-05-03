/**
 * Module 3a payload V2 — TSR_REL_INDEX market data inputs (3 modes).
 *
 * 3 modes de capture des paramètres market (S0, σ, ρ, dividend yield) :
 *
 *  - SNAPSHOT_AT_GRANT (default IFRS 2) — l'utilisateur clique "Récupérer
 *    maintenant" → proxy Server Action fetchIndexMarketData → preview
 *    EODHD/Yahoo → on remplit les champs en lecture seule. Reproductible.
 *
 *  - MANUAL — saisie manuelle des 4 champs (cas index obscur, data Bloomberg
 *    interne, etc.). L'utilisateur saisit aussi reference_index_correlation
 *    (Pearson sur log-returns vs sous-jacent).
 *
 *  - LIVE_AT_VALUATION — refetch à chaque run de valuation côté EF
 *    compute-valuation. ⚠️ Reproductibilité IFRS 2 dégradée — usage CFO /
 *    backtest only.
 *
 * Sans ces 4 inputs (S0/σ/ρ/q), le moteur Python (main.py l. 454-456)
 * fallback à S0=100, σ=20%, ρ=0.5 → Monte Carlo silencieusement faux.
 *
 * Audit IFRS 2.46 : reference_index_data_source persisté + timestamp
 * captured_at — voir migration 00070.
 */
'use client';

import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { AlertTriangle, Info, Loader2, RefreshCw } from 'lucide-react';
import type { PlanWizardData } from '@equity/shared';
import { fetchIndexMarketData } from '@/server/actions/market-data';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Mode = 'SNAPSHOT_AT_GRANT' | 'MANUAL' | 'LIVE_AT_VALUATION';

type Props = {
  /** Index de la condition dans le tableau RHF (e.g. 0). */
  conditionIndex: number;
  /** Display name de l'index pour l'aide contextuelle. */
  indexDisplayName?: string;
  /** Ticker Yahoo courant (ex: ^FCHI). */
  ticker: string;
  /** Date de référence (= grant_date du plan, depuis Step 3). */
  asOfDate?: string;
};

export function MarketDataInputs({ conditionIndex, indexDisplayName, ticker, asOfDate }: Props) {
  const { register, watch, setValue, formState } = useFormContext<PlanWizardData>();
  const fieldNamePrefix = `conditions.${conditionIndex}` as const;

  const mode = (watch(`${fieldNamePrefix}.marketDataFetchMode`) ?? 'SNAPSHOT_AT_GRANT') as Mode;
  const s0 = watch(`${fieldNamePrefix}.reference_index_s0`);
  const sigma = watch(`${fieldNamePrefix}.reference_index_sigma`);
  const correlation = watch(`${fieldNamePrefix}.reference_index_correlation`);
  const dataSource = watch(`${fieldNamePrefix}.reference_index_data_source`);
  const capturedAt = watch(`${fieldNamePrefix}.reference_index_data_captured_at`);

  const errors = formState.errors;
  const conditionErrors = (
    errors.conditions as Array<Record<string, { message?: string } | undefined>> | undefined
  )?.[conditionIndex];

  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  function setMode(next: Mode) {
    setValue(`${fieldNamePrefix}.marketDataFetchMode`, next, {
      shouldValidate: true,
      shouldDirty: true,
    });
    if (next !== 'MANUAL') {
      // Au switch MANUAL → autre mode, on garde les valeurs (utiles preview)
      // mais on bascule la source pour audit.
      if (next === 'SNAPSHOT_AT_GRANT' && dataSource === 'MANUAL') {
        setValue(`${fieldNamePrefix}.reference_index_data_source`, null, {
          shouldDirty: true,
        });
      }
    } else {
      // Switch vers MANUAL : on tag la source pour audit
      setValue(`${fieldNamePrefix}.reference_index_data_source`, 'MANUAL', {
        shouldDirty: true,
      });
    }
  }

  async function handleAutoFetch() {
    setFetchError(null);
    if (!ticker || ticker.trim().length === 0) {
      setFetchError('Sélectionner un ticker avant de récupérer.');
      return;
    }
    if (!asOfDate) {
      setFetchError('Date de référence (grant_date du plan) manquante.');
      return;
    }
    setFetching(true);
    try {
      const result = await fetchIndexMarketData({
        ticker: ticker.trim(),
        asOfDate,
        lookbackDays: 1095,
      });
      if (!result.ok) {
        setFetchError(result.error);
        return;
      }
      const md = result.data;
      setValue(`${fieldNamePrefix}.reference_index_s0`, md.s0, {
        shouldValidate: true,
        shouldDirty: true,
      });
      setValue(`${fieldNamePrefix}.reference_index_sigma`, md.sigma, {
        shouldValidate: true,
        shouldDirty: true,
      });
      setValue(`${fieldNamePrefix}.reference_index_dividend_yield`, md.dividend_yield, {
        shouldValidate: true,
        shouldDirty: true,
      });
      setValue(`${fieldNamePrefix}.reference_index_data_source`, 'EODHD', {
        shouldDirty: true,
      });
      setValue(`${fieldNamePrefix}.reference_index_data_captured_at`, new Date().toISOString(), {
        shouldDirty: true,
      });
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setFetching(false);
    }
  }

  const requireValues = mode === 'SNAPSHOT_AT_GRANT' || mode === 'MANUAL';
  const allFilled =
    !requireValues ||
    (s0 != null &&
      Number(s0) > 0 &&
      sigma != null &&
      Number(sigma) > 0 &&
      correlation != null &&
      Number(correlation) >= -1 &&
      Number(correlation) <= 1);

  const readonlyValues = mode === 'SNAPSHOT_AT_GRANT' && dataSource === 'EODHD';

  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardHeader>
        <CardTitle className="text-base">
          Paramètres de marché — {indexDisplayName ?? ticker ?? 'Indice'}
        </CardTitle>
        <CardDescription>
          Mode de capture des paramètres S₀, σ, ρ, q. Ces valeurs alimentent le moteur Monte Carlo.
          Sans elles, fallback silencieux S₀=100, σ=20 %, ρ=0,5.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Mode picker */}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Mode de capture</legend>
          <div className="grid gap-2 md:grid-cols-3">
            <ModeRadio
              value="SNAPSHOT_AT_GRANT"
              currentMode={mode}
              onChange={setMode}
              label="Auto-fetch (snapshot)"
              hint="EODHD/Yahoo à la grant_date — reproductible IFRS 2"
              recommended
            />
            <ModeRadio
              value="MANUAL"
              currentMode={mode}
              onChange={setMode}
              label="Saisie manuelle"
              hint="Index obscur ou data Bloomberg interne"
            />
            <ModeRadio
              value="LIVE_AT_VALUATION"
              currentMode={mode}
              onChange={setMode}
              label="Live à chaque run"
              hint="Refetch live — backtest / MTM"
            />
          </div>
        </fieldset>

        {/* Hidden register pour persister le mode */}
        <input type="hidden" {...register(`${fieldNamePrefix}.marketDataFetchMode`)} />

        {/* Warning IFRS 2 dégradé pour LIVE_AT_VALUATION */}
        {mode === 'LIVE_AT_VALUATION' ? (
          <Alert variant="default" className="border-orange-300 bg-orange-50">
            <AlertTriangle className="h-4 w-4 text-orange-700" />
            <AlertTitle>Reproductibilité IFRS 2 dégradée</AlertTitle>
            <AlertDescription className="space-y-2 text-xs">
              <p>
                En mode <strong>Live à chaque run</strong>, S₀, σ et ρ sont refetchés à chaque
                valorisation depuis Yahoo/EODHD avec la date du run comme
                <code className="ml-1 font-mono">as_of_date</code>. Deux runs lancés à 30 secondes
                d&apos;écart peuvent renvoyer des valeurs différentes (mouvements intra-day) — la
                valeur IFRS 2 du plan ne sera donc PAS strictement reproductible.
              </p>
              <p>
                Usage recommandé : <strong>backtest</strong>, <strong>reporting MTM</strong>, ou
                simulations &laquo; what-if &raquo;. Pour la valorisation officielle IFRS 2
                d&apos;un plan d&apos;actionnariat, préférer
                <strong> Auto-fetch (snapshot)</strong>.
              </p>
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Auto-fetch button (mode SNAPSHOT only) */}
        {mode === 'SNAPSHOT_AT_GRANT' ? (
          <div className="flex flex-col gap-2 rounded-md border border-dashed bg-white/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-muted-foreground text-xs">
                {capturedAt && dataSource === 'EODHD' ? (
                  <>
                    Capturé le{' '}
                    <span className="font-mono">
                      {new Date(capturedAt).toLocaleString('fr-FR')}
                    </span>{' '}
                    depuis <strong>{dataSource}</strong>.
                  </>
                ) : (
                  <>Aucune capture — cliquez pour récupérer S₀ / σ / q en live.</>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAutoFetch}
                disabled={fetching || !ticker}
                data-testid={`market-data-fetch-${conditionIndex}`}
              >
                {fetching ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Récupération…
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Récupérer maintenant
                  </>
                )}
              </Button>
            </div>
            {fetchError ? (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">{fetchError}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : null}

        {/* Form values incomplete warning */}
        {requireValues && !allFilled ? (
          <Alert variant="default" className="border-amber-300 bg-amber-100/50">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <AlertTitle>Données incomplètes</AlertTitle>
            <AlertDescription>
              Remplir les 3 champs S₀, σ, ρ pour que la valuation Monte Carlo utilise les vraies
              caractéristiques de marché. Sinon le moteur tombera sur ses valeurs par défaut (S₀ =
              100, σ = 20 %, ρ = 0,5).
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Inputs (toujours visibles ; readonly si snapshot/EODHD) */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldNamePrefix}.s0`}>
              Spot S₀ {requireValues && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id={`${fieldNamePrefix}.s0`}
              type="number"
              step="0.01"
              min="0.01"
              placeholder="ex : 7234.12"
              readOnly={readonlyValues}
              aria-invalid={!!conditionErrors?.reference_index_s0}
              {...register(`${fieldNamePrefix}.reference_index_s0`, {
                valueAsNumber: true,
              })}
            />
            <p className="text-muted-foreground text-xs">Cours de clôture à la grant_date.</p>
            {conditionErrors?.reference_index_s0?.message ? (
              <p className="text-destructive text-xs">
                {String(conditionErrors.reference_index_s0.message)}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${fieldNamePrefix}.sigma`}>
              Volatilité σ {requireValues && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id={`${fieldNamePrefix}.sigma`}
              type="number"
              step="0.001"
              min="0.001"
              max="5"
              placeholder="ex : 0.18"
              readOnly={readonlyValues}
              aria-invalid={!!conditionErrors?.reference_index_sigma}
              {...register(`${fieldNamePrefix}.reference_index_sigma`, {
                valueAsNumber: true,
              })}
            />
            <p className="text-muted-foreground text-xs">Fraction (0,18 = 18%).</p>
            {conditionErrors?.reference_index_sigma?.message ? (
              <p className="text-destructive text-xs">
                {String(conditionErrors.reference_index_sigma.message)}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${fieldNamePrefix}.correlation`}>
              Corrélation ρ {requireValues && <span className="text-destructive">*</span>}
            </Label>
            <Input
              id={`${fieldNamePrefix}.correlation`}
              type="number"
              step="0.01"
              min="-1"
              max="1"
              placeholder="ex : 0.72"
              aria-invalid={!!conditionErrors?.reference_index_correlation}
              {...register(`${fieldNamePrefix}.reference_index_correlation`, {
                valueAsNumber: true,
              })}
            />
            <p className="text-muted-foreground text-xs">ρ ∈ [-1, 1] avec sous-jacent.</p>
            {conditionErrors?.reference_index_correlation?.message ? (
              <p className="text-destructive text-xs">
                {String(conditionErrors.reference_index_correlation.message)}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${fieldNamePrefix}.dividend_yield`}>Dividend yield q</Label>
            <Input
              id={`${fieldNamePrefix}.dividend_yield`}
              type="number"
              step="0.001"
              min="0"
              max="1"
              placeholder="ex : 0.025"
              readOnly={readonlyValues}
              {...register(`${fieldNamePrefix}.reference_index_dividend_yield`, {
                valueAsNumber: true,
              })}
            />
            <p className="text-muted-foreground text-xs">Decimal (0,025 = 2.5%).</p>
          </div>
        </div>

        <Alert variant="default" className="border-blue-200 bg-blue-50/50">
          <Info className="h-4 w-4 text-blue-700" />
          <AlertDescription className="text-xs">
            <strong>Source recommandée</strong> : EODHD (auto-fetch) ou Yahoo Finance. Pour la
            corrélation, viser ≥ 252 jours de données historiques (3 ans recommandés en IFRS 2).
            Source actuelle : <code className="font-mono">{dataSource ?? '—'}</code>.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

function ModeRadio({
  value,
  currentMode,
  onChange,
  label,
  hint,
  recommended,
}: {
  value: Mode;
  currentMode: Mode;
  onChange: (next: Mode) => void;
  label: string;
  hint: string;
  recommended?: boolean;
}) {
  const active = value === currentMode;
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      data-testid={`market-mode-${value}`}
      data-active={active}
      className={[
        'flex flex-col items-start gap-1 rounded-md border p-3 text-left text-xs transition-colors',
        active
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/40 hover:bg-primary/2 bg-white',
      ].join(' ')}
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        {recommended ? (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
            IFRS 2
          </span>
        ) : null}
      </div>
      <span className="text-muted-foreground">{hint}</span>
    </button>
  );
}

// Backwards-compat export pour les call-sites existants (sandbox /dev) qui
// importent encore l'ancien nom. Le nouveau nom est `MarketDataInputs`.
export const ManualIndexMarketDataInputs = MarketDataInputs;
