# Equity Platform — Contexte projet

## Mission

SaaS B2B français de gestion administrative et financière de plans d'actionnariat salarié.
Stack : Next.js 15 + Supabase + Resend + Yousign + moteur Python Monte Carlo existant (https://equity-gem-quant.fly.dev).

## Spec architecture

Voir `docs/MODULE_01_FOUNDATION.md` — c'est le document de référence.
Lis-le intégralement avant toute action.

## Modules à venir

Les modules 2 à 13 seront fournis un par un dans `docs/MODULE_XX_*.md`.
Ne pas anticiper les modules futurs sauf instruction explicite.

## Conventions

- Pas de `any` TypeScript sans justification commentée
- Toujours valider les inputs Server Actions avec Zod
- Toujours logger les actions critiques dans `audit_events`
- pnpm comme package manager
- Conventional Commits (feat:, fix:, chore:, etc.)

## État actuel

[À mettre à jour au fur et à mesure]

## État actuel

- [x] Module 1 — Foundation (terminé le X)
- [ ] Module 2 — Identity & Roles (en cours)
