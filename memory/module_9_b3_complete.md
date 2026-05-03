# Module 9 B3 — closure complète

Branche : `feat/module-9-b3-portal` (depuis master `f2b2c41` post-PR #14 mergé)
PR : `#15` (draft, à ouvrir post-commits)

## Périmètre B3 livré

5 pages portail bénéficiaire pour le workflow d'exercice +
3 Server Actions + 7 composants Editorial + helpers + 35 tests.

### Routes ajoutées

```
/portal/awards/[id]/exercise/new      Form principal de demande
/portal/awards/[id]/tax-simulator     Simulation libre 5 scénarios
/portal/exercises                     Liste de mes demandes
/portal/exercises/[id]                Détail d'une demande
```

PortalNav étendu avec un 4e lien "Mes exercices" (icon TrendingUp).

### Composants livrés

```
apps/web/src/components/exercises/
├── TaxBreakdownDisplay.tsx           # Affichage Editorial d'un breakdown
├── ExerciseRequestForm.tsx           # Form principal (client component)
├── TaxSimulator.tsx                  # Simulator 5 scénarios (client)
├── ExerciseRequestStatusBadge.tsx    # Badge status (6 valeurs)
├── CancelExerciseDialog.tsx          # Inline cancel (collapse simple)
└── format-helpers.ts                 # formatEuro, formatPercent,
                                      #  computeMaxUnitsAvailable, etc.
```

### Server-side

```
apps/web/src/server/queries/exercises.ts    # listMy + getDetail
apps/web/src/server/actions/exercises.ts    # createExerciseRequest
                                            # cancelMyExerciseRequest
packages/shared/src/schemas/exercise.ts     # Zod schemas
```

## Décisions D1-D5 implémentées

| ID  | Décision                          | Implémentation                                                                                                                                  |
| --- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Calcul fiscal hybride             | `useMemo` côté client + recalcul côté serveur dans `createExerciseRequest` (lib stateless, même résultat)                                       |
| D2  | Tax simulator standalone          | Page `/portal/awards/[id]/tax-simulator` avec CTA `Créer une demande` qui prefill `exercise/new` via query params `units` + `cessionPrice`      |
| D3  | Multi-tranches FIFO custom number | Form input single number `unitsToExercise`. RPC `request_exercise` consomme via fallback snapshot (Module 9 B1). Pas de checkbox par tranche V1 |
| D4  | Cession concomitante toggle       | Toggle dans `ExerciseRequestForm`. Active 2 champs supplémentaires (cessionDate + cessionPricePerUnit). Désactivé par défaut                    |
| D5  | Page admin FMV skip V1            | Pas de `/dashboard/companies/[id]/fmv`. FMV seedée manuellement (cf Pré-requis ci-dessous)                                                      |

## Pré-requis E2E exécutés

### FMV seedée

```sql
UPDATE companies
   SET last_known_fmv_per_share = 25.00,
       fmv_as_of_date = CURRENT_DATE,
       fmv_source = 'manual_test_b3',
       fmv_updated_at = NOW()
 WHERE id IN ('dc220ce4-611a-483c-97ee-8faedd8066de',
              '2a4d3068-0ac3-4296-bcb9-52f5240267dd');
```

⚠ Adaptation : la spec utilisateur référençait la colonne `fmv_per_share`
mais la DB Module 9 B1 a `last_known_fmv_per_share`. Adapté en
conséquence.

Deux companies "Capiwise" dans l'org test, les deux mises à 25 € pour
permettre les tests live des 2+ awards de la sandbox.

### AWD-2026-0007

**Décision : OPTION B** — laissé tel quel (status `PARTIALLY_EXERCISED`,
units_exercised=50 résiduel post-tests B1). La fallback snapshot
calcule correctement les units_available restantes (300 vested via
1ère tranche - 50 exercised = 250 disponibles). Pas d'altération de
données réelles.

## Tests Vitest — 35 nouveaux (543 workspace, +35 vs baseline 508)

### packages/shared (10 tests)

- exercise.test.ts (10) :
  - createExerciseRequestInputSchema : 6 tests (valid sans cession,
    units≤0, cession_price<0, cession_toggle sans date, cession
    complète valid, awardId pas UUID)
  - cancelExerciseRequestInputSchema : 2 tests (valid, reason trop court)
  - exerciseRequestStatusSchema : 2 tests (tous statuts officiels,
    rejette inconnu)

### apps/web (25 tests)

- format-helpers.test.ts (16) : formatEuro, formatUnits, formatPercent,
  formatDateFr, computeMaxUnitsAvailable (3 cas dont snapshot fallback),
  regimeAccentColor (4 régimes), regimeLabel,
  formatTaxBreakdownForDisplay
- exercises.test.ts (Server Actions, 9) : 6 tests
  createExerciseRequest (Zod rejects, AGA refusé, happy path BSPCE,
  RPC error propagation) + 3 tests cancelMyExerciseRequest

## Pattern important : Zod 4 strict UUID

Zod 4 valide les UUID avec une regex stricte `[1-8]` pour version +
`[89abAB]` pour variant. Un test UUID `'11111111-1111-1111-...-...'`
(toutes les digits 1) **échoue** car violates variant bits.

Solution : utiliser des UUIDs réels v4 dans les tests, ex:
`'a3b9c2d4-1234-4567-89ab-1234567890ab'`.

À documenter pour Module 10+ (impact tests Zod 4 nécessaire si
on continue à mocker des IDs).

## Pattern vi.hoisted requis

Les Server Actions tests doivent utiliser `vi.hoisted` pour les
constantes utilisées dans `vi.mock` factory, sinon erreur
"Cannot access X before initialization".

```ts
const { TEST_USER_ID } = vi.hoisted(() => ({
  TEST_USER_ID: 'a0b0c0d0-...',
}));

vi.mock('@/lib/auth/rbac', () => ({
  requireUser: vi.fn().mockResolvedValue({ id: TEST_USER_ID, ... }),
}));
```

## Dette V2

- **#93** Page admin `/dashboard/companies/[id]/fmv` : form simple +
  historique des updates FMV (audit). V1 = SQL manuel.
- **#94** Multi-tranches checkboxes : alternative à D3 où l'utilisateur
  voit ses tranches et coche celles à exercer. V1 = FIFO automatique.
- **#95** Page `/portal/awards/[id]/aga-tax` dédiée pour cession AGA :
  V1 redirige vers `/portal/awards/[id]` car AGA pas exerçable. À
  reconsidérer si demande utilisateur pour simuler la cession AGA.
- **#96** TMI auto via `annualTaxableIncome` : V1 le form fixe TMI
  manuel par défaut 30. V2 = champ optionnel "Mon revenu annuel"
  pour activer le mode auto + détection TMI dynamique.
- **#97** Approval timeline visuelle dans détail exercise : V1
  affiche juste le statut. V2 = réutiliser ApprovalRequestTimeline
  (Module 5) avec les approval_decisions de l'approval_request lié.
- **#98** Documents bulletin / certificat dans détail exercise :
  V1 affiche les `bulletin_document_id` / `notification_document_id`
  comme champs DB mais ne les rend pas downloadables. V2 = liens
  vers signed URLs storage (pattern Module 6).
- **#99** Recharts dans TaxSimulator : V1 affiche les 5 scénarios en
  cartes côte à côte avec montant net. V2 = bar chart Editorial
  comparatif brut vs net comme prévu spec §10.

## Recon clé du code existant

### RPC `request_exercise` signature

```ts
Args: {
  p_award_id: string
  p_units_to_exercise: number
  p_payment_method?: string
  p_beneficiary_notes?: string
  p_tax_simulation?: Json
}
Returns: Json  // { exercise_request_id, request_number, ... }
```

⚠ NOTE : la RPC ne prend PAS `cessionDate` ni `fmvAtCession` —
cette info est embarquée dans `p_tax_simulation` (snapshot JSONB).
Les détails de cession vivent dans le breakdown stocké en
`exercise_requests.tax_simulation_snapshot`.

### `PortalPlanSummary` n'inclut PAS `company_id`

Adaptation Module 8 : doit re-query la table plans pour obtenir
`company_id` quand on veut accéder à la FMV company. Pattern
implémenté dans les 2 pages `/portal/awards/[id]/exercise/new` et
`/portal/awards/[id]/tax-simulator`.

## Métriques

- Tests workspace : 508 baseline → 543 (+35)
- Lignes de code (composants + actions + queries + helpers + schemas) :
  ~1 600
- Lignes de tests : ~600
- Typecheck : ✅ passing
- Pages : 4 portal + 1 PortalNav étendu
- Server Actions : 2 (create + cancel)
- Server queries : 2 (listMy + getDetail)
- Composants : 5 (display, form, simulator, status badge, cancel
  dialog) + helpers

## Next : B4 ou B5

Spec §6.4-§6.5 : page admin de revue d'une exercise_request +
workflow d'approbation côté admin (réutilise inbox Module 5).
Dépend de #97 (timeline) et #98 (documents) pour avoir le contenu
déjà côté UI.

Alternativement B5 : page admin FMV (#93) + page admin workflow
exercise + audit log filterable.
