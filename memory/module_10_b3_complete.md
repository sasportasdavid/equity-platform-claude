# Module 10 B3 — RPC compute + UI matrice principale

**Phase B3 livrée** — Server Action getCapTable + 7 tests + 2 composants design system + page principale + sidebar nav.

## Réponses pré-flight (V2 + V3)

### V2 — Workflow approval `createFundingRound` cas (b)

**Comportement V1 actuel** : si un `approval_workflow` avec
`applies_to='FUNDING_ROUND_CREATE'` existe pour l'org, l'action `createFundingRound`
**reject explicite** avec message `"Un workflow approval est attaché à
funding_rounds.create. Le routage Module 5 est V2 — créer la levée
temporairement sans workflow ou désactiver le workflow."`.

→ **PAS de skip silencieux** (le risque pointé par le user). L'admin
voit le message d'erreur clair et sait qu'il doit désactiver le workflow
ou attendre V2.

**Pas de cas (a) `PENDING_APPROVAL`** en V1 : le wiring complet
(INSERT round PENDING + start_approval_workflow + record_approval_decision
hook) est différé à B7 ou Module 12.

→ **Dette V1.5 documentée** dans `memory/module_10_b2_complete.md`.

### V3 — `z.infer` vs `z.input` audit complet

| Schema                     | Type                  | A `.default()` ?                        | Fix B3       |
| -------------------------- | --------------------- | --------------------------------------- | ------------ |
| `createShareClassSchema`   | `z.input`             | Oui (4 defaults)                        | OK déjà      |
| `updateShareClassSchema`   | `z.infer`             | Non                                     | OK (= input) |
| `investorSchema`           | `z.infer`             | Non                                     | OK           |
| `createFundingRoundSchema` | `z.input`             | Oui (3 defaults)                        | OK déjà      |
| `cancelFundingRoundSchema` | `z.infer`             | Non                                     | OK           |
| `createScenarioSchema`     | `z.infer` → `z.input` | **Oui** (sub-schema defaults)           | **Fixé B3**  |
| `runMonteCarloExitSchema`  | `z.infer` → `z.input` | **Oui** (numPaths default 10000)        | **Fixé B3**  |
| `getCapTableInputSchema`   | `z.infer` → `z.input` | **Oui** (viewMode default CONSOLIDATED) | **Fixé B3**  |

**3 corrections** appliquées pré-flight B3.

## Livrables B3

### Server Action / Query (`apps/web/src/server/queries/cap-table.ts`, 99 lignes)

`getCapTable(input?: GetCapTableInput)` :

- Validation Zod `getCapTableInputSchema.safeParse`
- `requirePermission('captable.read.all')`
- RPC `compute_cap_table(p_org_id, p_asof_date, p_scenario_id, p_view_mode)`
- Retourne `{ ok: true, data: CapTableResult } | { ok: false, error }`

**Type `CapTableResult`** exporté pour les composants UI.

**Pattern read-only** : pas de `'use server'` car lecture pure. Module 4-9
convention = `server/queries/*` pour les SELECTs, `server/actions/*` pour
les mutations.

### Tests Vitest (`__tests__/cap-table.test.ts`, 7 tests)

| #   | Cas                                                                         |
| --- | --------------------------------------------------------------------------- |
| 1   | Happy CONSOLIDATED, org vide (positions=[], grand_total=0)                  |
| 2   | Happy CONSOLIDATED, org avec 2 positions (FOUNDER COMMON + INVESTOR PREF_A) |
| 3   | Happy DILUTED, awards virtuels ESOP_VIRTUAL inclus + vérif RPC arg          |
| 4   | Error path, RPC retourne erreur (Insufficient permissions)                  |
| 5   | Error path, Zod fail (viewMode='INVALID' rejeté)                            |
| 6   | Error path, org actif manquant (`activeOrgId: null`)                        |
| 7   | Default viewMode=CONSOLIDATED si non fourni                                 |

Pattern mock `vi.hoisted` partagé pour `requirePermissionMock` + `rpcMock`

- `mockState`. Ne touche pas le réseau.

### Composant `valuation-toggle.tsx` (78 lignes — création initiale, pas refondu PR #12)

- Segmented control 3 modes : `Consolidé / Dilué / Pro forma`
- URL search param `?view=DILUTED` (default `CONSOLIDATED` = pas de param)
- `useRouter()` + `useSearchParams()` pour synchro avec Server Component
- Tooltips `HINTS` par mode
- Classes Tailwind : `border + p-0.5` container, `bg-primary text-primary-foreground` actif
- A11y : `role="tablist"` + `aria-selected` + `data-active`

⚠️ Erratum spec §0.2 : la spec disait "déjà créé en PR #12" — c'était
**faux** (cf recon B1 §3). Création initiale documentée dans le commit B3.

### Composant `cap-table-matrix.tsx` (264 lignes — création initiale, pas refondu PR #12)

TanStack Table v8 avec :

