---
name: Module 10 B5 — DEFERRED V1.5 (Python endpoint absent)
description: B5 Monte Carlo skippé propre faute d'endpoint Python /compute/dilution-monte-carlo. Spec à transmettre au mainteneur Fly + liste des fichiers à créer en V1.5.
type: project
---

# Module 10 — B5 DEFERRED V1.5

**Date** : 2026-05-04
**Branche** : `feat/module-10-cap-table`
**Décision** : skip B5 propre, branche B du protocole — endpoint Python absent au moment de B5.

**Why** : le simulateur Monte Carlo de sortie nécessite un appel Edge Function → moteur Python Fly.io sur l'endpoint `/compute/dilution-monte-carlo`. Cet endpoint n'existe pas. Le moteur n'expose que `/compute/multi-tranche` (utilisé par Module 3a B5 IFRS 2).

**How to apply** : ne pas tenter d'implémenter le frontend Monte Carlo tant que l'endpoint Python n'est pas livré. Page placeholder en place, permission seedée, attendre signal mainteneur Fly.

---

## 1. Vérification endpoint (étape 0 du protocole)

### 1.1 Curl test

```bash
curl -i -X POST https://equity-gem-quant-tonnom.fly.dev/compute/dilution-monte-carlo \
  -H "Content-Type: application/json" \
  -d '{}' \
  --max-time 15
```

**Résultat** :

```
HTTP/2 404
date: Mon, 04 May 2026 10:49:43 GMT
server: Fly/9f7e98291c (2026-04-30)
content-length: 22
content-type: application/json

{"detail":"Not Found"}
```

### 1.2 OpenAPI inspect

```bash
curl -s https://equity-gem-quant-tonnom.fly.dev/openapi.json
```

→ Un seul endpoint listé : `POST /compute/multi-tranche` (déjà utilisé par Module 3a B5 pour valorisation IFRS 2).

**Diagnostic** : route Monte Carlo de dilution **absente** côté Python. Skip V1.5 obligatoire.

---

## 2. Spec endpoint à transmettre au mainteneur Fly

Source : `docs/MODULE_10_CAP_TABLE.md` §6.4 (lignes 1727-1789).

### 2.1 Input attendu

```json
{
  "positions": [
    {
      "stakeholder_id": "uuid",
      "stakeholder_name": "string",
      "share_class_code": "string",
      "share_class_type": "COMMON|PREFERRED|ESOP",
      "units": 12345,
      "liquidation_preference_multiple": 1.0,
      "liquidation_preference_type": "NON_PARTICIPATING",
      "conversion_ratio": 1.0,
      "cost_basis_per_unit": 5.0
    }
  ],
  "valuation_distribution": {
    "type": "lognormal",
    "mean": 100000000,
    "stddev": 30000000
  },
  "time_horizon_years": 5.0,
  "num_paths": 10000,
  "seed": 42
}
```

### 2.2 Output attendu

```json
{
  "run_id": "...",
  "exec_time_ms": 1234,
  "engine_version": "2.6.0",
  "input_hash": "abc123",
  "results_per_stakeholder": [
    {
      "stakeholder_id": "uuid",
      "mean_payout": 1234567,
      "p10": 500000,
      "p25": 800000,
      "p50": 1100000,
      "p75": 1500000,
      "p90": 2000000,
      "distribution_paths": [
        /* 100 sample paths max */
      ]
    }
  ],
  "global_metrics": {
    "exit_valuation_mean_simulated": 99876543,
    "exit_valuation_p50": 100000000
  }
}
```

### 2.3 Contraintes performance

- 10K paths × 50 stakeholders × 1 share class : **< 30s** (cible §1.7 spec)
- Lognormal sampling : `numpy.random.lognormal(mean, sigma)` avec sigma calculé depuis stddev/mean (paramétrisation moments)
- Waterfall par path : appliquer liquidation preferences avec conversion AUTO_BEST par défaut
- Paths exposés : 100 sample (pas 10K) pour limiter taille payload

### 2.4 Sécurité

