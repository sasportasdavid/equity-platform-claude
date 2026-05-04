# MODULE 11 — IFRS 2 VALUATION FINALISATION + VISUALISATION MONTE CARLO

> **Projet :** Equity Platform (Capiwise)
> **Version :** 1.0
> **Date :** Mai 2026
> **Prérequis :** Modules 1 à 10 terminés et validés
> **Audience :** Claude Code (développement) + mainteneur engine Python (David)

---

## 0. CONTEXTE & OBJECTIFS

### 0.1 Mission du module

Finaliser l'intégration du moteur de valorisation IFRS 2 et livrer la **visualisation Monte Carlo** premium qui distingue Capiwise face à Carta/Pulley. Le module couvre :

- **Refonte des dettes techniques #1 + #11** issues de PR #19-24 (normalisation des taux, calcul `incremental_fair_value` différé)
- **Activation du bloc `VisualizationPayload`** côté moteur Python (déjà spécifié en Pydantic mais non rempli aujourd'hui)
- **Composants UI viewer Monte Carlo** : nuage spaghetti, courbe de convergence, distribution des payoffs, panneau d'audit (input_hash + seed + version moteur)
- **Replay cinématique côté client** : animation 5 secondes sur un calcul réel de 2 secondes, pattern "premium reveal" comme Numerix/Riskmetrics
- **Page admin de suivi des `valuation_runs`** historisés (déjà existants depuis PR #19)
- **Cron de recalcul périodique** : snapshots mensuels de fair value pour reporting CAC
- **Compliance V1** : 2 nouvelles règles (`VALUATION_STALE_BLOCKING`, `FMV_DEVIATION_WARNING`)

C'est le module qui **clôture** l'écosystème valorisation. Après Module 11, la chaîne complète tourne : payload V2 → moteur Python → résultat enrichi avec viz → affichage UI premium → historisation → cron de recalcul → compliance auto.

### 0.2 Décisions structurantes (déjà tranchées)

| Décision                                            | Choix retenu                                                                                  | Justification                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Périmètre V1**                                    | Option (b) — viewer + suivi runs + cron + dettes #1/#11. Pas d'IFRS 2 incremental P&L journal | (c) ambitieux trop lourd, dérive scope Module 13                          |
| **Séquence dev**                                    | Option α — engine Python d'abord, frontend après                                              | David maintient l'engine, séquence linéaire propre                        |
| **Replay cinématique**                              | OUI — animation 5 sec sur calcul 2 sec                                                        | Différentiation forte vs Carta. +1j de polish                             |
| **Niveau visualisation**                            | Canvas 2D (pas WebGL)                                                                         | Suffisant pour 3000 paths, plus simple à coder, plus stable cross-browser |
| **Sub-échantillonnage paths**                       | 3000 paths affichés / N total simulés                                                         | Standard métier (Numerix). Au-delà = bouillie illisible                   |
| **Architecture UI**                                 | 6 composants découplés sous `components/valuation/`                                           | Réutilisables Module 13 reporting                                         |
| **Cron recalcul**                                   | Mensuel le 1er du mois à 02:00 UTC                                                            | Cohérent avec rythme reporting CAC                                        |
| **Permission `valuation.run`**                      | OWNER + ADMIN_HR                                                                              | Pas de BENEFICIARY (résultats sensibles)                                  |
| **Stale threshold**                                 | 90 jours avant blocage compliance                                                             | Standard FMV refresh française                                            |
| **Format de stockage `valuation_runs.result_json`** | Snapshot complet de la response Python (sans `paths_sample` qui pèse trop)                    | Audit trail complet, viz régénérable on-demand                            |

### 0.3 Périmètre exact

**Inclus dans ce module :**

**Côté moteur Python** (David, B0) :

- Brancher la logique de génération `VisualizationPayload` quand `config.include_visualization=true`
- Sub-échantillonnage déterministe (seed-based) de N total → 3000 paths
- Génération `convergence_curve` (~50 points en log-scale)
- Génération `payoff_histogram` avec bins adaptatifs
- Tests Pytest sur les 3 sous-payloads
- Documentation OpenAPI mise à jour

**Côté Capiwise** (B1-B6) :

- Client `lib/quant/client.ts` + types Zod synchronisés avec OpenAPI
- Refonte `normalizeRateUnit` en 2 fonctions contextuelles : `normalizeRateOrDividend` + `normalizeSigma`
- Calcul `incremental_fair_value` côté Capiwise (différé : `new_fv - old_fv` au moment de la modification de plan)
- 6 composants UI : `MonteCarloViewer`, `PathsCanvas`, `ConvergenceChart`, `PayoffHistogram`, `ParametersCard`, `AuditPanel`
- Replay cinématique : animation progressive du nuage spaghetti
- Page `/(dashboard)/plans/[id]/valuation` (refonte page existante)
- Page admin `/dashboard/valuation/runs` (liste historique paginée)
- Cron mensuel via pg_cron pour recalculer les `valuation_runs` stales
- 2 compliance rules : `VALUATION_STALE_BLOCKING`, `FMV_DEVIATION_WARNING`
- Sandbox `/dev/monte-carlo-replay` avec presets (PSP, BSPCE, AGA, peer group TSR)
- Permissions : `valuation.run`, `valuation.runs.read.all`, `valuation.runs.read.own`

**Exclus (modules ultérieurs) :**

- IFRS 2 incremental P&L (delta + journal comptable IFRS 2 §B43-B44) → Module 11.5 dédié si nécessaire, ou Module 13
- Reporting cross-plans formaté pour CAC (export PDF avec branding) → Module 13
- Drill-down audit historique plans modifiés N vs N-1 → Module 13
- Recalcul WebSocket realtime (push live pendant calcul) → V2 (V1 = polling Realtime Supabase suffit)
- Multi-currency valuation runs → V2 (V1 = EUR uniquement)
- Calibration FMV automatique via 409A protocol → V2 (V1 = manuelle admin)
- Stress-tests scénarios (volatility shock +50%, rate shock +200bps) → V2
- Comparaison Black-Scholes vs Monte Carlo side-by-side → V2 (Module 11 force MC pour les conditions de marché)

### 0.4 Dépendances

- **Module 1** : tables `audit_events`, RLS patterns
- **Module 2** : RBAC, permissions
- **Module 3a** : `plans`, page `/dashboard/plans/[id]` (8 onglets, on touche l'onglet Valuation)
- **Module 3a B5** (PR #19-24) : `valuation_runs` table + payload V2 + Edge Function `compute-valuation` qui appelle Fly.io
- **Moteur Python Fly.io** : endpoint `/compute/multi-tranche` v2.5.0+ avec `VisualizationPayload` à brancher
- **Module 5** : workflow approval (réutilisé pour `FMV_DEVIATION_WARNING` si > seuil)
- **Module 10 (B7)** : pattern compliance rules `runChecks.ts` (`runValuationComplianceChecks`)
- **Design System V1** : composants `editorial-area-chart`, `editorial-bar-chart` (réutilisés pour ConvergenceChart, PayoffHistogram)

### 0.5 Référence

- `MODULE_03A_PLANS.md` section B5 valuation IFRS 2
- `memory/post_pr19_observations.md` — dette #1 (normalizeRateUnit) et #11 (incremental_fair_value)
- Discussion `claude.ai/chat/e30ba862-9933-4552-bdd5-c3fe8e8b8205` — prototype viewer + architecture cible
- Capture UI Figma fournie par David (S₀=50€, K=50€, Barrière=75€, σ=32%, r=3.2%, T=3.5y, N=100K) — référence visuelle target
- OpenAPI Fly.io : `https://equity-gem-quant-tonnom.fly.dev/openapi.json` schemas `VisualizationPayload`, `PathSampleMetadata`, `PyMonteCarloResponse`

---

## 1. ARCHITECTURE GÉNÉRALE

### 1.1 Vue d'ensemble du flux

```
┌──────────────────────────────────────────────────────────────────────┐
│  FLUX 1 : Calcul valuation depuis page plan                         │
│                                                                       │
│  Admin → /dashboard/plans/[id]/valuation                             │
│  Click "Lancer une valorisation"                                     │
│                                                                       │
│  → Server Action requestValuationRun(planId, includeVisualization)  │
│      │                                                                │
│      ├─ INSERT valuation_runs status='RUNNING'                       │
│      ├─ Trigger Edge Function compute-valuation (existante PR#19)  │
│      │   └─ POST Python /compute/multi-tranche                       │
│      │       avec config.include_visualization = true                │
│      │                                                                │
│      └─ Realtime subscription Supabase pour récupérer le résultat   │
│                                                                       │
│  Frontend pendant attente :                                          │
│  → Affiche replay cinématique mockup (5 sec) avec valeurs preview   │
│  → Quand réel arrive : transition vers vrais paths                  │
│  → Affiche les 6 composants viewer + métriques live                 │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  FLUX 2 : Cron recalcul mensuel                                      │
│                                                                       │
│  pg_cron 1er du mois 02:00 UTC                                       │
│  → SELECT plans WHERE last_valuation_run.updated_at < now-30d        │
│  → Pour chaque plan stale : enqueue new valuation_run                │
│  → Notification admin si > 5% drift vs précédent (FMV_DEVIATION)    │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  FLUX 3 : Compliance check sur transitionAward                       │
│                                                                       │
│  transitionAward('PROPOSED' → 'PENDING_APPROVAL')                    │
│  → runValuationComplianceChecks()                                    │
│      ├─ VALUATION_STALE_BLOCKING : reject si plan.last_run > 90j    │
│      └─ FMV_DEVIATION_WARNING : warn si delta > 20% vs précédente   │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.2 Routes Next.js

```
# Admin / RH
/dashboard/plans/[id]/valuation              # Page principale viewer (refonte existante)
/dashboard/valuation                         # Liste cross-plans des dernières valuations
/dashboard/valuation/runs                    # Historique tous les runs
/dashboard/valuation/runs/[id]               # Détail d'un run figé (replay possible)

# Sandbox dev
/dev/monte-carlo-replay                      # Test viewer avec presets

# Bénéficiaire
# Aucune nouvelle route — les bénéficiaires voient leurs awards via Module 8
# Le viewer est exclusivement admin
```

### 1.3 Composants à créer

```
apps/web/src/components/valuation/
├── MonteCarloViewer.tsx       # Orchestrateur principal
├── PathsCanvas.tsx            # Canvas 2D spaghetti color-coded
├── ConvergenceChart.tsx       # Recharts log-scale
├── PayoffHistogram.tsx        # Recharts bar chart
├── ParametersCard.tsx         # Chips inputs verrouillés (S₀ K Barrière σ r T N)
├── AuditPanel.tsx             # Hash + seed + engine_version + Greeks
├── ValuationRunsTable.tsx     # TanStack Table pour liste historique
└── ReplayController.tsx       # Logique animation cinématique
```

### 1.4 Layout

`apps/web/src/app/(dashboard)/dashboard/plans/[id]/valuation/layout.tsx` :

- Réutilise le PageShell standard
- Breadcrumb : `Plans / [name] / Valorisation`
- Subtitle adaptatif : `Dernier run · {date} · IFRS 2 grant date FV {amount}` ou `Aucune valorisation à ce jour`
- Action top-right : `[Lancer une valorisation]` (disabled si run RUNNING en cours)

---

## 2. SCHÉMA DB

Module 11 réutilise majoritairement la table `valuation_runs` existante (PR #19). Quelques colonnes à ajouter pour l'historisation viz et le tracking compliance.

### 2.1 Migration 00091 — Extension `valuation_runs`

```sql
-- Module 11 : extensions pour visualisation + cron + compliance

-- Le full result JSON est déjà stocké en result_json (PR #19).
-- On ajoute des colonnes dédiées pour requêtes rapides + index.

ALTER TABLE valuation_runs
  ADD COLUMN IF NOT EXISTS engine_version TEXT,           -- '2.5.0' depuis result.engine_version
  ADD COLUMN IF NOT EXISTS input_hash TEXT,               -- '0x9c4f7a...' pour audit
  ADD COLUMN IF NOT EXISTS fair_value_per_unit NUMERIC(15,4),
  ADD COLUMN IF NOT EXISTS std_error NUMERIC(15,6),       -- σ/√N pour intervalle de confiance
  ADD COLUMN IF NOT EXISTS hit_rate_barrier NUMERIC(5,4), -- 0..1, % de paths atteignant la barrière
  ADD COLUMN IF NOT EXISTS num_paths INTEGER,
  ADD COLUMN IF NOT EXISTS num_steps INTEGER,
  ADD COLUMN IF NOT EXISTS includes_visualization BOOLEAN NOT NULL DEFAULT FALSE,
  -- visualization_json stocke uniquement convergence + histogram + metadata (pas paths_sample qui pèse trop)
  -- paths_sample est régénéré on-demand via re-run avec même seed
  ADD COLUMN IF NOT EXISTS visualization_summary_json JSONB,
  ADD COLUMN IF NOT EXISTS run_type TEXT NOT NULL DEFAULT 'MANUAL'
    CHECK (run_type IN ('MANUAL', 'CRON_MONTHLY', 'CRON_STALE_REFRESH', 'TRIGGERED_BY_MODIFICATION')),
  ADD COLUMN IF NOT EXISTS triggered_by UUID REFERENCES auth.users(id);

-- Index pour requêtes "dernière valuation par plan"
CREATE INDEX IF NOT EXISTS idx_valuation_runs_plan_latest
  ON valuation_runs(plan_id, created_at DESC)
  WHERE status = 'SUCCESS';

-- Index pour requêtes "stale plans" (cron)
CREATE INDEX IF NOT EXISTS idx_valuation_runs_org_status_date
  ON valuation_runs(org_id, status, created_at DESC);

-- Vue helper : dernière valuation SUCCESS par plan
CREATE OR REPLACE VIEW latest_valuation_per_plan AS
SELECT DISTINCT ON (plan_id)
  plan_id,
  org_id,
  id AS valuation_run_id,
  fair_value_per_unit,
  engine_version,
  input_hash,
  created_at AS valued_at
FROM valuation_runs
WHERE status = 'SUCCESS'
ORDER BY plan_id, created_at DESC;

GRANT SELECT ON latest_valuation_per_plan TO authenticated;

-- Audit explicite via Server Action (pas de trigger, pattern Module 4-10)
```

### 2.2 Migration 00092 — Permissions Module 11

```sql
INSERT INTO permissions_catalog (code, description) VALUES
  ('valuation.run', 'Lancer une valorisation Monte Carlo manuelle'),
  ('valuation.runs.read.all', 'Voir tous les valuation_runs de l''org'),
  ('valuation.runs.read.own', 'Voir les valuation_runs des plans dont on est manager'),
  ('valuation.replay', 'Rejouer un valuation_run historique avec viz'),
  ('valuation.cron.configure', 'Configurer le cron mensuel (frequency, day)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role, permission_code) VALUES
  ('OWNER', 'valuation.run'),
  ('OWNER', 'valuation.runs.read.all'),
  ('OWNER', 'valuation.replay'),
  ('OWNER', 'valuation.cron.configure'),
  ('ADMIN_HR', 'valuation.run'),
  ('ADMIN_HR', 'valuation.runs.read.all'),
  ('ADMIN_HR', 'valuation.replay'),
  ('AUDITOR', 'valuation.runs.read.all'),
  ('AUDITOR', 'valuation.replay')
ON CONFLICT DO NOTHING;
```

### 2.3 Migration 00093 — Cron mensuel (DEFERRED V1.5 si MCP bloqué)

```sql
-- Cron mensuel le 1er du mois à 02:00 UTC
-- Recalcule toutes les valuations stales (> 30j)
-- Pattern Module 7 cron consumer + Module 10 nightly snapshot

-- ⚠️ Si MCP apply_migration bloqué (cf Module 10 dette #90),
-- cette migration est DEFERRED V1.5 et préservée dans
-- memory/module_11_b6_cron_skipped.md pour application Dashboard Studio

CREATE OR REPLACE FUNCTION refresh_stale_valuations_all_orgs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan RECORD;
  v_run_id UUID;
BEGIN
  -- Pour chaque plan ACTIVE dont la dernière valuation a > 30j
  FOR v_plan IN
    SELECT p.id, p.org_id, p.name, lvp.valued_at
      FROM plans p
      LEFT JOIN latest_valuation_per_plan lvp ON lvp.plan_id = p.id
     WHERE p.status = 'ACTIVE'
       AND (lvp.valued_at IS NULL OR lvp.valued_at < NOW() - INTERVAL '30 days')
  LOOP
    -- Insert un valuation_run en status='QUEUED' avec run_type='CRON_MONTHLY'
    -- Le worker (Edge Function compute-valuation) le picke et l'exécute
    INSERT INTO valuation_runs (plan_id, org_id, status, run_type, payload_sent)
    VALUES (
      v_plan.id, v_plan.org_id, 'QUEUED', 'CRON_MONTHLY',
      jsonb_build_object('triggered_by', 'cron_monthly')
    )
    RETURNING id INTO v_run_id;

    -- Audit
    INSERT INTO audit_events (org_id, event_type, resource_type, resource_id, metadata)
    VALUES (
      v_plan.org_id, 'valuation.cron_enqueued', 'valuation_runs', v_run_id,
      jsonb_build_object('plan_id', v_plan.id, 'plan_name', v_plan.name)
    );
  END LOOP;
END $$;

-- Schedule le 1er du mois à 02:00 UTC
SELECT cron.schedule(
  'valuation-monthly-refresh',
  '0 2 1 * *',
  $$ SELECT refresh_stale_valuations_all_orgs() $$
);
```

### 2.4 Pas de table dédiée pour `incremental_fair_value`

Décision : V1, l'`incremental_fair_value` est calculé **à la volée** dans la Server Action `requestValuationRun` quand un plan est modifié. On ne crée pas de table dédiée `plan_modifications_journal`. Si plus tard Module 11.5 ou Module 13 décide de comptabiliser le journal P&L IFRS 2 (§B43-B44), une table dédiée sera ajoutée à ce moment-là.

Le calcul V1 :

```typescript
// Quand un plan est modifié, requestValuationRun calcule :
const newRun = await callPythonEngine(updatedPlanPayload);
const oldRun = await getLatestValuationRun(planId);
const incrementalFairValue = newRun.fair_value_per_unit - oldRun.fair_value_per_unit;
const incrementalCharge = incrementalFairValue * plan.units_outstanding;

// Stocké dans valuation_runs.metadata pour audit, pas dans une table P&L dédiée
```

---

## 3. SERVER ACTIONS, TYPES & SCHÉMAS ZOD

### 3.1 Types Zod synchronisés OpenAPI

`packages/shared/src/types/valuation.ts` :

```typescript
import { z } from 'zod';

// =============================================================================
// Schemas synchronisés avec OpenAPI Fly.io
// (cf https://equity-gem-quant-tonnom.fly.dev/openapi.json)
// =============================================================================

// PathSampleMetadata
export const pathSampleMetadataSchema = z.object({
  sim_id: z.number().int(),
  final_value: z.number(),
  max_value: z.number(),
  min_value: z.number(),
  final_itm: z.boolean(),
  achieved_vesting: z.boolean(),
  payoff_discounted: z.number(),
});
export type PathSampleMetadata = z.infer<typeof pathSampleMetadataSchema>;

// VisualizationPayload
export const visualizationPayloadSchema = z.object({
  paths_sample: z.array(z.array(z.number())), // number[][]
  paths_metadata: z.array(pathSampleMetadataSchema),
  convergence_curve: z.array(z.record(z.string(), z.number())), // [{n: number, fv: number}]
  payoff_histogram: z.record(z.string(), z.unknown()), // {bins: number[], counts: number[]}
  sample_size: z.number().int(),
  total_paths: z.number().int(),
  num_steps: z.number().int(),
  sim_T: z.number(),
});
export type VisualizationPayload = z.infer<typeof visualizationPayloadSchema>;

// PyMonteCarloResponse (réponse complète du moteur)
export const pyMonteCarloResponseSchema = z.object({
  fair_value: z.number(),
  fair_value_per_unit: z.number(),
  fair_value_market_only: z.number().optional(),
  std_error: z.number().optional(),
  vesting_probability: z.number().optional(),
  vesting_probability_real: z.number().optional(),
  avg_market_multiplier: z.number().optional(),
  greeks: z.record(z.string(), z.number()).optional(),
  engine_version: z.string(),
  input_hash: z.string(),
  execution_time_ms: z.number(),
  audit_trail: z.unknown().optional(),
  condition_breakdown: z.unknown().optional(),
  tranche_details: z.array(z.unknown()).optional(),
  debug_paths: z.array(z.unknown()).optional(),
  visualization: visualizationPayloadSchema.nullable().optional(),
});
export type PyMonteCarloResponse = z.infer<typeof pyMonteCarloResponseSchema>;

// =============================================================================
// Inputs Server Actions (côté Capiwise)
// =============================================================================

export const requestValuationRunSchema = z.object({
  planId: z.string().uuid(),
  includeVisualization: z.boolean().default(true),
  numPaths: z.number().int().min(1000).max(100000).default(100000),
  numTimeSteps: z.number().int().min(12).max(365).default(36),
  seed: z.number().int().optional(), // si non fourni, le moteur en génère un
});
export type RequestValuationRunInput = z.input<typeof requestValuationRunSchema>;

export const replayValuationRunSchema = z.object({
  runId: z.string().uuid(),
});
export type ReplayValuationRunInput = z.input<typeof replayValuationRunSchema>;
```

### 3.2 Client Quant `apps/web/src/lib/quant/client.ts`

```typescript
import { pyMonteCarloResponseSchema, type PyMonteCarloResponse } from '@equity/shared';

const QUANT_ENGINE_URL = process.env.QUANT_ENGINE_URL!;
const QUANT_ENGINE_API_KEY = process.env.QUANT_ENGINE_API_KEY;

export async function callMultiTrancheCompute(payload: unknown): Promise<PyMonteCarloResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (QUANT_ENGINE_API_KEY) {
    headers['Authorization'] = `Bearer ${QUANT_ENGINE_API_KEY}`;
  }

  const response = await fetch(`${QUANT_ENGINE_URL}/compute/multi-tranche`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Engine quant failed (${response.status}): ${errorBody}`);
  }

  const json = await response.json();
  const parsed = pyMonteCarloResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Engine response shape mismatch: ${parsed.error.message}`);
  }
  return parsed.data;
}
```

### 3.3 Refonte normalizers (dette #1)

`supabase/functions/_shared/buildPythonPayload.ts` (existant, à refactorer) :

```typescript
// AVANT (dette #1 - une seule fonction pour tout) :
// function normalizeRateUnit(value: number): number {
//   return value > 1 ? value / 100 : value;
//   // PROBLÈME : un dividend_yield=1 (= 1%) est traité comme 100%
//   // PROBLÈME : une volatility=18 est traitée comme fraction 18 (= 1800%)
// }

// APRÈS (split contextuel) :

/**
 * Normalise un taux d'intérêt ou un dividend yield.
 * Convention de saisie utilisateur : pourcentage entier ou décimal sans unité.
 * - 3.2 → 0.032 (3.2%)
 * - 0.032 → 0.032 (déjà en fraction)
 * - 100 → 1.0 (100%, edge case rate très élevé)
 * Bornes : [0, 1]
 */
export function normalizeRateOrDividend(value: number): number {
  if (value < 0) throw new Error('Rate cannot be negative');
  // Si > 1, on suppose pourcentage entier (3.2 = 3.2%) → divise par 100
  // Si <= 1, on suppose déjà en fraction (0.032 = 3.2%)
  return value > 1 ? value / 100 : value;
}

/**
 * Normalise une volatilité.
 * Convention métier : la volatilité est TOUJOURS saisie en fraction par l'UI
 * (label "Fraction (0,18 = 18%)"). Donc pas de conversion %.
 * Bornes : [0.01, 5.0] (1% à 500% — au-delà = erreur de saisie)
 */
export function normalizeSigma(value: number): number {
  if (value < 0.01) {
    throw new Error('Volatility too low (min 1% = 0.01)');
  }
  if (value > 5.0) {
    throw new Error('Volatility unrealistic (max 500% = 5.0)');
  }
  return value;
}

// Migration progressive : remplacer chaque appel à normalizeRateUnit
// par l'appel contextuel approprié. Tests d'isolation par contexte.
```

### 3.4 Server Actions

`apps/web/src/server/actions/valuation.ts` :

```typescript
'use server';

import { requestValuationRunSchema, replayValuationRunSchema } from '@equity/shared';
import { callMultiTrancheCompute } from '@/lib/quant/client';
import { runValuationComplianceChecks } from '@/lib/compliance/runChecks';

// =============================================================================
// requestValuationRun — Lancer une nouvelle valorisation
// =============================================================================

export async function requestValuationRun(input: unknown): Promise<Result<{ runId: string }>> {
  const user = await requirePermission('valuation.run');
  const parsed = requestValuationRunSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  // 1. Charger le plan + valider
  const plan = await loadPlanForValuation(parsed.data.planId, user.activeOrgId);
  if (!plan) return { ok: false, error: 'PLAN_NOT_FOUND' };

  // 2. Build payload V2 via buildPythonPayload (refactor utilisant les normalizers contextuels)
  const payload = buildPythonPayload(plan, {
    numPaths: parsed.data.numPaths,
    numTimeSteps: parsed.data.numTimeSteps,
    seed: parsed.data.seed,
    includeVisualization: parsed.data.includeVisualization,
  });

  // 3. INSERT valuation_run en status='RUNNING'
  const supabase = await createSupabaseServerClient();
  const { data: run, error: insertErr } = await supabase
    .from('valuation_runs')
    .insert({
      plan_id: plan.id,
      org_id: user.activeOrgId,
      status: 'RUNNING',
      run_type: 'MANUAL',
      triggered_by: user.id,
      payload_sent: payload,
      includes_visualization: parsed.data.includeVisualization,
    })
    .select('id')
    .single();

  if (insertErr) return { ok: false, error: insertErr.message };

  // 4. Appel synchrone moteur Python (V1 — pas de queue async, calcul ~2-5s)
  try {
    const response = await callMultiTrancheCompute(payload);

    // 5. Calcul incremental_fair_value si plan déjà valorisé
    const previousRun = await getLatestValuationRun(plan.id);
    const incrementalFV = previousRun
      ? response.fair_value_per_unit - previousRun.fair_value_per_unit
      : null;

    // 6. UPDATE valuation_run avec résultats
    // ⚠️ paths_sample stripped pour ne pas exploser la taille DB (max ~5MB par row)
    const visualizationSummary = response.visualization
      ? {
          paths_metadata: response.visualization.paths_metadata,
          convergence_curve: response.visualization.convergence_curve,
          payoff_histogram: response.visualization.payoff_histogram,
          sample_size: response.visualization.sample_size,
          total_paths: response.visualization.total_paths,
          num_steps: response.visualization.num_steps,
          sim_T: response.visualization.sim_T,
          // paths_sample omitted intentionally — re-fetch on demand via replay
        }
      : null;

    await supabase
      .from('valuation_runs')
      .update({
        status: 'SUCCESS',
        result_json: response,
        engine_version: response.engine_version,
        input_hash: response.input_hash,
        fair_value_per_unit: response.fair_value_per_unit,
        std_error: response.std_error,
        hit_rate_barrier: extractHitRate(response),
        num_paths: parsed.data.numPaths,
        num_steps: parsed.data.numTimeSteps,
        visualization_summary_json: visualizationSummary,
        metadata: { incremental_fair_value: incrementalFV },
      })
      .eq('id', run.id);

    await logAuditEvent({
      orgId: user.activeOrgId,
      eventType: 'valuation.run_succeeded',
      resourceType: 'valuation_runs',
      resourceId: run.id,
      metadata: { fair_value: response.fair_value_per_unit, plan_name: plan.name },
    });

    return { ok: true, data: { runId: run.id } };
  } catch (err) {
    // Engine error → status='FAILED'
    await supabase
      .from('valuation_runs')
      .update({ status: 'FAILED', error_message: String(err) })
      .eq('id', run.id);

    return { ok: false, error: `Engine quant failure: ${err}` };
  }
}

// =============================================================================
// replayValuationRun — Relancer un run historique avec viz
// =============================================================================

export async function replayValuationRun(input: unknown): Promise<Result<{ runId: string }>> {
  const user = await requirePermission('valuation.replay');
  const parsed = replayValuationRunSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  // Charger le payload original + relancer avec same seed → même résultat (déterministe)
  const supabase = await createSupabaseServerClient();
  const { data: original } = await supabase
    .from('valuation_runs')
    .select('payload_sent, plan_id')
    .eq('id', parsed.data.runId)
    .eq('org_id', user.activeOrgId)
    .single();

  if (!original) return { ok: false, error: 'RUN_NOT_FOUND' };

  // Force include_visualization=true au cas où l'original ne l'avait pas
  const payloadWithViz = {
    ...original.payload_sent,
    config: { ...original.payload_sent.config, include_visualization: true },
  };

  // Appel direct moteur (pas d'INSERT nouveau run, on enrichit l'ancien si possible)
  const response = await callMultiTrancheCompute(payloadWithViz);

  // Update visualization_summary_json + retourne l'ID original
  await supabase
    .from('valuation_runs')
    .update({
      visualization_summary_json: response.visualization,
      replayed_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.runId);

  return { ok: true, data: { runId: parsed.data.runId } };
}

// =============================================================================
// listValuationRuns — Liste paginée des runs
// =============================================================================

export async function listValuationRuns(
  filters: { planId?: string; status?: string; limit?: number; offset?: number } = {},
): Promise<Result<{ runs: ValuationRun[]; total: number }>> {
  const user = await requirePermission('valuation.runs.read.all');
  // Query paginée + filtres + count exact
  // ...
}
```

### 3.5 Wiring Edge Function existant `compute-valuation`

⚠️ **ATTENTION** : la Edge Function existante (PR #19) appelle déjà `/compute/multi-tranche`. Module 11 **ne la remplace pas** — il l'enrichit pour qu'elle :

1. Passe `include_visualization: true` dans `config` quand demandé
2. Stocke le `VisualizationPayload` dans `valuation_runs.visualization_summary_json`
3. Réutilise le pattern Realtime existant (Module 3a B5) pour push live

À vérifier en B0 recon : la EF actuelle accepte-t-elle déjà ce flag ou faut-il une modif ? Réponse via grep :

```bash
grep -rn "include_visualization\|VisualizationPayload" supabase/functions/
```

---

## 4. UI / COMPOSANTS

### 4.1 Vue d'ensemble

Le viewer s'organise autour de 7 composants découplés. Chaque composant reçoit ses props typées depuis `@equity/shared` et n'a aucune logique d'appel API (les données arrivent via Server Action côté page).

```
MonteCarloViewer (orchestrateur)
├── ParametersCard         (top — chips inputs)
├── PathsCanvas            (large — nuage spaghetti, animation cinématique)
├── KPICards × 4           (juste valeur, erreur standard, hit rate, paths simulées)
├── ConvergenceChart       (bottom-left)
├── PayoffHistogram        (bottom-right)
└── AuditPanel             (collapsible footer)
```

### 4.2 `MonteCarloViewer.tsx`

Composant orchestrateur. Reçoit la response complète d'un `valuation_run` SUCCESS et organise l'affichage. Gère l'état "replay cinématique" (B4).

**Props :**

```typescript
type MonteCarloViewerProps = {
  run: ValuationRunWithViz; // Le valuation_run depuis DB + viz
  plan: PlanWithConditions; // Le plan source
  onRelaunch?: () => void; // Bouton "Relancer la simulation"
  enableReplay?: boolean; // Active animation cinématique au mount
};
```

**Layout :**

- Top : titre éditorial `Valorisation Monte Carlo — {plan.name}`
- Sous-titre : `{plan.type} avec {conditions} · IFRS 2 grant date fair value`
- Grid 12-col responsive :
  - Cols 1-12 : ParametersCard (chips)
  - Cols 1-12 : PathsCanvas (h-96)
  - Cols 1-3 / 4-6 / 7-9 / 10-12 : KPICards
  - Cols 1-6 : ConvergenceChart
  - Cols 7-12 : PayoffHistogram
  - Cols 1-12 : AuditPanel (collapsed default)

### 4.3 `ParametersCard.tsx`

Chips affichant les paramètres d'entrée verrouillés. Pas d'inputs editable — c'est de la lecture seule, on relance avec un nouveau run pour changer.

```typescript
type ParametersCardProps = {
  S0: number; // Spot price
  K: number; // Strike
  barrier?: number; // Barrière si présente
  sigma: number; // Volatilité (en fraction)
  r: number; // Rate (en fraction)
  T: number; // Horizon (années)
  numPaths: number; // N
  currency?: string; // 'EUR' default
};
```

**Rendu :**

```
[ S₀ = 50,00 € ] [ K = 50,00 € ] [ Barrière = 75,00 € ]
[ σ = 32 % ] [ r = 3,2 % ] [ T = 3,5 ans ]
[ N = 100 000 paths ]
```

Format : chips `bg-paper-200 border border-paper-300 rounded-full px-3 py-1 mono text-xs`.

### 4.4 `PathsCanvas.tsx`

Le composant central et le plus complexe. Canvas 2D qui dessine 3000 paths color-coded.

**Props :**

```typescript
type PathsCanvasProps = {
  paths: number[][]; // [[S0, S1, ..., S_{numSteps}], ...]
  metadata: PathSampleMetadata[]; // Pour color-coding
  S0: number;
  barrier?: number;
  numSteps: number;
  simT: number;
  enableReplay?: boolean; // Animation progressive si true
};
```

**Algorithme de rendu :**

```typescript
// 1. Mapping coordonnées
const xMin = 0,
  xMax = simT;
const yMin = Math.min(...paths.flat()) * 0.9;
const yMax = Math.max(...paths.flat()) * 1.1;
const xToCanvas = (t: number) => (t / xMax) * canvas.width;
const yToCanvas = (s: number) => canvas.height - ((s - yMin) / (yMax - yMin)) * canvas.height;

// 2. Color encoding (selon metadata)
const colorForPath = (meta: PathSampleMetadata) => {
  if (meta.achieved_vesting && meta.final_itm) return 'rgba(20, 184, 166, 0.15)'; // teal
  if (meta.achieved_vesting && !meta.final_itm) return 'rgba(234, 88, 12, 0.20)'; // orange
  return 'rgba(120, 113, 108, 0.10)'; // gris
};

// 3. Draw paths (alpha additif pour effet "nuage")
ctx.lineWidth = 0.5;
paths.forEach((path, i) => {
  ctx.strokeStyle = colorForPath(metadata[i]);
  ctx.beginPath();
  path.forEach((S, t) => {
    const dt = (t / numSteps) * simT;
    const x = xToCanvas(dt);
    const y = yToCanvas(S);
    if (t === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
});

// 4. Overlay barrier line (red dashed)
if (barrier) {
  ctx.strokeStyle = 'rgba(220, 38, 38, 0.6)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(0, yToCanvas(barrier));
  ctx.lineTo(canvas.width, yToCanvas(barrier));
  ctx.stroke();
  ctx.setLineDash([]);
}

// 5. Labels S0 / barrier sur côté gauche/droit + t=0 / T en bas
```

**Replay cinématique (si `enableReplay=true`) :**

```typescript
const REPLAY_DURATION_MS = 5000;
const FRAMES = 60;

useEffect(() => {
  if (!enableReplay) return;

  let frameId: number;
  const startTime = performance.now();

  const animate = (now: number) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / REPLAY_DURATION_MS, 1);

    // Ease-out cubic pour un effet "premium reveal"
    const easedProgress = 1 - Math.pow(1 - progress, 3);

    // Sub-échantillonner progressivement les paths
    const visiblePathCount = Math.floor(paths.length * easedProgress);
    const visiblePaths = paths.slice(0, visiblePathCount);
    const visibleMetadata = metadata.slice(0, visiblePathCount);

    drawCanvas(visiblePaths, visibleMetadata);

    if (progress < 1) {
      frameId = requestAnimationFrame(animate);
    }
  };

  frameId = requestAnimationFrame(animate);
  return () => cancelAnimationFrame(frameId);
}, [paths, metadata, enableReplay]);
```

**Légende footer :**

```
─ Barrière touchée + ITM final    (teal)
─ Touchée mais OTM                (orange)
─ Non touchée (forfeited)         (gris)
- - Barrière 75 €                  (rouge dashed)
```

### 4.5 `ConvergenceChart.tsx`

Recharts LineChart en échelle log X. Affiche la convergence de FV vs N.

**Props :**

```typescript
type ConvergenceChartProps = {
  curve: Array<{ n: number; fv: number }>; // ~50 points log-scale
  finalFV: number; // Valeur finale pour ligne de référence
};
```

**Rendu :**

- X-axis : logarithmic, label "N paths simulés"
- Y-axis : linear, label "Fair Value (€)"
- Line : courbe bleue
- ReferenceLine horizontale : `finalFV` en pointillés gris (target asymptotique)
- Animation : draw progressive de gauche à droite au mount

### 4.6 `PayoffHistogram.tsx`

Recharts BarChart vertical. Distribution des payoffs actualisés.

**Props :**

```typescript
type PayoffHistogramProps = {
  histogram: { bins: number[]; counts: number[] };
};
```

**Rendu :**

- X-axis : valeurs payoff (0 à max)
- Y-axis : count (ou %)
- Bars : couleur teal (cohérent légende)
- Annotations : `0` (gris foncé pour la barre "non payé") + valeur max à droite

### 4.7 `AuditPanel.tsx`

Footer collapsible avec hash + seed + version moteur + Greeks.

**Props :**

```typescript
type AuditPanelProps = {
  inputHash: string; // '0x9c4f7a...'
  seed?: number;
  engineVersion: string; // '2.5.0'
  executionTimeMs: number;
  greeks?: Record<string, number>;
};
```

**Rendu :**

```
┌─────────────────────────────────────────────────────────────┐
│  Audit hash · 0x9c4f7a · seed 42 · engine 2.5.0 · 4150ms   │
│                                                             │
│  ▼ Greeks (cliquer pour développer)                         │
│     Delta : 0.4231                                          │
│     Gamma : 0.0123                                          │
│     Vega  : 19.5                                            │
│     Theta : -2.1                                            │
│     Rho   : 8.7                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.8 `KPICards`

4 cards top-aligned avec les métriques principales.

```typescript
<KPICard label="Juste valeur" value="13,50 €" subtitle="par option · IFRS 2 grant FV" highlight />
<KPICard label="Erreur standard" value="± 0,083 €" subtitle="σ/√N" />
<KPICard label="Hit rate barrière" value="44,0 %" subtitle="paths ≥ 75 €" />
<KPICard label="Paths simulées" value="100 000" subtitle="/ 100 000" />
```

Format mono pour les nombres, label small uppercase tracking-wide. Highlight = `bg-brass-50 border-brass-300`.

### 4.9 Page `/(dashboard)/dashboard/plans/[id]/valuation/page.tsx`

Server Component qui :

1. Charge le plan + sa dernière valuation_run SUCCESS
2. Si `valuation_run` existe : affiche `MonteCarloViewer`
3. Si pas de run : affiche `EmptyState` avec CTA "Lancer la première valorisation"
4. Header : Action `[Lancer une valorisation]` (relance, génère un nouveau run avec viz)

### 4.10 Page `/(dashboard)/dashboard/valuation/runs/page.tsx`

Liste cross-plans des dernières valuations.

- Filtres : par plan, par status, par run_type (MANUAL / CRON_MONTHLY / etc.)
- Colonnes : Plan / Date / FV/unit / Engine version / Status / Actions
- Action "Voir" → `/dashboard/valuation/runs/[id]` (replay du run)

### 4.11 Sandbox `/dev/monte-carlo-replay/page.tsx`

4 presets pour test rapide sans hit le moteur :

```typescript
const PRESETS = [
  { name: 'PSP barrier', payload: { S0: 50, K: 50, barrier: 75, sigma: 0.32, r: 0.032, T: 3.5 } },
  { name: 'BSPCE simple', payload: { S0: 100, K: 100, sigma: 0.4, r: 0.025, T: 4 } },
  {
    name: 'AGA TSR',
    payload: {
      /* TSR_REL_INDEX condition */
    },
  },
  {
    name: 'Peer group',
    payload: {
      /* WeightedPeerGroup */
    },
  },
];
```

Bouton "Calculer" → appelle `requestValuationRun` → affiche viewer avec replay cinématique.

### 4.12 Sidebar nav

Ajout dans `apps/web/src/components/shared/dashboard-sidebar.tsx` :

- Section "ANALYSE" : nouvel item "Valorisations" (Lucide icon `LineChart`) → `/dashboard/valuation`

---

## 5. COMPLIANCE V1

À placer dans `apps/web/src/lib/compliance/rules/valuationRules.ts`.

### 5.1 Rules

```typescript
export const VALUATION_COMPLIANCE_RULES: ComplianceRule[] = [
  {
    code: 'VALUATION_STALE_BLOCKING',
    description: 'Bloquer transitions award si dernière valuation > 90j',
    appliesTo: ['AWARD_PROPOSED', 'AWARD_PENDING_APPROVAL', 'AWARD_GRANT'],
    enforcement: 'hard',
    check: async (data, ctx) => {
      const plan = await ctx.loadPlan(data.planId);
      const latestRun = await ctx.getLatestValuationRun(plan.id);

      if (!latestRun) {
        return {
          severity: 'ERROR',
          code: 'VALUATION_NEVER_RUN',
          message: `Aucune valorisation IFRS 2 trouvée pour le plan "${plan.name}". Lancer une valorisation avant tout octroi.`,
        };
      }

      const daysSinceRun = Math.floor(
        (Date.now() - new Date(latestRun.created_at).getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysSinceRun > 90) {
        return {
          severity: 'ERROR',
          code: 'VALUATION_STALE',
          message: `Dernière valorisation IFRS 2 obsolète (${daysSinceRun}j > 90j). Relancer une valorisation avant d'octroyer.`,
        };
      }

      return null;
    },
  },

  {
    code: 'FMV_DEVIATION_WARNING',
    description: 'Warner si la nouvelle FV dévie de > 20% vs précédente',
    appliesTo: ['VALUATION_RUN_COMPLETED'],
    enforcement: 'soft',
    check: async (data, ctx) => {
      const previousRun = await ctx.getPreviousValuationRun(data.planId, data.runId);
      if (!previousRun) return null; // Première valuation, pas de comparaison

      const oldFV = previousRun.fair_value_per_unit;
      const newFV = data.fair_value_per_unit;

      if (oldFV === 0) return null; // Évite division par zéro

      const deviation = Math.abs((newFV - oldFV) / oldFV);

      if (deviation > 0.2) {
        return {
          severity: 'WARNING',
          code: 'FMV_DEVIATION_HIGH',
          message: `Nouvelle FV ${newFV.toFixed(4)}€ dévie de ${(deviation * 100).toFixed(1)}% vs précédente ${oldFV.toFixed(4)}€. Vérifier les paramètres marché.`,
          metadata: { previous_fv: oldFV, new_fv: newFV, deviation_pct: deviation },
        };
      }

      return null;
    },
  },
];
```

### 5.2 Wiring

- `runValuationComplianceChecks(input, ctx)` exposé dans `runChecks.ts`
- Hooké dans :
  - `transitionAward` côté Module 3b (rule `VALUATION_STALE_BLOCKING`)
  - `requestValuationRun` après SUCCESS (rule `FMV_DEVIATION_WARNING`, soft → notification admin via Module 7)

---

## 6. TESTS

### 6.1 Tests SQL (sandbox + cloud)

Cible : 15+ tests SQL.

| ID  | Description                                                          |
| --- | -------------------------------------------------------------------- |
| A   | Recon DB : `valuation_runs` colonnes étendues présentes              |
| B   | INSERT valuation_run avec includes_visualization=TRUE                |
| C   | SELECT latest_valuation_per_plan view : retourne dernier run SUCCESS |
| D   | latest_valuation_per_plan : ne retourne pas runs FAILED ou QUEUED    |
| E   | Index idx_valuation_runs_plan_latest utilisé (EXPLAIN)               |
| F   | Permissions seedées : 5 perms `valuation.*`                          |
| G   | Role mapping OWNER + ADMIN_HR + AUDITOR                              |
| H   | Cron job `valuation-monthly-refresh` enregistré (si appliqué)        |
| I   | refresh_stale_valuations_all_orgs() : détecte plans > 30j            |
| J   | INSERT valuation_run par cron : run_type='CRON_MONTHLY'              |
| K   | RLS valuation_runs : ADMIN voit toute l'org                          |
| L   | RLS valuation_runs : BENEFICIARY ne voit pas (pas de perm read)      |
| M   | UPDATE valuation_run.status : trigger updated_at                     |
| N   | Visualization summary stocké en JSONB sans paths_sample              |
| O   | Test taille moyenne row valuation_run < 100KB (sans paths_sample)    |

### 6.2 Tests Vitest

Cible : 35+ tests.

**Normalizers (refactor dette #1)** : 12 tests

- `normalizeRateOrDividend(0.032)` → 0.032
- `normalizeRateOrDividend(3.2)` → 0.032
- `normalizeRateOrDividend(-0.01)` → throws
- `normalizeRateOrDividend(0)` → 0
- `normalizeSigma(0.18)` → 0.18
- `normalizeSigma(0.005)` → throws (too low)
- `normalizeSigma(6.0)` → throws (unrealistic)
- `normalizeSigma(0.50)` → 0.50

**Server Actions (`requestValuationRun`)** : 10 tests

- Happy path : engine retourne SUCCESS, valuation_run créé
- Permission denied : pas de perm `valuation.run`
- Plan not found
- Engine timeout : status='FAILED' avec error_message
- Engine 500 : same
- Engine response shape mismatch : Zod parse fail
- includes_visualization=true : payload.config.include_visualization=true envoyé
- includes_visualization=false : pas de viz dans la response, stockage minimal
- Incremental fair value : delta calculé si previous_run existe
- No previous run : incremental_fair_value=null

**Compliance rules** : 8 tests

- VALUATION_STALE_BLOCKING : reject à 91j
- VALUATION_STALE_BLOCKING : pass à 89j
- VALUATION_NEVER_RUN : reject si null latestRun
- FMV_DEVIATION_WARNING : warn à 21% deviation
- FMV_DEVIATION_WARNING : pass à 19% deviation
- FMV_DEVIATION_WARNING : null si oldFV = 0
- FMV_DEVIATION_WARNING : null si pas de previous run
- Wiring runChecks : VALUATION_STALE_BLOCKING active sur AWARD_GRANT

**Components (snapshot/render)** : 5 tests

- ParametersCard renders chips with French formatting
- KPICards renders 4 cards with mono numerics
- AuditPanel collapsible toggles greeks
- ConvergenceChart receives empty array → empty state
- PayoffHistogram with 0 bins → empty state

### 6.3 Tests Pytest (engine Python)

À écrire **côté repo Python du moteur Fly.io**, pas côté Capiwise. Je détaille pour le mainteneur (David) :

**Cibles (10+ tests)** :

- `include_visualization=True` → `response.visualization is not None`
- `include_visualization=False` → `response.visualization is None`
- `paths_sample` shape : `len == sample_size`, chaque sous-array `len == num_steps + 1`
- `paths_metadata` : 1 entry par path
- `paths_metadata[i].sim_id` cohérent
- `paths_metadata[i].max_value >= paths_metadata[i].final_value` (ou >= S0 selon trajectoire)
- `convergence_curve` non-vide si include_viz=true, ~50 points
- `convergence_curve[-1].fv` ≈ `response.fair_value_per_unit` (à 2 décimales)
- `payoff_histogram.bins` strictement croissants
- `sum(payoff_histogram.counts) == sample_size`
- Determinisme avec same seed : 2 runs → input_hash identique → response identique

### 6.4 Tests E2E manuels

Cible : 6 scénarios.

1. ☐ Lancer valuation manuelle sur plan PSP avec barrière → viewer affiche tous composants en < 10s
2. ☐ Replay cinématique : animation 5 sec visible au mount, paths apparaissent progressivement
3. ☐ Cliquer "Relancer la simulation" : nouveau run créé, FV cohérente
4. ☐ Liste runs admin : pagination, filtres fonctionnels
5. ☐ VALUATION_STALE_BLOCKING : tenter award sur plan dont dernière valuation > 90j → reject
6. ☐ FMV_DEVIATION_WARNING : forcer un run avec params très différents → warning sans bloquer

---

## 7. INSTRUCTIONS POUR CLAUDE CODE

### Phase 1 — Bootstrap

1. Lire `memory/module_10_complete.md` (closure du module précédent)
2. Lire `memory/post_pr19_observations.md` (dettes #1 + #11 documentées)
3. Branche `feat/module-11-valuation-viz` from master à jour (post Module 10 merge)
4. Pre-checks :
   - Tests workspace 698+/698+ verts (post Module 10)
   - Drift cloud documenté
   - Module 10 mergé sur master
   - Capture UI Figma sous les yeux comme référence visuelle

### Phase 2 — B0 Engine Python (David, hors Claude Code)

⚠️ **Cette phase est FAITE PAR DAVID en dehors de Claude Code.**

Côté repo Python du moteur (équivalent `equity-gem-quant-tonnom`) :

1. Localiser le code qui génère la `PyMonteCarloResponse`
2. Vérifier si `VisualizationPayload` est rempli quelque part — probablement non
3. Implémenter la logique de remplissage :
   ```python
   if config.get('include_visualization', False):
       visualization = VisualizationPayload(
           paths_sample=subsample_paths(all_paths, target_size=3000),
           paths_metadata=compute_metadata_per_path(all_paths, conditions, payoffs),
           convergence_curve=compute_convergence_curve(running_fv_estimates, num_points=50),
           payoff_histogram=compute_histogram(payoffs, num_bins=40),
           sample_size=3000,
           total_paths=num_paths,
           num_steps=num_time_steps,
           sim_T=T_max,
       )
   else:
       visualization = None
   ```
4. Écrire 10+ tests Pytest (cf §6.3)
5. Bump engine_version 2.5.0 → 2.6.0
6. Deploy sur Fly.io
7. Re-curl test : `jq '.visualization | keys'` doit retourner `["convergence_curve", ...]` au lieu de null
8. Commit + push côté repo Python avec message `feat(viz): branch VisualizationPayload generation`

**Estimation B0 : 1.5-2j David.**

### Phase 3 — B1 : Capiwise client + types V2 (Claude Code)

Pré-condition : B0 terminé et déployé. Vérification rapide :

```bash
curl -s -X POST https://equity-gem-quant-tonnom.fly.dev/compute/multi-tranche \
  -H "Content-Type: application/json" \
  -d '{
    "config": { "num_paths": 1000, "include_visualization": true, "seed": 42 },
    "market": { "S0": 50, "r": 0.032, "q": 0, "sigma": 0.32 },
    "instrument": { "strike": 50, "T": 3.5, "type": "option", "vesting_schedule": [{"time": 3.5, "portion": 1.0}] },
    "conditions": []
  }' | jq '.visualization | keys'
# Attendu : ["convergence_curve", "num_steps", "paths_metadata", "paths_sample", "payoff_histogram", "sample_size", "sim_T", "total_paths"]
```

Si KO → STOP, escalader à David.
Si OK → procéder.

1. Créer `apps/web/src/lib/quant/client.ts` (cf §3.2)
2. Créer `packages/shared/src/types/valuation.ts` (cf §3.1)
3. Tests Vitest 5+ sur le client (mock fetch)
4. Commit : `feat(module-11): quant client + valuation types`

### Phase 4 — B2 : Refonte dettes #1 + #11

1. Refonte `normalizeRateUnit` → `normalizeRateOrDividend` + `normalizeSigma` (cf §3.3)
2. Migration progressive : grep + remplacement de tous les call sites
3. Tests d'isolation 12+ tests (cf §6.2 normalizers)
4. Calcul `incremental_fair_value` côté Capiwise dans `requestValuationRun`
5. Stockage dans `valuation_runs.metadata.incremental_fair_value`
6. Commit : `refactor(module-11): split normalizers + incremental fair value calc`

### Phase 5 — B3 : Composants viewer Monte Carlo

1. `ParametersCard.tsx` (le plus simple, ~80 lignes)
2. `AuditPanel.tsx` (~120 lignes)
3. `ConvergenceChart.tsx` (Recharts wrapping ~150 lignes)
4. `PayoffHistogram.tsx` (Recharts ~150 lignes)
5. `PathsCanvas.tsx` (le plus complexe, Canvas 2D ~300 lignes — cf §4.4)
6. `MonteCarloViewer.tsx` (orchestrateur ~200 lignes)
7. Tests Vitest snapshot 5+ (cf §6.2 components)
8. Sandbox `/dev/monte-carlo-replay/page.tsx` avec 4 presets
9. Commit : `feat(module-11): monte carlo viewer components`

### Phase 6 — B4 : Replay cinématique

1. `ReplayController.tsx` (logique animation ~80 lignes)
2. Intégration dans `MonteCarloViewer.tsx` avec prop `enableReplay`
3. Test manuel : animation visible 5 sec au mount
4. Commit : `feat(module-11): cinematic replay animation`

### Phase 7 — B5 : Pages

1. Refonte `/(dashboard)/dashboard/plans/[id]/valuation/page.tsx` avec MonteCarloViewer
2. Création `/(dashboard)/dashboard/valuation/page.tsx` (vue cross-plans)
3. Création `/(dashboard)/dashboard/valuation/runs/page.tsx` (liste paginée)
4. Création `/(dashboard)/dashboard/valuation/runs/[id]/page.tsx` (replay)
5. `ValuationRunsTable.tsx` (TanStack Table)
6. Sidebar nav update : "Valorisations" sous ANALYSE
7. Commit : `feat(module-11): valuation pages + runs table`

### Phase 8 — B6 : Cron + compliance + closure

1. Migration 00091 (extension valuation_runs)
2. Migration 00092 (permissions seed)
3. Migration 00093 (cron mensuel) — **DEFERRED V1.5 si MCP bloqué**, pattern Module 10 #90
4. Compliance rules `valuationRules.ts` + wiring `runChecks.ts`
5. Hook compliance dans `transitionAward` (Module 3b) pour VALUATION_STALE_BLOCKING
6. Tests d'activation 8+ (cf §6.2 compliance)
7. E2E manuel 6 scénarios
8. Memory `module_11_complete.md` + 15+ erratums anticipés
9. Commit : `feat(module-11): cron + compliance + closure`

### Workflow Git

- 1 branche `feat/module-11-valuation-viz` from master
- 6 commits B1-B6 (B0 hors-Claude Code)
- PR draft dès B1, ready après B6
- Squash-merge sur master à la fin

### Reporting

Toutes les 2 phases (B1+B2, B3+B4, B5+B6), poster dans le chat :

```
🏗️ MODULE 11 — POINT D'AVANCEMENT
Phases complétées : X/6 (B0 par David hors-Claude)
Derniers commits :
  - feat(module-11): quant client + valuation types (a3f4b21)
  - refactor(module-11): split normalizers (b5c8d92)
Prochaine phase : B3 — Composants viewer
ETA : ~3h
Bloqueurs : aucun
```

---

## 8. CONVENTIONS STRICTES (RAPPEL)

Règles autoritaires depuis `CLAUDE.md` racine :

- `'use server'` = uniquement async functions
- Pattern Result `{ ok: true, data } | { ok: false, error }` pour Server Actions
- Validation Zod sur chaque Server Action
- Audit log systématique (insertion `audit_events` sur toute action critique)
- TypeScript strict — aucun `any` non justifié
- Imports absolus via `@/` pour `apps/web` et `@equity/shared` pour le package partagé
- Types DB depuis `@equity/shared` UNIQUEMENT
- Sandbox `/dev/*` pour mécaniques complexes (monte-carlo-replay)
- Sidebar nav : ajouter "Valorisations" dès que la page principale existe (B5)
- Pas de `localStorage`/`sessionStorage` dans les composants
- Migration séquentielle 00091-00093 (pas de skip)
- Régénérer types après chaque migration

---

## 9. POINTS DE VIGILANCE

- **Engine Python upstream** : Module 11 dépend de B0 fait par David. Si B0 n'est pas fait, **toute la phase B3 frontend est inutile** (pas de paths_sample à afficher). Si Claude Code arrive en B3 et que `visualization` est null, STOP et escalader.

- **Taille DB `paths_sample`** : 3000 paths × 175 steps × 8 bytes ≈ 4MB par run. Si on stocke ça dans `valuation_runs.result_json`, la table explose vite. **Solution V1** : stripper `paths_sample` avant INSERT, stocker uniquement `visualization_summary_json` (= visualization sans paths_sample). Pour replay : re-call l'engine avec same seed.

- **Determinisme du replay** : pour que le replay donne EXACTEMENT le même résultat qu'à l'origine, il faut passer le **même seed** au moteur. Stocker `payload_sent.config.seed` à l'INSERT et le réutiliser au replay.

- **Replay cinématique côté client** : ne PAS abuser. 5 sec max. Si l'utilisateur recharge la page, ne pas relancer l'animation (only on first mount avec `enableReplay=true`). Sinon, frustration.

- **Concurrence valuation_runs** : un user peut cliquer "Lancer une valuation" 2 fois en 100ms. Garder un lock côté Server Action (`SELECT ... WHERE plan_id=? AND status='RUNNING' FOR UPDATE`) pour éviter doublons.

- **VALUATION_STALE_BLOCKING + bootstrap nouvelle org** : une nouvelle org sans aucune valuation **doit pouvoir** créer son premier plan. Solution : la rule retourne `VALUATION_NEVER_RUN` au lieu de `VALUATION_STALE` dans ce cas, et l'UI affiche un onboarding "Lancer la première valorisation" avant l'octroi.

- **FMV_DEVIATION_WARNING soft seulement** : ne pas bloquer en V1. Le CFO doit pouvoir valider une dévation > 20% s'il sait pourquoi (ex: nouvelle levée). Bloquer = compliance trop rigide.

- **Cron mensuel et empty state** : si l'org a 0 plan ACTIVE le 1er du mois, le cron ne fait rien. Pas d'erreur, juste un log NOTICE.

- **Replay un run vieux > 6 mois** : moteur Python a peut-être changé de version. Le replay donne potentiellement une FV différente (engine_version 2.5.0 vs 2.7.0). **Documenter** dans l'AuditPanel : afficher l'engine_version du run original. Si elle diffère de la version courante, afficher un warning subtle "Version moteur 2.5.0 — résultat reproduit avec 2.6.0".

- **Greeks non calculés systématiquement** : selon le moteur, les Greeks (Delta/Gamma/Vega/Theta/Rho) sont optionnels. Si absents, AuditPanel doit afficher gracefully (pas de crash si `greeks` est undefined).

- **Multi-currency exclusion V1** : si le plan est en USD, refuser le calcul avec message clair `MULTI_CURRENCY_NOT_SUPPORTED_V1`. Pas de conversion automatique.

- **Permission `AUDITOR`** : a accès `valuation.runs.read.all` + `valuation.replay`. Mais PAS `valuation.run` (ne peut pas lancer un nouveau run). Cohérent avec le rôle CAC en lecture seule.

---

## 10. MIGRATIONS — RÉSUMÉ

| #     | Nom                                  | Effet                                          |
| ----- | ------------------------------------ | ---------------------------------------------- |
| 00091 | `valuation_runs_extend_for_viz.sql`  | ALTER + index + view                           |
| 00092 | `seed_permissions_module_11.sql`     | 5 perms + role mappings                        |
| 00093 | `cron_monthly_valuation_refresh.sql` | pg_cron schedule (DEFERRED V1.5 si MCP bloqué) |

---

## 11. DETTES TECHNIQUES À CRÉER (V2)

À ajouter à `CLAUDE.md` "Dette technique connue" lors de la closure Module 11 :

- **#94** IFRS 2 incremental P&L journal (compta §B43-B44) — Module 11.5 ou 13
- **#95** Reporting cross-plans formaté CAC (export PDF) — Module 13
- **#96** Multi-currency valuation (USD, GBP) — V2
- **#97** Calibration FMV automatique 409A — V2
- **#98** Stress-tests scénarios (vol shock, rate shock) — V2
- **#99** Push WebSocket realtime pendant calcul (au lieu de polling) — V2
- **#100** Comparaison Black-Scholes vs Monte Carlo side-by-side — V2

---

## 12. RÉSOLUTION DETTES EXISTANTES

À mettre à jour dans `CLAUDE.md` :

- ✅ Dette #1 (`normalizeRateUnit % bruts non contextuels`) — RÉSOLUE en Module 11 B2. Split en `normalizeRateOrDividend` + `normalizeSigma`. Tests d'isolation 12 cases.
- ✅ Dette #11 (`incremental_fair_value calcul différé`) — RÉSOLUE en Module 11 B2. Calcul à la volée dans `requestValuationRun`, stocké en `valuation_runs.metadata`.
- ⏳ Dette technique EODHD ticker mapping isolation Deno — toujours ouverte (autre module).
- ⏳ Dette tests React component button-in-button — toujours ouverte (config testing-library).

---

**FIN DU MODULE 11 — IFRS 2 VALUATION FINALISATION + VISUALISATION MONTE CARLO**

_Quand le Module 11 est implémenté et validé, reviens vers Claude (chat) pour "go module 12" (Compliance Engine V2 configurable par org)._
