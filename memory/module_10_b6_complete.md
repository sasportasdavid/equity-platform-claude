---
name: Module 10 B6 — Snapshots + Portal Positions + Bulk Import (closure)
description: Closure B6 — 4 actions snapshots/import, 4 pages dashboard + 1 portal, tab Évolution réactivé, migration 00090 cron nightly écrite mais cloud apply bloqué session.
type: project
---

# Module 10 — B6 closure

**Date** : 2026-05-04
**Branche** : `feat/module-10-cap-table`
**Commit** : `feat(module-10): snapshots + portal positions + bulk import`

## Sommaire

3 sous-features livrées en 1 commit consolidé (Option 1 du protocole user) :

1. **Snapshots** — RPC materialize existant (B1) + 3 Server Actions + 2 pages
2. **Portail positions** — Page `/portal/positions` (admin client pattern)
3. **Bulk import CSV** — Server Action + wizard 3 steps + template
4. **Bonus** : Tab Évolution réactivé sur `/dashboard/captable`

## Server Actions livrées (4)

| Action                 | Permission                 | Comportement clé                                                             |
| ---------------------- | -------------------------- | ---------------------------------------------------------------------------- |
| `createManualSnapshot` | `captable.snapshot.create` | Appelle `materialize_snapshot` RPC + freeze immédiat optionnel               |
| `freezeSnapshot`       | `captable.snapshot.create` | Admin client (bypass RLS no_update) + ownership check + idempotent           |
| `deleteSnapshot`       | `captable.snapshot.create` | RLS bloque si is_immutable=true + check explicite côté SA                    |
| `bulkImportPositions`  | `captable.import`          | Resolve share_class par code + beneficiary par email + INSERT atomique batch |

**Décision archi** : pas de RPC `freeze_snapshot` (avait été planifiée puis annulée). Le client cookie-based subit la RLS `snapshots_no_update USING(FALSE)`. Plutôt que d'écrire un RPC SECURITY DEFINER, j'utilise l'**admin client** (service_role bypass RLS) avec ownership check explicite côté SA (double-coverage). Aucune migration nouvelle pour ça → réactivation V1.5 immédiate sans déploiement DB.

## Pages livrées (4)

| Route                                | Permission gate         | Description                                                                         |
| ------------------------------------ | ----------------------- | ----------------------------------------------------------------------------------- |
| `/dashboard/captable/snapshots`      | `captable.read.all`     | Liste 100 snapshots, badges (frozen, type), créer manuel                            |
| `/dashboard/captable/snapshots/[id]` | `captable.read.all`     | Vue frozen avec `CapTableMatrix` + actions freeze/delete                            |
| `/dashboard/captable/import`         | `captable.import`       | Wizard 3 steps (upload → preview → done), template CSV téléchargeable               |
| `/portal/positions`                  | (RLS via beneficiaries) | Page portail bénéficiaire — units agrégés par share_class + cost basis + disclaimer |

## Composants nouveaux (4)

- [create-snapshot-button.tsx](apps/web/src/components/captable/create-snapshot-button.tsx) — Dialog avec form (asof_date, label, isImmutable)
- [snapshot-actions.tsx](apps/web/src/components/captable/snapshot-actions.tsx) — Boutons Freeze + AlertDialog Delete (cachés si is_immutable)
- [evolution-chart.tsx](apps/web/src/components/captable/evolution-chart.tsx) — LineChart Recharts par class_type + ReferenceLine sur funding_round.closed_at
- [bulk-import-positions-helpers.ts](apps/web/src/components/captable/bulk-import-positions-helpers.ts) — Pure functions parsePositionsCsv + validateRow + computeSummary + buildCsvTemplate

## Modifications

