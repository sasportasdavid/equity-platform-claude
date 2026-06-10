# Audit global Capiwise — 10 juin 2026

> Audit multi-angles mené sur le repo (branche locale `fix/dark-mode-end-to-end`), la base
> Supabase de production (`ytlfnxcrclugrsbvqdkb`) et les Edge Functions déployées.
> Objectif : mise en ligne d'une solution complète, sans bug, bonne UX, gestion métier
> excellente. 5 audits parallèles (sécurité, qualité/architecture, métier, UX, tests/CI)
>
> - vérifications directes en cloud (advisors, RPC déployées, EFs).

## Verdict global

**Le produit n'est pas prêt pour une ouverture large en l'état.** Le socle est
remarquablement solide (1366 tests verts, typecheck strict, state machine 100 % testée,
RBAC + audit + Zod quasi systématiques, design system tokenisé), mais l'audit a confirmé
**3 vulnérabilités actives en production**, **1 bug financier sur la cap table**, et des
trous UX structurels (aucun état loading/error). Comptez ~2 semaines de travail focalisé
pour atteindre l'objectif.

| Domaine                                             | Score    | Résumé                                                                                   |
| --------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| Sécurité applicative (Server Actions, API, secrets) | 7,5/10   | Discipline excellente, rate limiting inopérant en serverless                             |
| Sécurité DB (RLS, RPC, advisors)                    | **4/10** | 3 vulnérabilités confirmées en prod                                                      |
| Qualité code & architecture                         | 6,5/10   | Cœur TS très propre, hygiène repo dégradée                                               |
| Logique métier                                      | 6,5/10   | State machine et fiscalité bien architecturées, erreurs de régime fiscal + bug cap table |
| UX / Frontend                                       | 6/10     | DS cohérent mais zéro loading/error, dark mode incomplet                                 |
| Tests & CI                                          | 6,5/10   | 1366 tests verts mais lint cassé, zéro E2E métier, CI partielle                          |

---

## P0 — Vulnérabilités et bugs bloquants (à corriger avant toute ouverture)

### P0-1 · `compliance_rule_definitions` : pas de RLS, `anon` a TOUS les droits ✅ vérifié en prod

