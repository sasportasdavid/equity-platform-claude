# Module 10 B4 — Scénarios déterministes + tabs Camembert/Waterfall

**Phase B4 livrée** — 4 Server Actions scenarios + 21 tests + dilution-comparator + 3 pages /scenarios + page minimale /share-classes/new + tabs (Tableau/Camembert/Waterfall) + 2 presets sandbox.

## Livrables B4

### Server Actions (`apps/web/src/server/actions/cap-table.ts`, +290 lignes)

4 actions ajoutées au fichier B2 :

| Action                        | Permission                 | Pattern                                                                        |
| ----------------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| `createScenario`              | `captable.scenario.create` | INSERT dilution_scenarios + audit                                              |
| `updateScenario(id, partial)` | `captable.scenario.create` | Owner check + invalidate result_cache + audit                                  |
| `deleteScenario(id)`          | `captable.scenario.create` | Owner check + DELETE + audit                                                   |
| `runScenario(id)`             | `captable.read.all`        | Cache 24h check → si stale: RPC compute_cap_table(scenario_id) → persist cache |

**Cache 24h** : `result_cache JSONB` + `result_computed_at TIMESTAMPTZ` dans
`dilution_scenarios`. `runScenario` :

1. Si cache existe et `< 24h` → retourne `cached:true` directement
2. Sinon → RPC compute_cap_table(`p_view_mode='PRO_FORMA'`, `p_scenario_id=id`)
   → persist cache + return `cached:false`

**Owner check** : double-coverage RLS (policy `update_own` / `delete_own`
sur `created_by = auth.uid()`) + check explicit côté Server Action avec
message d'erreur clair `"Seul le créateur peut..."`.

**Update intelligent** : `updateScenario` accepte partial. Si `parameters`
fourni, re-valide via `createScenarioSchema.shape.parameters.safeParse` et
sync `scenario_type` avec `parameters.scenarioType`.

### Tests Vitest (+21 nouveaux, 43/43 dans cap-table.test.ts)

| Action               | Tests                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `createScenario` (6) | happy NEW_ROUND + happy POOL_TOPUP + happy EXIT + Zod scenarioType invalide + Zod name + DB error |
| `updateScenario` (6) | happy name + happy parameters change scenario_type + refus non-owner + refus empty + 404 + Zod id |
| `deleteScenario` (3) | happy owner + refus non-owner + 404                                                               |
| `runScenario` (6)    | cache miss + cache hit (frais) + cache stale (>24h, re-call) + 404 + RPC fail + Zod id            |

**Pattern mock étendu** : `dilution_scenarios` ajouté au makeBuilder
chainable (`insert`, `select`, `update`, `delete`, `maybeSingle`).

### Composant `dilution-comparator.tsx` (191 lignes — création initiale)

Comparateur Avant/Après avec :

- Header deltas globaux (3 stats : total avant / total après / évolution
  signed avec couleurs emerald/red)
- Grid deltas par share_class (avec badges `Nouveau` / `Retiré` + couleur
  emerald/red sur le %)
- 2 matrices côte à côte (`xl:grid-cols-2`) qui réutilisent `CapTableMatrix`
  (composant B3) avec props différentes

### Composant `cap-table-tabs.tsx` (105 lignes — création initiale)

Wrapper Tabs sur la page principale `/dashboard/captable` :

- Tab `Tableau` (CapTableMatrix B3)
- Tab `Camembert` (EditorialPieChart, donut center label = total units)
- Tab `Waterfall` (EditorialWaterfall, top 10 stakeholders + Autres + Total)
- Tab `Évolution` disabled (B6 — besoin snapshots historisés)

### Pages B4

| Route                                   | Type                                      | Description                                                                                                                |
| --------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `/dashboard/captable/scenarios`         | Server Component                          | Liste 100 scénarios récents (own + shared). Cards avec badge `Partagé` / `Autre user` + cache age label                    |
| `/dashboard/captable/scenarios/new`     | Server Component + ScenarioBuilder Client | Wizard form (4 types switch). Submit → createScenario → redirect /scenarios/[id]                                           |
| `/dashboard/captable/scenarios/[id]`    | Server Component                          | Détail. Charge en parallèle : scenario meta + getCapTable CONSOLIDATED + runScenario PRO_FORMA. Affiche DilutionComparator |
| `/dashboard/captable/share-classes/new` | Server Component + ShareClassForm Client  | V5 fix — page minimale créée pour que le CTA empty state ne soit plus 404                                                  |

### Page principale modifiée

`/dashboard/captable/page.tsx` :

- `CapTableMatrix` direct → remplacé par `CapTableTabs` (Tableau/Camembert/Waterfall/Évolution)
- Bouton `Nouveau scénario` (top-right Actions) maintenant **actif** (link vers `/scenarios/new`)
- Bouton `Importer historique` reste disabled (B6)

### Sandbox `/dev/cap-table-builder` — +2 presets

- **Preset 5** — Scenario NEW_ROUND Series B (30M€ pre-money + 10M€ raised, PREF_B, lead VC)
- **Preset 6** — Scenario POOL_TOPUP 5% (5000 units, target 15% pool)

## Réponses aux questions V2/V4/V5/V6

