---
name: PR #44 — QA E2E Foundation Playwright (closure)
description: Foundation E2E livrée — Mailpit Docker + migration QA cloud + route bypass 5 couches + helpers loginAs + 1er scénario audit-trail-smoke + GitHub Actions
type: project
---

# PR #44 — QA E2E Foundation closure

**Date** : 2026-05-05
**Branche** : `feat/qa-e2e-foundation` (depuis master `e1179bf` post-PR #42)
**Cloud project** : `ytlfnxcrclugrsbvqdkb` (1 migration QA-only appliquée)
**Philosophie** : minimalisme maintenant, discipline ensuite, sophistication plus tard.

---

## Livrables (6 phases)

| Phase | Livrable                    | Fichier                                                                                          |
| ----- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| B1    | Mailpit Docker              | `docker-compose.qa.yml` + `docs/QA_SETUP.md`                                                     |
| B2    | Migration QA + script seed  | `supabase/migrations/99000_qa_seed_users_org_dev_only.sql` + `apps/web/scripts/seed-qa-users.ts` |
| B3    | Route bypass 5 couches      | `apps/web/src/app/api/test/login/route.ts`                                                       |
| B4    | Playwright config + helpers | `apps/web/playwright.config.ts` (étendu real-Supabase mode) + `apps/web/e2e/helpers/auth.ts`     |
| B5    | 1er scénario E2E            | `apps/web/e2e/audit-trail-smoke.spec.ts` (3 tests)                                               |
| B6    | CI + CLAUDE.md règle        | `.github/workflows/e2e.yml` + `CLAUDE.md` règle "no merge sans E2E à partir M14"                 |

---

## Décisions B0 tranchées (5 arbitrages)

| #   | Décision                                             | Détail                                                                                                                           |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **Option β** : reuse dev cloud + namespace QA strict | Org QA `aaaaaaaa-1111-2222-3333-444444444444`, emails `@capiwise-qa.test` only, `is_test_user=true` flag obligatoire             |
| A2  | Migration `99000_qa_seed_users_org_dev_only.sql`     | Préfixe `99` réservé QA, suffixe `_dev_only` explicite                                                                           |
| A3  | **5 couches sécurité** sur route bypass              | VERCEL_ENV + NODE_ENV + secret + is_test_user + email pattern                                                                    |
| A4  | Selectors adaptés aux testid existants PR #41        | `audit-trail-event`, `audit-event-row-clickable`, `audit-event-detail-drawer`, `audit-drawer-section-hash`, `audit-drawer-close` |
| A5  | `fullyParallel: false` préservé                      | DB partagée V1 + scénarios read-only                                                                                             |

---

## Conditions strictes namespace QA (A1 user)

✅ Email **@capiwise-qa.test ONLY** — route bypass reject sinon (couche 5)
✅ `user_profiles.is_test_user=true` requis — couche 4 DB-level
✅ Org QA isolée slug `capiwise-qa`, id fixé `aaaaaaaa-1111-2222-3333-444444444444`
✅ AUCUN test ne touche Paragraphe (`526b87a9-…`) ou Capiwise (`9b72d914-…`)
✅ Helper `loginAs(role)` map les 5 emails QA, throw si role inconnu
✅ V1 = scénarios **read-only** ; toute mutation V1.X doit cleaner en `afterEach`

---

## DB cloud appliqué

### `qa_seed_users_org_dev_only`

- `ALTER user_profiles ADD COLUMN is_test_user BOOLEAN NOT NULL DEFAULT false`
- `INDEX idx_user_profiles_test_users ON (is_test_user) WHERE TRUE`
- `INSERT organizations` : 1 org Capiwise QA (id `aaaaaaaa-1111-2222-3333-444444444444`)

⚠️ La création des 5 auth.users + memberships se fait via le script TS
`scripts/seed-qa-users.ts` (auth.admin.createUser ne marche pas en SQL pur).
À lancer une fois post-migration : `pnpm --filter web tsx scripts/seed-qa-users.ts`

---

## Sécurité route `/api/test/login` — 5 couches

| #   | Check                                             | Statut return               |
| --- | ------------------------------------------------- | --------------------------- |
| 1   | `process.env.VERCEL_ENV === 'production'`         | 404 plain text              |
| 2   | `process.env.NODE_ENV === 'production'`           | 404 plain text (redondance) |
| 3   | Header `x-test-secret` matche `E2E_BYPASS_SECRET` | 401                         |
| 4   | DB lookup → `user_profiles.is_test_user === true` | 403                         |
| 5   | Email regex `@capiwise-qa.test$`                  | 403                         |

**En prod Vercel** : couches 1+2 → toujours 404, peu importe le secret/payload.
**En dev/test/preview** : couches 3-5 valident, retourne 200 avec `action_link`.

---

## Helpers Playwright (B4)

```typescript
// e2e/helpers/auth.ts
loginAs(page, 'OWNER' | 'ADMIN_HR' | 'APPROVER' | 'AUDITOR' | 'BENEFICIARY')
getMailpitMessages({ to?, subject? })  // list emails Mailpit
clearMailpit()                           // vide la boîte (afterEach pattern)
```

Ports : Playwright 3100, Next dev classique 3000, Mailpit SMTP 1025 / UI 8025.

---

## Scénario `audit-trail-smoke.spec.ts` (B5, 3 tests)

1. **OWNER accède /dashboard/audit-trail** → hero h1 visible + audit-trail-list visible
2. **Click row → drawer ouvre** → URL `?event=…` + `audit-drawer-section-hash` visible
3. **Click backdrop close → drawer ferme** → URL nettoyée (`?event=` retiré)

Tous read-only. Aucun cleanup nécessaire.

---

## CI GitHub Actions (B6)

`.github/workflows/e2e.yml` :

- Trigger : `pull_request` master + `push` master
- Service container Mailpit (latest)
- Setup pnpm 8 + Node 20 + Playwright chromium
- `pnpm --filter web test:e2e` avec env QA forwardée
- Upload `playwright-report/` en artifact si échec (rétention 30j)
- `concurrency` : 1 run par ref (cancel-in-progress)

**Secrets GitHub Actions à configurer** :

- `SUPABASE_URL_QA` (= dev cloud V1)
- `SUPABASE_ANON_KEY_QA`
- `SUPABASE_SERVICE_KEY_QA`
- `E2E_BYPASS_SECRET` (≠ prod !!!)

---

## Règle CLAUDE.md activée

À partir de Module 14, **NO MERGE sans ≥ 1 test E2E** pour les flows critiques de la feature. Patterns suggérés :

- Module 14 : `signup-flow.spec.ts` / `invitation-accept.spec.ts` / `onboarding-wizard.spec.ts`
- Module 15 : `cap-table-totals.spec.ts` / `vesting-forecast.spec.ts`
- Module 16 : `approval-workflow.spec.ts` / `delegation.spec.ts`

Cible fin M16 : **25-30 scénarios E2E**. Cible Q4 2026 : Claude in Chrome staging nightly.

---

## Vérifications restantes (post-merge)

⚠️ **Non exécuté en local cette session** :

1. `pnpm --filter web tsx scripts/seed-qa-users.ts` — création des 5 users sur dev cloud
2. `docker compose -f docker-compose.qa.yml up -d` — lancement Mailpit
3. `pnpm --filter web test:e2e` — run de la suite (3 tests audit-trail-smoke + 6 anon redirects existants)
4. Validation visuelle Playwright `--ui` mode

→ **Dette V1.X** : David doit lancer ces 4 étapes manuellement post-merge pour activer la foundation. Cf `docs/QA_SETUP.md` setup steps.

---

## Stats

- **Tests workspace avant** : 1283 (post-PR #42)
- **Tests workspace après** : 1283 (les 3 E2E ajoutés sont en suite Playwright séparée, pas Vitest workspace)
- **Tests E2E** : 6 anon redirects existants + **3 nouveaux audit-trail-smoke** = 9 total
- **LOC ajoutées** : ~1100 (docs + config + helpers + scénario + CI workflow + memory)

---

## Dettes V1.X documentées

1. **#133 seed-qa-users.ts pas exécuté** : à lancer manuellement post-merge
2. **#134 GitHub secrets non configurés** : `SUPABASE_*_QA` + `E2E_BYPASS_SECRET` à ajouter
3. **#135 Vercel env vars** : `E2E_BYPASS_SECRET` à configurer **uniquement preview**, jamais prod
4. **#136 Tests parallel** : `fullyParallel: false` V1, à reconsidérer V1.X si scénarios > 20
5. **#137 Régression visuelle** : screenshots baseline V2
6. **#138 Multi-browser** : Firefox + Safari V2 si demande client
7. **#139 Pattern fixtures DB** : isolation par schemaName V1.X
8. **#140 Tests mutations** : afterEach cleanup transactional V1.X
9. **#141 Régen DB types post-99000** : `is_test_user` pas dans les types — cast `unknown` dans la route bypass

---

## Sécurité — checklist post-merge

- [ ] `E2E_BYPASS_SECRET` présent dans GitHub Actions secrets
- [ ] `E2E_BYPASS_SECRET` présent dans Vercel **preview** uniquement (PAS production)
- [ ] Vercel env vars confirmées sur dashboard Settings → Environment Variables
- [ ] Test smoke en local : `pnpm --filter web test:e2e --ui` avec real Supabase
- [ ] Migration `qa_seed_users_org_dev_only` confirmée appliquée (vérifier `is_test_user` column existe)
- [ ] Script seed lancé : 5 users `@capiwise-qa.test` présents en DB
- [ ] Cleanup script V1.X documenté pour supprimer users QA si besoin
