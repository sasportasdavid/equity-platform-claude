# Dossier de validation fiscaliste — moteur de simulation FR 2026

> À faire relire par un fiscaliste avant ouverture publique. Le simulateur
> d'imposition (portail bénéficiaire + admin) repose entièrement sur les
> constantes ci-dessous. Source de vérité : `apps/web/src/lib/tax/rates.ts`
> et les régimes dans `aga.ts`, `stockOption.ts`, `bspce.ts`, `bsa.ts`.
> Mise à jour : audit 2026-06-10 (corrections AGA/SO appliquées).

Pour chaque point : **[ ] valider** / noter la correction si le taux ou la
règle diffère.

## 1. Barème IR 2026 (revenus 2025)

`TAX_BRACKETS_2026` — tranches 0 % / 11 % / 30 % / 41 % / 45 %, seuils
11 600 / 29 579 / 84 577 / 181 917 €. Revalorisation +0,9 % (LF 2026 art. 4).

- [ ] Seuils de tranches exacts pour les revenus 2025 imposés en 2026.
- [ ] **Plafonnement du quotient familial** : non modélisé (`helpers.ts`).
      L'avantage par demi-part n'est pas plafonné → IR potentiellement
      sous-estimé pour les foyers à parts élevées. Confirmer si acceptable V1.

## 2. Prélèvements sociaux & PFU

| Constante                | Valeur                                            | Source citée                     | À valider                                                                     |
| ------------------------ | ------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------- |
| `PS_CAPITAL_GAINS_2026`  | **18,6 %** (10,6 CSG + 0,5 CRDS + 7,5 solidarité) | LFSS 2025-1403 art. 12           | [ ] La hausse CSG capital 9,2→10,6 % est-elle bien votée et applicable 2026 ? |
| `PFU_IR_2026`            | 12,8 %                                            | inchangé                         | [ ]                                                                           |
| `PFU_TOTAL_2026`         | **31,4 %**                                        | 12,8 + 18,6                      | [ ] dépend du point ci-dessus                                                 |
| `CSG_CRDS_ACTIVITY_2026` | 9,7 % (forfait)                                   | assiette salaires, inchangé 2018 | [ ] forfait acceptable (part déductible non modélisée) ?                      |

> ⚠️ **Point le plus sensible** : si la CSG capital 2026 n'est pas 10,6 %, tous
> les `PS_CAPITAL_GAINS_2026` et le PFU sont faux de 1,4 pt.

## 3. AGA (actions gratuites) — `aga.ts`

Gain d'acquisition post-2018, split au seuil **300 000 €** (`AGA_SOCIAL_REGIME_THRESHOLD`) :

- Fraction **≤ 300 000 €** → prélèvements sociaux du **capital** (18,6 %),
  **sans** contribution salariale 10 %. (CGI 80 quaterdecies / CSS L 136-6.)
- Fraction **> 300 000 €** → assimilée salaire : CSG activité 9,7 % +
  **contribution salariale 10 %** (CSS L 137-14).
- Abattement IR (`applyAgaAbattement`) : conservé tel quel.

- [ ] Confirmer le split 300 k€ et l'application des PS capital (18,6 %) sous le seuil.
- [ ] Confirmer qu'aucune contribution salariale 10 % n'est due sous 300 k€.
- [ ] Abattement IR : modalités/montant 2026.

> Correction 2026-06-10 : avant, le code appliquait CSG 9,7 % + 10 % sur la
> **totalité** (sur-taxe ~1 à 2,5 pts sous le seuil). Corrigé.

## 4. Stock-options — `stockOption.ts`

Gain de levée (PV d'acquisition), options attribuées depuis le 28/09/2012 :
barème IR (salaires) + CSG activité 9,7 % + **contribution salariale 10 %**
(CSS L 137-14).

- [ ] Confirmer l'application des 10 % sur l'intégralité du gain de levée.
- [ ] Cas des options **antérieures au 28/09/2012** : non distingué (pas de
      date de référence dans l'input). Confirmer qu'aucun plan concerné n'existe,
      sinon ajouter un paramètre.
- [ ] Variante « non qualifiée » : cumul +9,7 % supplémentaire (= 29,4 % social) — à valider.

> Correction 2026-06-10 : avant, les 10 % étaient **omis** (sous-estimation ~10 pts). Corrigé.

## 5. BSPCE — `bspce.ts`

- [ ] Régime selon ancienneté dans la société (< 3 ans / ≥ 3 ans) et taux
      applicables post-LF 2025 (un TODO/warning existe déjà dans `bspce.ts`).
- [ ] Critère d'ancienneté : le code retombe sur `attributionDate` si `hireDate`
      absent (conservateur). Confirmer.

## 6. BSA — `bsa.ts`

- [ ] Régime fiscal des BSA (PV de cession / PFU) — vérifier la cohérence 2026.

## 7. Points transverses

- [ ] `effectiveTaxRate` : arrondi d'affichage (corrigé pour montrer 31,4 % et non 31 %).
- [ ] Tous les `breakdown` tracent `ratesYear` + sources → vérifier que l'année
      affichée correspond au millésime validé.

---

**Livrable attendu du fiscaliste** : validation ligne à ligne de `rates.ts`
(section 2) + confirmation des régimes AGA (§3) et SO (§4), qui sont les deux
corrections majeures de l'audit. En cas d'écart, indiquer la valeur/règle
correcte — l'implémentation est centralisée et rapide à ajuster.