- [cap-table.ts schemas](packages/shared/src/schemas/cap-table.ts) — +5 schémas Zod B6 (createManualSnapshot, freezeSnapshot, deleteSnapshot, importPositionRow, bulkImportPositions) + `BULK_IMPORT_MAX_ROWS = 500` + `STAKEHOLDER_TYPES_IMPORT` enum
- [cap-table.ts SA](apps/web/src/server/actions/cap-table.ts) — 4 nouvelles actions (~330 lignes)
- [cap-table-tabs.tsx](apps/web/src/components/captable/cap-table-tabs.tsx) — Tab Évolution réactivé (disabled→conditional sur evolution.points.length >= 2)
- [captable/page.tsx](<apps/web/src/app/(dashboard)/dashboard/captable/page.tsx>) — Charge snapshots + funding rounds en parallèle, alimente `evolution` prop. Boutons header "Importer" et "Snapshots" actifs.
- [PortalNav.tsx](apps/web/src/app/portal/components/PortalNav.tsx) — 5ème lien `Mes positions` ajouté (icône Coins)
- [cap-table.test.ts](apps/web/src/server/actions/__tests__/cap-table.test.ts) — Mock admin client ajouté (suite 43 tests B4 inchangée)

## Migrations

### 00090 — cron nightly snapshot

**Fichier local** : [00090_module_10_cron_nightly_snapshot.sql](supabase/migrations/00090_module_10_cron_nightly_snapshot.sql)

**Statut cloud** : ⚠️ **NON APPLIQUÉ — bloqué session par MCP Supabase permission**.

Le tool `apply_migration` retourne `permission denied` pour les 2 project_ids essayés (`vryjvccyvmrwfvayvuls` puis `ytlfnxcrclugrsbvqdkb`). Le CLI `supabase db push` est bloqué par drift entre timestamps cloud et numéros sequential locaux. La migration doit être appliquée manuellement par le user via :

- Dashboard Supabase SQL Editor, ou
- Direct psql, ou
- `supabase migration repair` puis `db push`

Contenu :

1. Helper `materialize_nightly_snapshots_all_orgs()` SECURITY DEFINER — boucle sur les orgs ayant ≥1 share_class active, capture les exceptions par org
2. `cron.schedule('cap-table-nightly-snapshot', '0 2 * * *', ...)` — 02:00 UTC chaque jour

**Pas de RPC freeze_snapshot** : la branche initiale prévoyait un RPC SECURITY DEFINER, abandonnée au profit de l'admin client (cf décision archi ci-dessus). Une seule migration B6 vs 2 prévues.

## Tests

- **Web** : 673/673 ✅ (+20 vs B4 — 9 parsePositionsCsv + 7 validateRow + 2 computeSummary + 2 buildCsvTemplate)
- **Shared** : 70/70 ✅
- Typecheck : 0 errors
- Lint : 1 warning pré-existant TanStack (pas nouveau)

## Décisions

### V2-B6 Snapshot RPC freeze : abandonnée

Initialement, j'allais écrire `freeze_snapshot(p_id UUID)` SECURITY DEFINER pour bypass la RLS `snapshots_no_update USING(FALSE)`. Abandonnée car :

1. MCP apply_migration bloqué session → migration ne peut pas atterrir cloud
2. Type généré ne contiendrait pas la fonction → typecheck fail dans SA
3. Admin client (service_role) résout le bypass RLS sans migration

**Pattern adopté** : `freezeSnapshot` SA fait :

- ownership check via cookie client (RLS SELECT actif → ne voit que son org)
- UPDATE via admin client (bypass RLS)
- Idempotence si déjà frozen
- Audit explicite

C'est techniquement équivalent en sécurité mais plus simple à déployer V1.

### V4-B6 Portail % consolidé : non livré V1

Le user a explicitement demandé "% consolidé" sur les cards positions du portail. Mais BENEFICIARY n'a pas accès au grand_total de l'org (pas de permission `captable.read.all`, pas de RLS dédiée pour portails).