### V2 — Workflow approval cas (b)

**Comportement V1 implémenté** : **Interprétation A** (reject explicite, aucun
INSERT). Code `cap-table.ts:354` :

```typescript
if (workflow) {
  return {
    ok: false,
    error:
      'Un workflow approval est attaché à funding_rounds.create. ' +
      'Le routage Module 5 est V2 — créer la levée temporairement sans ' +
      'workflow ou désactiver le workflow.',
  };
}
```

L'admin voit un message d'erreur explicite. Pas de DRAFT créé. Pas d'audit
log (l'action n'a rien fait). Documenté dans `memory/module_10_b2_complete.md`.

### V4 — Tests RPC mocking strategy

**On mocke le Supabase client**, pas la RPC SQL elle-même. Pattern :

```typescript
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    rpc: (...args) => Promise.resolve(mockState.rpcResult),
  }),
}));
```

→ La RPC `compute_cap_table` n'est PAS testée par mes tests Vitest. Elle
a été testée séparément en B1 via les **15 assertions inline** (UNION ALL
dans dry-run BEGIN/ROLLBACK + 15 tests d'intégration croisés post-Lot 4).

→ Test d'intégration réel de `compute_cap_table` avec data réelle =
**dette** déférée à B7 ou Module 12 (Compliance V2).

### V5 — Empty state CTA `/share-classes/new`

**Option b implémentée** : page minimale créée avec form fonctionnel
(switch type COMMON/PREFERRED/ESOP + champs essentiels code/name/parValue/
poolTotalUnits si ESOP). Le CTA depuis l'empty state aboutit donc sur une
vraie page, plus de 404.

V2 = wizard multi-step avec presets (Common Stock, Pool ESOP 10%, Series A
template, etc.).

### V6 — Sidebar badge counter

**Pas implémenté** en B3. Justification : coût SSR par page pour fetch le
count `SELECT COUNT(*) FROM cap_table_positions WHERE position_closed_at IS NULL`.

→ **Dette V2 documentée** : à implémenter via une RPC `cap_table_position_count(p_org_id)` cached 5 min OU via un CTX provider qui fetch une seule fois au login.

## Tests workspace post-B4

|                | Avant B4                        | Après B4      |
| -------------- | ------------------------------- | ------------- |
| apps/web tests | 632                             | **653** (+21) |
| shared tests   | 70                              | 70            |
| Typecheck      | 0 erreur                        | 0 erreur      |
| Lint           | 1 warning TanStack pré-existant | idem          |

## Garde-fous appliqués (B4)

- ✅ `apply_scenario` réutilisé tel quel (RPC privée 00085, pas modif)
- ✅ Pattern Result `{ok, data | error}` sur les 4 actions
- ✅ Validation Zod systématique avec discriminated union sur scenario_type
- ✅ `logAuditEvent` Server Action sur 3 mutations (scenario_created,
  scenario_updated, scenario_deleted)
- ✅ Owner check explicit (RLS double-coverage)
- ✅ Cache 24h `result_cache` avec invalidation sur updateScenario
- ✅ Tabs disabled `Évolution` avec tooltip explicite (B6)
- ✅ Bouton `Nouveau scénario` activé sur page principale (link /scenarios/new)
- ✅ Page minimale `/share-classes/new` (V5 fix CTA empty state)

## Erratums spec consolidés (B1+B2+B3+B4)

| #   | Erratum                                                                                                    | Phase |
| --- | ---------------------------------------------------------------------------------------------------------- | ----- |
| 1   | `audit_table_changes()` n'existe pas → audit Server Action                                                 | B1    |
| 2   | `cap_table.*` → `captable.*`                                                                               | B1    |
| 3   | `user_has_permission()` → `has_permission()`                                                               | B1    |
| 4   | `cap_table_snapshots` ALTER ADD-only                                                                       | B1    |
| 5   | `documents` → `document_instances`                                                                         | B1    |
| 6   | `exercise_requests.status='COMPLETED'` (pas FULLY_PAID)                                                    | B1    |
| 7   | REVOKE EXECUTE FROM PUBLIC + authenticated + anon                                                          | B1    |
| 8   | `approval_workflows.scope` → `applies_to`                                                                  | B2    |
| 9   | `z.infer` → `z.input` sur schemas avec `.default()`                                                        | B2/B3 |
| 10  | Composants `cap-table-matrix` + `valuation-toggle` non créés en PR #12                                     | B3    |
| 11  | Server Component RSC ne peut pas appeler `Date.now()` (impure) → préfetch `new Date()` au niveau composant | B4    |

## Prochaine phase B5

- Endpoint Python `/compute/dilution-monte-carlo` à coordonner avec
  maintainer Fly.io (`equity-gem-quant-tonnom`)
- **Bloqueur potentiel** : skip B5 V1.5 si endpoint Python pas livré
  (cf spec §7 Phase 6 + recon B1 §4)
- Si endpoint OK :
  - Edge Function `compute-dilution-monte-carlo`
  - Server Action `runMonteCarloExit`
  - Page `/dashboard/captable/exit-simulator` avec violin plot
- Vérification curl explicite avant d'attaquer (pattern V3 user)
