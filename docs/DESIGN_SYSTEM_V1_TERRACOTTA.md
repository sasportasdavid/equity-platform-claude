# Design System V1 — Terracotta Atelier (source de vérité)

> **Source** : Brief Claude Design (mockup `Mockup_capiwise.pdf`) consolidé 5 mai 2026.  
> **Statut** : Source de vérité visuelle pour tous les écrans Capiwise V1.  
> **Convention** : tout écart vis-à-vis de ce document doit être documenté en commit + memo `memory/design_system_v1_deviations.md`.

---

## 1. Positionnement éditorial

**« L'intelligence éditoriale du capital »** — la marque s'oppose à Carta (corporate-tech américain) par un parti-pris à la française : densité, sérénité, rigueur, références culturelles. Inspirations : _Les Échos_ + _Stripe Press_.

Cible : CFO, RH, fondateurs, bénéficiaires, auditeurs (CAC), board.

---

## 2. Palette « Terracotta Atelier »

```css
:root {
  /* Encre — texte, surfaces sombres */
  --ink-900: #1b1f2a; /* titres, simulateur sombre */
  --ink-800: #2a2f3d;
  --ink-700: #4a4f5c; /* corps de texte */
  --ink-500: #7a7f8b; /* secondaire, captions */
  --ink-300: #b5b9c2;

  /* Papier — fonds, cartes */
  --paper-50: #faf7f0; /* fond global type "papier journal" */
  --paper-100: #f4efe3;
  --paper-200: #ebe5d4; /* mode édition critique (wizard) */
  --paper-300: #dcd5bf; /* bordures fines */

  /* Brass — accent signature, CTA, sparklines, italique de mise en valeur */
  --brass-300: #d4a574;
  --brass-500: #b8865b; /* couleur de marque principale */
  --brass-700: #8c6240;

  /* Bond — vert obligataire, succès, "signé", segments acquis */
  --bond-50: #e8f0ec;
  --bond-300: #6fa388;
  --bond-500: #0f6b47; /* succès solide */
  --bond-700: #084a30;

  /* Title — bordeaux, alertes critiques, valeurs descendantes (ESOP qui se réduit) */
  --title-50: #f5e8e8;
  --title-500: #a23131;
  --title-700: #7a1d1d;

  /* Saffron — avertissements (strike sous FMV, contrôle conformité borderline) */
  --saffron-50: #fbf3dc;
  --saffron-300: #e0c570;
  --saffron-500: #a8801e;
  --saffron-700: #6f5212;
}
```

**Règles d'usage :**

- `brass-500` = couleur de marque, jamais utilisée sur des actions destructives
- `title-500` = alertes critiques + valeurs descendantes (sparkline trailDown)
- `saffron-500` = warnings non-bloquants (strike sous FMV, conformité borderline)
- `bond-500` = succès, signatures, segments vesting acquis
- Pas de `border-left` coloré sur containers (anti-pattern AI)

---

## 3. Typographie

| Famille | Police                                              | Usage                                                                                  |
| ------- | --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Serif   | **Source Serif 4** (variable, axes `opsz` + `wght`) | Titres H1, mots en italique stylés (`<em>` avec `font-variation-settings: 'opsz' 144`) |
| Sans    | **Inter Tight** (300, 400, 500, 600)                | Corps de texte UI, labels, boutons                                                     |
| Mono    | **JetBrains Mono** (400, 500, 600)                  | **Tous** chiffres, valeurs, dates, IDs, articles, SLA                                  |

**Règles** :

- H1 : Source Serif 4 600, 32px, line-height 1.2, letter-spacing -0.02em, max-width 36ch, `text-wrap: balance`
- Italique éditoriale : `<em>` + `font-variation-settings: 'opsz' 144`
- Overlines : Inter Tight 600, 10–11px, letter-spacing 0.12em, uppercase, ink-500
- **Tabular nums systématique** sur tous les chiffres : `font-variant-numeric: tabular-nums` ou classe `.tabular`

