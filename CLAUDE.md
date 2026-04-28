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

### État actuel

- [x] Module 1 — Foundation
- [x] Module 2 — Identity & Roles — login fonctionnel ✅
- [x] Module 3a — Plans
  - [x] Wizard 7 étapes (container + sidebar + footer + auto-save brouillon)
  - [x] B1 — Migrations tables métier (00010-00019)
  - [x] B2 — RPC `create_plan_full` atomique + Server Action `createPlan`
  - [x] B3 — Server Actions update / duplicate / archive / lock + RPC `duplicate_plan_full` + `PlanActionsMenu` UI
  - [x] B4 — Pages liste + détail (8 onglets) + sidebar nav globale
  - [x] B5 fundation — Edge Function `compute-valuation` v4 + Server Action `runValuation` + `RunValuationButton` (Realtime) + `ValuationCard` sur Synthèse → fair_value IFRS 2 affiché end-to-end ✅
  - [x] B5.5 — Page détail valuation `/valuations/[runId]` (KPIs + tranches + sample paths Recharts + Greeks + audit trail)
  - [x] B5.6 — Onglet IFRS 2 réel + Edge Function `compute-ifrs2-expense` (étalement straight-line mensuel) + tables peuplées
  - [x] B5.7 — `compute_greeks=true` + `include_debug_paths` activés dans payload Python

## TODOs transverses (post Module 3a)

1. Migration de cohérence DB : `rate_flat` / `dividend_yield` en fraction (au lieu du fix défensif au payload Python — cf. `normalizeRateUnit`)
2. `runComplianceChecks` (Module 4 — `compliance_warnings` actuellement vide)
3. Setup Vitest + tests unitaires (`buildPythonPayload`, builders `plans.ts`, helpers)
4. Setup Playwright + tests E2E automatisés

## Sécurité

- [x] Rotation clé Resend après leak dans .env.example (date: \_\_\_)
