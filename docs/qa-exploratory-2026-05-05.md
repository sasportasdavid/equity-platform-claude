# QA Exploratoire Capiwise/Paragraphe — 5 mai 2026

Tester : Claude Sonnet 4.6 in Chrome (3e session, mode texte-first strict)
Build : v0.15.0 (post-PR #42)
Profil : OWNER · Org : Paragraphe (sasportasdavid+owner@gmail.com)
Viewport: 1280×800 demandé — JS innerWidth/innerHeight retourne 576×657
⚠ Problème viewport (voir Bug #1)

Actions navigateur consommées : ~28 / 30
Durée estimée : ~25 min

---

## Pages testées

### /dashboard ✅

**Hero observé :**
"EQUITY MANAGEMENT · Q2 2026 — Bonsoir, tout est en ordre.
142 bénéficiaires actifs · 10 plans en cours"

**KPI cards (5) :**
| Card | Valeur observée | Détail |
|---|---|---|
| Fair Value IFRS 2 | 12,4 | vs T-1 · valorisation 5 mai 2026 · CAC E&Y |
| Alertes conformité | "Tous les contrôles sont validés" | 0 alertes affichées |
| Vesting · 30 jours | "Aucune tranche dans les 30 prochains jours" | — |
| Bénéficiaires actifs | 142 | ↗ +142 ces 30 derniers jours |
| Cap libre ESOP | 3,2 % | 6 720 unités disponibles |

**Bug attendu — Alertes 0 vs 2 OPEN en DB :** CONFIRMÉ.

---

### /dashboard/audit-trail ✅

**Hero :** "Bonsoir, 43 événements au registre.
7 jours d'historique · 21 types d'actions · 1 acteur"

**ChainIntegrityBadge :** "Chaîne intègre · SHA-256 · 1 événement vérifié"

---

### Drawer audit event V1.5 ✅ (partiel — 1 crash, 1 succès)

**Test 1 — Clic AWD-2026-0005 PROPOSED→GRANTED :** FRAME ERROR / PAGE CRASH
**Test 2 — Clic audit.exported :** Drawer OUVERT, 5 sections OK, ESC ferme

---

### /dashboard/audit-trail — Exporter ▼ V2 🔴 CRITIQUE

**Clic JSON signé :** POST 200, aucun download, aucun toast → P1
**Clic PDF :** POST 200 puis 345+ requêtes RSC pending, page freeze → P0
**Clic CSV :** Non testé (page gelée)

---

### /dashboard/plans/8e45bfd1... ✅

8 tabs OK. Tab "État" inerte au 1er clic → P2.

---

### /dashboard/beneficiaries — NON TESTÉ

---

### Phase 6 Adversariel

- /dashboard/plans/00000000-... → 404 propre AVEC app shell ✅
- /dashboard/foo → 404 raw SANS app shell ❌ (P2)
- /dashboard/reports → 404 raw SANS app shell ❌ (P2)

---

## Bugs trouvés

### Bug #1 P3 — Viewport resize ignoré

### Bug #2 P1 — Dashboard alertes 0 vs 2 OPEN ✅ CONFIRMÉ

### Bug #3 P1 — Export JSON signé silencieux

### Bug #4 P0 — Export PDF boucle RSC infinie

### Bug #5 P1 — Drawer crash sur award.status_changed (intermittent)

### Bug #6 P2 — Drawer audit.exported : filters/event_count vides

### Bug #7 P2 — Tab "État" inerte sur plans/[id]

### Bug #8 P3 — Awards sans texte accessible plan/[id]

### Bug #9 P2 — 404 sans app shell sur /dashboard/[unknown]

---

## Console errors agrégées

Aucune erreur console capturée (hook installé après 1re navigation).

---

## Verdict global : 🔴

**PR #42 (Exporter V2) BLOQUÉE en l'état.**

- Bug #4 P0 boucle RSC PDF
- Bug #3 P1 JSON silencieux
- Bug #5 P1 crash drawer

**Priorités fix avant release :**

1. Bug #4 — P0 — Route handler /api/audit/export (PR #45 en cours)
2. Bug #3 — P1 — Download blob URL pattern (PR #45)
3. Bug #5 — P1 — Error Boundary AuditEventDrawer (PR #45)
4. Bug #2 — P1 — Fix query alertes dashboard (V1.X)
5. Bug #6 P2, #7 P2, #9 P2 — V1.X

Rapport partiel — /dashboard/beneficiaries non testé.
Généré le 05/05/2026 · ~25 min · ~28 actions navigateur