---

## 4. Iconographie

**Pas d'icônes pleines de bibliothèque générique** (Lucide, Heroicons interdites par défaut).

Préférer :

- Pastilles colorées (badges)
- Symboles typographiques : `↗ ↘ → ↑ ↓ · ✓ !`
- Filets (rules) brass-500, 1px, largeur 64px sous les H1 (TitleRule)
- Sparklines avec **point d'ancrage obligatoire**

---

## 5. Composants signature

### 5.1 `KpiCard`

- Padding : 24-26px
- Fond : `paper-50`, bordure 1px `paper-300`, radius 8px
- Structure : overline → valeur (mono 36-48px tabular nums) → unité (mono 0.46em ink-500 **!important**, margin-left 6px) → filet brass 64×1 → ctx (13px ink-500) → sparkline + valeur finale (mono 11) → lien optionnel italique brass
- **`.cw-kpi-val` doit avoir `white-space: nowrap` et `gap: 6px`** pour empêcher les coupures « 4 [retour] 200 »

### 5.2 `Sparkline`

- SVG, viewBox dynamique
- Tracé : polyline + fill gradient ink-300 → brass-500 (opacity 0.08)
- **Point d'ancrage obligatoire** :
  - Anneau : `r=4 fill=none stroke=color stroke-width=1.5 opacity=0.9`
  - Cercle plein : `r=2.2 fill=color`
- Color par défaut : brass-500
- Si `trailDown` : title-500
- Valeur finale à droite, mono 11 ink-700 (ou title-700 si trailDown)

### 5.3 `PageHead`

Structure : overline → row( H1 italic em + filet brass 64×1 margin 14/10 + sub 14px ink-500 max-width 64ch ) ↔ boutons (secondary ghost + primary brass).
Support `ctaDisabled` pour griser le bouton primaire.

### 5.4 `cw-vt` — Vesting timeline horizontale

Barre de **4 segments** empilés horizontalement, chaque segment en pourcentage du span temporel total :

| Segment     | Style                                              |
| ----------- | -------------------------------------------------- |
| `.acquired` | bond-500 solide                                    |
| `.live`     | gradient bond-500 → ink-700                        |
| `.future`   | pattern hachuré 45° (paper-200 / ink-300, 4px/8px) |
| `.cond`     | pattern dashed 90° brass-500 transparent (3px/6px) |

**Repère TODAY** : trait vertical brass-500 + pastille + label `TODAY` mono 9px brass-700 letter-spacing 0.16em.

**Ticks dates** : mono 11px ink-700, ligne cumulative `.cw-vt-cum` en dessous (valeurs absolues + pourcentages).

**Légende** : carrés-échantillon 14×10 en bas.

### 5.5 `cw-breakeven` — slider what-if (Portail bénéficiaire)

- Marqueur vertical sur slider, 1.5px saffron-500
- `box-shadow: 0 0 0 2px rgba(168,128,30,0.2)`
- Label `::before` : mono 9.5px 0.16em uppercase saffron-300 `SEUIL · 235 M€` au-dessus

### 5.6 Badges

| Classe                 | Style                                  | Usage                            |
| ---------------------- | -------------------------------------- | -------------------------------- |
| `.cw-badge.bond`       | bond-500 fond, blanc texte             | `● Signé`                        |
| `.cw-badge.bond-soft`  | bond-50 fond, bond-700 texte           | États validés secondaires        |
| `.cw-badge.title.live` | title-500 fond, blanc, **pulse animé** | Alertes critiques **uniquement** |
| `.cw-badge.brass.live` | brass-500 fond, blanc                  | « En cours »                     |
| `.cw-badge.pending`    | neutre                                 | `··· En attente`                 |

⚠️ **Le pulse `live` est réservé aux alertes critiques.** Pas de live sur valeurs informatives.

---

## 6. Cohérence narrative — données fictives à respecter dans tous les écrans

