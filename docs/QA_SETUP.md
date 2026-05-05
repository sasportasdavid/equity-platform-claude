# Capiwise — QA E2E Setup (PR #44)

> **Statut** : Foundation livrée PR #44. 1 scénario E2E + infra reproductible.
> **Philosophie** : minimalisme maintenant, discipline ensuite, sophistication plus tard.

---

## 🎯 Ce que cette infra fait

- **5 users QA** seedés en cloud dev `ytlfnxcrclugrsbvqdkb` (couvrant les 5 rôles : OWNER / ADMIN_HR / APPROVER / AUDITOR / BENEFICIARY)
- **1 org QA isolée** (`Capiwise QA`, slug `capiwise-qa`, id `aaaaaaaa-1111-2222-3333-444444444444`)
- **Route bypass auth** (`/api/test/login`) avec 5 couches de sécurité — production-safe
- **Mailpit local** pour catcher les emails (magic link, invitations, notifications)
- **Playwright** étendu avec helpers `loginAs(role)` + Mailpit helpers
- **GitHub Actions e2e workflow** (PR + push master)

## 🚧 Ce que cette infra ne fait PAS (yet)

- Pas de tests **mutations** sur les vraies orgs (Paragraphe / Capiwise) — V1.X
- Pas de **régression visuelle** screenshots — V2
- Pas de **multi-browser** (Firefox, Safari) — V2
- Pas de **Claude in Chrome** staging nightly — post beta privée

---

## 🔧 Setup local (premier run)

### 1. Mailpit (Docker)

```bash
# Lancer
docker compose -f docker-compose.qa.yml up -d

# UI accessible
open http://localhost:8025

# Reset emails
docker compose -f docker-compose.qa.yml restart mailpit

# Stop
docker compose -f docker-compose.qa.yml down
```

**Alternative brew (si pas de Docker)** :

```bash
brew install mailpit
mailpit --listen 0.0.0.0:8025 --smtp 0.0.0.0:1025
```

### 2. Migration QA + seed users (one-shot)

```bash
# 1. Appliquer la migration cloud (col is_test_user + 1 org QA)
# Via Supabase MCP : mcp__supabase__apply_migration name='qa_seed_users_org_dev_only'
# OU via supabase CLI : supabase db push

# 2. Lancer le seed des 5 users QA
pnpm --filter web tsx scripts/seed-qa-users.ts

# Output attendu :
# ✅ Seeded owner@capiwise-qa.test (OWNER)
# ✅ Seeded admin-hr@capiwise-qa.test (ADMIN_HR)
# ... (5 users)
```

### 3. Variables d'env

Ajouter dans `apps/web/.env.local` :

```bash
# QA / E2E Testing — NEVER use in production
E2E_BYPASS_SECRET=qa-bypass-secret-change-me-in-ci
```

### 4. Lancer Playwright

```bash
# CLI mode
pnpm --filter web test:e2e

# UI mode (interactif, recommandé pour dev)
pnpm --filter web test:e2e:ui
```

---

## 🔐 Sécurité — la route `/api/test/login`

5 couches de défense en profondeur (pas une seule, **toutes** doivent passer) :

| #   | Couche                                            | Statut return | But                                 |
| --- | ------------------------------------------------- | ------------- | ----------------------------------- |
| 1   | `VERCEL_ENV !== 'production'`                     | 404           | Bloque toute exposition prod Vercel |
| 2   | `NODE_ENV !== 'production'`                       | 404           | Redondance Next.js (dev/test pass)  |
| 3   | Header `x-test-secret` matche `E2E_BYPASS_SECRET` | 401           | Authentifie les tests               |
| 4   | `user_profiles.is_test_user = true`               | 403           | DB-level guard                      |
| 5   | Email pattern `@capiwise-qa.test`                 | 403           | Dernière barrière de namespace      |

**En prod**, la route répond TOUJOURS `404 Not Found` (couches 1+2). Les couches 3-5 ne sont que de la défense en profondeur si jamais une env var prod est mal configurée.

### Configuration Vercel

| Env Var                     | Preview             | Production               |
| --------------------------- | ------------------- | ------------------------ |
| `E2E_BYPASS_SECRET`         | ✅ Configurer       | ❌ **NE PAS configurer** |
| `NEXT_PUBLIC_SUPABASE_URL`  | ✅ (cloud QA)       | ✅ (cloud prod)          |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ (clé QA, ≠ prod) | ✅ (clé prod)            |

⚠️ Si jamais `E2E_BYPASS_SECRET` est défini en prod par accident, la couche 1 (`VERCEL_ENV === 'production'`) protège quand même.

---

## 📋 Inventaire users QA

