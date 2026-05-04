# Module 10 — Cap Table Dynamique — RECON B1

Date : 2026-05-04
Branche : `feat/module-10-cap-table` (depuis master à `94c9a0d`)
Spec : `docs/MODULE_10_CAP_TABLE.md` (1936 lignes)

## 1. État Git / pre-checks

- ✅ Branche `feat/module-10-cap-table` créée depuis master
- ✅ Master HEAD = `94c9a0d` (PR #23 — fix EODHD ticker mapping)
- ✅ Modules 1-9 mergés sur master (jusqu'à PR #18 Module 9 B5)
- ✅ PR #19 (payload V2) + PR #20/#23/#24 (cleanup) mergés
- ⏳ PR #21 et PR #22 toujours OPEN (test branch `test-pr21-and-pr22-e2e`),
  pas dans master. Pas bloquant pour Module 10 mais à noter.
- ✅ `pnpm typecheck` : 0 erreur
- ✅ `pnpm test` : web 603/603 + shared 70/70 verts

## 2. État DB (Supabase cloud `ytlfnxcrclugrsbvqdkb`)

### Tables Module 10 — recensement (5 attendues par spec)

| Table                 | État cloud                         | Action B1                        |
| --------------------- | ---------------------------------- | -------------------------------- |
| `share_classes`       | **ABSENTE**                        | CREATE en migration 00080        |
| `funding_rounds`      | **ABSENTE**                        | CREATE en migration 00081        |
| `cap_table_positions` | **ABSENTE**                        | CREATE en migration 00082        |
| `cap_table_snapshots` | **PRÉSENTE** (préfigurée Module 1) | ALTER en 00083 ou rebase complet |
| `dilution_scenarios`  | **ABSENTE**                        | CREATE en migration 00084        |

### `cap_table_snapshots` — schéma actuel (Module 1 préfiguré)

11 colonnes :

- `id` UUID PK
- `org_id` UUID NOT NULL
- `company_id` UUID NOT NULL
- `snapshot_date` DATE NOT NULL
- `snapshot_type` TEXT NOT NULL
- `trigger_event` TEXT
- `data` JSONB NOT NULL
- `total_shares_outstanding` BIGINT
- `total_shares_fully_diluted` BIGINT
- `created_at` TIMESTAMPTZ NOT NULL
- `created_by` UUID

⚠️ **Écart vs spec §2.4** : la spec attend probablement des colonnes
supplémentaires (snapshot_label, is_immutable, scenario_id ?). À aligner
en migration 00083 par ALTER TABLE ADD COLUMN IF NOT EXISTS — pas de
CREATE TABLE qui casserait la table existante. Le `data JSONB` peut
contenir l'essentiel pour V1 si besoin.

→ **Décision recon** : faire un `ALTER TABLE` ADD-only en 00083 plutôt
qu'un CREATE en 00082 comme suggéré par la spec. À valider avec user.

### Migrations existantes

Dernière migration appliquée cloud : `20260503180414` (= `00075_module_3a_patch_create_plan_full_market_data.sql`).

Migrations locales 00056-00075 cohérentes. Pas de drift cloud-only.

### Permissions actuelles

Recherche `cap_table.%`, `share_classes.%`, `funding_rounds.%`,
`dilution_scenarios.%` dans `permissions_catalog` :

→ **0 permissions seedées**. Aucune préfiguration Module 1 pour les
permissions Module 10. À créer entièrement en migration 00089.

## 3. État design system (PR #12)

### Composants captable attendus par spec §0.2 / §1.4

| Composant                 | État                                                                  | Note                               |
| ------------------------- | --------------------------------------------------------------------- | ---------------------------------- |
| `cap-table-matrix.tsx`    | **ABSENT**                                                            | Spec dit "déjà créé PR #12" — faux |
| `valuation-toggle.tsx`    | **ABSENT**                                                            | Idem                               |
| `editorial-waterfall.tsx` | ✅ PRÉSENT (`apps/web/src/components/charts/editorial-waterfall.tsx`) | OK                                 |

### Dossier `apps/web/src/components/captable/`

- Existe avec uniquement `.gitkeep` (0 fichier réel)

### Page placeholder

- `apps/web/src/app/(dashboard)/dashboard/captable/page.tsx` existe en stub
  ("Module à venir post-Module 3"). À remplacer en B3.

⚠️ **Écart spec vs réalité** : la spec mentionne en §0.2 que les composants
`cap-table-matrix`/`valuation-toggle` sont "déjà créés" en PR #12. C'est
inexact : seul `editorial-waterfall` existe. Il faudra **créer** les 2
autres composants en B3/B4 plutôt que de les "enrichir".

→ **Décision recon** : créer `cap-table-matrix.tsx` et `valuation-toggle.tsx`
en Phase 4 (B3) en même temps que la page principale. Pas un blocker mais
1-2 commits supplémentaires à prévoir vs la spec.

## 4. État Python engine (Fly.io)

- Endpoint `/compute/multi-tranche` : ✅ existant (Module 3a B5)
- Endpoint `/compute/dilution-monte-carlo` : **ABSENT** (à coordonner avec
  maintainer Fly app `equity-gem-quant-tonnom`)

→ **Décision recon** : Phase B5 (Python Monte Carlo) potentiellement
**bloquée** si l'endpoint n'est pas livré côté Python. Spec §7 Phase 6 dit :
"Si endpoint not OK : skip B5 V1, marquer comme dette V1.5". J'applique ce
fallback s'il n'est pas livré au moment d'arriver à B5.

## 5. État compliance V1 — dette #3

`apps/web/src/lib/compliance/rules/awardRules.ts:10` mentionne déjà
`AGA_30_PERCENT_CAP` comme rule existante mais `runChecks.ts:142` confirme :

```typescript
// V1 : on ne charge pas la cap table — AGA_30_PERCENT_CAP retournera null
companyTotalShares: null,
```

→ Dette #3 confirmée. À résoudre en Phase B7 (Module 10 closure) en
chargeant `companyTotalShares` via `compute_cap_table()`.

## 6. Composants désignés du Design System (état réel)

Dossiers `apps/web/src/components/charts/` :

- ✅ `editorial-area-chart.tsx`
- ✅ `editorial-bar-chart.tsx`
- ✅ `editorial-line-chart.tsx`
- ✅ `editorial-pie-chart.tsx`
- ✅ `editorial-waterfall.tsx`
- `index.ts`, `shared.tsx`

→ Les 4 charts éditoriaux + waterfall sont disponibles pour la page
principale (Tab Tableau / Camembert / Waterfall / Évolution).

## 7. Module 8 / Module 9 — closures de référence

- `memory/module_8_complete.md` : **ABSENT côté projet**, présent en
  user-level memory (auto-memory MEMORY.md). Module 8 mergé via PR #11.
- `memory/module_9_complete.md` : **ABSENT côté projet**. Sub-blocks
  présents (`module_9_b1_complete.md` → `module_9_b5_complete.md`).
  Module 9 mergé via PR #18 (commit `c2b1b17`).

→ Pas un bloqueur — la closure globale de M9 vit dans les sub-blocks +
auto-memory. À noter : Module 10 devrait produire un `module_10_complete.md`
final (pas seulement des sub-blocks).

## 8. 5 questions / arbitrages user avant B2

### Q1 — `cap_table_snapshots` existante : ALTER ou CREATE ?

La table existe déjà (Module 1 préfiguré, 11 cols). La spec §2.4 attend
une CREATE en 00083. Trois options :

- **Option A (safe ADD-only)** : ALTER TABLE ADD COLUMN IF NOT EXISTS en
  00083 pour ajouter les colonnes manquantes (snapshot_label, is_immutable,
  scenario_id, etc.). Garde les éventuelles données existantes.
- **Option B (DROP + CREATE)** : DROP TABLE + CREATE TABLE en 00083, plus
  propre mais perd les données. À valider qu'aucune org en cloud n'a déjà
  de snapshots (probable mais à vérifier).
- **Option C (rebase doc spec)** : adapter la spec §2.4 au schéma existant
  - ALTER ADD-only.

→ **Reco** : Option A. Préserve les données potentielles + risque minimum.

### Q2 — Composants design system manquants : créer maintenant ou plus tard ?

`cap-table-matrix.tsx` + `valuation-toggle.tsx` n'existent pas. La spec
suppose qu'ils existent. Options :

- **Option A** : les créer en début de B3 (Phase 4) au moment où on en a
  besoin pour la page principale. ~150 LOC supplémentaires sur ce commit.
- **Option B** : les créer en commit séparé "design system enrichment"
  AVANT B3, pour respecter le pattern "design d'abord, code business
  ensuite".

→ **Reco** : Option A. Pas de cost-benefit à isoler.

### Q3 — Endpoint Python `/compute/dilution-monte-carlo` : skip B5 ou attendre ?

Pas livré côté Fly.io. La spec autorise le skip V1 :

- **Option A (skip)** : marquer B5 comme dette V1.5 et passer directement
  à B6 (snapshots / portal). Le Module 10 V1 sort sans Monte Carlo de
  sortie. PR mergée plus vite.
- **Option B (attendre)** : bloquer le PR jusqu'au livraison Python. Risque
  de blocage indéfini.

→ **Reco** : Option A (skip si toujours absent à B5). Documenter dans
`memory/module_10_complete.md` + dette technique CLAUDE.md.

### Q4 — Migration 00089 (seed permissions) : OWNER+ADMIN_HR mappings ?

La spec §2.10 ne précise pas tous les role mappings. À valider :

- `cap_table.read.all` → OWNER + ADMIN_HR + ADMIN_FINANCE ?
- `cap_table.read.own` → BENEFICIARY (lecture seule de ses positions) ?
- `share_classes.create/update/deactivate` → OWNER + ADMIN_FINANCE ?
- `funding_rounds.create` → OWNER (workflow approval Module 5) ?
- `dilution_scenarios.create` → OWNER + ADMIN_HR ?

→ **Reco par défaut** : suivre le pattern Module 5/6 (OWNER + ADMIN_HR pour
les actions cap-table critiques, BENEFICIARY pour read.own). À valider.

### Q5 — Reporting / cadence

La spec §7 Phase 8 demande un reporting tous les 2 phases (B1+B2, B3+B4,
B5+B6, B7). À confirmer :

- ✅ Format strict défini dans la spec
- 🤔 Le user veut-il aussi un STOP avant B3 (UI commitment) ? Ou enchaînement
  automatique B1 → B2 → reporting ?

→ **Reco** : enchaîner B1+B2 sur "go B2" puis reporter avant B3 (pour valider
l'architecture Server Actions avant de toucher l'UI). Ensuite enchaîner B3+B4
puis reporter. STOP avant B5 (potentielle blocage Python).

## 9. Workflow git proposé

| Phase                     | Commit                                                                                   | Push | PR Status        |
| ------------------------- | ---------------------------------------------------------------------------------------- | ---- | ---------------- |
| B1 (DB schema)            | `feat(module-10): db schema cap table (00080-00089)`                                     | ✅   | draft            |
| B2 (Server Actions CRUD)  | `feat(module-10): share classes + funding rounds server actions`                         | ✅   | draft            |
| **REPORTING B1+B2**       | (chat)                                                                                   | —    | —                |
| B3 (compute + UI matrice) | `feat(module-10): compute cap table + main page`                                         | ✅   | draft            |
| B4 (scénarios)            | `feat(module-10): dilution scenarios deterministic`                                      | ✅   | draft            |
| **REPORTING B3+B4**       | (chat)                                                                                   | —    | —                |
| B5 (Python MC ou skip)    | `feat(module-10): exit simulator monte carlo integration` ou `chore(module-10): skip B5` | ✅   | draft            |
| B6 (snapshots + portal)   | `feat(module-10): snapshots + portal positions + import`                                 | ✅   | draft            |
| **REPORTING B5+B6**       | (chat)                                                                                   | —    | —                |
| B7 (compliance + closure) | `feat(module-10): compliance + closure`                                                  | ✅   | ready-for-review |

## 10. Synthèse — STOP avant B2

**Pas de blocker critique.** 5 décisions à valider par user avant migration
00080 (Q1-Q5 ci-dessus). Sans réponse, j'applique les recommandations
"Reco" par défaut, mais préfère un GO explicite vu l'impact sur la PR.

**État global** : prêt à attaquer B1 (migrations 00080-00089) après go.
