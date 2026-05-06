# Architecture Capiwise — guide opérationnel

> **Public visé** : David (owner), futurs collaborateurs humains, instances Claude Code.
> **Objectif** : comprendre où vit le code, qui peut le toucher, et éviter les pièges classiques.
> **Dernière mise à jour** : 5 mai 2026 (post Module 14 mergé, tag v0.16.0).

---

## 1. Où vit Capiwise

### 1.1 Ton checkout local (sur ton Mac)

```
/Users/sasportasdavid/equity-platform/
├── apps/
│   ├── web/                    # Application Next.js 16 (Turbopack)
│   │   ├── src/
│   │   │   ├── app/            # App router (pages + layouts)
│   │   │   ├── components/     # Composants React
│   │   │   ├── lib/            # Utilitaires (auth, supabase client, env...)
│   │   │   ├── server/actions/ # Server Actions (login, onboarding, etc.)
│   │   │   └── proxy.ts        # Middleware Next.js (auth gating)
│   │   ├── e2e/                # Tests Playwright (30 scénarios)
│   │   ├── public/             # Assets statiques
│   │   ├── .env.local          # ⚠️ JAMAIS committé (secrets)
│   │   └── .next/              # Cache Turbopack (auto-généré)
│   └── quant-engine/           # Pricer Python (Black-Scholes + Monte Carlo)
├── packages/
│   └── shared/                 # Types + schémas Zod partagés
├── supabase/
│   ├── migrations/             # 100+ migrations SQL versionnées
│   └── functions/              # Edge Functions (Deno TypeScript)
├── memory/                     # Memos Claude Code (audit, closures par PR)
├── docs/                       # Documentation projet (← ce fichier ici)
├── .claude/
│   └── settings.json           # Config Claude Code (worktrees disabled)
├── .github/
│   └── workflows/              # GitHub Actions CI (tests, lint, e2e)
├── CLAUDE.md                   # Règles + dette technique pour Claude Code
└── package.json                # Monorepo pnpm workspaces
```

**Règle d'or** : tout le code Capiwise vit ici. C'est ton _home_ pour le projet.

### 1.2 Le cloud (sur Internet)

```
GitHub                          ── Source of truth du code
├── github.com/sasportasdavid/equity-platform-claude
├── master branch               # Code stable, taggé v0.X.Y
└── feat/* branches             # Pull Requests en cours

Vercel                          ── Hosting de l'app web
├── capiwise.com (production)   # 🔴 pas encore configuré (deploy first-time = demain)
└── *.vercel.app (previews)     # Auto-deploy par PR

Supabase                        ── DB + Auth + Edge Functions
└── ytlfnxcrclugrsbvqdkb.supabase.co
    ├── PostgreSQL (plans, awards, audit_logs, user_profiles, etc.)
    ├── Auth (users, sessions, magic-links)
    ├── Edge Functions (yousign-callback, ifrs2-runner, etc.)
    └── Storage (PDF documents)

Fly.io                          ── Pricer Python
└── equity-gem-quant-tonnom.fly.dev
    └── Déployé depuis apps/quant-engine/

Resend                          ── Emails transactionnels
└── Domaine capiwise.com (vérifié)
    └── Magic-links, invitations, notifications

Yousign                         ── Signature électronique (sandbox V1)
└── api-sandbox.yousign.app

EODHD                           ── Market data (volatilités historiques)
└── eodhd.com (utilisé par Module 11 IFRS 2)
```

---

## 2. Les acteurs qui peuvent toucher au code

### 2.1 David (toi)

**Capacités** :

- Lire/modifier les fichiers dans `equity-platform/`
- Lancer `pnpm dev`, `pnpm test`, `pnpm build`
- `git commit`, `git push` vers GitHub
- Configurer `.env.local` (jamais committé)
- Merger les PRs sur GitHub (`gh pr merge` ou via web UI)
- Déployer sur Vercel (à venir)

**Limites** :

- N'écris pas directement de code complexe. Délègue à Claude Code via briefs.

### 2.2 Claude Code (CLI ou Desktop app)

**Capacités** :

- Lire/modifier les fichiers dans `equity-platform/`
- Exécuter des commandes bash sur ton Mac
- Lancer `pnpm dev` (souvent via `preview_start` interne)
- Push branches sur GitHub
- Créer des PRs via `gh` CLI
- Utiliser les CLI installées (supabase CLI, vercel CLI, fly CLI)

**Limites** :

- Ne touche pas au cloud directement (passe par les CLI installées localement).
- Configuration : voir `.claude/settings.json` (worktrees DOIVENT être disabled).

**Workflow type** :