La table n'a pas de RLS (advisor ERROR) et le rôle `anon` détient SELECT / INSERT /
UPDATE / DELETE / TRUNCATE (vérifié via `information_schema.role_table_grants`).
**N'importe qui avec la clé publique anon peut lire et réécrire les définitions des
23 règles de compliance** (severity, params par défaut) sur capiwise.fr.
**Fix** : `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + policies read authenticated /
write service_role, et `REVOKE` des grants anon. ~30 min.

### P0-2 · `confirm_exercise_payment` et `cancel_exercise_request` : fuite cross-org ✅ vérifié en prod

Les deux RPC SECURITY DEFINER vérifient `user_has_permission()` (scopée sur l'org du
caller) mais **jamais que la demande d'exercice appartient à l'org du caller**. Vérifié
dans `pg_proc` en cloud : aucun appel à `_enforce_tenant_org` ni `current_org_id`.
Un admin d'une org tierce qui connaît un UUID peut **confirmer un paiement d'exercice
(création de positions au capital sans paiement réel) ou annuler une demande** d'une
autre organisation. Le helper `_enforce_tenant_org` existe déjà (migration cloud
`fix_cross_org_rpcs` du 19 mai, qui a patché `compute_cap_table`) — il suffit de
l'ajouter à ces deux fonctions, puis de **passer les ~20 autres RPC SECURITY DEFINER au
même crible** (seuls `create_award_full` et `compute_cap_table` ont été durcis).

### P0-3 · Repo : l'EF `python-callback` committée est le code d'un AUTRE projet

`supabase/functions/python-callback/index.ts` (475 lignes) contient un chatbot
« CapiwiseCoach » avec `LOVABLE_API_KEY` et des tables inexistantes
(`incentive_plan_participants_v4`…). **La version déployée en cloud est la bonne**
(callback HMAC valuation, vérifié via l'API Supabase) — mais le repo ne contient nulle
part la vraie version. Tout redéploiement depuis le repo casserait la chaîne de
valorisation Monte Carlo et déploierait du code étranger. **Fix** : récupérer le source
cloud (fait pendant l'audit, dispo via `get_edge_function`) et le committer.

### P0-4 · Cap table DILUTED : double soustraction de `units_exercised`

`00085_module_10_compute_cap_table_rpc.sql:146` soustrait `units_exercised` de
`units_outstanding`, qui est une colonne GENERATED qui le soustrait **déjà**
(`00001:438`). Un award de 1 000 units dont 300 exercées affiche 400 units virtuelles
au lieu de 700 → **la vue fully-diluted est fausse pour tout award partiellement
exercé** (et la part exercée est en plus comptée en position COMMON réelle). Pour un
produit dont la cap table est la proposition de valeur, c'est bloquant.

### P0-5 · UX : aucun `loading.tsx` / `error.tsx` / `not-found.tsx` / `global-error.tsx`

Zéro fichier dans toute l'app (50 routes dashboard + portal). Navigation sans aucun
feedback pendant le fetch SSR (impression d'app gelée sur cap table / valuations),
et toute erreur runtime affiche l'écran Next.js brut — `global-error.tsx` manquant
alors que Sentry est en place. **Fix** : un `loading.tsx` + `error.tsx` au niveau
`(dashboard)/dashboard/` et `portal/` couvre tout par héritage. 0,5–1 j.

### P0-6 · Process : lint cassé (41 erreurs) et aucune CI sur les 1366 tests unitaires

`pnpm -F web lint` échoue (37× `react/no-unescaped-entities` mécaniques + 2 vrais
`set-state-in-effect`). Seul le E2E a un workflow GitHub Actions (`e2e.yml`, qui pin
d'ailleurs pnpm v8 alors que le repo exige 10.33.2). Une régression unitaire peut
merger silencieusement. **Fix** : corriger le lint (~1 h) + workflow CI
typecheck/lint/test (~30 lignes).

### P0-7 · Git : branche locale zombie et désynchronisée

La branche locale `fix/dark-mode-end-to-end` ne contient que le fix Sentry déjà mergé
(no-op), est 3 commits derrière master, et **les 2 vrais commits dark mode
(`e7ff62c`, `4ffee52`) n'existent que sur `origin/`** — dont le fix racine
`@custom-variant dark (&:where(.dark, .dark *))` absent du checkout local. Risque
d'écraser le travail distant. **Fix** : pull/rebase ou repartir de master. 10 min.

---

## P1 — À corriger avant ouverture large

### Sécurité

1. **Rate limiting in-memory inopérant sur Vercel** (`lib/rate-limit/memory-store.ts`) :
   chaque lambda a son propre compteur, perdu à chaque cold start. Migrer vers Upstash
   Redis ou une table Postgres.
2. **`sendMagicLink` sans rate limiting** (`auth.ts:311`) : la catégorie `magic_link`
   existe mais n'est jamais appelée → email-bombing + épuisement quota Resend possibles.
3. **`checkEmailExistsForLogin` = oracle d'énumération d'emails** (`auth.ts:44`) :
   Server Action non authentifiée retournant un booléen. Rate-limiter a minima,
   idéalement supprimer l'oracle.
4. **62 fonctions SECURITY DEFINER exécutables par `anon`** (advisor WARN) + 13 fonctions
   avec `search_path` mutable + 3 vues SECURITY DEFINER (ERROR advisor) : passe de
   hardening DB (REVOKE anon, `SET search_path`, security_invoker sur les vues).
5. **Pas de CSP/HSTS** (`next.config.ts` sans `headers()`) — dette déjà tracée.
6. Leaked password protection désactivée côté Supabase Auth (1 toggle).

### Métier (validation fiscaliste recommandée)

7. **Fiscalité AGA** (`lib/tax/aga.ts:84`) : applique CSG activité 9,7 % + contribution
   salariale 10 % sur tout le gain — or la fraction ≤ 300 k€ relève des PS du capital
   (17,2/18,6 %) sans contribution 10 %. Sur-taxe de 1 à 2,5 pts sur le cas dominant.
8. **Fiscalité SO** (`lib/tax/stockOption.ts:65`) : la contribution salariale 10 %
   (CSS L.137-14) est omise → sous-estimation ~10 pts. Symétrie suspecte avec le bug
   AGA (régimes probablement intervertis).
9. **Cap AGA « 30 % »** : 30 % n'est légal que si l'attribution bénéficie à tous les
   salariés (cas général : 15 %, 20 % PME non cotées) ; assiette gonflée par
   `POOL_RESERVE` ; 5 statuts d'awards exclus du cumul ; fail-open silencieux si le
   caller n'a pas `captable.read.all`.
10. **`BSPCE_BENEFICIARY_TYPE_REVERSE`** : `'EXTERNAL'` n'existe pas dans l'enum réel ;
    basculer un porteur BSPCE en `ADVISOR`/`OTHER` ne bloque pas.
11. **Les RPC exercise contournent la state machine** : `GRANTED → PARTIALLY_EXERCISED`
    n'est pas dans `ALLOWED_TRANSITIONS`, pas d'event `award.status_changed`. Documenter
    comme exception officielle ou aligner la SM.
12. **Arrondis vesting incohérents entre 3 implémentations** : `materialize_vesting_events`
    (drift-corrigé, la référence) vs fallback `request_exercise` (`::BIGINT`, pas de
    correction) vs `buildVestingTimeline` (`Math.round`). Sur 1 001 units × 4×25 %,
    totaux différents → un bénéficiaire peut se voir refuser ses dernières units.
13. **Taux fiscaux 2026 à faire valider ligne à ligne** (`rates.ts` : PFU 31,4 % basé sur
    LFSS 2025-1403, barème +0,9 %) — tout le simulateur en dépend.

### Qualité / hygiène

14. **`apps/web/src/types/database.ts`** : 3 919 lignes de code mort tracké, version
    périmée du fichier canonique `@equity/shared` — régression de la dette #44 (PR #20).
15. **Drift migrations repo ↔ cloud** : ~14 migrations cloud sans fichier local, dont
    5 fixes réels du 19 mai (`fix_cross_org_rpcs`, `fix_custom_access_token_hook_clear_stale`,
    `award_counter_self_healing`, `unique_default_workflow_per_applies_to`,
    `signature_settings_and_workflows`). À reverse-engineer et committer.
16. **EFs market-data non documentées** (`yahoo-search`, `market-data-fetch`,
    `market-data-peer-group`, `marketDataService.ts` 1 470 lignes) : style différent,
    10 `: any` non justifiés, absentes de CLAUDE.md.
17. Schémas Zod inline dans 9 fichiers Server Actions (violation convention).

### Tests

18. **Zéro E2E sur les flows métier** (plans, awards, exercises, cap table, portal) —
    la couverture actuelle = auth/signup/invitation/audit uniquement (37 tests).
19. **12/24 fichiers Server Actions sans aucun test** (~3 300 lignes), dont les 3 plus
    critiques : `documents.ts` (844 l.), `plans.ts` (502 l.), `auth.ts` (485 l.).
20. `useMonteCarloReplay.ts:141` + `CookieConsent.tsx:39` : setState-in-effect.

### UX

21. **Dark mode incomplet** : ~118 classes light-only en prod (Exercises, Cap Table,
    Compliance, + ~35 hex inline dans les charts Recharts) alors que
    `defaultTheme="system"` expose tous les users en OS sombre. Pas de ThemeToggle sur
    le portail bénéficiaire.
22. **7 tables sans overflow-x** dont `portal/exercises` (mobile bénéficiaire).
23. **Page orpheline** `settings/exercise-workflows` (aucun lien) + 2 items sidebar
    `disabled` vers des routes inexistantes (`/dashboard/reports`, `/dashboard/workflows`).
24. Contraste AA : `--ink-400` ≈ 3,2:1 sur paper-50 (~74 usages, seuil 4,5:1).
25. `aria-label` manquant sur `AwardRowActions` (toutes les lignes de la liste awards).

---

## P2 — Dette à tracer

- Performance DB (advisors) : 30 policies `auth_rls_initplan` non optimisées,
  29 `multiple_permissive_policies`, 79 FK non indexées, 46 index inutilisés,
  1 index dupliqué.
- Race conditions sans verrou optimiste (`transitionAward`, double `request_exercise`
  concurrent) ; `confirm_exercise_payment` ne compare jamais le montant reçu à
  `total_exercise_amount` ; `FULLY_EXERCISED` calculé sans tenir compte d'`units_cancelled`.
- `effectiveTaxRate` arrondi à 2 décimales (31 % affiché au lieu de 31,4 %).
- Quotient familial non plafonné (IR sous-estimé hauts foyers) — à warner dans l'UI.
- Hooks notifications exportés en Server Actions sans gate (`insertNotificationWithRender`…).
- Sandboxes `/dev/*` publiques si `ENABLE_DEV_SANDBOX=true` (vérifier la var en prod Vercel).
- Duplication `BulkImportModal` / `BulkImportBeneficiariesModal` (~700 lignes chacun) ;
  fichiers > 800 lignes (`cap-table.ts` 1 136, `awards.ts` 983…).
- FR/EN mélangés user-facing (« Award », « Dashboard », « Close ») ; EmptyState non
  généralisé sur 8 listes ; dossiers orphelins (`lib/state-machines/` vide…).
- lint-staged sans eslint ; pas de `test:coverage` ni script `verify` agrégateur.
- CLAUDE.md périmé : 1083 tests annoncés (réel 1366), « CI pas en place » (e2e.yml
  existe), Module 13 « à venir » (livré + Module 14 en prod), pas trace des modules
  marketing/site public ni des EFs market-data.
- 4 fichiers vides à la racine (`equity-platform@0.1.0`, `next`, `pnpm`, `web@0.1.0`)
  — artefacts shell du 6 mai, `rm` sans risque. `docs/PR_37_BRIEF_DASHBOARD_KPI_v2.md`
  non tracké : committer ou supprimer.

---

## Ce qui est solide (à préserver)

- **Discipline Server Actions** : sur ~90 actions, quadruple garde-fou
  (requirePermission / safeParse / Result pattern / audit) quasi systématique,
  0 IDOR détecté côté TS, scoping org correct sur members.
- **Secrets propres** : rien de committé, `admin.ts` en `server-only`, bypass E2E
  réellement verrouillé par 5 couches.
- **State machine awards** : conforme spec §2.2, pure, 100 % testée, aucune transition
  dangereuse, `createAndPropose` force DRAFT→transition pour l'audit.
- **Module tax** : architecture rates/helpers/régimes exemplaire, traçabilité
  `ratesYear` + sources dans chaque breakdown (les erreurs P1-7/8 sont des erreurs de
  _contenu_, pas de structure).
- **1366 tests verts en < 10 s**, typecheck strict vert, fiscal/compliance/state machine
  couverts à 100 % de leurs fichiers.
- **Infra E2E professionnelle** : bypass sécurisé, Mailpit, 5 users QA, workflow GitHub,
  test cross-org-leak.
- **Design system tokenisé** : la majorité des surfaces flippe déjà en dark via les
  vars ; pattern toast centralisé ; a11y au-dessus de la moyenne.
- **EF `python-callback` cloud** : pattern HMAC + idempotence propre (c'est le repo qui
  est faux, pas la prod).

---

## Plan d'action recommandé

### Semaine 1 — Sécurité & intégrité (bloquant)

1. RLS + revoke anon sur `compliance_rule_definitions` (30 min)
2. `_enforce_tenant_org` dans `confirm_exercise_payment` + `cancel_exercise_request`,
   puis crible des ~20 autres RPC SECURITY DEFINER + tests SQL d'isolation tenant (1-2 j)
3. Committer la vraie EF `python-callback` + les 5 migrations cloud du 19 mai (résorber
   le drift) (0,5 j)
4. Fix double soustraction cap table DILUTED + test PARTIALLY_EXERCISED (0,5 j)
5. Nettoyage git : rebaser/supprimer la branche locale, supprimer
   `apps/web/src/types/database.ts`, `rm` les 4 fichiers vides (1 h)
6. Fix lint (41 erreurs) + workflow CI typecheck/lint/test + pnpm 10 dans e2e.yml (0,5 j)

### Semaine 2 — Métier & UX

7. Correction des régimes fiscaux AGA/SO (probablement intervertis) + validation
   `rates.ts` par un fiscaliste + tests contre cas BOFiP chiffrés (1-2 j)
8. Cap AGA : plafond conditionnel 15/20/30 %, assiette capital social, statuts manquants,
   fail-loud (1 j)
9. Harmoniser les 3 implémentations d'arrondi vesting sur le modèle
   `materialize_vesting_events` (0,5 j)
10. `loading.tsx`/`error.tsx`/`global-error.tsx` dashboard + portal (1 j)
11. Dark mode : 118 classes light-only + charts sur vars `--chart-*` + ThemeToggle
    portal (2 j) — ou repli temporaire : forcer `defaultTheme="light"`
12. Quick wins UX : lien exercise-workflows, retrait items sidebar fantômes,
    overflow-x tables, aria-labels (0,5 j)

### Avant ouverture publique

13. 8 specs E2E métier : award-lifecycle, plan-wizard, portal-smoke, exercise-flow,
    cap-table-totals, document-generate, compliance-gate, magic-link (3-4 j)
14. Rate limiting partagé (Upstash/Postgres) + `sendMagicLink` + `checkEmailExists` (1 j)
15. Hardening DB : search_path, vues security_invoker, revoke anon sur les 62 fonctions,
    leaked password protection (1 j)
16. Mettre à jour CLAUDE.md (statut réel post-modules 13/14, EFs market-data, CI)
