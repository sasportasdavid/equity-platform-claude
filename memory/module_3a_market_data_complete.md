# Module 3a payload V2 + Market Data Fetch — closure

Branche : `fix/module-3a-payload-v2-and-market-data-fetch`
PR draft : (à renseigner après création — étape 12)

## Objectif

PR majeure combinant 2 chantiers liés :

1. **Fix 3 bugs Python payload V8** (audit `memory/payload_python_audit_v8.md`) :
   - **P0 #1** TSR_REL_INDEX silent fallback à S0=100/σ=0.20/ρ=0.5 quand
     les colonnes sont vides → biais Monte Carlo silencieux
   - **P0 #2** TSR_REL_PEERS Pydantic 422 (s0/volatility/correlationWithMain
     en camelCase + lowercase au lieu de S0/sigma/correlation uppercase
     attendu côté moteur Python)
   - **P2 #3** `shouldUseMonteCarlo` activait MC pour multi-tranches
     même sans condition non-fermée → MC inutile + temps de calcul ×10

2. **Auto-fetch market data EODHD/Yahoo** pour TSR_REL_INDEX et
   TSR_REL_PEERS, avec **3 modes** alignés sur la grant_date :
   - `SNAPSHOT_AT_GRANT` (default IFRS 2) : capture S0/σ/ρ à la grant_date,
     persisté en DB, reproductible
   - `MANUAL` : saisie utilisateur (cas index obscur, data Bloomberg interne)
   - `LIVE_AT_VALUATION` : refetch live à chaque run de valuation —
     **reproductibilité IFRS 2 dégradée** (usage CFO / backtest only)

## Livrables

### 5 migrations DB (00070 → 00074)

| #     | Fichier                                                 | Contenu                                                                                                                                        |
| ----- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 00070 | `module_3a_payload_v2_tsr_rel_index_market_data.sql`    | +6 cols `performance_conditions` (s0/sigma/correlation/dividend_yield/data_source/captured_at) + CHECK constraints                             |
| 00071 | `module_3a_payload_v2_tsr_rel_peers_validation.sql`     | 3 functions + trigger validate peers s0/volatility on INSERT/UPDATE                                                                            |
| 00072 | `module_3a_payload_v2_valuation_runs_payload_audit.sql` | `payload_sent` + `response_received` JSONB + 2 GIN indexes + view `valuation_runs_audit`                                                       |
| 00073 | `module_3a_market_data_fetch_mode.sql`                  | `market_data_fetch_mode` TEXT enum + `reference_index_resolved_ticker` + `market_data_warnings` + INDEX partiel sur LIVE_AT_VALUATION          |
| 00074 | `module_3a_market_data_cache.sql`                       | Table cache 24h `market_data_cache` (ticker, as_of_date, lookback_days) UNIQUE INDEX + DISABLE RLS (data publique marché) + trigger updated_at |

### 4 Edge Functions Deno

| #   | EF                             | Note                                                                                                                                                                                                                                                   |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `yahoo-search` (NEW)           | Proxy Yahoo Finance search avec retry + fallback liste curated (CAC 40, S&P 500, etc.)                                                                                                                                                                 |
| 2   | `market-data-fetch` (NEW)      | Preview EODHD primary + Yahoo fallback ; calcule σ log-returns + winsorisation ; supporte `preview_only=true`                                                                                                                                          |
| 3   | `market-data-peer-group` (NEW) | Multi-peers preview : matrice corrélation (N+1)×(N+1) + S0/σ par actif. **Patch correlation_matrices** : 21 lignes UPSERT remplacées par `console.log` structuré (table absente Capiwise — Solution B)                                                 |
| 4   | `compute-valuation` V2.1       | Step 1.bis `refreshLiveMarketData` AVANT le build payload. Gère LIVE_AT_VALUATION pour TSR_REL_INDEX (invoke market-data-fetch) ET TSR_REL_PEERS (invoke market-data-peer-group via `companies.ticker`). Persiste `payload_sent` + `response_received` |

### Lib partagée Deno

- `_shared/marketDataService.ts` (NEW, 1618 lignes) : `fetchMarketData`, `fetchHistoricalPrices`, `computeHistoricalVolatility`, `computeCorrelationMatrix`, `fetchDividendYieldForPeer`, `fetchRiskFreeRate`. **6× rename** `EODHD_API_TOKEN` → `EODHD_API_KEY` (uniformisation Capiwise).

### `_shared/buildPythonPayload.ts` V2