1. David donne un brief Markdown détaillé (sous-modules B0 → B6 typiquement).
2. Claude Code crée une branche `feat/...`, code, teste, commit.
3. Claude Code push + crée la PR.
4. David merge après review.

### 2.3 Claude.ai (chat assistant — le tuteur projet)

**Capacités** :

- Lire les fichiers projet uploadés (Modules de spec, briefs).
- Donner du code, des analyses, des briefs prêts pour Claude Code.
- Exécuter du SQL sur Supabase via MCP (`apply_migration`, `execute_sql`).
- Interroger Vercel via MCP (deployments, projects, logs).
- Naviguer GitHub via web fetch.

**Limites** :

- Ne touche PAS à ton Mac.
- Ne peut PAS exécuter de commandes shell sur ton ordi (te dit quoi taper, tu tapes).

**Workflow type** :

1. David expose un besoin/audit/question stratégique.
2. Claude.ai analyse, propose, génère briefs/SQL/explications.
3. David exécute (lui-même ou via Claude Code).
4. Claude.ai vérifie en cloud via MCP que tout est OK.

### 2.4 GitHub Actions (CI/CD)

**Capacités** :

- Lance automatiquement les tests à chaque push/PR.
- Vérifie les types TypeScript, lint, build.
- E2E Playwright (30 scénarios actuels).

**Configuré dans** : `.github/workflows/`

---

## 3. Le flow type d'un changement (de l'idée à la prod)

```
1. DAVID identifie un besoin
   │
   ▼
2. DAVID + CLAUDE.AI rédigent un brief Markdown détaillé
   (sous-modules B0 audit, B1-B5 implémentation, B6 tests + closure)
   │
   ▼
3. DAVID copie le brief dans Claude Code (terminal/desktop)
   │
   ▼
4. CLAUDE CODE
   ├── Crée branche feat/...
   ├── B0 audit (lit le code existant)
   ├── Si arbitrage critique → demande validation à David
   ├── B1-B5 implémentation
   ├── B6 tests (Vitest + Playwright)
   ├── Push branche
   └── Crée PR via gh CLI
   │
   ▼
5. GITHUB ACTIONS lance les tests automatiquement
   │
   ▼
6. DAVID review la PR (rapidement)
   ├── gh pr ready (si draft)
   ├── gh pr merge --squash --delete-branch
   └── git tag -a vX.Y.Z + git push origin vX.Y.Z
   │
   ▼
7. AUTO-DEPLOY (à venir)
   ├── Vercel auto-deploy preview/prod sur master
   └── Migrations Supabase → manuelles via supabase CLI ou MCP
```

---

## 4. La séparation `.env.local` ↔ Vercel env vars

### 4.1 Local (`.env.local`)

**Emplacement** : `apps/web/.env.local`

**Contient** : toutes les clés pour faire tourner l'app DEV LOCAL :

- Supabase (URL + anon key + service_role key)
- Resend (API key + from email)
- Yousign (sandbox)
- EODHD
- Quant Engine URL
- E2E bypass secret

**Statut** : ⚠️ JAMAIS committé (présent dans `.gitignore`).

**Backup** : à faire manuellement dans 1Password / coffre-fort (pas de versioning Git).

### 4.2 Production (Vercel env vars)

**Emplacement** : Vercel Dashboard → Project → Settings → Environment Variables

**Particularités** :

- 3 environnements : Production, Preview, Development.
- `NEXT_PUBLIC_APP_URL` doit valoir :
  - Production : `https://capiwise.com`
  - Preview : `https://capiwise-{branch}.vercel.app`
  - Development : `http://localhost:3000`
- Les secrets server-side (`SUPABASE_SERVICE_ROLE_KEY`, etc.) ne doivent jamais avoir le préfixe `NEXT_PUBLIC_*`.

---

## 5. Les pièges classiques (et comment les éviter)

### 5.1 Worktrees Claude Code (RÉSOLU le 5 mai 2026)

**Symptôme** : Claude Code lance `pnpm dev` sur un port aléatoire (60097, 49764, etc.) au lieu de 3000.

**Cause** : Claude Code créait par défaut un git worktree dans `.claude/worktrees/[nom-aléatoire]/` pour bosser en isolation. Ce worktree avait son propre `node_modules`, son propre besoin de `.env.local`, et son propre dev server. David testait sur 3000, Claude Code sur 60097 → 2 environnements désynchronisés.

**Fix permanent** : `.claude/settings.json` contient :

```json
{ "worktrees": { "enabled": false } }
```

**Vérification** :

```bash
git worktree list
# Doit afficher UNIQUEMENT :
# /Users/sasportasdavid/equity-platform   XXXXXXX [master]
```

