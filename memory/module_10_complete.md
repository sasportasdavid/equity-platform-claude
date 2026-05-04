---
name: Module 10 — Cap Table Dynamique (closure complète)
description: Module 10 livré end-to-end (B1→B7) avec 7 commits, 11 migrations cloud + 1 deferred V1.5, 13 Server Actions, 9 pages, 5 compliance rules, résolution dette #3 AGA cap. PR #25 ready for review.
type: project
---

# Module 10 — Cap Table Dynamique — closure complète

**Date** : 2026-04-30 (start) → 2026-05-04 (closure B7)
**Branche** : `feat/module-10-cap-table`
**PR** : #25 (à passer ready après ce commit)
**Spec** : [docs/MODULE_10_CAP_TABLE.md](docs/MODULE_10_CAP_TABLE.md) (1936 lignes)

## 1. Synthèse 7 sous-modules

| #   | Phase                       | Commit                | LOC   | Notes                                                                                                   |
| --- | --------------------------- | --------------------- | ----- | ------------------------------------------------------------------------------------------------------- |
| B1  | DB schema + RPCs            | `c12f1c1` + `8855e7a` | ~1500 | 11 migrations 00080-00089 + 00082b corrective namespace                                                 |
| B2  | Server Actions CRUD         | `719322b`             | ~600  | 5 SA (createShareClass, updateShareClass, deactivateShareClass, createFundingRound, cancelFundingRound) |
| B3  | compute_cap_table + UI      | `3ddae42`             | ~1000 | Page principale, ValuationToggle, CapTableMatrix                                                        |
| B4  | Scénarios déterministes     | `4881b78`             | ~1500 | 4 SA scenarios + dilution-comparator + cap-table-tabs                                                   |
| B5  | Monte Carlo                 | `35f71cc`             | ~50   | DEFERRED V1.5 — endpoint Python absent → placeholder + memory                                           |
| B6  | Snapshots + Portal + Import | `23d62c6`             | ~2000 | 4 SA + 4 pages + tab Évolution réactivé                                                                 |
| B6+ | Cleanup cron + UI           | `0946d20`             | ~120  | Cron deferred V1.5, wording UI corrigé                                                                  |
| B7  | Compliance + closure        | (à venir)             | ~600  | 4 rules cap-table + activation AGA cap (dette #3) + 25 tests                                            |

**Total** : ~8 commits, **+12 165 lignes** (54 files changed) post-master.

## 2. Statistiques

### DB

- **Migrations cloud-applied** : 11 (00080→00089 + 00082b namespace correction)
- **Migrations DEFERRED V1.5** : 1 (cron nightly snapshot — voir `module_10_b6_cron_skipped.md`)
- **Tables nouvelles** : 4 (`share_classes`, `funding_rounds`, `cap_table_positions`, `dilution_scenarios`)
- **Tables ALTER** : 1 (`cap_table_snapshots` — extend existing M1)
- **RPCs nouveaux** : 3 (`compute_cap_table`, `create_funding_round`, `materialize_snapshot`)
- **Hooks DB** : 1 (`exercise_to_cap_table_hook` — Module 9 → Module 10)
- **Permissions seedées** : 14 (namespace `captable.*`)
- **RLS policies** : ~12 (positions, snapshots, scenarios, share_classes, funding_rounds)

### Code

- **Server Actions** : 13 total (B2: 5, B4: 4, B6: 4)
- **Pages dashboard** : 7 (`/captable`, `/captable/snapshots`, `/captable/snapshots/[id]`, `/captable/scenarios`, `/captable/scenarios/new`, `/captable/scenarios/[id]`, `/captable/share-classes/new`, `/captable/import`, `/captable/exit-simulator`)
- **Pages portal** : 1 (`/portal/positions`)
- **Composants nouveaux** : 11 (cap-table-matrix, valuation-toggle, cap-table-tabs, dilution-comparator, evolution-chart, create-snapshot-button, snapshot-actions, run-scenario-button, scenario-builder, share-class-form, import-wizard)
- **Compliance rules** : 5 nouvelles (4 cap-table + 1 split AGA_APPROACHING_CAP soft)
- **Edge Functions** : 0 (toutes les opérations en RPC pure SQL ou Server Action)

### Tests

- **Vitest workspace** : 698 (vs 521 pré-Module-10 = +177 nouveaux, dont +25 B7)
- **SQL tests inline** (apply_migration) : ~50 assertions cumulées B1
- **E2E manuels** : 8 scénarios documentés (B7.4 checklist) — à valider par user post-merge

## 3. Compliance V1 (B7)

### Rules livrées (5)

| Rule                         | Enforcement | Scope                                   | Status                               |
| ---------------------------- | ----------- | --------------------------------------- | ------------------------------------ |
| `SHARE_CLASS_CODE_UNIQUE`    | hard        | SHARE_CLASS_CREATE                      | NEW B7                               |
| `ROUND_AMOUNT_CONSISTENCY`   | hard        | FUNDING_ROUND_CREATE                    | NEW B7                               |
| `POOL_OVER_ALLOCATION`       | hard        | SHARE_CLASS_CREATE, POOL_TOPUP_SCENARIO | NEW B7                               |
| `ESOP_PERCENT_BEST_PRACTICE` | soft        | SHARE_CLASS_CREATE, POOL_TOPUP_SCENARIO | NEW B7                               |
| `AGA_30_PERCENT_CAP`         | hard        | AGA awards                              | **ACTIVÉE B7 (résolution dette #3)** |
| `AGA_APPROACHING_CAP`        | soft        | AGA awards                              | NEW B7 (split soft du hard)          |

### Wiring

- `createShareClass` → pre-check via `runCapTableComplianceChecks(scope=SHARE_CLASS_CREATE)`
- `createFundingRound` → pre-check via `runCapTableComplianceChecks(scope=FUNDING_ROUND_CREATE)`
- `runComplianceChecks` (Module 3b) → charge maintenant `companyTotalShares` + `agaAllocatedTotal` via `compute_cap_table` pour les plans AGA

## 4. Décisions architecturales

### Module-level

1. **Namespace `captable.*` (M1)** vs `cap_table.*` (spec) → **Option D refondue** + migration corrective 00082b. Préserve les permissions M1 préfigurées.

2. **B5 Monte Carlo DEFERRED V1.5** : endpoint Python `/compute/dilution-monte-carlo` absent côté `equity-gem-quant-tonnom.fly.dev` (HTTP 404 confirmé 2026-05-04). Page placeholder + permission seedée + schema Zod prêts pour V1.5. Spec endpoint à transmettre au mainteneur Fly (memory `module_10_b5_skipped.md`).

3. **B6 cron nightly snapshot DEFERRED V1.5** : Option β arbitrage user — migration supprimée du repo plutôt que dette flottante. SQL conservé en memory `module_10_b6_cron_skipped.md` pour V1.5. UI mise à jour : "Snapshots quotidiens automatiques disponibles V1.5".

4. **Pas de RPC `freeze_snapshot`** : RLS `snapshots_no_update USING(FALSE)` bypassée via admin client (service_role) avec ownership check explicite côté SA. Sécurité équivalente, pas de migration nécessaire.

5. **Permission `captable.scenario.update` non créée** : `updateScenario`/`deleteScenario` mappent sur `captable.scenario.create` + ownership check (RLS owner-only en doublon). Mapping volontaire et permanent V1 (pas de mini-migration 00089b — éviter le couplage code+DB).

6. **Portal `/portal/positions` sans % consolidé** : BENEFICIARY n'a pas accès au grand_total org (RLS scope-confidentialité). Disclaimer V1 affiché. V2 = RPC `get_my_position_with_org_total(p_beneficiary_id)` qui retourne uniquement `{ my_units, my_percent }` pré-calculé scope-org.

7. **Sidebar nested nav reportée V2** : pattern `NAV_SECTIONS` flat. Snapshots + Importer exposés via boutons dans header de `/dashboard/captable`.

8. **Portal positions admin client (pas RLS)** : pour robustesse BENEFICIARY pur sans `active_org_id` JWT (cf dette M8 #85), on lookup beneficiaries via user_id puis filter explicite par stakeholder_id+org_id.

9. **AGA_30_PERCENT_CAP split en 2 rules** : hard error (>30%) + soft warning (>27%). Le runner bucket par `rule.enforcement`, pas par `issue.severity`, donc la séparation est nécessaire pour avoir un soft warning.

10. **Tab Évolution conditionnel** : disabled tant que < 2 snapshots dans la DB, avec tooltip explicatif. UX propre, pas de chart vide trompeur.

## 5. Erratums spec consolidés (15)

À patcher post-merge dans `docs/MODULE_10_CAP_TABLE.md` :

1. Namespace `captable.*` (M1 préfiguré) ≠ `cap_table.*` (spec) → préserver M1
2. `approval_workflows.scope` n'existe pas → `applies_to`
3. Zod `z.input<>` requis pour 5 schémas avec `.default()` (createShareClass, createFundingRound, createScenario, runMonteCarloExit, getCapTableInput)
4. `EditorialWaterfallDatum` shape `label`/`type: 'positive'|'negative'|'total'` (pas `name`/`gain`)
5. RSC purity : `new Date()` au top-level (pas `Date.now()` dans render)
6. CTA empty state share class → page minimale créée (`/captable/share-classes/new`)
7. Permission `captable.scenario.update` absente du seed 00089 → mapped sur `scenario.create` + ownership
8. Permission `captable.scenario.delete` requiert `is_admin=TRUE` (vs read/create open all)
9. Tab "Évolution" disabled visible avec title tooltip (pas caché)
10. Waterfall = distribution units par stakeholder (top 10), pas waterfall financier d'exit
11. Cache 24h `runScenario` invalidé par `updateScenario` via `result_cache=null`
12. Endpoint Python `/compute/dilution-monte-carlo` absent → B5 deferred V1.5
13. RPC `freeze_snapshot` planifiée puis abandonnée → admin client
14. Portal % consolidé non livrable V1 sans RPC dédié BENEFICIARY
15. Cron nightly snapshot deferred V1.5 (MCP apply blocked)

Bonus : `AGA_APPROACHING_CAP` séparé en rule soft autonome (vs warning embedded dans AGA_30_PERCENT_CAP de la spec) — cohérence avec le runner enforcement bucketing.

## 6. Dettes V2 ouvertes

- **#88** Module 10 B5 V1.5 — endpoint Python `/compute/dilution-monte-carlo`
- **#89** Permission `captable.scenario.update` (mapping volontaire V1)
- **#90** Cron nightly snapshot DEFERRED V1.5 (Dashboard SQL Editor)
- **#91** Pas de RPC `freeze_snapshot` (admin client)
- **#92** Portal sans % consolidé V1 (V2 RPC `get_my_position_with_org_total`)
- **#93** Sidebar nested nav non supporté (boutons header à la place)

**6 dettes V2 ouvertes** documentées dans CLAUDE.md (#88-#93).

## 7. Dettes résolues

- **#3 AGA_30_PERCENT_CAP** ✅ — ctx loader branché dans `runComplianceChecks` pour plans AGA. Rule active hard + soft warning séparé. 9 tests Vitest verts (5 hard + 4 soft).

## 8. Action mainteneurs externes

### A. Fly.io (mainteneur engine Python `equity-gem-quant-tonnom`)

Pour activer B5 V1.5 (simulateur Monte Carlo de sortie) :

- Implémenter `POST /compute/dilution-monte-carlo`
- Spec input/output : `memory/module_10_b5_skipped.md` §2
- Réutiliser secret `QUANT_ENGINE_API_KEY`
- Cible perf : 10K paths × 50 stakeholders < 30s
- Bump `engine_version` 2.6.0 → 2.7.0
- Notifier sasportasdavid@gmail.com

### B. Supabase Dashboard (mainteneur DB)

Pour activer B6 cron nightly snapshot V1.5 :

- Ouvrir Dashboard SQL Editor (project `ytlfnxcrclugrsbvqdkb`)
- Coller le SQL de `memory/module_10_b6_cron_skipped.md` §1
- Vérifier : `SELECT jobname, schedule FROM cron.job WHERE jobname = 'cap-table-nightly-snapshot';`
- Mettre à jour les 3 wordings UI ("V1.5" → "automatique nocturne 02:00 UTC")

## 9. E2E checklist (à exécuter par user)

8 scénarios de validation E2E manuel post-merge :

1. ☐ Création share_class COMMON via `/dashboard/captable/share-classes/new` → INSERT cap_table_positions trigger ne plante pas
2. ☐ Exercise FULLY_PAID Module 9 → position auto-créée dans `cap_table_positions` (via hook 00088). **Raccourci SQL acceptable** : UPDATE manuel `exercise_requests.status='COMPLETED'` sur un award test, vérifier la matrice cap table
3. ☐ Création round Series A via Server Action `createFundingRound` → snapshot post-round généré (via `materialize_snapshot` interne au RPC)
4. ☐ Scénario NEW_ROUND via `/dashboard/captable/scenarios/new` → matrice avant/après cohérente dans `dilution-comparator`
5. ☐ Snapshot manuel via `/dashboard/captable/snapshots` (bouton "Créer un snapshot") + freeze → impossible delete
6. ☐ Bulk import 50 lignes via `/dashboard/captable/import` → atomique + visible dans matrice
7. ☐ BENEFICIARY voit `/portal/positions` avec ses positions uniquement (RLS scope-via-admin)
8. ☐ AGA_30_PERCENT_CAP rejette un award AGA qui dépasse 30% — test avec org ayant cap table (≥1 share_class créée)

→ Si l'un échoue, ne pas merger sans investigation.

## 10. Patterns notables introduits

- **Cache 24h scenarios** : `result_cache JSONB` + `result_computed_at` + invalidation via `update*` actions (pattern réutilisable pour autres compute coûteux)
- **Discriminated union scenarios** : Zod `z.discriminatedUnion('scenarioType', [...])` permet de typer fortement les 4 variants déterministes côté client + serveur
- **Helper SQL `materialize_nightly_snapshots_all_orgs()`** (deferred V1.5) : pattern boucle SECURITY DEFINER avec exception capture par org pour cron multi-tenant
- **Admin client + ownership check explicit** : alternative légitime au RPC SECURITY DEFINER quand RLS bloque les UPDATE intentionnels (`snapshots_no_update USING(FALSE)`)
- **Compliance pre-check dans Server Action** : `runCapTableComplianceChecks` appelé avant l'INSERT/RPC business logic, retourne hard errors comme `{ ok: false, error }`

## 11. PR #25 — état final

- Branche : `feat/module-10-cap-table` (8+ commits)
- Description PR : à actualiser avec liste 7 commits B1-B7 + dettes
- Status : draft → **ready for review** (post-commit B7)
- Reviewers : sasportasdavid@gmail.com (David Sasportas)
- Ne pas auto-merge — attendre arbitrage user

## 12. Rappels post-merge

1. Patcher `docs/MODULE_10_CAP_TABLE.md` avec les 15 erratums (§5 ci-dessus)
2. Coordonner avec mainteneurs externes (Fly engine + Supabase DB) pour V1.5 activations
3. Compléter les 8 E2E checks (§9) avant un éventuel push staging
4. Module 11 (IFRS 2 finalisation) pourra réutiliser le ctx loader cap table B7