| Email                          | Role        | Password (dev only) | Membership           |
| ------------------------------ | ----------- | ------------------- | -------------------- |
| `owner@capiwise-qa.test`       | OWNER       | `qa-test-pwd-2026`  | `Capiwise QA` ACTIVE |
| `admin-hr@capiwise-qa.test`    | ADMIN_HR    | `qa-test-pwd-2026`  | `Capiwise QA` ACTIVE |
| `approver@capiwise-qa.test`    | APPROVER    | `qa-test-pwd-2026`  | `Capiwise QA` ACTIVE |
| `auditor@capiwise-qa.test`     | AUDITOR     | `qa-test-pwd-2026`  | `Capiwise QA` ACTIVE |
| `beneficiary@capiwise-qa.test` | BENEFICIARY | `qa-test-pwd-2026`  | `Capiwise QA` ACTIVE |

Tous ces users portent `user_profiles.is_test_user = true` — flag obligatoire pour passer la couche 4 du bypass.

**Garde-fou** : `loginAs(role)` refuse si l'user n'a pas son `is_test_user=true` flag, même avec le secret valide.

---

## 🧪 Écrire un nouveau scénario E2E

### Pattern minimal

```typescript
import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('Mon nouveau flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'OWNER');
  });

  test('mon scénario read-only', async ({ page }) => {
    await page.goto('/dashboard/...');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
```

### Pattern avec email Mailpit

```typescript
import { clearMailpit, getMailpitMessages } from './helpers/auth';

test('user reçoit email après action', async ({ page }) => {
  await clearMailpit();

  // ... action qui déclenche email ...

  const messages = await getMailpitMessages({ to: 'owner@capiwise-qa.test' });
  expect(messages.length).toBeGreaterThan(0);
  expect(messages[0].Subject).toContain('Bienvenue');
});
```

### Règles d'or V1

1. **Read-only par défaut** — pas de mutation sur la DB cloud (sinon afterEach cleanup obligatoire)
2. **Strict namespace QA** — JAMAIS toucher Paragraphe (`526b87a9-...`) ou Capiwise (`9b72d914-...`)
3. **1 scénario = 1 flow** — pas de tests qui touchent à 5 features différentes
4. **Pas de timeouts > 10s** sans justification (sinon le test ralentit toute la suite CI)
5. **Selectors `data-testid`** > selectors texte (résistants aux évolutions UI)

---

## 🚀 CI GitHub Actions

Le workflow `.github/workflows/e2e.yml` lance la suite Playwright sur :

- **Pull requests** vers `master`
- **Push** sur `master` (regression continue)

Services container Mailpit dans le job. Secrets requis :

| Secret                    | Valeur                                    |
| ------------------------- | ----------------------------------------- |
| `SUPABASE_URL_QA`         | URL du projet Supabase QA (=dev cloud V1) |
| `SUPABASE_SERVICE_KEY_QA` | Service role key du projet QA             |
| `E2E_BYPASS_SECRET`       | Secret bypass auth (≠ prod !!!)           |

Sur fail : `playwright-report/` uploadé en artifact (rétention 30j).

---

## 📚 Helpers disponibles

| Helper                              | Usage                                                  |
| ----------------------------------- | ------------------------------------------------------ |
| `loginAs(page, role)`               | Bypass auth via `/api/test/login` + redirect dashboard |
| `getMailpitMessages({to, subject})` | List emails Mailpit filtré                             |
| `clearMailpit()`                    | Vide la boîte Mailpit avant un test                    |

---

## ⚠️ Pièges connus

1. **`pnpm dev` qui tourne en parallèle** : Playwright utilise port 3100, Next dev classique 3000. OK.
2. **Migration 99000 dev cloud** : si appliquée 2× → idempotente (`ON CONFLICT DO NOTHING`). Si script seed lancé 2× → `auth.admin.createUser` retourne erreur "already exists" → log `skipped` mais pas de throw.
3. **Mailpit Docker volume `mailpit_data`** : persiste entre redémarrages. Pour cleaner full : `docker compose -f docker-compose.qa.yml down -v` (supprime le volume).
4. **`E2E_BYPASS_SECRET` dans CI logs** : passer via `env:` block (jamais en `echo`/`run`). GitHub Actions masque automatiquement les secrets dans les logs.
5. **CI session cookies** : Playwright redémarre le contexte entre tests. Pas de pollution de session inter-tests par défaut.

---

## 📅 Roadmap V1.X / V2

### V1.X (post-PR #44)

- Régression visuelle screenshots baseline (1 par page critique)
- Multi-browser Firefox + Safari (si demande client)
- Pattern fixtures DB stratifié (par schemaName Supabase)
- Tests mutations avec cleanup transactional

### V2

- Claude in Chrome staging nightly (QA exploratoire continu)
- Performance budget par scénario (TTI < 3s, LCP < 2.5s)
- E2E Module 14+ : signup-flow, invitation-accept, onboarding-wizard, etc.

### Cible fin Module 16

**25-30 scénarios E2E** (pas 250). Largement suffisant pour beta privée.