**Une seule entreprise** : **Paragraphe** (SAS, 4 ans, 9 780 000 actions).

**Un seul plan en cours** : **BSPCE-2026-001 / Tranche A — Tech**

- 4 200 unités, 5 bénéficiaires
- Strike 24 €, FMV 312 €
- Plan signé 15.03.2026
- Cliff 12 mois (15.03.2027)
- Vesting linéaire 36 mois après cliff jusqu'au 15.03.2030
- 20 % conditionnel à ARR ≥ 12 M€ T+24

**Date de référence** : 30 avril 2026.

**Marie Lambert (Lead Eng)** détient 1 200 BSPCE de ce plan :

- Cliff non encore atteint → 0 unités acquises partout
- Au cliff : 1 050 u. débloquées d'un coup
- Gain latent à terme : (312 − 24) × 4 200 = 1 209 600 €
- Pour Marie individuellement : (312 − 24) × 1 200 = 345 600 €
- Seuil de profitabilité du what-if exit : ~235 M€

**Acteurs** :

- Auditeur CAC : E&Y
- CFO : Julien Doe
- CEO : Élise Marin

⚠️ **Toutes les valeurs chiffrées doivent être cohérentes entre écrans.** Pas de strike 288 € sur un écran et 24 € sur l'autre — c'est une erreur déjà corrigée à ne pas réintroduire.

---

## 7. Les 6 écrans à reproduire

### 7.1 Dashboard CFO

**Hero KPI Fair Value 12,4 M€ asymétrique** (40 % de largeur, sparkline riche 13 points + ticks date mono + narrative italique).

**À droite** : 2×2 satellites

1. Alertes conformité (`2`, **avec badge live**)
2. Vesting · 30 jours (`187 u.`)
3. Bénéficiaires actifs (`142, +3`)
4. Cap libre ESOP (`3,2 %`, **trailDown title-500**) — copy : « Vous pouvez encore attribuer 6 720 unités sans révision du pool »

**En dessous** :

- Table « Plans actifs » : BSPCE-2026-001 / AGA-2025-014 / SO-2024-008
- Sidebar droite : card Alertes conformité (badge title.live « 2 actives »), Activité récente, Calendrier vesting

### 7.2 Cap Table

Vue tabulaire éditoriale :

- **Holdings** : Founders / Series A / ESOP / Cap libre
- **Donut camembert** minimaliste (segments brass / bond / ink) à gauche
- **Table dense** à droite : % détenu, dilution post-money, droits de vote, pacte
- **Pied de table** : signature CAC E&Y + date dernier audit

### 7.3 Plan detail (BSPCE-2026-001)

**Header** : `4 200 unités, _quatre ans devant elles._`
**Sub** : `Plan signé le 15 mars 2026 · cliff 12 mois · vesting linéaire mensuel sur 36 mois suivants · strike 24 €.`

**4 KPIs état pré-cliff** :
| KPI | Valeur | Sub |
|---|---|---|
| Unités totales | 4 200 | / 5 bénéficiaires |
| Avant cliff | **11m 14j** | déblocage le 15.03.2027 · 25 % de l'attribution |
| Au cliff | **1 050 u.** | acquises d'un coup · vesting linéaire mensuel ensuite |
| Gain latent à terme | **1,21 M€** | `(312 € − 24 €) × 4 200 = 1 209 600 €` (mono 11 droit) |

**Vesting timeline** : segments 0 % / 3,1 % / 76,9 % / 20 %, repère TODAY à 3,1 %, cumul `0 → 1 050 → 2 100 → 3 150 → 4 200 u.`

**Tableau bénéficiaires** : 5 lignes, % acquis = 0,0 % partout (cliff non atteint), avatars initiales, badges Signé/En attente.

**Card « Conditions du plan »** : type, strike 24 €, FMV 312 €, cliff, vesting, performance ARR ≥ 12 M€ T+24, exercice 10 ans, auditeur E&Y. Badge « Conformité 163 bis G ».

