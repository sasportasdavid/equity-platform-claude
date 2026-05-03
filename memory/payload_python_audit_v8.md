# Audit moteur Python V8 vs Capiwise — closure

**Date** : 2026-05-01
**PR** : #11 (à créer) — `fix/payload-python-v8-alignment`
**Source code Python audité** : `main.py` du repo Fly.io equity-gem-quant

---

## Contexte

Question initiale : "le payload envoyé au moteur Python sur Fly.io est-il
aligné avec ce qui donne des bonnes valeurs Monte Carlo ?"

Audit ligne-par-ligne du code Python V8 (937 lignes, FastAPI + Pydantic +
NumPy + Cholesky GBM multi-asset) vs `buildPythonPayload.ts` Capiwise.

## Bugs trouvés

### Bug #1 (P0 — bloquant prod) : TSR_REL_INDEX silencieusement faux

**Référence code Python** : `main.py` l. 454-456

```python
idx_S0 = float(cond.index_S0) if cond.index_S0 is not None else 100.0
idx_sigma = float(cond.index_sigma) if cond.index_sigma is not None else 0.20
idx_rho = clamp_rho(cond.correlation if cond.correlation is not None else 0.5)
```

**Symptôme** : si Capiwise n'envoie pas `index_S0/index_sigma/correlation`,
le moteur fallback à 100 / 0.20 / 0.5. Pour un index réel (SBF120 à 8000,
σ ≈ 22 %, ρ ≈ 0.85), le résultat MC est complètement décalé. Pas d'erreur
visible — bug silencieux.

**Cause racine** : Capiwise n'a pas encore branché `searchTicker` +
`fetchMarketData` (Module 3a §5.2 deferred dans CLAUDE.md). Les données
live des indices ne sont jamais fetchées ni stockées en DB.

### Bug #2 (P0 — bloquant prod) : TSR_REL_PEERS Pydantic 422 + flat ignoré

**Référence code Python** : `main.py` l. 65-74 + l. 460/586

Schéma Pydantic strict :

```python
class WeightedPeerInGroup(BaseModel):
    id: str
    weight: float = Field(..., ge=0)
    S0: float = Field(..., gt=0)         # REQUIRED uppercase
    sigma: float = Field(..., gt=0, le=5.0)  # REQUIRED
    correlation: Optional[float] = Field(default=None, ge=-1, le=1)
```

Lecture du moteur :

```python
elif ctype == "TSR_REL_PEERS" and cond.weighted_peer_groups:
    # ne lit JAMAIS cond.peer_group flat
```

**Symptôme** :

1. Capiwise utilise côté TS `s0/volatility/correlationWithMain` →
   Pydantic rejette en 422 (S0/sigma manquants comme required).
2. Capiwise envoie parfois `cond.peer_group` flat → moteur l'ignore →
   peers ignorés → multiplier=0 → FV faux.

### Bug #3 (P2 — perf) : critère multi-tranches inutile

**Référence code Python** : `main.py` l. 358-407

Le moteur a un bloc analytique pur pour multi-tranches sans condition de
marché (boucle sur `tranches`, `calculate_non_market_analytical(...)`).
Pas besoin de MC.

`shouldUseMonteCarlo` côté Capiwise V1 :

```typescript
return hasMarketCondition || hasMultipleTranches; // ⚠️ deuxième critère inutile
```

**Symptôme** : un plan AGA 4 tranches sans condition de marché bascule en
MC (50000 paths × 1028 steps × 4 tranches ≈ 2-3 secondes) alors qu'il
serait calculé en BS pur en 10 ms côté moteur.

## Bugs HYPOTHÉTIQUES qui n'en sont pas

D'après le payload de référence transmis initialement, j'avais identifié 8
divergences. Après audit du code Python V8 réel, **5 sont des faux problèmes** :

| #   | Mon point initial                                   | Réalité moteur V8                                                      |
| --- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | `instrument.type` UPPERCASE attendu                 | L. 320 : `.upper() == "OPTION"` accepte tout cassing                   |
| 2   | `underlying_model` top-level requis                 | Pas dans le schéma — moteur ne supporte que GBM en V8                  |
| 3   | `peers` + `correlation_matrix` top-level            | `peers` accepté mais `correlation_matrix` ignoré (dérivé via Cholesky) |
| 4   | `combination_type/evaluation_moment/failure_action` | Pas dans le schéma → ignorés                                           |
| 5   | `num_time_steps === 252` forcé                      | L. 410-412 : `max(input, T*252+20)` → minimum 1028 pas pour 4 ans      |

Conclusion : le payload de référence transmis initialement était partiellement
inexact (par exemple, il mentionnait `"CALL"` alors que le moteur normalise
en `"OPTION"`). Capiwise est globalement aligné avec le moteur V8 réel —
modulo les bugs P0 sur l'absence de market data des indices et peers.

## Fix Étape 1 (cette PR)

### Commits

1. `feat(payload): map peers to Pydantic format (Bug #2 part 1)`
   - Ajoute helper `mapPeerToMoteur` qui convertit s0/volatility/correlationWithMain
     en S0/sigma/correlation (Pydantic strict)
   - Throw explicit error si peer.s0 ou peer.volatility manquant