- Auth : header `Authorization: Bearer <QUANT_ENGINE_API_KEY>` (déjà setup pour `/compute/multi-tranche`, réutiliser le même secret)
- Pas de PII : `stakeholder_id` UUID + `stakeholder_name` (nom + prénom complet acceptable, pas d'email/IBAN)
- Logging : `run_id` + `exec_time_ms` côté Python ; pas de log positions/valuations en clair

---

## 3. Fichiers à créer en V1.5 (réactivation)

Quand l'endpoint sera disponible, créer dans cet ordre :

### 3.1 Edge Function

`supabase/functions/compute-dilution-monte-carlo/index.ts` :

```typescript
// Pattern : proxy Deno comme compute-valuation (Module 3a B5)
// 1. Verify JWT supabase
// 2. RPC compute_cap_table(p_org_id, p_asof) → positions
// 3. POST QUANT_ENGINE_URL/compute/dilution-monte-carlo avec :
//    { positions, valuation_distribution, time_horizon_years, num_paths, seed }
// 4. Return result
```

Secret à set : `supabase secrets set QUANT_ENGINE_API_KEY=...` (déjà fait pour Module 3a, vérifier persist).

### 3.2 Server Action

`apps/web/src/server/actions/cap-table.ts` — étendre avec :

```typescript
export async function runMonteCarloExit(
  input: RunMonteCarloExitInput,
): Promise<{ ok: true; runId: string; results: ... } | { ok: false; error: string }>
```

- Permission : `captable.scenario.run_montecarlo` (déjà seedée 00089)
- Validation Zod : `runMonteCarloExitSchema` (déjà défini dans `packages/shared/src/schemas/cap-table.ts` avec `z.input<>`)
- Cap dur `numPaths <= 10000` (cf dette V2 §11)
- Cas vide : si `compute_cap_table` retourne 0 position → reject `{ ok: false, error: 'CAPTABLE_EMPTY_NO_MC' }`
- Audit event : `captable.monte_carlo_run` avec `num_paths`, `valuation_mean`, `time_horizon_years`

### 3.3 Composants

- `apps/web/src/components/captable/exit-monte-carlo-form.tsx` — Client form (mean, stddev, horizon, num_paths) + submit
- `apps/web/src/components/captable/violin-plot.tsx` — Recharts custom violin (p10/p25/p50/p75/p90 par stakeholder)
- Possibilité de réutiliser `EditorialWaterfall` pour le payout p50 par stakeholder (top 10)

### 3.4 Page activation

Remplacer le contenu de `apps/web/src/app/(dashboard)/dashboard/captable/exit-simulator/page.tsx` :

- Retirer EmptyState placeholder
- Ajouter form ExitMonteCarloForm (Client) + RunMonteCarloButton + résultat ViolinPlot
- Permission gate déjà en place (`captable.scenario.run_montecarlo`)

### 3.5 Tests Vitest

- Mock fetch vers Edge Function (pattern vi.hoisted déjà rodé en B2-B4)
- Tests SA : success path, permission denied, validation Zod, capTable empty
- Tests composants pure (extraire le calcul violin → helper testable)

---

## 4. État actuel V1 (post-B5 deferred)

### Livré

- Page `/dashboard/captable/exit-simulator` placeholder ([page.tsx](<apps/web/src/app/(dashboard)/dashboard/captable/exit-simulator/page.tsx>))
  - PageShell + breadcrumb + header
  - EmptyState avec LighthouseIllustration
  - CTA retour cap table + lien secondaire scénarios déterministes
  - Permission gate `captable.scenario.run_montecarlo` (redirect si absente)
- Permission `captable.scenario.run_montecarlo` seedée (migration 00089) — OWNER + ADMIN_HR
- Schema Zod `runMonteCarloExitSchema` déjà défini ([cap-table.ts:218-232](packages/shared/src/schemas/cap-table.ts:218))

### Non livré (V1.5)

- Edge Function `compute-dilution-monte-carlo`
- Server Action `runMonteCarloExit`
- Composants `exit-monte-carlo-form.tsx` + `violin-plot.tsx`
- Tests Vitest (15-20 attendus)
- E2E manuel 10K paths × 50 stakeholders < 30s

### Estimation

- Branche A (endpoint OK) : ~5h dev frontend
- Branche B (endpoint KO, livré aujourd'hui) : ~30min — placeholder + memory + PR

---

## 5. Action mainteneur Fly

Pour réactiver B5 V1.5, le mainteneur du moteur Python Fly.io doit :

1. Implémenter la route `/compute/dilution-monte-carlo` selon §2.1/§2.2 ci-dessus
2. Réutiliser le secret `QUANT_ENGINE_API_KEY` existant
3. Tester perf : 10K paths × 50 stakeholders < 30s
4. Bump engine_version (actuel 2.6.0 → 2.7.0)
5. Notifier sasportasdavid@gmail.com pour activation Capiwise

Une fois l'endpoint live, vérifier avec :

```bash
curl -i -X POST https://equity-gem-quant-tonnom.fly.dev/compute/dilution-monte-carlo \
  -H "Authorization: Bearer $QUANT_ENGINE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"positions":[],"valuation_distribution":{"type":"lognormal","mean":100000000,"stddev":30000000},"time_horizon_years":5.0,"num_paths":1000}'
```

→ doit retourner 422 (validation positions vide), pas 404.

---

## 6. Erratums spec consolidés (B1→B5)

12 erratums au total post-B5 (vs 11 post-B4) :

1. Namespace `captable.*` (M1) ≠ `cap_table.*` spec → Option D refondue + migration 00082b
2. `approval_workflows.scope` n'existe pas → `applies_to`
3. Zod `z.input<>` requis pour 5 schémas avec `.default()`
4. `EditorialWaterfallDatum` shape `label`/`type: 'positive'|'negative'|'total'`
5. RSC purity : `new Date()` au top-level (pas `Date.now()` dans render)
6. CTA empty state share class → page minimale créée
7. Permission `captable.scenario.update` absente du seed → mappé sur `scenario.create` + ownership check
8. Permission `captable.scenario.delete` requiert `is_admin=TRUE` (vs read/create open all)
9. Tab "Évolution" disabled visible avec title tooltip (pas caché)
10. Waterfall = distribution units par stakeholder (top 10 + autres + total), pas waterfall financier d'exit (le vrai waterfall financier viendra avec scénario EXIT)
11. Cache 24h `runScenario` invalidé par `updateScenario` via `result_cache=null`
12. **NEW B5** : endpoint Python `/compute/dilution-monte-carlo` absent → B5 deferred V1.5 + page placeholder

---

## 7. Liens

- Spec endpoint : `docs/MODULE_10_CAP_TABLE.md` §6.4
- Schema Zod préparé : [cap-table.ts:218](packages/shared/src/schemas/cap-table.ts:218)
- Permission seedée : [00089_module_10_seed_permissions.sql:60](supabase/migrations/00089_module_10_seed_permissions.sql:60)
- Page placeholder : [exit-simulator/page.tsx](<apps/web/src/app/(dashboard)/dashboard/captable/exit-simulator/page.tsx>)
- Pattern Edge Function référence : `supabase/functions/compute-valuation/` (Module 3a B5)