- 7 colonnes : Stakeholder + email / Type / Classe (code + Badge type) /
  Units / % avec mini-barre / Source / Acquis le
- Tri par défaut : `units desc`
- Sticky header `bg-muted/40`
- Footer 2 niveaux : 1 ligne par share_class_code (`Total {code}`) +
  ligne `Total général` (border-t-2)
- Mini-barre proportionnelle dans la colonne %
- Badges colorés par class_type :
  COMMON=emerald / PREFERRED=indigo / ESOP=amber / WARRANT=purple /
  BSPCE=blue / OTHER=gray
- Format FR : `Intl.NumberFormat('fr-FR')` (espaces séparateurs milliers,
  4 décimales max, pas d'arrondi pour audit IFRS)

V2 deferred (B6) : deltas T-1 (vs snapshot précédent), pivot par stakeholder
avec drill-down par share_class.

### Page `/dashboard/captable/page.tsx` (refonte complète, ex-stub)

- `requireUser` + `hasPermission('captable.read.all')` → redirect /dashboard
  si pas de perm (pas 404)
- `searchParams.view` → `viewMode` ViewMode
- `getCapTable({ viewMode })` Server Component fetch
- PageShell compound API :
  - Breadcrumb `Capiwise / Cap Table`
  - Overline `EQUITY MANAGEMENT · CAP TABLE`
  - Title `Vue d'ensemble`
  - TitleRule (cuivre)
  - Subtitle adaptatif : `{N} position(s) · {M} stakeholder(s) · vue {viewMode}`
    OR `Aucune position · vue {viewMode}`
  - Actions : 2 boutons disabled (`Importer historique` B6, `Nouveau scénario` B4)
- ValuationToggle visible
- **Empty state** si positions=[] : `<EmptyState>` avec illustration
  ScalesIllustration + CTA `Créer ma première classe d'actions →` vers
  `/dashboard/captable/share-classes/new` + secondary link doc
- **Error state** si `getCapTable` retourne `{ ok: false }` : EmptyState
  variant `error` + bouton `Recharger`

### Sidebar nav

`apps/web/src/components/shared/dashboard-sidebar.tsx` ligne 61 :
`comingSoon: true` retiré. Le lien `/dashboard/captable` est maintenant
actif (icon `PieChart` Lucide, section Opérations).

## Tests workspace post-B3

|                | Avant B3                                                                   | Après B3     |
| -------------- | -------------------------------------------------------------------------- | ------------ |
| apps/web tests | 625                                                                        | **632** (+7) |
| shared tests   | 70                                                                         | 70           |
| Typecheck      | 0 erreur                                                                   | 0 erreur     |
| Lint           | 1 nouveau warning (incompatible-library TanStack — pré-existant DataTable) | idem         |

## Garde-fous appliqués (B3)

- ✅ RPC `compute_cap_table` réutilisé tel quel (pas de migration corrective)
- ✅ Composants `cap-table-matrix.tsx` + `valuation-toggle.tsx` créés en B3
  avec mention "création initiale" dans le commit
- ✅ Tab Tableau seulement (Camembert/Waterfall/Évolution = B4-B6)
- ✅ PageShell pattern compound (Breadcrumb / Overline / Title / TitleRule /
  Subtitle / Actions / Content)
- ✅ Permission check `captable.read.all` → redirect 403 → /dashboard
- ✅ Empty state avec CTA cohérent (pas un tableau vide)
- ✅ Sidebar nav update (comingSoon retiré)
- ✅ V3 z.input fix proactif sur 3 schemas avec defaults

## Erratums spec consolidés (B1+B2+B3)

1. ❌ `audit_table_changes()` n'existe pas → audit via Server Action / RPC INSERT (B1)
2. ❌ `cap_table.*` → `captable.*` (cohérence M1) (B1)
3. ❌ `user_has_permission()` → `has_permission()` (alias, pattern dominant) (B1)
4. ❌ `cap_table_snapshots` préfigurée M1 → ALTER ADD-only (B1)
5. ❌ `documents` → `document_instances` (table M6) (B1)
6. ❌ `exercise_requests.status='FULLY_PAID'` → `'COMPLETED'` (B1)
7. ❌ REVOKE EXECUTE FROM PUBLIC + authenticated + anon (B1)
8. ❌ `approval_workflows.scope` → `applies_to` (B2)
9. ❌ `z.infer` → `z.input` sur schemas avec `.default()` (B2 + B3 audit complet)
10. ❌ Composants `cap-table-matrix.tsx` + `valuation-toggle.tsx` non
    créés en PR #12 (création initiale en B3) (B3)

## Prochaine phase B4

- Server Actions `createScenario` / `updateScenario` / `deleteScenario` / `runScenario`
- Page `/dashboard/captable/scenarios/[id]` avec dilution-comparator
- Tabs Camembert + Waterfall ajoutés à la page principale
- 4 scénarios déterministes : NEW_ROUND, POOL_TOPUP, BULK_EXERCISE, EXIT