3 fixes des bugs P0/P2 + ajout de 2 champs au type `PythonConditionInput` :

- `id` : id de la performance_condition (audit + LIVE dispatch)
- `market_data_fetch_mode` : 'SNAPSHOT_AT_GRANT' | 'MANUAL' | 'LIVE_AT_VALUATION' | null

Modifs métier :

- `shouldUseMonteCarlo` retire `|| hasMultipleTranches` (fix P2)
- `mapPeerToMoteur` convertit `s0→S0`, `volatility→sigma`, `correlationWithMain→correlation` (fix P0 #2)
- TSR_REL_PEERS toujours wrappé en `weighted_peer_groups` côté payload Python (uniformise les 2 modes flat/weighted)
- TSR_REL_INDEX envoie `index_S0` + `index_sigma` + `correlation` (fix P0 #1)
- `enrichPeersWithATM` retiré (inliné — vérifié qu'il n'avait aucun caller externe)
- Type `MoteurPeerFormat` ajouté

### Server Actions + Zod schemas (étape 7)

`packages/shared/src/schemas/market-data.ts` (NEW) :

- 3 schemas input (`searchIndicesInputSchema`, `fetchIndexMarketDataInputSchema`, `fetchPeerGroupMarketDataInputSchema`)
- 4 types output (`SearchIndexResult`, `FetchIndexMarketDataResult`, `PeerAssetStats`, `FetchPeerGroupMarketDataResult`)
- `marketDataFetchModeSchema` + `MarketDataFetchMode`
- Bornes validées : `MIN_LOOKBACK_DAYS=30`, `MAX_LOOKBACK_DAYS=3650`,
  `DEFAULT_LOOKBACK_INDEX_DAYS=1095`, `DEFAULT_LOOKBACK_PEERS_DAYS=1095`

`apps/web/src/server/actions/market-data.ts` (NEW) :

- 3 actions Result-pattern `{ ok: true; data } | { ok: false; error }`
- `requirePermission('plans.create')` sur les 3
- Pattern uniforme : `safeParse` → `requirePermission` → `supabase.functions.invoke` → unwrap response → wrap Result

`apps/web/src/server/actions/__tests__/market-data.test.ts` (NEW) :

- **18 tests verts** (5 + 7 + 6)
- Mock pattern `vi.hoisted` (TEST_ORG_ID, TEST_USER_ID, invokeMock)
- Couverture : happy × 3, EF error × 3, EF success=false × 3, payload malformé × 1, Zod fail × 6, edge cases (fallback, lookback overflow, > 30 peers) × 3

### Schema wizard étendu (étape 8)

`packages/shared/src/schemas/plan-wizard.ts` :

- **+9 champs V2** dans `performanceConditionSchema` :
  - `marketDataFetchMode` (enum 3-options)
  - `reference_index_s0` / `_sigma` / `_correlation` / `_dividend_yield`
  - `reference_index_data_source` (enum MANUAL|EODHD|YAHOO)
  - `reference_index_data_captured_at` (timestamp ISO)
  - `reference_index_resolved_ticker` (ticker EODHD résolu, ex: CAC.PA pour ^FCHI Yahoo)
  - `market_data_warnings` (array de strings)
- Champs ajoutés à `CONDITION_FIELDS_BY_TYPE.MARKET` → cleanup auto au switch
  de type (un user qui passe TSR_REL_INDEX → SERVICE ne traîne plus de
  market data orphelin)
- **superRefine TSR_REL_INDEX étendu** : si `marketDataFetchMode` = SNAPSHOT_AT_GRANT
  ou MANUAL → S0/σ/ρ obligatoires (sinon biais MC silencieux). Mode LIVE :
  ticker obligatoire (déjà validé en amont), valeurs optionnelles.

### UI Wizard Step 4

`apps/web/src/components/plans/wizard/MarketDataInputs.tsx` (NEW, refondu) :

- Mode picker 3-options (SNAPSHOT default + IFRS 2 badge, MANUAL, LIVE)
- Bouton "Récupérer maintenant" → invoke `fetchIndexMarketData` (preview EODHD)
- 4 inputs S0/σ/ρ/q (readonly en mode SNAPSHOT post-fetch)
- Warning IFRS 2 dégradé pour mode LIVE_AT_VALUATION (Alert orange)
- Affichage source + timestamp captured_at pour audit
- Backward-compat export `ManualIndexMarketDataInputs` pour les call-sites legacy

`apps/web/src/components/plans/wizard/steps/step4/MarketBranch.tsx` :

- Wiring `MarketDataInputs` dans `IndexSelector` (rendu après ticker sélectionné)
- Lecture du `grantDate` du form pour le passer comme `asOfDate`

### Builder Server Action

`apps/web/src/server/actions/plans.ts::buildConditionsPayload` :

- +9 nouvelles colonnes DB snake_case (default `'SNAPSHOT_AT_GRANT'` pour
  cohérence avec migration 00073)

### Tests + auxiliaires

- `apps/web/src/__tests__/payload/buildPythonPayload.test.ts` (NEW) : **40 tests verts** (28 non-null assertions ajoutées via Python regex auto-patch)
- `scripts/validate-payload-v2.mjs` (NEW) : script E2E manuel pour valider le payload V2
- `memory/payload_python_audit_v8.md` (NEW) : audit V8 source

## Compteurs finaux

| Métrique                             | Avant | Après   | Δ                                                                                                |
| ------------------------------------ | ----- | ------- | ------------------------------------------------------------------------------------------------ |
| Tests workspace                      | 614   | **672** | +58                                                                                              |
| Tests apps/web                       | 544   | 602     | +58                                                                                              |
| Tests shared                         | 70    | 70      | —                                                                                                |
| Migrations                           | 69    | **74**  | +5                                                                                               |
| Edge Functions                       | 12    | **16**  | +4 (yahoo-search + market-data-fetch + market-data-peer-group + compute-valuation V2.1 modifiée) |
| Server Actions market-data           | 0     | **3**   | +3                                                                                               |
| Champs `performance_conditions` (DB) | —     | +9 V2   | +9                                                                                               |

## Décisions architecturales

### Solution A pour `market_data_cache` (Option A retenue)

`market_data_cache` était référencé par les EFs source mais absent de la DB
Capiwise. Décision : **créer la table** (migration 00074) plutôt que patcher
out l'UPSERT côté EF. Justification : le cache 24h évite des micro-mouvements
intra-day entre preview ("Récupérer maintenant") et save ("Sauvegarder le
plan") qui produiraient 2 valeurs S0 différentes pour le même plan.

### Solution B pour `correlation_matrices` (Option B retenue)

`correlation_matrices` aussi absente. Décision : **patch out l'UPSERT** et
remplacer par `console.log('[correlation-audit] matrix computed', {...})`.
Justification : la matrice de corrélation effective est déjà persistée dans
`valuation_runs.payload_sent.live_fetch_metadata` (migration 00072) →
`correlation_matrices` aurait été un doublon audit pour zéro valeur business
ajoutée. La trace canonique IFRS 2.46 reste `valuation_runs.payload_sent`.

### Solution A pour TSR_REL_PEERS LIVE_AT_VALUATION (full implementation)

Le compute-valuation V2.1 gère maintenant la branche LIVE_AT_VALUATION pour
TSR_REL_PEERS : invoke `market-data-peer-group` avec `companies.ticker`
(target) + peers de la condition, puis patch in-place les `s0`/`volatility`/
`correlationWithMain` de chaque peer (et la corrélation target↔peer pour
le ROW). Vérifié que `companies.ticker` existait bien dans la DB.

### Default `marketDataFetchMode = 'SNAPSHOT_AT_GRANT'`

Cohérent avec migration 00073 default + recommandation IFRS 2 (reproductibilité
des inputs critiques). Le wizard expose le mode picker mais préselectionne
SNAPSHOT — l'utilisateur doit explicitement opter pour LIVE_AT_VALUATION
(et lit le warning).

### Convention `error.issues` (Zod 4)

Bug rencontré : `parsed.error.errors[0]` retourne `undefined` en Zod 4
(breaking change vs Zod 3). Toutes les Server Actions market-data utilisent
`parsed.error.issues[0]?.message`. À garder en tête pour les futurs Server
Actions du repo (`beneficiaries.ts` utilise déjà `error.issues`).

### Pattern test mock — `vi.hoisted`

Vitest hoist les `vi.mock` factories en haut du fichier, donc les variables
référencées dans la factory doivent être `vi.hoisted`. Pattern :

```typescript
const { TEST_ORG_ID, TEST_USER_ID, invokeMock } = vi.hoisted(() => ({
  TEST_ORG_ID: '00000000-0000-4000-8000-000000000000',
  TEST_USER_ID: '00000000-0000-4000-8000-000000000099',
  invokeMock: vi.fn(),
}));
```

## Vérifications globales

- ✅ `pnpm typecheck` : 0 erreur (apps/web + shared)
- ✅ `pnpm test` : **672/672 verts** (apps/web 602 + shared 70)
- ✅ `pnpm lint` : 0 nouveau warning ni erreur dans nos fichiers (37 erreurs
  pré-existantes dans `portal/exercises/` et `components/exercises/` sont
  des apostrophes JSX non escapées — hors scope cette PR)
- ❌ Verification preview navigateur : NON exécutée (le wizard Step 4 nécessite
  auth + plan en édition + ticker TSR_REL_INDEX + EFs deployées). E2E manuel
  post-merge, pattern aligné avec M5-M8.

## Dette V2 — À résoudre dans des PRs séparées

1. **Migration `YahooIndexSearch` vers `searchIndices`** : le composant
   `YahooIndexSearch.tsx` utilise actuellement une liste statique
   `TOP_INDICES` (CAC 40, S&P 500, etc.). Le `searchIndices` Server
   Action introduit par cette PR est plus complet (autocomplete dynamique
   via Yahoo API + fallback curated). À migrer dans une PR distincte
   qui fera : (a) ajout debounced query → state, (b) `useTransition` +
   `useState` results, (c) suppression de la TOP_INDICES static.

2. **Tests E2E Playwright Wizard Step 4** : verification preview différée
   conformément au pattern M5-M8. Ajouter à la roadmap test E2E global :
   auth magic link → create plan wizard → Step 4 → ajouter condition
   TSR_REL_INDEX → sélectionner ticker → cliquer "Récupérer maintenant" →
   assert preview EODHD (S0 > 0, σ ∈ [0.05, 0.5], q ∈ [0, 0.10]).

3. **Wizard Step 4 TSR_REL_PEERS UI complete** : la V1 active uniquement
   TSR_REL_INDEX dans le wizard pour le bouton auto-fetch. TSR_REL_PEERS
   UI complete (auto-fetch matrice corrélation visible + warnings) reportée
   à V2. Le moteur backend gère DÉJÀ les 3 modes pour les peers (cf.
   `compute-valuation/index.ts:refreshLiveMarketData` branche peers) — il
   manque juste le wiring UI dans le `PeerGroupEditor`.

4. **Cleanup batch `market_data_cache`** : pas de cron pg_cron qui DELETE
   WHERE `expires_at < now()`. La table grossit indéfiniment (TTL 24h
   limite mais pas zéro). V2 : ajouter pg_cron quotidien.

5. **Drift fiscal moteur Python** : `measurementPeriodYears` envoyé en
   Julian year (365.25). À aligner avec la convention exacte du moteur
   `https://equity-gem-quant-tonnom.fly.dev/compute/multi-tranche` (
   `MODULE_03A_PLANS.md` §4.2). Probablement OK — divergence Julian vs
   Banker's = 0.07 % sur 3 ans, négligeable pour scoring mais peut décaler
   les Greeks de vol sur les MC longs.

6. **Yahoo `quotesQueryId=tss_match_phrase_query`** : EF yahoo-search use
   un endpoint Yahoo non-officiel. Si Yahoo casse le contract, le fallback
   curated kick-in mais on perd l'autocomplete. Monitoring à prévoir.

## STOP final — actions David manuel

Après merge de la PR draft, **ces 4 actions restent côté David** :

1. `supabase db push --linked` (apply migrations 00070-00074 en cloud)
2. `supabase functions deploy yahoo-search market-data-fetch market-data-peer-group compute-valuation`
3. Tester E2E manuel : login wizard → CAC 40 (^FCHI) → fetch EODHD →
   save plan → run valuation → vérif `valuation_runs.payload_sent` contient
   `index_S0`/`index_sigma`/`correlation` correctement remplis
4. Si E2E pass → PR ready-for-review → merge sur master

Les secrets EODHD_API_KEY doivent être configurés côté EF :

```bash
supabase secrets set EODHD_API_KEY=xxx
```

## Pattern à reproduire ailleurs

- **Mode picker 3-options avec audit IFRS 2** : pattern réutilisable
  pour tout autre champ qui peut être SNAPSHOT (capture immutable),
  MANUAL (saisie utilisateur), ou LIVE (refetch à l'usage). Cf. discount
  rate, vol implied, peer beta…
- **Result-pattern Server Action proxy EF** : 3 actions market-data
  uniformes (safeParse → requirePermission → invoke → unwrap) — bon
  template pour les futures Server Actions qui proxient des EFs
  (notification re-send, document re-render, etc.)