Si plusieurs lignes apparaissent → un worktree fantôme existe encore. Le supprimer :

```bash
sudo rm -rf .claude/worktrees/[nom]
git worktree prune
```

### 5.2 `.env.local` écrasé ou désynchronisé

**Symptôme** : Runtime ZodError sur les variables `NEXT_PUBLIC_*` au démarrage de l'app, ou login retourne 500.

**Causes possibles** :

1. Une commande shell mal formée (heredoc bloqué) a tronqué le fichier.
2. Claude Code a écrasé une variable en pensant que sa valeur n'était pas critique.
3. Duplication accidentelle de section (lignes ajoutées 2 fois).
4. Espace en début/fin de valeur (`KEY= eyJhbG...` au lieu de `KEY=eyJhbG...`).

**Fix** :

1. Toujours éditer `.env.local` via VSCode/TextEdit, jamais via heredoc terminal.
2. Vérification rapide :
   ```bash
   cd apps/web && grep -E "^[A-Z]" .env.local | awk -F= '{print $1, "=", length($2), "chars"}'
   ```
3. Comparer les longueurs aux valeurs typiques :
   - `NEXT_PUBLIC_SUPABASE_URL` ≈ 40
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` ≈ 208
   - `SUPABASE_SERVICE_ROLE_KEY` ≈ 219
   - Les autres : voir doc Supabase/Resend/Yousign.

### 5.3 Cache Turbopack stale

**Symptôme** : modifications de `.env.local` ou `package.json` ne sont pas prises en compte au reload.

**Fix** :

```bash
cd /Users/sasportasdavid/equity-platform && \
  lsof -ti:3000 | xargs kill -9 2>/dev/null ; \
  rm -rf apps/web/.next && \
  pnpm dev
```

### 5.4 Magic-link expiré

**Symptôme** : "Erreur serveur (500)" ou "Invalid token" au clic d'un magic-link.

**Causes** :

- Token > 5 minutes (expire automatiquement).
- Token déjà cliqué (one-time-use).
- Cookie `sb-...-code-verifier` perdu (PKCE flow nécessite le browser qui a demandé le link).

**Fix** : redemander un nouveau magic-link, cliquer dans les 60 secondes, depuis le browser qui a demandé.

### 5.5 Boucle `/onboarding ↔ /dashboard ↔ /select-org` (RÉSOLU)

**Symptôme** : après login, redirection infinie entre ces 3 pages.

**Cause root** : le `custom_access_token_hook` Supabase ne propageait pas le claim `onboarding_completed` dans le JWT. Le proxy interprétait `undefined` comme `false`, déclenchant le gate Module 14 même pour des users onboardés en DB.

**Fix appliqué (commit après v0.16.0)** :

- `proxy.ts:118-122` : claim lu en _tristate_ (gate fire UNIQUEMENT si claim explicitement `false`).
- `onboarding/page.tsx:26` : exige l'invariant complet (`completed && profileFilled && hasOrg`) avant redirect dashboard.

**Dette V1.X #33 documentée** : le hook Supabase devrait propager le claim de manière fiable. Workaround proxy en place.

### 5.6 Plusieurs `pnpm dev` simultanés

**Symptôme** : tu testes des changements qui ne s'affichent pas (parce qu'ils sont sur un autre port).

**Diagnostic rapide** :

```bash
lsof -i:3000 -i:3001 -i:3002 -i:3003
```

**Fix** : kill tout et relancer un seul :

```bash
pkill -9 -f "next-server"
cd /Users/sasportasdavid/equity-platform && pnpm dev
```

---

## 6. Bonnes pratiques pour les futures sessions

### 6.1 Pour David

1. **Toujours travailler dans `/Users/sasportasdavid/equity-platform/`**. Tout le reste est temporaire.
2. **Lance `pnpm dev` toi-même** pour garder le contrôle du port et de l'environnement. Si Claude Code veut tester, il peut utiliser `curl` ou `playwright` sans relancer un dev server.
3. **Avant tout test, vérifie le port** : `lsof -i:3000`.
4. **`.env.local` = un seul endroit**, point. Backup mensuel hors-Git (1Password ou drive perso).
5. **Tag chaque PR mergée** : `git tag -a vX.Y.Z -m "..."` puis `git push origin vX.Y.Z`. Le projet utilise SemVer (patch pour hotfix, minor pour modules, major pour breaking changes).

### 6.2 Pour Claude Code

Quand David te lance une mission, **AVANT toute commande** :

1. Vérifie que tu es dans `/Users/sasportasdavid/equity-platform/` (pas dans un worktree).
2. Vérifie que `.env.local` existe et a les bonnes longueurs de clés.
3. Si David a un dev server qui tourne (port 3000), ne le tue pas — utilise-le ou test avec `curl`/`fetch`.
4. Communique systématiquement le `serverId` et le port au début d'une session.

### 6.3 Pour Claude.ai (chat)

Quand David expose un problème ou une vision stratégique :

1. **Vérifie en cloud (MCP Supabase/Vercel) avant de répondre** plutôt que de spéculer.
2. **Évite de générer des commandes shell complexes avec heredoc** — préfère VSCode pour éditer des fichiers `.env`.
3. **Pour les briefs Claude Code**, structure en sous-modules B0 (audit) → B1-B5 (implémentation) → B6 (tests + closure).
4. **Documente les décisions** (Option A vs B vs C) avec arguments factuels.

---

## 7. Commandes utiles (memory bank)

### Diagnostic état local

```bash
# Worktrees (doit afficher 1 seule ligne)
git worktree list

