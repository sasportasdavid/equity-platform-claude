# Capiwise — Equity Platform

SaaS B2B français de gestion administrative et financière de plans d'actionnariat salarié (BSPCE, AGA, Stock Options, BSA, RSU). Conformité réglementaire FR + valorisation IFRS 2.

## Stack

- **Frontend** : Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind · shadcn/ui
- **Backend** : Server Actions · Supabase (PostgreSQL + RLS + Auth + Storage + Edge Functions)
- **Intégrations** : Resend (email), Yousign (e-signature), moteur Python Quant existant (Fly.io)
- **Tooling** : pnpm workspace · ESLint · Prettier · Husky · Conventional Commits · Playwright

## Structure

```
equity-platform/
├── apps/
│   └── web/            # Application Next.js 15
├── packages/
│   └── shared/         # Types, schémas Zod, constantes partagées
├── supabase/
│   ├── migrations/     # Schéma DB versionné
│   └── functions/      # Edge Functions Deno
└── docs/               # Specs modules (MODULE_01_FOUNDATION.md, ...)
```

## Démarrage local

```bash
# 1. Installer les dépendances
pnpm install

# 2. Configurer les variables d'environnement
cp .env.example apps/web/.env.local
# Puis remplir les valeurs (voir docs/setup ou demander à l'équipe)

# 3. Démarrer Supabase local (nécessite Docker)
pnpm supabase:start
pnpm supabase:reset   # Applique migrations + seed

# 4. Lancer Next.js
pnpm dev
```

L'app tourne sur [http://localhost:3000](http://localhost:3000), Supabase Studio sur [http://localhost:54323](http://localhost:54323).

## Scripts utiles

| Commande              | Effet                                        |
| --------------------- | -------------------------------------------- |
| `pnpm dev`            | Lance Next.js en mode dev                    |
| `pnpm build`          | Build de production                          |
| `pnpm lint`           | ESLint sur tout le monorepo                  |
| `pnpm typecheck`      | Vérification TypeScript stricte              |
| `pnpm test`           | Tests unitaires Vitest                       |
| `pnpm test:e2e`       | Tests Playwright                             |
| `pnpm format`         | Formatage Prettier                           |
| `pnpm supabase:start` | Démarre Supabase local (Docker)              |
| `pnpm supabase:reset` | Reset DB locale + applique migrations + seed |

## Conventions

- **Commits** : [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, etc.) — vérifié par `commitlint`.
- **Code** : pas de `any` non justifié, validation Zod systématique sur les Server Actions, audit trail sur toute action critique.
- **Sécurité** : RLS activée sur toutes les tables, jamais de `service_role` côté client, soft deletes par défaut.
- **Voir** [`docs/MODULE_01_FOUNDATION.md`](docs/MODULE_01_FOUNDATION.md) pour la spec d'architecture complète.

## Modules

| #    | Nom                       | Statut              |
| ---- | ------------------------- | ------------------- |
| 1    | Foundation & Architecture | ✅ Spec + bootstrap |
| 2-13 | À livrer                  | ⏳                  |