2. `feat(payload): always wrap peers in weighted_peer_groups (Bug #2 part 2)`
   - Si `cond.peer_group` flat → wrappé dans `weighted_peer_groups[0]`
     avec id='default', weight=1.0
   - `cond.peer_group` n'est plus envoyé au top-level (champ ignoré par moteur)

3. `feat(payload): send index market data for TSR_REL_INDEX (Bug #1)`
   - Lit nouvelles colonnes DB `reference_index_s0/sigma/correlation/dividend_yield`
   - Envoie `index_S0/index_sigma/correlation` dans la condition
   - Console.warn si données manquantes (FV sera faux mais pas de crash)

4. `feat(payload): remove hasMultipleTranches from MC routing (Bug #3)`
   - `shouldUseMonteCarlo` ne checke plus que `hasMarketCondition`
   - Gain : ~100x perf sur les plans multi-tranches sans condition de marché

5. `feat(audit): persist payload_sent + response_received in valuation_runs`
   - Migration 00052 ajoute les 2 colonnes JSONB + index GIN + view audit
   - `compute-valuation/index.ts` patché pour persister à RUNNING + DONE

6. `feat(db): add reference index market data columns (Bug #1 schema)`
   - Migration 00050 ajoute `reference_index_s0/sigma/correlation/dividend_yield/data_source/captured_at`
   - Constraints sigma ∈ [0,5], correlation ∈ [-1,1], data_source enum
   - Index partial sur conditions avec données manquantes

7. `feat(db): validate peers market data on insert (Bug #2 schema)`
   - Migration 00051 ajoute fonctions `validate_peer_group_market_data`
     et `validate_weighted_peer_groups_market_data`
   - Trigger BEFORE INSERT/UPDATE bloque les peers sans s0/volatility
   - TSR_REL_INDEX : warning seulement (compatibilité legacy)

8. `feat(ui): add ManualIndexMarketDataInputs to wizard step 4`
   - 3 inputs S0/σ/ρ avec validation client + alert si incomplet
   - Forward-pointer vers V2 (fetchMarketData via Yahoo/EODHD)

9. `test(payload): 35 tests Vitest covering V2 alignment`
   - 8 tests `shouldUseMonteCarlo` (avec et sans critère multi-tranches)
   - 9 tests `mapPeerToMoteur` (Pydantic compat, throws, normalisation)
   - 6 tests TSR_REL_PEERS payload (wrapping flat → wpg)
   - 4 tests TSR_REL_INDEX payload (avec/sans market data, warnings)
   - 8 tests structure générale (parity ValuationRequest)

## Reste à faire (Étape 3 — out of scope cette PR)

- **Module 3a §5.2 — searchTicker + fetchMarketData**
  - Edge function qui fetch S0/σ/ρ depuis Yahoo/EODHD
  - Auto-recompute sur sauvegarde de condition + cron weekly refresh
  - Quand livré : ManualIndexMarketDataInputs deviennent read-only avec
    bouton "Refresh", `data_source` passe à 'YAHOO' ou 'EODHD'

- **Compliance rule MARKET_DATA_REQUIRED** (Module 12 — Compliance V2)
  - Bloque la sauvegarde de TSR_REL_INDEX sans market data complète
  - Force le pattern propre quand fetchMarketData sera dispo

## Tests E2E à valider après merge

Avant de considérer cette PR mergée production-ready, lancer 3 valuations
réelles sur le moteur Fly.io :

1. Plan AGA simple, 4 tranches, 0 condition → BS analytique pur
   - Attendu : FV ≈ S0 × Σ portion_i × exp(-q × T_i) ± 0.01
   - Vérifier `valuation_runs.payload_sent.config.use_monte_carlo === false`

2. Plan AGA, TSR_REL_INDEX vs S&P 500 (S0=4500, σ=0.18, ρ=0.72)
   - Attendu : pas d'erreur, FV stable run-à-run avec seed=42
   - Vérifier dans `payload_sent.conditions[0]` : `index_S0`, `index_sigma`,
     `correlation` présents avec les bonnes valeurs

3. Plan BSPCE, TSR_REL_PEERS, 4 peers (avec s0/volatility/correlationWithMain
   tous renseignés via wizard)
   - Attendu : pas de 422, FV cohérent
   - Vérifier dans `payload_sent.conditions[0].weighted_peer_groups[0].peers`
     : `S0` (uppercase), `sigma`, `correlation` (sans `s0`/`volatility`/`correlationWithMain`)

## Références

- `supabase/functions/_shared/buildPythonPayload.ts` (V2)
- `supabase/functions/compute-valuation/index.ts` (V2)
- `supabase/migrations/00050_tsr_rel_index_market_data.sql`
- `supabase/migrations/00051_tsr_rel_peers_validation.sql`
- `supabase/migrations/00052_valuation_runs_payload_audit.sql`
- `apps/web/src/components/plans/wizard/ManualIndexMarketDataInputs.tsx`
- `apps/web/src/__tests__/payload/buildPythonPayload.test.ts`
- Fly.io engine `main.py` (audit source)