### 7.4 Portail bénéficiaire (Marie)

**Hero** : `Bonjour Marie,` + `vous détenez _1 200 BSPCE_ sur Paragraphe.` Plan signé · 15.03.2026.

**3 KPIs** : Unités acquises 0 / 1 200, Valeur potentielle à terme 345,6 k€, Prochaine tranche +300 u. (au cliff, dans 11 mois).

**Vesting timeline** (mêmes proportions que plan detail).

**Simulateur What-If de sortie** (fond ink-900, texte paper-50) :

- Titre : `Si Paragraphe se vendait à _{exit} M€_…`
- Gain net en mono 42px à droite
- Sous le gain (si non profitable) : mono 10.5 italic 0.45 opacity « vos BSPCE deviennent profitables au-delà de 235 M€ »
- 3 presets sur ligne au-dessus du slider :
  - Prudent · 150 M€
  - Cible · 235 M€
  - Ambitieux · 400 M€
    (boutons texte serif italique, soulignés brass)
- Slider avec marqueur seuil de profitabilité (cw-breakeven)
- Slider et poignée passent en title-500 sous le seuil, brass-500 au-dessus
- Encart explicatif sous le slider, ton qui change selon profitable/non profitable
- Courbe de gain SVG en bas
- Récap 3 colonnes : sur unités acquises (0), sur attribution complète (1 200), imposition PFU 30 %

### 7.5 Wizard étape 4 — Conformité & approbation

**Stepper 5 étapes en haut.**

**Bannière d'arbitrage** (en haut, avant le stepper si besoin) saffron-50 / saffron-500 border tant que pas arbitrée :

- Pastille `!` saffron-500
- Texte serif italique 18 : « Strike fixé à 288 € sous la FMV de 312 €. Risque de requalification fiscale en avantage en nature. »
- 2 CTA :
  - `Ajuster strike à 312 € · recommandé` (brass plein)
  - `Conserver et documenter la décote` (outline brass)
- Si « Conserver » : textarea de justification CAC obligatoire (≥ 20 caractères)
- Une fois arbitrée : bascule en bond-50 / bond-500 ✓ + lien retour discret

**CTA principal** `Soumettre pour signature` **disabled** (gris, opacity 0.4, pointer-events none) tant que `decision` non prise (ou « keep » sans justification suffisante).

**À gauche** : grille 9 contrôles 163 bis G (✓ / !), avec article CGI à droite et lien « Voir la source ↗ ». Le contrôle « Strike ≥ FMV à l'émission » est warn (288 € < 312 €).
Note discrète sous la grille (paper-100, mono 11.5 ink-500) qui pointe vers la bannière.

**À droite** : workflow d'approbation 4 mains :

- CFO done · CEO done · Auditeur E&Y now · Board todo
- Récapitulatif : Instrument BSPCE, Tranche A — Tech, Bénéficiaires 5, Unités 4 200, Strike 24 €, vesting, date émission souhaitée 15.05.2026

### 7.6 Audit Trail

Vue chronologique inversée des événements du plan : signatures, attributions, modifications, exports CERFA.

**Chaque événement** : timestamp mono, acteur (avatar + nom + rôle), action en serif, hash de la pièce justificative, lien « Voir la source ».

**Filtres latéraux** par type d'événement / acteur / période.

**Mini-map à droite** : densité d'événements par jour sur les 90 derniers jours, brick chart compact.

---

## 8. Stack technique attendue

- **Framework** : Next.js 16 (déjà en place)
- **Styling** : CSS variables + Tailwind config étendue. **Pas de design system tiers** (Material, Chakra, Mantine).
- **Tabular nums systématique** sur tous les chiffres
- **Pas d'emoji**, pas d'icônes Lucide/Heroicons par défaut → préférer pastilles + symboles typographiques
- **Pas de gradients pop**. Seuls gradients tolérés : sparklines (ink-300 → brass-500) et segments vesting (bond-500 → ink-700)
- **Pas de dark mode** dans cette première itération (V1.5)
- Composants atomiques exportés : `KpiCard`, `HeroKpi`, `Sparkline`, `PageHead`, `Sidebar`, `Topbar`, `VestingTimeline`, `Badge`, `BreakevenSlider`

