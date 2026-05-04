# Module 10 B2 — Server Actions cap-table CRUD

**Phase B2 livrée** — 5 Server Actions + 22 tests Vitest + sandbox 4 presets.

## Vérifications préalables (Q1 + Q3)

### Q1 — `exercise_requests.status = 'COMPLETED'` timing

**Vérifié** dans `supabase/migrations/00065_module_9_rpc_confirm_payment_cancel.sql:57` :

```sql
SET status = 'COMPLETED', payment_received_at = p_payment_received_at, completed_at = now()
```

→ La transition `SIGNED → COMPLETED` n'arrive QU'APRÈS confirmation paiement
effectif via le RPC `confirm_payment` (Module 9 B1). Donc le hook 00088
`on_exercise_payment_confirmed` crée bien la position cap_table **après**
réception paiement. ✅ **Pas de bug** d'émission prématurée.

### Q3 — 18 perms `captable.*` exactes (post-00089 cloud apply)

| Type          | Count | Codes                                                                                                                                                                                                                       |
| ------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Legacy M1** | 4     | `captable.read`, `captable.export`, `captable.simulate`, `captable.edit`                                                                                                                                                    |
| **Module 10** | 14    | `captable.read.{all,own}`, `captable.share_class.{create,update,deactivate}`, `captable.round.{read,create,cancel}`, `captable.scenario.{read,create,run_montecarlo,delete}`, `captable.snapshot.create`, `captable.import` |

**14 nouvelles** (1 de plus que namespace cible original = `captable.share_class.deactivate`
ajouté pour le pattern soft-delete via Server Action `deactivateShareClass`).

## Livrables B2

### Schémas Zod (`packages/shared/src/schemas/cap-table.ts`, 254 lignes)

- `createShareClassSchema` (refines pool_only_for_esop + participating_capped)
- `updateShareClassSchema` (partial sans classType/code immutables)
- `createFundingRoundSchema` (refine sum(units)\*price ≈ amount à ±1%)
- `cancelFundingRoundSchema` (id + reason min 3 chars)
- 4 schémas scenario (NEW_ROUND / POOL_TOPUP / BULK_EXERCISE / EXIT) +
  discriminated union `createScenarioSchema` (B4 préempté)
- `runMonteCarloExitSchema` (B5 préempté)
- `getCapTableInputSchema` (B3 préempté)

**Note pattern** : `z.input<>` sur les types Input (defaults Zod optionnels
côté caller) vs `z.infer<>` qui aurait forcé tous les défauts comme requis.
Discovered en typecheck + corrigé.

### Server Actions (`apps/web/src/server/actions/cap-table.ts`, 410 lignes)

5 actions wrappées en `'use server'` :

| Action                 | Permission                        | Pattern                                                                                  |
| ---------------------- | --------------------------------- | ---------------------------------------------------------------------------------------- |
| `createShareClass`     | `captable.share_class.create`     | INSERT direct + `logAuditEvent('captable.share_class_created')`                          |
| `updateShareClass`     | `captable.share_class.update`     | UPDATE diff + `logAuditEvent` (before/after states)                                      |
| `deactivateShareClass` | `captable.share_class.deactivate` | Soft-delete `is_active=FALSE` + check 0 positions actives                                |
| `createFundingRound`   | `captable.round.create`           | RPC `create_funding_round` (atomic) — audit dans le RPC, pas dupliqué côté Server Action |
| `cancelFundingRound`   | `captable.round.cancel`           | UPDATE status DRAFT/PENDING_APPROVAL → CANCELLED + `logAuditEvent` (refus si CLOSED)     |

**Pattern Result** : `{ ok: true, ...data } | { ok: false, error: string }`.
Validation Zod systématique avec `validationError(err)` helper.

**Hook Module 5 V1 (createFundingRound)** : check présence `approval_workflows`
avec `applies_to='FUNDING_ROUND_CREATE'`. Si présent → reject avec message
explicite (V2 = vrai routage approval). Si absent → INSERT direct via RPC
(`status='CLOSED'`).

