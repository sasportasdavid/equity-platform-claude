# Design System V1 — Editorial Finance · Kickoff

> **Branche** : `feat/design-system-v1`
> **Date kickoff** : 2026-05-01
> **Référence prompt** : design system V1 v4.0 (1ᵉʳ mai 2026)
> **Mockups source** : 6 PNG (Dashboard CFO, Portail bénéficiaire, Cap Table, Plan Detail, Wizard Étape 4, Audit Trail)

---

## Mission

Refonte visuelle complète de Capiwise selon direction artistique
**Editorial Finance** : palette ink-bleu nuit (#0B1838) + cuivre/laiton
(#B8865B) + crème papier (#FAF8F3), typographie Fraunces serif éditoriale

- Inter sans + JetBrains Mono tabular, line cuivre 64px sous chaque
  titre de page, density premium type Bloomberg Terminal.

**Périmètre** : composants UI uniquement. Aucune logique métier, aucune
migration, aucune Server Action, aucune RPC, aucune Edge Function
modifiée.

## Règle d'or

| Source                                            | Rôle                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Mockups PNG**                                   | Vocabulaire visuel cible : palette, typographie, hiérarchie, layout                         |
| **Code existant** (master + feat/module-8-portal) | Vérité absolue sur les données disponibles, fonctionnalités branchées, Server Actions, RPCs |

Si un mockup affiche un élément qui ne correspond à rien dans le code,
on **utilise ce qui est codé** en lui appliquant **l'esthétique du
mockup**. La fidélité visuelle est secondaire à la fidélité
fonctionnelle.

## Précondition note

Module 8 (PR #11) n'est pas encore mergé sur master au moment du
kickoff. La branche `feat/design-system-v1` est créée depuis l'état
incluant M8 pour pouvoir refactor les composants `/portal/*` (PortalHeader,
LeaverSimulator, VestingChart, AwardSummaryCard, etc.). Quand PR #11
sera mergée (squash), cette branche aura besoin d'un rebase.

## Plan d'exécution 14 étapes

| #   | Commit                                                  | Étape                                   |
| --- | ------------------------------------------------------- | --------------------------------------- |
| 1   | `chore(design): bootstrap kickoff`                      | Branche, baseline, recon                |
| 2   | `feat(design): tokens v1 editorial finance`             | `@theme inline` + 3 fonts               |
| 3   | `feat(design): theme provider & dark mode`              | Light/dark/system                       |
| 4   | `feat(design): UI primitives editorial finance`         | button/input/select/tabs/etc.           |
| 5   | `feat(design): editorial layout & sidebar refactor`     | PageShell + sidebar                     |
| 6   | `feat(design): KPICard with sparkline anchor`           | KPI signature avec ancrage final cuivre |
| 7   | `feat(design): EmptyState component family`             | 8 illustrations SVG inline              |
| 8   | `feat(design): DataTable editorial typography`          | Refactor data-table                     |
| 9   | `feat(design): VestingTimeline editorial chart`         | SVG natif 4 zones                       |
| 10  | `feat(design): refactor ApprovalRequestTimeline visual` | Variante horizontale                    |
| 11  | `feat(design): editorial chart components`              | Wrappers Recharts pré-stylés            |
| 12  | `feat(design): refactor dashboard CFO screen`           | Mockup 1                                |
| 13  | `feat(design): refactor plan detail & wizard step 4`    | Mockup 4 + 5                            |
| 14  | `feat(design): refactor beneficiary portal & QA`        | Mockup 2 + restes + QA                  |

Modules 10 (Cap Table) et 13 (Audit Trail) **non livrés** : composants
génériques préparés sans page réelle, sandbox `/dev/design/*` uniquement.

## Adaptations mockup → code (règle d'or appliquée)

### Mockup 1 — Dashboard CFO

- ❌ KPI "Cap libre ESOP 3,2 %" → REMPLACÉ (Module 10 non livré)
- ❌ Citation italic IFRS 2 hero → omettre (pas de source)
- ✅ Greeting adaptatif (`adaptive-greeting.ts` à créer)
- ✅ KPI Vesting/Bénéficiaires/Alertes branchés sur queries existantes

### Mockup 2 — Portail bénéficiaire

- ❌ Card "VALEUR POTENTIELLE À TERME 345,6 k€" → REMPLACÉE (calcul
  `units × (FMV - strike)` interdit par spec Module 8 §1.5)
- ❌ Slider what-if valorisation société → REMPLACÉ par `LeaverSimulator`
  existant (form date + leaver_type) restylé en thème sombre éditorial
- ❌ "VOTRE GAIN NET en €" → "VOS UNITÉS NETTES en u." (cohérent spec)
- ✅ Hero typographique 3 lignes branché sur `get_beneficiary_portal_dashboard`
- ✅ VestingTimeline simplifiée prop `simplified={true}`

### Mockup 3 — Cap Table

- ❌ Page `/dashboard/captable` réelle → NON CRÉÉE (Module 10 non livré)
- ✅ Composants génériques `cap-table-matrix.tsx` + `valuation-toggle.tsx`
  dans sandbox `/dev/design/cap-table`

### Mockup 4 — Plan Detail

- ❌ 5 onglets mockup → CONSERVER 8 onglets existants (mockup simplifié)
- ❌ Indicateur design "transitions 200/250 ms" → omettre en prod
- ✅ Title adaptatif (`adaptive-plan-title.ts` à créer)
- ✅ KPI "Gain latent à terme" légitime côté admin (≠ portail)
- ✅ VestingTimeline 4 zones SVG natif

### Mockup 5 — Wizard Étape 4

- ❌ 9 contrôles 163 bis G mockup → utiliser les rules réellement codées
  (`awardRules.ts`, `beneficiaryRules.ts`, etc., probablement 4-6 rules
  selon plan_type)
- ❌ 5 étapes mockup → CONSERVER 7 étapes existantes
- ✅ Bannière d'arbitrage conditionnelle sur résultat `runComplianceChecks`
- ✅ CTA "Soumettre" disabled si rule en ERROR non résolue
- ✅ Workflow approbation horizontal (refactor `ApprovalRequestTimeline`)

### Mockup 6 — Audit Trail

- ❌ Page `/dashboard/audit` réelle → NON CRÉÉE (Module 13 non livré)
- ✅ Composants génériques dans `apps/web/src/components/audit/`
  - sandbox `/dev/design/audit-trail`

## Critères d'acceptation (résumé)

- 0 palette Tailwind par défaut (indigo/emerald/slate) sans wrapping
- 100 % chiffres financiers en mono tabular
- 100 % titres de page en serif Fraunces
- Dark mode autonome (pas un invert)
- Focus ring cuivre WCAG AA sur 100 % focusables
- 8 illustrations SVG inline custom (pas de Lucide brut sur empty states)
- Aucun calcul `units × (FMV - strike)` côté portail bénéficiaire
- Aucune migration SQL touchée
- Aucune Server Action métier modifiée
- Tests baseline 406 → toujours 406 (ou +) après chaque étape

## État baseline (Étape 1)

- Branche : `feat/design-system-v1` créée depuis état post-M8
- Tests : **406** workspace (346 web + 60 shared) ✅
- Typecheck : ✅
- Lint : ✅ 0 errors
- Build : ✅
- Mockups : 6 PNG fournis par user (référence visuelle)
- Recon mémorisée : `~/.claude/projects/-Users-sasportasdavid-equity-platform/memory/design_system_v1_recon.md`

## Convention de reporting

Toutes les 3 étapes (Étapes 3/6/9/12/14), un message dans le chat avec :

- Étapes complétées N/14
- Hashs des derniers commits
- Adaptations mockup→code documentées (rappel)
- Bloqueurs éventuels

Si bloqueur réel : STOP + ping avant de continuer.