---

## 9. Anti-patterns à éviter

- ❌ Strike différent entre écrans
- ❌ Pulse `live` sur valeurs non critiques
- ❌ Sparkline sans point d'ancrage final
- ❌ KPI sans `white-space: nowrap` (provoque « 4 [retour] 200 »)
- ❌ Unité sans `!important` sur taille (sinon écrasée par la val parent)
- ❌ Icônes Lucide/Heroicons génériques
- ❌ Bordures gauches colorées sur containers (anti-pattern AI)
- ❌ Gradient hero, fond pop coloré
- ❌ « % acquis 33,3 % » alors que le cliff n'est pas atteint
- ❌ Filler content (sections vides bourrées de placeholder)

> Tout doit respirer la précision d'un quotidien financier de qualité. Densité maîtrisée, hiérarchie claire, italique stylé sur les mots qui méritent l'attention, chiffres en mono toujours alignés.

---

## 10. État actuel vs cible (5 mai 2026)

### Aligné ✅

- Palette brass / paper / ink / bond / saffron / title : déjà déployée (PR #12)
- Tabular nums : implémenté
- Bord brass 64×1 (TitleRule) : composant existe (`title-rule.tsx`)
- Pas de gradient pop : OK

### À aligner 🟠

- **Serif font** : Fraunces actuel → Source Serif 4 cible
- **Sans font** : Inter actuel → Inter Tight cible
- **Iconographie** : Lucide actuel → symboles typo cible (refactor V1.5)
- **`cw-vt` Vesting Timeline** : composant `VestingTimeline` existe Module 8 mais à aligner sur la spec 4 segments (acquired/live/future/cond)
- **`cw-breakeven` Slider** : à créer pour Module 8 portail bénéficiaire

### Manquant 🔴

- **Header context** « Plateforme admin · CFO & équipe Equity » au-dessus de la sidebar
- **OrgSwitcher** footer sidebar avec avatar + chevron
- **Counters dynamiques** sidebar (Plans 12, Bénéficiaires 142, Attributions 8)
- **Hero asymétrique 1.5×** Dashboard CFO
- **Sparklines avec points d'ancrage** sur les KpiCards (sparklines actuelles n'ont pas l'anneau + cercle plein)
- **Pulse `live` badge title-500** pour alertes critiques

---

## 11. Plan de propagation V1c (les 3 PR)

| PR  | Titre                                  | Scope                                                                  | Estimation |
| --- | -------------------------------------- | ---------------------------------------------------------------------- | ---------- |
| #35 | sidebar pixel-near (B1c)               | Logo bullet, counters dyn, signet item actif, OrgSwitcher footer       | 2-3h       |
| #36 | dashboard hero pixel-near (B1d)        | HeroKpi asymétrique 1.5×, breadcrumb org name, italic mid-sentence     | 2h         |
| #37 | dashboard 5 KPI cards pixel-near (B1e) | 5 satellites avec sparklines + points d'ancrage + deltas + badges live | 3h         |

**Pré-requis si migration fontes décidée** : PR #34.5 `chore(design): migrate fontes Fraunces → Source Serif 4 + Inter Tight` (~1h).

---

## 12. Références

- Mockup PDF : `Mockup_capiwise.pdf` (5 pages, 6 écrans)
- Capture prod : `Capture_capiwise.pdf` (état actuel pour comparaison)
- Brief Claude Design original : reçu 5 mai 2026 via chat David
- DS V1 historique : commit `d889fa3` "Editorial Finance — refonte 14 étapes" (PR #12)
- Propagation V1 : commit `7c34460` "upgrade 3 priority pages" (PR #31)