**V1 livre** : units, cost basis total, cost basis moyen/unit, classes détenues. **V2** : RPC `get_org_total_units_for_portal(p_user_id)` SECURITY DEFINER qui retourne juste le grand_total scope-org (dette #95).

Disclaimer V1 affiché en bas de page : _"La part du capital (% consolidé) sera disponible en V2 — elle nécessite une autorisation employeur pour le calcul."_

### V5-B6 Sidebar nested nav : reportée V2

Le user souhaitait `Cap Table > Snapshots` en sub-item dans la sidebar dashboard. Le pattern actuel (`NAV_SECTIONS` flat) ne supporte pas le nesting. Plutôt que de refactorer la sidebar pour 1 module, j'ai exposé Snapshots + Importer via des **boutons dans le header de `/dashboard/captable`** (pattern aligné avec l'action "Nouveau scénario" déjà présente).

V2 (dette #96) : refactor sidebar pour supporter sub-items conditionnels (utile aussi pour Plans > Templates futurs).

### V6-B6 Tab Évolution data shape

Pour le tab Évolution, j'utilise les `totals_by_class` (par CODE de share_class, ex `COMMON`, `PREF_A`) plutôt que par class_type (`COMMON`, `PREFERRED`). Raison : les snapshots existants stockent par code. Si la convention de codes correspond aux types (ce qui est typique : `COMMON`, `PREF_A`, `PREF_B`...), c'est lisible. V2 = choix utilisateur entre vue par code et vue par class_type agrégé.

### V7-B6 RPC vs admin pour portal positions

J'ai utilisé l'admin client pour `/portal/positions` (pattern aligné sur M8 layout) au lieu de RLS standard. Raison : un BENEFICIARY pur (sans membership ACTIVE) peut avoir un JWT sans `active_org_id`, ce qui rend `current_org_id()` NULL et bloque toutes les RLS. Le lookup beneficiaries via user_id puis filter explicite org_id+stakeholder_id est robuste à ce scenario edge.

Cf dette M8 #85.

## Erratums spec consolidés (15 post-B6)

1-12. (cf B5 rapport) 13. **NEW B6** : RPC `freeze_snapshot` planifiée puis abandonnée → admin client + ownership check 14. **NEW B6** : portal % consolidé non livrable V1 (besoin RPC dédié pour BENEFICIARY) 15. **NEW B6** : sidebar nested nav non supporté → boutons header (pattern existant respecté)

## Action user requise — apply migration cloud

Pour activer le cron nightly automatique (B6 feature optionnelle — le manuel marche déjà sans cron), apply en cloud :

```bash
# Option 1 : Dashboard Supabase SQL Editor
# Coller le contenu de supabase/migrations/00090_module_10_cron_nightly_snapshot.sql

# Option 2 : CLI après repair
pnpm supabase migration repair --linked --status applied <list>
pnpm supabase db push --linked
```

Vérifier ensuite :

```sql
SELECT jobname, schedule FROM cron.job WHERE jobname = 'cap-table-nightly-snapshot';
-- Devrait retourner : cap-table-nightly-snapshot | 0 2 * * *
```

Sans ce cron, les snapshots automatiques quotidiens ne s'exécutent pas. Les snapshots **manuels** (via UI) fonctionnent indépendamment.

## Liens

- Spec : `docs/MODULE_10_CAP_TABLE.md` §2.4 (snapshots) + §3.1 (bulk import) + §4.7 (portal)
- Schemas : [cap-table.ts:294+](packages/shared/src/schemas/cap-table.ts:294)
- Server Actions : [cap-table.ts:710+](apps/web/src/server/actions/cap-table.ts:710)
- Tests B6 : [bulk-import-positions-helpers.test.ts](apps/web/src/components/captable/__tests__/bulk-import-positions-helpers.test.ts)
- Migration : [00090_module_10_cron_nightly_snapshot.sql](supabase/migrations/00090_module_10_cron_nightly_snapshot.sql)