**Erratum spec** : la spec utilisait `scope='funding_rounds.create'` mais
la table `approval_workflows` a une colonne `applies_to TEXT` (pas `scope`).
Vérifié via `information_schema.columns`.

### Tests Vitest (`apps/web/src/server/actions/__tests__/cap-table.test.ts`, 22 tests)

| Action                     | Cas testés                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `createShareClass` (5)     | happy + Zod pool_only_for_esop (deux sens) + Zod code regex + DB 23505                   |
| `updateShareClass` (4)     | happy + 404 + empty update + Zod id                                                      |
| `deactivateShareClass` (3) | happy 0 positions + refus N positions + Zod id                                           |
| `createFundingRound` (4)   | happy RPC + Zod sum mismatch + workflow blocker + DB error                               |
| `cancelFundingRound` (6)   | happy DRAFT + happy PENDING_APPROVAL + refus CLOSED + refus CANCELLED + 404 + Zod reason |

**Pattern mock** : `vi.hoisted` pour partager state entre `vi.mock` factories

- tests. Mock builder chainable émulant `supabase.from()` + `.select()` +
  `.eq()` + `.maybeSingle()` + `.insert()` + `.update()` + `.rpc()`.

### Sandbox `/dev/cap-table-builder`

`page.tsx` (Server Component) charge :

- 20 dernières share_classes (active + inactive)
- 10 dernières funding_rounds
- 50 positions actives
- 20 derniers audit_events `captable.*`

`sandbox.tsx` (Client Component) expose **4 presets** :

1. **Startup post-Seed** : crée COMMON + ESOP classes
2. **Series A** : crée Preferred A + Series A round 5M€ avec 2 lead VCs
3. **Cancel last DRAFT** : annule la dernière round DRAFT créée
4. **Deactivate last share class** : soft-delete la dernière share class active

Logs colorés (Badge `default` / `destructive`) + JSON pretty-print du Result
`{ok|error}` retourné par chaque Server Action.

⚠️ **Les presets écrivent dans la DB cloud** — usage limité aux orgs de test.
Note dans le sandbox.

### Permissions TS (`packages/shared/src/constants/permissions.ts`)

+14 codes ajoutés à l'union `Permission` (sinon `requirePermission(...)` fail
le typecheck strict). Les 4 codes legacy M1 restent inchangés.

## Erratums spec détectés en B2

1. **`approval_workflows.scope`** → réelle colonne = `applies_to`. Vérifié via
   schema introspection.
2. **`z.infer<>` vs `z.input<>`** : pas dans la spec mais critique pour le
   typecheck Server Action. Tous les types Input utilisent `z.input<>`.

## Tests workspace post-B2

|                | Avant B2 (post B1) | Après B2      |
| -------------- | ------------------ | ------------- |
| apps/web tests | 603                | **625** (+22) |
| shared tests   | 70                 | 70            |
| Typecheck      | 0 erreur           | 0 erreur      |

## Garde-fous appliqués

- ✅ Pattern Result `{ ok: true, ...data } | { ok: false, error: string }` (CLAUDE.md)
- ✅ Validation Zod systématique (`safeParse` + `validationError()`)
- ✅ `logAuditEvent` Server Action (pas trigger DB) — événements
  `captable.share_class_{created,updated,deactivated}` + `captable.round_cancelled`
- ✅ Permission via `requirePermission('captable.X.Y')` qui appelle
  `has_permission()` côté DB
- ✅ Hook Module 5 routing (passthrough V1, V2 = vrai routage approval)
- ✅ Sandbox `/dev/cap-table-builder` avec 4 presets
- ✅ TablesUpdate<'share_classes'> typage strict pour le map camel→snake

## Prochaine phase B3

- Server Action `getCapTable` (avec viewMode toggle CONSOLIDATED/DILUTED/PRO_FORMA)
- Page `/dashboard/captable/page.tsx` (tab Tableau seulement)
- Composants design system : `cap-table-matrix.tsx` + `valuation-toggle.tsx` (à
  créer — la spec disait "déjà en PR #12" mais c'est faux, cf recon B1)
- Sidebar nav update (lien "Cap Table")
- Réutilisation `editorial-waterfall.tsx` (existant) pour Tab Waterfall (B4)
