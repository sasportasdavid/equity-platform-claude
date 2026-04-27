'use client';

import { useFormContext } from 'react-hook-form';
import { Activity, Calculator, Coins, TrendingUp } from 'lucide-react';
import {
  CURRENCY_UI_LABELS,
  CurrencyEnum,
  MODEL_CHOICE_UI_LABELS,
  ModelChoiceEnum,
  PLAN_WIZARD_LIMITS,
  STEPS_PER_YEAR_UI_LABELS,
  UNDERLYING_MODEL_UI_LABELS,
  UnderlyingModelEnum,
  VOL_METHOD_UI_LABELS,
  VolMethodEnum,
  type PlanWizardData,
  type UnderlyingModel,
} from '@equity/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Step 6 — Valuation Monte Carlo.
 *
 * 4 sections fixes (Sous-jacent / Volatilité / Taux & dividendes /
 * Modèle Monte Carlo) + 2 sections conditionnelles selon
 * `underlyingModel` (HESTON / JUMP_DIFFUSION).
 *
 * Tous les champs nourrissent le payload envoyé au moteur Python
 * (https://equity-gem-quant.fly.dev). Les valeurs par défaut viennent
 * du `step6Schema.default(...)` Zod (numPaths=50000, stepsPerYear=12,
 * useAntithetic=true, etc.).
 *
 * Validations cross-field dans `planWizardSchema.superRefine` :
 *  - dividendInputMode === 'amount' → dividendAmount requis (≥ 0)
 *  - underlyingModel === 'HESTON' → 5 paramètres hestonX requis
 *  - underlyingModel === 'JUMP_DIFFUSION' → 3 paramètres jumpX requis
 */

const STEPS_PER_YEAR_OPTIONS: ReadonlyArray<12 | 52 | 252> = [12, 52, 252];

export function Step6Valuation() {
  const { register, watch, formState } = useFormContext<PlanWizardData>();
  const errors = formState.errors;
  const underlyingModel = watch('underlyingModel') as UnderlyingModel | undefined;
  const dividendInputMode = watch('dividendInputMode');
  const showHeston = underlyingModel === 'HESTON';
  const showJump = underlyingModel === 'JUMP_DIFFUSION';

  return (
    <section className="space-y-5" data-testid="step-6-valuation">
      <p className="text-muted-foreground text-sm">
        Paramètres du modèle de valorisation Monte Carlo. Les défauts conviennent à 90 % des cas.
        Les modèles HESTON et JUMP_DIFFUSION nécessitent des paramètres supplémentaires (calibrés
        depuis le marché des options).
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Sous-jacent */}
        <Card data-testid="val-card-underlying">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="size-4" /> Sous-jacent
            </CardTitle>
            <CardDescription>Action sous-jacente et devise de référence.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <NumberField
              register={register}
              name="underlyingPrice"
              label="Prix du sous-jacent (S₀) *"
              min={0.01}
              step="any"
              placeholder="Ex : 12.50"
              errorMsg={errors.underlyingPrice?.message as string | undefined}
              helpText="Prix de l'action à la date d'attribution."
            />
            <SelectField
              register={register}
              name="currency"
              label="Devise"
              defaultValue={watch('currency') ?? 'EUR'}
              options={CurrencyEnum.options.map((c) => ({
                value: c,
                label: CURRENCY_UI_LABELS[c],
              }))}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField
                register={register}
                name="ticker"
                label="Ticker (optionnel)"
                placeholder="^FCHI, AAPL…"
                mono
              />
              <TextField
                register={register}
                name="companyTicker"
                label="Ticker société (optionnel)"
                placeholder="MC.PA"
                mono
              />
            </div>
          </CardContent>
        </Card>

        {/* Volatilité */}
        <Card data-testid="val-card-vol">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4" /> Volatilité
            </CardTitle>
            <CardDescription>Méthode d&apos;estimation et valeur (% annualisée).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <SelectField
              register={register}
              name="volMethod"
              label="Méthode"
              defaultValue={watch('volMethod') ?? 'MANUAL'}
              options={VolMethodEnum.options.map((v) => ({
                value: v,
                label: VOL_METHOD_UI_LABELS[v],
              }))}
            />
            <NumberField
              register={register}
              name="volatility"
              label={`Volatilité (% annualisée) *`}
              min={PLAN_WIZARD_LIMITS.MIN_VOLATILITY}
              max={PLAN_WIZARD_LIMITS.MAX_VOLATILITY}
              step="any"
              placeholder="Ex : 35"
              errorMsg={errors.volatility?.message as string | undefined}
              helpText={`Entre ${PLAN_WIZARD_LIMITS.MIN_VOLATILITY} % et ${PLAN_WIZARD_LIMITS.MAX_VOLATILITY} %.`}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField
                register={register}
                name="lookbackDays"
                label="Lookback (jours)"
                min={180}
                max={3650}
                step={1}
                placeholder="1095"
                helpText="Pour méthode HISTORICAL."
              />
              <NumberField
                register={register}
                name="volatilityWinsorizingPct"
                label="Winsorizing (%)"
                min={0}
                max={20}
                step="any"
                placeholder="0"
                helpText="Tronque les outliers."
              />
            </div>
          </CardContent>
        </Card>

        {/* Taux & dividendes */}
        <Card data-testid="val-card-rates">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4" /> Taux & dividendes
            </CardTitle>
            <CardDescription>Risk-free et politique de dividendes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <NumberField
              register={register}
              name="riskFreeRate"
              label="Taux sans risque (%) *"
              min={PLAN_WIZARD_LIMITS.MIN_RISK_FREE_RATE}
              max={PLAN_WIZARD_LIMITS.MAX_RISK_FREE_RATE}
              step="any"
              placeholder="Ex : 3.5"
              errorMsg={errors.riskFreeRate?.message as string | undefined}
              helpText="OAT 10 ans ou équivalent."
            />
            <SelectField
              register={register}
              name="dividendInputMode"
              label="Mode dividende"
              defaultValue={dividendInputMode ?? 'percent'}
              options={[
                { value: 'percent', label: 'Yield (%)' },
                { value: 'amount', label: 'Montant absolu (€)' },
              ]}
            />
            {dividendInputMode === 'amount' ? (
              <NumberField
                register={register}
                name="dividendAmount"
                label="Montant dividende (€) *"
                min={0}
                step="any"
                placeholder="Ex : 1.20"
                errorMsg={errors.dividendAmount?.message as string | undefined}
                shouldUnregister
              />
            ) : (
              <NumberField
                register={register}
                name="dividendYield"
                label="Dividend Yield (%)"
                min={0}
                max={PLAN_WIZARD_LIMITS.MAX_DIVIDEND_YIELD}
                step="any"
                placeholder="Ex : 2"
                errorMsg={errors.dividendYield?.message as string | undefined}
                shouldUnregister
              />
            )}
          </CardContent>
        </Card>

        {/* Modèle Monte Carlo */}
        <Card data-testid="val-card-model">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calculator className="size-4" /> Modèle Monte Carlo
            </CardTitle>
            <CardDescription>Choix du moteur et paramètres de simulation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                register={register}
                name="modelChoice"
                label="Moteur"
                defaultValue={watch('modelChoice') ?? 'auto'}
                options={ModelChoiceEnum.options.map((m) => ({
                  value: m,
                  label: MODEL_CHOICE_UI_LABELS[m],
                }))}
              />
              <SelectField
                register={register}
                name="underlyingModel"
                label="Modèle sous-jacent"
                defaultValue={underlyingModel ?? 'GBM'}
                options={UnderlyingModelEnum.options.map((u) => ({
                  value: u,
                  label: UNDERLYING_MODEL_UI_LABELS[u],
                }))}
              />
            </div>
            <NumberField
              register={register}
              name="timeHorizonYears"
              label="Horizon temporel (années) *"
              min={PLAN_WIZARD_LIMITS.MIN_TIME_HORIZON}
              max={PLAN_WIZARD_LIMITS.MAX_TIME_HORIZON}
              step="any"
              placeholder="Ex : 4"
              errorMsg={errors.timeHorizonYears?.message as string | undefined}
              helpText={`Entre ${PLAN_WIZARD_LIMITS.MIN_TIME_HORIZON} et ${PLAN_WIZARD_LIMITS.MAX_TIME_HORIZON} ans.`}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField
                register={register}
                name="numPaths"
                label="Nombre de paths"
                min={PLAN_WIZARD_LIMITS.MIN_NUM_PATHS}
                max={PLAN_WIZARD_LIMITS.MAX_NUM_PATHS}
                step={1000}
                placeholder="50000"
                helpText="50 000 = bon compromis vitesse/précision."
              />
              <SelectField
                register={register}
                name="stepsPerYear"
                label="Pas par an"
                defaultValue={String(watch('stepsPerYear') ?? 12)}
                options={STEPS_PER_YEAR_OPTIONS.map((n) => ({
                  value: String(n),
                  label: STEPS_PER_YEAR_UI_LABELS[n],
                }))}
                valueAsNumber
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                {...register('useAntithetic')}
                defaultChecked={watch('useAntithetic') ?? true}
                className="size-4"
              />
              <span>Antithetic variates (réduit la variance)</span>
            </label>
          </CardContent>
        </Card>
      </div>

      {showHeston ? <HestonCard /> : null}
      {showJump ? <JumpDiffusionCard /> : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Cards conditionnels selon le modèle sous-jacent
// ---------------------------------------------------------------------------

function HestonCard() {
  const { watch, setValue, formState } = useFormContext<PlanWizardData>();
  const errors = formState.errors;
  return (
    <Card data-testid="val-card-heston">
      <CardHeader>
        <CardTitle className="text-base">Paramètres HESTON (volatilité stochastique)</CardTitle>
        <CardDescription>
          5 paramètres calibrés depuis le marché des options. Calibrage manuel ou via le moteur.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <ControlledNumberField
          name="hestonV0"
          label="V₀ — variance initiale *"
          step="any"
          placeholder="Ex : 0.04"
          value={watch('hestonV0')}
          onChange={(v) => setValue('hestonV0', v)}
          errorMsg={errors.hestonV0?.message as string | undefined}
        />
        <ControlledNumberField
          name="hestonKappa"
          label="Kappa *"
          step="any"
          placeholder="Ex : 2"
          value={watch('hestonKappa')}
          onChange={(v) => setValue('hestonKappa', v)}
          errorMsg={errors.hestonKappa?.message as string | undefined}
        />
        <ControlledNumberField
          name="hestonTheta"
          label="Theta *"
          step="any"
          placeholder="Ex : 0.04"
          value={watch('hestonTheta')}
          onChange={(v) => setValue('hestonTheta', v)}
          errorMsg={errors.hestonTheta?.message as string | undefined}
        />
        <ControlledNumberField
          name="hestonXi"
          label="Xi (vol-of-vol) *"
          step="any"
          placeholder="Ex : 0.3"
          value={watch('hestonXi')}
          onChange={(v) => setValue('hestonXi', v)}
          errorMsg={errors.hestonXi?.message as string | undefined}
        />
        <ControlledNumberField
          name="hestonRho"
          label="Rho *"
          min={-1}
          max={1}
          step="any"
          placeholder="Ex : -0.5"
          value={watch('hestonRho')}
          onChange={(v) => setValue('hestonRho', v)}
          errorMsg={errors.hestonRho?.message as string | undefined}
        />
      </CardContent>
    </Card>
  );
}

function JumpDiffusionCard() {
  const { watch, setValue, formState } = useFormContext<PlanWizardData>();
  const errors = formState.errors;
  return (
    <Card data-testid="val-card-jump">
      <CardHeader>
        <CardTitle className="text-base">Paramètres JUMP_DIFFUSION (sauts de Merton)</CardTitle>
        <CardDescription>3 paramètres pour le processus de saut.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <ControlledNumberField
          name="jumpLambda"
          label="Lambda (intensité) *"
          step="any"
          placeholder="Ex : 0.1"
          value={watch('jumpLambda')}
          onChange={(v) => setValue('jumpLambda', v)}
          errorMsg={errors.jumpLambda?.message as string | undefined}
        />
        <ControlledNumberField
          name="jumpMuJ"
          label="Mu_J (taille moyenne) *"
          step="any"
          placeholder="Ex : -0.05"
          value={watch('jumpMuJ')}
          onChange={(v) => setValue('jumpMuJ', v)}
          errorMsg={errors.jumpMuJ?.message as string | undefined}
        />
        <ControlledNumberField
          name="jumpSigmaJ"
          label="Sigma_J (vol des sauts) *"
          step="any"
          placeholder="Ex : 0.15"
          value={watch('jumpSigmaJ')}
          onChange={(v) => setValue('jumpSigmaJ', v)}
          errorMsg={errors.jumpSigmaJ?.message as string | undefined}
        />
      </CardContent>
    </Card>
  );
}

/**
 * Variante controlled de NumberField pour les fields qui doivent se
 * re-sync au `reset()` du form (Heston, JumpDiffusion). RHF avec
 * `register` garde un shadow state qui ne se purge pas tant que le
 * composant ne unmount pas — or HestonCard reste monté quand on switch
 * de preset HESTON → KO HESTON. La version controlled (value+onChange)
 * lit la value depuis le form state à chaque render.
 */
function ControlledNumberField({
  name,
  label,
  min,
  max,
  step,
  placeholder,
  value,
  onChange,
  errorMsg,
}: {
  name: string;
  label: string;
  min?: number;
  max?: number;
  step?: number | string;
  placeholder?: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  errorMsg?: string;
}) {
  const id = `val-${name}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        aria-invalid={!!errorMsg}
        className="h-8 font-mono"
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') onChange(undefined);
          else {
            const n = Number(raw);
            onChange(Number.isFinite(n) ? n : undefined);
          }
        }}
      />
      {errorMsg ? <p className="text-destructive text-xs">{errorMsg}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers de rendu (factorisation des champs répétés)
// ---------------------------------------------------------------------------

type RegisterFn = ReturnType<typeof useFormContext<PlanWizardData>>['register'];

/**
 * NumberField est fully controlled : lit via `watch(name)` et écrit via
 * `setValue(name, ...)`. Sans ça, RHF garde un shadow state qui ne se
 * re-sync pas au `reset()` du form (ex : un input dividendAmount qui
 * gardait '0.15' après un préset KO sans dividendAmount). Le prop
 * `register` reste accepté pour la rétro-compatibilité de signature
 * mais n'est plus utilisé (le composant utilise useFormContext en
 * interne).
 */
function NumberField({
  name,
  label,
  min,
  max,
  step,
  placeholder,
  errorMsg,
  helpText,
}: {
  // register accepté pour rétro-compat mais ignoré (le composant
  // utilise useFormContext en interne pour le pattern controlled).
  register?: RegisterFn;
  name: Parameters<RegisterFn>[0];
  label: string;
  min?: number;
  max?: number;
  step?: number | string;
  placeholder?: string;
  errorMsg?: string;
  helpText?: string;
  shouldUnregister?: boolean;
}) {
  const { watch, setValue } = useFormContext<PlanWizardData>();
  const value = watch(name) as number | undefined;
  const id = `val-${name.replace(/[\\.\\[\\]]/g, '-')}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        aria-invalid={!!errorMsg}
        className="h-8 font-mono"
        value={value ?? ''}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            setValue(name, undefined as never, { shouldValidate: true, shouldDirty: true });
          } else {
            const n = Number(raw);
            setValue(name, (Number.isFinite(n) ? n : undefined) as never, {
              shouldValidate: true,
              shouldDirty: true,
            });
          }
        }}
      />
      {errorMsg ? (
        <p className="text-destructive text-xs">{errorMsg}</p>
      ) : helpText ? (
        <p className="text-muted-foreground text-xs">{helpText}</p>
      ) : null}
    </div>
  );
}

