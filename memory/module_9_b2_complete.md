# Module 9 B2 — closure complète

Branche : `feat/module-9-b2-tax` (depuis master `b1a662b` post-PR #13 mergé)
PR : `#14` (draft, à ouvrir post-commits)

## Périmètre B2 livré

Lib pure TS de simulation fiscale française pour les régimes BSPCE,
Stock Options, BSA et AGA. Aucune dépendance Supabase / Next.js / React
— réutilisable côté client (live preview portail) et serveur
(snapshot dans `exercise_requests.tax_simulation_snapshot`).

### Structure

```
apps/web/src/lib/tax/
├── rates.ts                      # Taux 2026 + sources LEGIFRANCE/BOFiP
├── types.ts                      # SimulationInput, TaxBreakdown, etc.
├── helpers.ts                    # computeProgressiveIR, yearsBetween, …
├── bspce.ts                      # simulateBspce(input)
├── stockOption.ts                # simulateStockOption(input, variant)
├── bsa.ts                        # simulateBsa(input)
├── aga.ts                        # simulateAga(input, variant)
├── multiTranche.ts               # simulateMultiTranche(input, tranches)
├── index.ts                      # API publique + dispatch
└── __tests__/                    # 56 tests Vitest

packages/shared/src/schemas/
└── tax-simulation.ts             # Zod schemas (input + breakdown)
```

### Taux fiscaux 2026 implémentés

- **Barème IR 2026** (LF 2026 art. 4) : 5 tranches 0/11/30/41/45%
  avec seuils 11_600 / 29_579 / 84_577 / 181_917
- **Prélèvements sociaux 18,6%** (LFSS 2026 — hausse CSG 9,2 → 10,6)
- **PFU total 31,4%** (12,8 IR + 18,6 PS) — était 30% en 2025
- **CSG/CRDS revenus d'activité 9,7%** (forfait V1 SO/AGA)
- **Contribution salariale AGA 10%** (post-2018 art. 80 quaterdecies)
- **Abattement AGA 50%** sous le seuil 300 000 €
- **Seuil ancienneté BSPCE 3 ans** (CGI art. 163 bis G)

### Régimes implémentés

| Régime          | PV acquisition                                                                              | PV cession                               |
| --------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------- |
| BSPCE ≥ 3 ans   | —                                                                                           | PFU 31,4% (option barème IR)             |
| BSPCE < 3 ans   | —                                                                                           | 30% IR + 18,6% PS = 48,6% (pas d'option) |
| SO qualifié     | TMI + CSG/CRDS 9,7%                                                                         | PFU 31,4% (option barème)                |
| SO non-qualifié | + cotisations sociales 9,7%                                                                 | identique                                |
| BSA             | —                                                                                           | PFU 31,4% (option barème IR)             |
| AGA post-2018   | TMI sur base après abattement (50% < 300K, charnière au-delà) + CSG/CRDS 9,7% + contrib 10% | PFU 31,4%                                |
| AGA pré-2018    | warning V1 + estimation post-2018                                                           | identique                                |

## Tests Vitest — 56 nouveaux (508 workspace, +56 vs baseline 452)

### rates.test.ts (2)

- Vérifie les 5 tranches IR 2026 + seuils officiels
- Vérifie PFU 12,8 + PS 18,6 = 31,4

### helpers.test.ts (16)

- computeProgressiveIR : 0, 15K, 50K, 100K, quotient familial, throws (6)
- detectTmiFromIncome : 4 tranches détectées
- yearsBetween : 3.0, 1.59 (2)
- applyFlatTmi : flat × base, base négative (2)
- computeIncomeTax : manual + auto wrapper (2)

### bspce.test.ts (8)

- T1 ≥3y PFU 31,4%, T2 +option barème, T3 <3y majoré 48,6%, T4 cession
  passe seuil, T5 0 unités throw, T6 moins-value, T7 post-2025 warning,
  T8 option barème ignorée si <3y

### stockOption.test.ts (8)

- T1 qualifié IR + CSG/CRDS, T2 non-qualifié +9,7%, T3 option barème,
  T4 TMI 45, T5 0 unités, T6 cession concomitante, T7 moins-value, T8
  TMI auto via annualTaxableIncome

### bsa.test.ts (5)

- T1 PFU 31,4%, T2 option barème, T3 pas de PV acquisition, T4
  moins-value, T5 0 unités

### aga.test.ts (8)

- T1 200K abattement 50%, T2 400K formule charnière, T3 cession
  concomitante, T4 pré-2018 warning, T5 TMI 45, T6 0 unités, T7 petit
  volume, T8 exactement 300K

### multiTranche.test.ts (4)

- T1 4 tranches ≥3y → toutes PFU, T2 4 tranches <3y → toutes majorées
  - warning unique, T3 mix régimes panachés, T4 agrégation totaux

### integration.test.ts (5)

- T1 BSPCE valide ok=true, T2 input invalide → TAX_INPUT_INVALID, T3
  switch STOCK_OPTION, T4 snapshot stable BSA E2E, T5 TMI auto 60K
  célibataire → 30%

## ⚠ Discrepancy spec vs math (à valider)

Le spec utilisateur mentionnait :

- `computeProgressiveIR(50000) ≈ 6105.32 €`
- `computeProgressiveIR(100000) ≈ 16385 €`

Ces valeurs ne sont pas cohérentes avec la formule progressive
française standard ni avec les formules que le spec lui-même fournissait
(« 17978 × 11% + 20420 × 30% »).

Calculs corrects (utilisés dans les tests) :

- `computeProgressiveIR(50000)` = 1977.69 + 6126.30 = **8103,99 €**
- `computeProgressiveIR(100000)` = 1977.69 + 16499.40 + 6323.43 =
  **24800,52 €**

Tous les tests utilisent les valeurs mathématiquement correctes. À
revoir avec le fiscaliste si le simulateur devait reproduire un autre
modèle (ex: simulation post-décote ou avec quotient implicite).

## Décisions architecturales V1

1. **Pas de décote en V1** — la décote française (réduction d'IR pour
   petits revenus) est ignorée. Pour les BSPCE/SO/BSA/AGA dont la PV
   pousse au-delà du seuil de décote, son impact est nul. Pour les
   simulations à très petits montants (TMI 0 ou 11), V1 surestime
   légèrement l'IR.

2. **Pas de cotisations sociales détaillées SO non-qualifiées** —
   forfait 9,7% en sus du CSG/CRDS. V2 affinera selon convention
   collective et plafond SS.

3. **Forfait contribution AGA 10%** — basé sur post-2018. AGA pré-2018
   estime au même forfait avec warning. V2 = régime ancien complet.

4. **BSPCE post-2025 simplifié** — la LF 2025 a introduit un régime
   distinct (PV exercice imposée comme salaire, PV cession au PFU).
   V1 agrège les deux et émet un warning. V2 = double calcul.

5. **TMI auto progressive marginale** — `computeIncomeTax` en mode auto
   calcule l'IR sur (income + base) puis soustrait l'IR sur income
   seul. Approche correcte pour effet marginal mais ne gère pas la
   décote ni la formule de plafonnement quotient familial.

6. **Multi-tranche regime hétérogène** — quand des tranches sont
   panachées (ex: BSPCE_3Y_LESS + BSPCE_3Y_PLUS), le breakdown agrégé
   prend le régime de la 1re tranche comme valeur indicative. L'UI
   doit afficher les régimes individuels via `breakdown.tranches[]`.

## Dette V2

- **#86** Décote française non implémentée (impact petits revenus)
- **#87** SO non-qualifiées : cotisations sociales détaillées par
  plafond SS au lieu de forfait 9,7%
- **#88** AGA pré-2018 : régime spécifique non implémenté V1
- **#89** BSPCE post-2025 : régime distinct PV exercice/cession non
  implémenté V1
- **#90** TMI auto sans gestion plafonnement quotient familial
- **#91** Multi-tranche : pas de validation Zod sur le `tranches[]`
  argument (à ajouter en B3 si exposé via Server Action)
- **#92** Spec vs math discrepancy sur computeProgressiveIR (cf section
  ⚠ ci-dessus) — à arbitrer avec le fiscaliste

## Pattern Result et erreurs typées

API publique :

```ts
simulateExerciseTax(input: unknown): Result<TaxBreakdown>
simulateExerciseTaxMultiTranche(input, tranches): Result<MultiTrancheBreakdown>
```

Erreurs typées :

- `TAX_INPUT_INVALID` : Zod validation failed
- `TAX_REGIME_UNSUPPORTED` : régime hors V1 (réservé V2 pour AGA pré-2018
  strict)
- `TAX_DATA_INCONSISTENT` : ex cessionDate < exerciseDate (rejeté Zod)

## Métriques

- Tests workspace : 452 baseline → 508 (+56)
- Lignes lib/tax : ~720 (rates 110, types 100, helpers 130, régimes 480)
- Lignes tests : ~700
- Typecheck : ✅ passing
- Schemas Zod : 1 fichier shared (tax-simulation.ts) avec 4 schemas
  exportés

## Next : B3

B3 livre le simulateur portail bénéficiaire :

- Page `/portal/awards/[id]/simulator` ou Section dédiée page détail
- Form input (date d'exercice, % à exercer, TMI manual/auto, options)
- Live preview du breakdown (consomme `simulateExerciseTax` côté client)
- Server Action `requestExerciseWithSimulation` qui :
  1. Re-calcule le breakdown côté serveur (cohérence)
  2. INSERT exercise_request avec `tax_simulation_snapshot = breakdown`
  3. Délègue au RPC `request_exercise` Module 9 B1
- Composants : TaxBreakdownCard, BracketsBreakdownChart, WarningsList
