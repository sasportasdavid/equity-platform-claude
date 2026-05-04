# Observations post-PR #19 — bugs / dettes vues mais NON fixées dans les 5 mini-PRs

Ce fichier sert de "carnet d'observations" pour les bugs/dettes croisées
pendant le travail sur les mini-PRs #20-#24, mais qui sont hors scope
(strict atomic atomique, 1 bug = 1 PR).

À traiter dans des PRs ultérieures (#25+).

---

## Obs #1 — `apps/web/src/types/database.ts` dead code (3919 lignes)

**Découvert pendant** : PR #20 (sweep accidentel via `git add -A`).

**Symptôme** : fichier de types DB Supabase régénéré localement, présent en
untracked depuis avant PR #19. Aucun import dans `apps/web` (vérifié via
`grep -rn "@/types/database\|types/database" apps/web/src/`).

**Pourquoi c'est dead code** : la convention Capiwise (CLAUDE.md
"Migration DB" + dette #44 fix PR #9) exige que les types Supabase vivent
UNIQUEMENT dans `packages/shared/src/types/database.ts` (single source).
Les 3 clients Supabase (`apps/web/src/lib/supabase/{client,server,admin}.ts`)
importent `Database` depuis `@equity/shared`.

**Impact** : aucun à l'exécution (jamais loadé). Mais :

- Pollue la PR #20 (3919 lignes ajoutées au sweep)
- Risque de drift silencieux : si quelqu'un finit par importer ce path,
  il aura un type désynchronisé du canonical `packages/shared/...`
- Reproduit la dette #44 que PR #9 avait précisément fixée (autre path)

**Fix proposé V2** : `git rm apps/web/src/types/database.ts` dans une
chore-PR séparée (chore: rm dead types file, mirror dette #44 fix).
Ajouter aussi `apps/web/src/types/database.ts` à `.gitignore` ou au
script `pnpm gen:types` pour empêcher la régénération hors du canonical.

**Tentative** : pendant PR #20 j'ai voulu faire un commit cleanup qui
supprimait ce fichier. Le user a explicitement refusé (scope creep).
Le fichier reste donc dans la branche `fix/pr20-correlation-save-after-fetch`
— il sera mergé tel quel quand PR #20 sera squash-mergée. À nettoyer
en chore-PR post-merge.