function TextField({
  register,
  name,
  label,
  placeholder,
  mono,
}: {
  register: RegisterFn;
  name: Parameters<RegisterFn>[0];
  label: string;
  placeholder?: string;
  mono?: boolean;
}) {
  const id = `val-${name.replace(/[\\.\\[\\]]/g, '-')}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="text"
        placeholder={placeholder}
        className={mono ? 'h-8 font-mono' : 'h-8'}
        {...register(name)}
      />
    </div>
  );
}

function SelectField({
  register,
  name,
  label,
  defaultValue,
  options,
  valueAsNumber,
}: {
  register: RegisterFn;
  name: Parameters<RegisterFn>[0];
  label: string;
  defaultValue: string | undefined;
  options: ReadonlyArray<{ value: string; label: string }>;
  valueAsNumber?: boolean;
}) {
  const id = `val-${name.replace(/[\\.\\[\\]]/g, '-')}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <select
        id={id}
        className="border-input bg-background shadow-xs h-8 w-full rounded-md border px-3 text-sm"
        {...register(name, valueAsNumber ? { valueAsNumber: true } : undefined)}
        value={defaultValue}
        onChange={(e) => {
          // L'enregistrement RHF gère l'event automatiquement via register
          // mais on garde value controlled pour re-sync au reset().
          register(name).onChange(e);
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
