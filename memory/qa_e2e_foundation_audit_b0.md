---
name: PR #44 — QA E2E Foundation Playwright audit B0
description: Audit pré-code — 4 questions techniques + 5 arbitrages bloqueurs imposant STOP avant migration / création projet QA
type: project
---

# B0 — QA E2E Foundation (PR #44)

**Date** : 2026-05-05
**Branche** : `feat/qa-e2e-foundation` (créée depuis master `e1179bf` post-PR #42)
**Brief** : `BRIEF_B_PLAYWRIGHT_FOUNDATION.md`

> **Status** : 4 questions techniques répondues. **5 arbitrages bloqueurs** identifiés qui requièrent décision David avant migration cloud / création de projet Supabase QA dédié. **STOP recommandé**.

---

## 1. Vérifications techniques B0 (4 questions du brief)

### Q1 — Playwright déjà installé ?

**OUI ✓ — déjà setup, pas from-scratch** :

- `apps/web/package.json` → `"@playwright/test": "^1.59.1"` + scripts `test:e2e`, `test:e2e:ui`
- `apps/web/playwright.config.ts` existe :
  - `testDir: './e2e'`, port **3100** (pas 3000 — coexiste avec `next dev`)
  - `baseURL: http://127.0.0.1:3100`, locale **fr-FR**
  - `webServer.command: pnpm exec next dev -p 3100`
  - `webServer.env` : **Supabase MOCKED** (`NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54331'` + `mock-anon-key-for-e2e`)
  - `NODE_ENV: 'test'`
- `apps/web/e2e/auth-flow.spec.ts` existe : 6 tests anon redirects (Module 2 / Phase 3 smoke)

→ **Action** : étendre l'existant, pas réinventer. **Mais** la config actuelle utilise Supabase MOCKED — incompatible avec le pattern bypass auth du brief qui requiert un vrai backend Supabase pour `auth.admin.generateLink()`.

### Q2 — Docker disponible ?

**OUI ✓** : `/usr/local/bin/docker` + `/usr/local/bin/docker-compose` installés. **`mailpit` brew non installé**.

→ **Action** : suivre le brief = `docker-compose.qa.yml` (pas brew). Léger, reproductible.

### Q3 — Variables d'env existantes

`apps/web/.env.local` contient :

- ✅ `NEXT_PUBLIC_SUPABASE_URL` (cloud `ytlfnxcrclugrsbvqdkb` — equity-platform-claude)
- ✅ `SUPABASE_SERVICE_ROLE_KEY`
- ✅ `RESEND_API_KEY`
- ❌ Pas de `E2E_BYPASS_SECRET` (à ajouter)
- ❌ Pas de `.env.test` ni `.env.testing`

→ **Action** : ajouter `E2E_BYPASS_SECRET` + `.env.example` + setup variables Vercel preview (PAS prod).

### Q4 — Architecture seed actuelle

- ❌ Pas de `pnpm seed` ou `pnpm db:seed`
- ❌ Pas de dossier `apps/web/scripts/`
- ✅ Seed cloud actuel : via migrations `demo_paragraphe_*` (10 migrations cloud-only, cf list_migrations PR #42)
- David crée des users de test via UI signup actuellement (5 users en cloud `ytlfnxcrclugrsbvqdkb` dont `sasportasdavid+owner@gmail.com`, `+2`, `+test`, etc.)

→ **Action** : créer `apps/web/scripts/seed-qa-users.ts` comme prescrit par le brief.

---

## 2. Arbitrages bloqueurs — 🛑 STOP avant migration / projet QA

### A1 — Supabase MOCKED vs réel projet QA dédié

**Conflit** : La config Playwright actuelle utilise Supabase **MOCKED** (`http://127.0.0.1:54331` + clé fake). Le pattern bypass auth du brief requiert un **vrai backend** Supabase pour :

- `supabase.auth.admin.generateLink({ type: 'magiclink', ... })`
- Lecture de `user_profiles.is_test_user` flag
- Insertion via service_role pour seed initial

**3 options** :

- **α** : Créer un **nouveau projet Supabase dédié QA** ($$$ — Supabase free tier limité à 2 projets actifs / org, +50€/mo si dépassement. À confirmer avec quotas Capiwise org)
- **β** : Réutiliser le projet dev `ytlfnxcrclugrsbvqdkb` MAIS isoler les users QA (pollue les 286 demo events + risque collision avec users réels). Acceptable si on namespace strict (`@capiwise-qa.test` email pattern + `is_test_user=true` flag + RLS strict).
- **γ** : Garder le pattern Supabase MOCKED actuel + écrire des E2E qui n'exigent **pas d'auth réelle** (anon redirects + 1er rendu page publique). Limité — couvre `audit-trail-smoke` partiel seulement (auth gate pas testé).

→ **Recommandation V1 minimaliste** : **Option β** (dev cloud existant + namespace QA strict). Évite cost + setup d'un nouveau projet. À condition que :

1. RLS soit confirmée stricte (events seed QA ne s'affichent pas pour users non-QA)
2. Migration de seed soit clairement marquée + facile à reverter
3. Cleanup script disponible pour supprimer les users QA

### A2 — Migration `99999_seed_qa` numéro

Brief propose `99999_seed_qa_users_and_org.sql`. Risque collision V1.X / V2 :

- Migrations actuelles : 00001 → 00097 (cloud + repo)
- Migration cloud-only `demo_paragraphe_*` non numérotée
- Si 99999 est utilisé puis Module 14/15 livre 00098+, c'est OK (numéro très haut). Mais si une migration 99998 est créée par erreur, ordre cassé.

→ **Recommandation** : utiliser **`99000_qa_seed_users_org_dev_only.sql`** (préfixe `99` réservé aux migrations QA, suffixe `_dev_only` rappelle la nature non-prod). Plus marge avant collision.

### A3 — Route `/api/test/login` sécurité prod

Brief prescrit 4 couches de défense :

1. `NODE_ENV !== 'production'` → 404
2. Header `x-test-secret` valide → 401
3. `user_profiles.is_test_user = true` → 403
4. Email pattern `@capiwise-qa.test` → 403

**Risque résiduel** identifié dans le brief §"Pièges" #5 : "Route doit RETURN 404 sans loguer en prod, sinon c'est une fuite info-disclosure". Notre middleware Next.js par défaut log toutes les routes — il faut un `next.config` explicit pour silencer en prod (couche 5 implicite).

**Risque add'l** : `E2E_BYPASS_SECRET` env var en preview Vercel. Le brief dit "NE PAS le configurer comme env var prod". Il faut documenter dans `docs/QA_SETUP.md` + checklist Vercel.

→ **Recommandation** : implémenter la route avec les 4 couches + ajouter une **5e couche fuse** (`if (env.VERCEL_ENV === 'production') return 404`) doublé du `NODE_ENV` check (defense in depth). Et documenter explicitement la configuration env Vercel.

### A4 — Conflit data-testid existants vs brief

Brief réclame :

- `data-testid="audit-event-row"` sur les rows
- `data-testid="audit-event-drawer"` sur le drawer
- `data-testid="audit-event-hash"` sur le hash full

**Existant PR #41** :

- `data-testid="audit-trail-event"` (article inside row)
- `data-testid="audit-event-row-clickable"` (wrapper client)
- `data-testid="audit-event-detail-drawer"` (drawer)
- Pas de testid spécifique sur hash full (juste `data-testid="audit-drawer-section-hash"`)

→ **Recommandation** : **adapter le scénario** au testid existant (pas modifier les composants). Plus stable pour les futures PRs E2E qui réutiliseront les mêmes selectors. Les selectors brief sont indicatifs, pas figés.

### A5 — Tests parallèles + DB partagée

Brief §"Pièges" #8 : `fullyParallel: true` + plusieurs tests touchent la même DB → risque mutations cross-tests. Notre config actuelle utilise déjà `fullyParallel: false` + `workers: process.env.CI ? 1 : 2`. Bien aligné.

→ **Recommandation** : **garder l'existant** (`fullyParallel: false`). Le brief recommande `fullyParallel: true` mais notre config actuelle est plus prudente — gardons-la.

---

## 3. Plan d'implémentation conditionné aux arbitrages

**SI Option β (dev cloud reuse + namespace QA strict)** retenue :

| Commit | Phase | Description                                                                                                                                                         |
| ------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | B0    | audit memo (ce fichier)                                                                                                                                             |
| 2      | B1    | `docker-compose.qa.yml` + `docs/QA_SETUP.md`                                                                                                                        |
| 3      | B2    | Migration `99000_qa_seed_users_org_dev_only.sql` (col `is_test_user` + 1 org QA) + script `apps/web/scripts/seed-qa-users.ts` (5 users via `auth.admin.createUser`) |
| 4      | B3    | Route `/api/test/login` 4 couches + env var `E2E_BYPASS_SECRET` + doc Vercel preview-only                                                                           |
| 5      | B4    | Étendre `playwright.config.ts` (env vars QA pour bypass) + helpers `tests/e2e/helpers/auth.ts` (loginAs + Mailpit)                                                  |
| 6      | B5    | 1er scénario `audit-trail-smoke.spec.ts` (3 tests adaptés aux testid existants : `audit-trail-event`, `audit-event-detail-drawer`)                                  |
| 7      | B6    | `.github/workflows/e2e.yml` + memory closure + `CLAUDE.md` règle                                                                                                    |

**Tests cible** : 1283 (post-PR #42) + 3 E2E neufs = **1286 workspace** (cible brief 1295-1310 plus haute, à clarifier).

---

## 4. Risques côté impact

1. **Réutilisation dev cloud** : si le seed QA crée 5 users + 1 org, le dashboard de tous les autres users (David+ses comptes test) verra apparaître les 5 nouveaux acteurs dans les listes (filtres acteurs etc.). **Mitigation** : `is_test_user=true` + filtrer côté query si besoin (V1.X).
2. **Auth admin generateLink rate limit** : Supabase limite `auth.admin.*` à ~5 requests/sec. Pour 3 tests E2E qui appellent `loginAs` chacun, OK. Mais le mock côté CI pourrait dépasser si la suite grossit V1.X.
3. **Migration 99000 idempotency** : doit être ré-exécutable sans planter. Le brief utilise `ON CONFLICT DO NOTHING` — bien.
4. **Security CI** : `E2E_BYPASS_SECRET` en GitHub Actions secrets. Si exposed dans logs → game over. **Mitigation** : passer uniquement via `env:` block, jamais en `echo` ou `run`.

---

## 5. Décisions à arbitrer (David)

1. **Supabase QA**: Option β (reuse dev cloud + namespace QA) **ou** Option α (nouveau projet dédié) ?
   - **Mon avis** : Option β V1 (cost-efficient, easy revert).

2. **Migration numéro** : `99000_qa_seed_users_org_dev_only.sql` (proposé) **ou** `99999_seed_qa_*` (brief original) ?
   - **Mon avis** : `99000_*_dev_only` (plus de marge + suffixe explicite).

3. **Couche 5 fuse Vercel prod** : ajouter `VERCEL_ENV === 'production'` check en plus du `NODE_ENV` ?
   - **Mon avis** : OUI (defense in depth, vu la sensibilité de la route).

4. **Tests parallel** : garder `fullyParallel: false` (existant) **ou** suivre brief `fullyParallel: true` ?
   - **Mon avis** : garder existant (plus safe, scope V1 ne le justifie pas).

5. **Adapter selectors aux testid existants** PR #41 plutôt que modifier les composants ?
   - **Mon avis** : OUI (stable + pas de churn).

---

## ✅ Conclusion B0

**Prereqs techniques OK** : Playwright 1.59.1 + config existante + Docker dispo + env vars présentes.

**Bloqueur** : Supabase MOCKED actuel ≠ pattern bypass auth brief. Choix Option α/β/γ requiert décision David sur cost + impact dev cloud.

**Demande** : arbitrer les 5 points §5 avant que je démarre B1. Sans cela, je risque de coder dans une mauvaise direction (notamment seed cloud sur le mauvais projet).

**Pas de bloqueur Playwright lui-même** : l'extension du `playwright.config.ts` + helpers + 1er scénario peut démarrer dès que le pattern Supabase est tranché.