# Ports occupés
lsof -i:3000 -i:3001

# Longueurs des env vars (sans révéler les valeurs)
cd apps/web && grep -E "^[A-Z]" .env.local | awk -F= '{print $1, "=", length($2), "chars"}'

# Statut git rapide
git status && git log -1 --oneline

# Dernier tag posé
git describe --tags --abbrev=0
```

### Restart propre

```bash
cd /Users/sasportasdavid/equity-platform && \
  lsof -ti:3000 | xargs kill -9 2>/dev/null ; \
  pkill -9 -f "next-server" 2>/dev/null ; \
  rm -rf apps/web/.next && \
  pnpm dev
```

### Vérification cloud Supabase (depuis Claude.ai)

L'assistant Claude.ai peut exécuter :

- `Supabase:execute_sql` pour query la DB.
- `Supabase:apply_migration` pour appliquer une nouvelle migration.

### Vérification cloud Vercel (depuis Claude.ai)

L'assistant Claude.ai peut exécuter :

- `Vercel:list_projects`, `Vercel:list_deployments`.
- `Vercel:get_project`, `Vercel:get_deployment`.

---

## 8. Glossaire éclair

| Terme             | Définition                                                                                                                             |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Server Action** | Fonction TypeScript exécutée côté serveur Next.js, callable depuis un Client Component via un appel async (Module 14, Module 13, etc.) |
| **Edge Function** | Fonction Deno hébergée sur Supabase, indépendante de Next.js. Utilisée pour les webhooks et tâches asynchrones.                        |
| **Magic-link**    | Lien à usage unique envoyé par email pour s'authentifier sans mot de passe (PKCE flow Supabase).                                       |
| **PKCE**          | Proof Key for Code Exchange. Méthode sécurisée pour échanger un code contre un access token (utilisée par les magic-links).            |
| **JWT**           | JSON Web Token. Token signé contenant les claims du user (id, email, app_metadata, etc.). Stocké dans un cookie côté browser.          |
| **RPC**           | Remote Procedure Call. Fonction PostgreSQL appelée depuis le code applicatif (ex: `ensure_user_profile_exists`).                       |
| **Worktree**      | Checkout supplémentaire d'un repo git, dans un dossier séparé, pointant vers une autre branche. Désactivé pour Claude Code.            |
| **Turbopack**     | Bundler de Next.js (alternative à Webpack), utilisé en dev. A son cache dans `.next/`.                                                 |
| **MCP**           | Model Context Protocol. Protocole permettant à Claude.ai d'utiliser des outils externes (Supabase, Vercel, GitHub).                    |

---

## 9. Liens rapides

- **GitHub repo** : https://github.com/sasportasdavid/equity-platform-claude
- **Supabase Dashboard** : https://supabase.com/dashboard/project/ytlfnxcrclugrsbvqdkb
- **Resend Dashboard** : https://resend.com/domains
- **Yousign sandbox** : https://account.yousign.com
- **Fly.io app** : https://fly.io/apps/equity-gem-quant-tonnom
- **Vercel** : https://vercel.com/dashboard (à configurer demain)

---

## 10. Pour aller plus loin

- Spécifications fonctionnelles : voir `MODULE_*.md` dans la racine du repo (Module 1 → 14).
- Mémos de closure par PR : `memory/module_*_complete.md`.
- Règles techniques pour Claude Code : `CLAUDE.md` à la racine.
- Tests E2E : `apps/web/e2e/*.spec.ts`.

---

_Ce document est versionnée avec le code. Toute modification structurelle (nouvelle stack, nouveau service cloud, nouveau process) doit être reflétée ici._
