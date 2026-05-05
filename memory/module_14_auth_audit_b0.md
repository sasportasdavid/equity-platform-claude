# Module 14 — Auth & Onboarding — Audit B0

> **PR cible** : #43 — Auth & Onboarding production-ready
> **Date audit** : 2026-05-05 (soir, post v0.15.2 / 7d26eb5)
> **Branche cible** : `feat/module-14-auth-onboarding`
> **Sources autoritaires** : `docs/MODULE_02_IDENTITY_ROLES.md` (spec) + état DB live
> **Estimation post-B0** : 1.5–2 j (alignée brief — beaucoup d'existant à consolider, peu à réinventer)

---

## 0. Résumé exécutif

**Le Module 2 (Identity & Roles) est livré et solide.** Login PKCE magic-link
fonctionne, invitation flow end-to-end existe (CAS atomique côté DB,
auto-création user_profile + membership, 2 templates Resend), `proxy.ts`
gère redirects et `NO_ORG_ALLOWED_PREFIXES`.

**Le brief PR #43 contredit la spec sur un point central** (signup
email + password vs magic-link only) — j'ai 1 arbitrage à faire valider
avant code (§4 ci-dessous). Les autres déviations brief vs existant sont
mineures (path `/accept-invitation/[token]` vs `/accept-invite?token=`).

**Manquant net** :

- `/signup` public (la spec l'autorise §2.4 sous magic-link, le brief le
  veut password — arbitrage)
- Trigger `handle_new_user` (DB) + backfill 1 user orphelin
  (`sasportasdavid@gmail.com`)
- Wizard onboarding 4 étapes (l'existant `/onboarding/create-org` est
  une page form 1-shot)
- Pages legal `/privacy` `/terms` `/dpa` + cookie banner + checkbox ToS
- Rate limit dans `proxy.ts` (spec §11 le prévoit, V1 ne l'a pas implémenté)
- Tests E2E Playwright : signup-flow, invitation-accept, onboarding-wizard
  (foundation PR #44 OK pour les wirer)

---

## 1. État DB live (5 mai 2026, 21h)

```
auth.users           : 10
user_profiles        : 9 (orphelin : sasportasdavid@gmail.com)
organizations        : 3
  ├─ capiwise          (9b72d914-1e9a-46c3-8388-4e3496ee3a6c)
  ├─ capiwise-qa       (aaaaaaaa-1111-2222-3333-444444444444) — org QA seedée PR #44
  └─ paragraphe-demo   (526b87a9-ef7f-4831-9049-5182092b2bce)
memberships          : 10 (4 capiwise + 5 capiwise-qa + 1 paragraphe-demo)
invitations          : 1 PENDING (sasportasdavid@gmail.com, expires 2026-05-07)
permissions_catalog  : 100 (RBAC granulaire)
role_permissions     : 198
```

**Note brief**: le brief annonce 5 users / 4 profiles / 2 orgs — la base a
évolué depuis la rédaction du brief (foundation QA PR #44 a seedé 5 users
QA + 1 org `capiwise-qa`, et 1 user `+attri` de Module 8 B5).

---

## 2. Réponses Q1–Q8

### Q1 — Signup public existe-t-il ?

**Réponse : NON.** Aucune route `/signup`. Le `LoginForm` affiche
explicitement _« L'inscription se fait uniquement par invitation. Demandez
à votre OWNER ou administrateur RH. »_ — aligné spec Module 2 §1.2
(`Enable email signups: false`).

Le login utilise `signInWithOtp({ shouldCreateUser: true })` côté browser
(PKCE) avec un pré-check `checkEmailExistsForLogin` Server Action qui
gate le signup public à la main (anti email enumeration : fake success
si l'email n'existe pas).

**À livrer Module 14** : route publique `/signup` qui ouvre l'inscription
auto-service (au choix : magic-link ou password — voir §4 arbitrage).

### Q2 — Flow invitation accept existe-t-il end-to-end ?

**Réponse : OUI, complet et solide.**

- Route : `/accept-invite?token=xxx` (query string, **pas** segment
  dynamique `/accept-invitation/[token]` comme indiqué dans le brief).
- Server Action `acceptInvitation(token)` : CAS atomique
  `UPDATE invitations SET status='ACCEPTED' WHERE token=? AND status='PENDING' AND expires_at>now()`
  → race-safe sans `SELECT FOR UPDATE`.
- Auto-création `auth.users` (admin client, `email_confirm: true`) +
  `user_profiles` + `memberships` (upsert idempotent).
- Si `invitation.beneficiary_id IS NOT NULL`, `beneficiaries.user_id` est
  lié.
- `app_metadata.active_org_id` + `active_roles` set au `auth.admin.updateUserById`.
- Magic link auto-login généré et redirect vers `/portal` (BENEFICIARY)
  ou `/dashboard`.
- 2 templates Resend brandés : `team_member_invite` + `beneficiary_first_invite`
  - `invitation_revoked`.
- Audit `invitation.created` + `invitation.accepted` + `invitation.revoked`.

L'invitation existante en DB (orpheline → `sasportasdavid@gmail.com`,
PENDING, expires 2026-05-07) a été créée le 30/04 via UI lors d'un
test E2E PR #5/#6 (cf. dette #40).

**À livrer Module 14** : aligner UX brief (path `/accept-invitation/[token]`
ou garder `/accept-invite?token=`) — recommandation : **garder l'existant**,
ajouter juste un fallback `/signup?invitation=<token>` pour le cas
"l'invité n'a pas encore de compte" (mais l'existant gère déjà ce cas
via `auth.admin.createUser` au moment du accept).

### Q3 — Email confirmation Supabase Auth — état config

**Réponse :** la spec §1.2 dit `Confirm email: false` (magic link =
confirmation implicite). C'est cohérent avec l'existant :

- `supabase.auth.signInWithOtp({ shouldCreateUser: true })` côté browser.
- `acceptInvitation` créé l'user avec `email_confirm: true` (admin).
- Pas de flow "signup → email confirmation → login" classique.

Le **brief PR #43 demande explicitement** un flow "signup public + email
confirmation Supabase Auth + page `/check-email`" — c'est l'arbitrage §4.

Templates Resend : 14 templates en place (cf. `apps/web/src/lib/resend/templates/`).
Les emails magic-link partent via le **template par défaut Supabase**
(pas Resend — trade-off accepté par la refacto Option B, cf. commentaire
`login-form.tsx` lignes 27-33). Pour brander 100 % en magic-link, il
faudrait Auth Hook "Send Email" Supabase Dashboard (V1.5).

Domaine `noreply@capiwise.com` confirmé vérifié côté Resend par David —
les emails Resend custom (invitations, notifs Module 7) partent du bon
domaine. Magic-link login emails utilisent le domaine Supabase par défaut.

### Q4 — Password reset / magic link — état config

**Réponse :** non applicable en V1 — pas de password (spec §0.2 exclu V2).

- Pas de routes `/reset-password` ni `/update-password`.
- Pas de template "Reset your password" (Supabase ou Resend).
- Le proxy `/auth/callback/route.ts` gère 2 flows : PKCE (`?code=`) +
  OTP legacy (`?token_hash=&type=magiclink|recovery|...`) — donc le
  cas "recovery" est techniquement déjà géré côté callback, mais aucune
  UI ne l'invoque.

**À livrer Module 14** : si on garde magic-link only, RAS — pas de password
reset à livrer. Si on bascule sur password (Option B brief), routes
`/reset-password` + `/update-password` à livrer.

### Q5 — Onboarding wizard 1ère connexion — existe-t-il ?

**Réponse : EXISTE PARTIELLEMENT.** Le flow actuel après login :

1. User clique magic-link → `/auth/callback` → session créée.
2. `proxy.ts` redirige : si pas d'`active_org_id` dans le JWT et pas
   sur une route `NO_ORG_ALLOWED_PREFIXES`, → `/select-org`.
3. `/select-org` (server component) charge `memberships` admin :
   - 0 membership → redirect `/onboarding/create-org`
   - ≥1 → picker / auto-select.
4. `/onboarding/create-org` : **1 page** form (nom, raison sociale,
   forme juridique, SIREN). Submit → `createOrganization` Server
   Action → membership OWNER → `app_metadata.active_org_id` →
   `/dashboard`.

Pas de wizard 4 étapes (Profile / Company / Permissions / Welcome).
Pas de page `/welcome` post-confirmation. Pas de capture
prénom/nom/role-title (le `user_profiles.full_name` reste `null` après
signup actuel).

**À livrer Module 14** : étendre l'existant `/onboarding/create-org`
en wizard 4 étapes (cf. mockup ASCII brief §"Design"). Ne pas
reconstruire le pipeline `/select-org` qui marche.

### Q6 — RGPD : ToS / Privacy / Cookie consent

**Réponse : RIEN de livré.**

- Pas de pages publiques `/legal/privacy` `/legal/terms` `/legal/dpa`.
- Pas de cookie banner (composant `<CookieConsent />` absent).
- Pas de checkbox ToS sur le login form (mais c'est cohérent : pas de
  signup, donc pas de moment d'accepter).
- Pas de colonnes `tos_accepted_at` / `tos_version_accepted` /
  `cookie_preferences` sur `user_profiles` (vérifié — schéma actuel :
  `id, email, full_name, avatar_url, phone, default_org_id, preferences,
created_at, updated_at, deleted_at, is_test_user`).
- Pas d'analytics (Vercel Analytics, Posthog) configurés. → V1 sans
  cookies non-essentiels = banner ultra-light, pas besoin de
  segmentation analytics ON/OFF.

**À livrer Module 14 (B4)** : 3 pages legal (statiques), 1 cookie banner
(simple : "OK / Personnaliser"), 1 checkbox ToS sur signup (si signup
livré), 3 colonnes ALTER `user_profiles`.

### Q7 — Sécurité : rate limit + CAPTCHA

**Réponse : RIEN de livré.**

- `proxy.ts` ne fait aucun rate limit.
- Pas de CAPTCHA.
- CSRF Next.js : natif via Server Actions (cookie `_next-action-id` +
  origin check, OK V1).
- Vercel Edge Network protège déjà partiellement contre DDoS.

La spec §11 prévoit explicitement _« Rate limiting sur `sendMagicLink`
(max 5/heure par email) »_ + _« Rate limiting sur `acceptInvitation`
(max 10/heure par IP) »_ — donc dette spec V1 que Module 14 résout.

**À livrer Module 14 (B5)** : rate limit middleware sur `/api/auth/*`,
`/login`, `/signup`, `/accept-invite`. V1 = in-memory Map (cf. brief
§"Pièges" #5 : suffit pour 95 % des bots, Vercel KV en V1.5).

### Q8 — Bug 1 user sans profile

**Réponse : CONFIRMÉ.**

```
SELECT u.id, u.email, u.created_at FROM auth.users u
LEFT JOIN user_profiles p ON p.id = u.id WHERE p.id IS NULL;
→ id=3f2fe863-8657-4877-a408-c42c897ef3c4
  email=sasportasdavid@gmail.com
  created_at=2026-05-04T15:25:05Z
```

C'est l'admin du projet — créé le 4 mai (probablement via
`auth.admin.createUser` ou test E2E qui n'a pas wired le profile), avec
une **invitation PENDING vers la même adresse** (id `cf3649ad-...`,
expires 2026-05-07).

**Pas de trigger** `handle_new_user` côté DB (vérifié : `pg_trigger`
sur `auth.users` retourne `[]` pour les triggers non-internal).
`custom_access_token_hook` existe (security_definer = true) — c'est
le hook RBAC, pas le trigger profile.

**À livrer Module 14 (B1)** : migration trigger
`handle_new_user` AFTER INSERT + backfill de l'orphelin.
Mécaniquement : un INSERT `user_profiles` avec `id=u.id, email=u.email`
suffit (les autres colonnes sont nullable ou default).

---

## 3. Mapping EXISTANT vs MANQUANT

| Item brief                             | Existant                                                    | Manquant                                            | Décision                                                        |
| -------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------- |
| `/signup` public                       | ❌                                                          | Page form + Server Action `signupUser`              | Option C (magic-link, cf. §4)                                   |
| Trigger `handle_new_user`              | ❌                                                          | Migration SQL + backfill                            | À livrer B1                                                     |
| `/check-email` post-signup             | ❌                                                          | Page statique "Confirme ton email"                  | À livrer B1 si Option B, sinon UI inline post-signup            |
| `/welcome` post-confirmation           | ❌                                                          | Page redirect → /onboarding                         | À livrer B1 si Option B, sinon `/auth/callback` redirect direct |
| `/onboarding` wizard 4 étapes          | Partiel (`/onboarding/create-org` 1 page)                   | Étendre wizard                                      | À livrer B2                                                     |
| `/accept-invitation/[token]`           | Path différent : `/accept-invite?token=`                    | Aligner brief OU garder existant                    | **Garder existant** (pas de migration UX)                       |
| Email Resend invitation Capiwise brand | OUI (`team_member_invite` + `beneficiary_first_invite`)     | RAS (déjà brandé)                                   | RAS                                                             |
| Pages legal `/privacy` `/terms` `/dpa` | ❌                                                          | 3 pages statiques                                   | À livrer B4                                                     |
| Cookie banner                          | ❌                                                          | Composant `<CookieConsent />` + persistence         | À livrer B4                                                     |
| Checkbox ToS sur signup                | ❌                                                          | UI + col `tos_accepted_at` + `tos_version_accepted` | À livrer B4                                                     |
| Rate limit middleware                  | ❌                                                          | proxy.ts gating routes auth                         | À livrer B5 (in-memory V1)                                      |
| CAPTCHA                                | ❌                                                          | V2 (cf. brief, rate limit suffit V1)                | NOT in scope V1                                                 |
| 25+ tests Vitest                       | 1293 workspace                                              | +25-30 nouveaux                                     | À livrer B6                                                     |
| 2-3 scénarios E2E Playwright           | 5 spec files (auth-flow, audit*, drawer*) + helpers/auth.ts | signup-flow, invitation-accept, onboarding-wizard   | À livrer B6                                                     |

---

## 4. Arbitrage critique — magic-link vs password

### La contradiction

**Spec Module 2 §0.2 + §1.1 + §1.2** :

> _« Pas de mot de passe en V1. Tous les logins se font via magic link. »_
> _« Enable email signups: false (création uniquement via invitation) »_
> _« Confirm email: false (magic link = confirmation implicite) »_
> _« Exclus : Password classique (V2 si demandé) »_

**Brief PR #43 §B1** :

> _« Form : email + password + nom + prénom + checkbox ToS »_
> _« Server action signupUser qui appelle supabase.auth.signUp() »_
> _« Email confirmation envoyé par Supabase »_
> _« Page /check-email : message "Confirme ton email" »_

→ **Direct conflict**.

### Les 3 options

**Option A — spec stricte, magic-link only**

- `/signup` page : juste un champ email + checkbox ToS. Submit →
  `signInWithOtp({ shouldCreateUser: true })` + token spécial pour
  routing post-callback vers `/onboarding`.
- Pas de password, pas de `/check-email` (la page actuelle de
  confirmation login post-OTP suffit), pas de `/reset-password`.
- Le brief "page /welcome" devient `/onboarding` step 1.
- ✅ Cohérent avec login existant. ✅ Réutilise toute la mécanique
  PKCE actuelle. ✅ Zéro reconfig Supabase Dashboard. ✅ Spec respectée.
- ❌ UX un peu différente du brief mockup ASCII (qui montre des champs
  email + password sur le login).

**Option B — brief stricte, password + email confirmation**

- `/signup` page : email + password + nom + prénom + ToS. Submit →
  `auth.signUp()` côté server action (admin client pour ne pas écraser
  la session caller — cf. CLAUDE.md piège §"Supabase Auth").
- `/check-email`, `/welcome`, `/reset-password`, `/update-password`
  routes à livrer.
- Login form : ajouter input password à côté de l'email actuel.
- ❌ **Reconfig Supabase Dashboard requise** : enable signups, enable
  confirmations, désactiver "Disabled Signups" — ça casse le pre-check
  `checkEmailExistsForLogin` actuel.
- ❌ Doublon mécanique magic-link (qui reste pour invitations) +
  password (signup classique) → 2 sources de truth UX.
- ❌ Spec §0.2 explicitement violée.
- ✅ UX standard universelle, pas d'éducation user "qu'est-ce qu'un
  magic link".

**Option C — pragmatique, magic-link + onboarding wizard, comme la spec §2.4**

- Même que Option A, MAIS : on ouvre le signup public (la spec §2.4
  laisse cette possibilité avec feature flag `allow_public_signup`).
- `/signup` minimal : email + ToS checkbox. Submit envoie magic-link
  via `signInWithOtp({ shouldCreateUser: true })` + audit
  `auth.signup_initiated`.
- Au callback, le `proxy.ts` détecte un user sans `active_org_id` ni
  membership → redirect `/onboarding` (wizard 4 étapes).
- Étapes wizard (rebrandées vs mockup) :
  1. **Profil** : prénom, nom, role/title (CFO, Equity Manager, Founder,
     Other). Persiste `user_profiles.full_name` + champs.
  2. **Organisation** : _« Tu rejoins ou tu crées ? »_ Si "rejoindre"
     → champ "code d'invitation" (token) → redirect `/accept-invite?token=...`
     (réutilise existant). Si "créer" → form étendu de l'existant
     `/onboarding/create-org`.
  3. **Récap permissions** : montre le rôle assigné (OWNER si new
     org, rôle invitation sinon) + permissions associées.
  4. **Welcome** : _« Tu es prêt »_ → CTA `/dashboard`.
- ✅ Cohérent spec §2.4 et §1.1 (magic-link only). ✅ Réutilise existant
  à 80 %. ✅ Ouvre signup public ce que demande le brief sans casser
  le modèle auth. ✅ Zéro reconfig Supabase Dashboard.
- ❌ Brief mockup ASCII login montre password — il faut documenter
  qu'on diverge du mockup mais pas de la fonction.

### Recommandation

**Option C.** Raisons :

1. Spec respectée — §0.2 explicit "Password classique : V2 si demandé".
2. Existant solide à 80 % — pas de reconfig Supabase Dashboard, pas de
   doublon mécanique.
3. Le **but** du brief (passer de "demo invitée à la main" à "beta
   privée publique avec waitlist") est atteint à 100 % — un user peut
   self-onboard sans qu'un admin l'invite.
4. Sécurité supérieure : pas de password = pas de bruteforce, pas de
   leak de hash, pas de "password reuse from breach".
5. Aligné avec la stratégie Module 7/8 (templates Resend custom déjà
   pensés magic-link).

**Si l'utilisateur veut Option B** (password + standard UX), je le ferai
sans drame mais ça augmente l'estimation à 2.5–3 j (reconfig Dashboard

- flow `/check-email` + `/reset-password` + `/update-password` + tests
  supplémentaires).

---

## 5. Autres arbitrages secondaires

### A1 — Path `/accept-invitation/[token]` vs `/accept-invite?token=`

**Recommandation : garder existant** (`/accept-invite?token=`). Aucune
plus-value à migrer en segment dynamique, et ça casserait l'invitation
PENDING actuelle (`sasportasdavid@gmail.com`). Pas de SEO concern (page
non indexable de toute façon).

### A2 — Wizard onboarding : `/onboarding` ou `/(auth)/onboarding/wizard` ?

**Recommandation : étendre `/(auth)/onboarding/`** :

- `/onboarding` (server component) → redirige vers la 1re étape
  selon état (profile vide ? company manquante ?).
- `/onboarding/profile` (étape 1)
- `/onboarding/company` (étape 2 — refacto de l'existant `/onboarding/create-org`)
- `/onboarding/welcome` (étape 4 — l'étape 3 "permissions" est inline
  dans la transition entre 2 et 4)
- Layout shared `/(auth)/onboarding/layout.tsx` avec stepper visuel
  ●●●○ (cf. mockup ASCII brief).

État stocké dans `user_profiles` :

- `onboarding_step` (text DEFAULT 'profile') ou inférence
- `onboarding_completed_at` (timestamp NULL) — clef pour proxy gate

### A3 — Cookie banner V1 lite

**Recommandation : banner minimal V1**.

- Pas d'analytics V1 (Vercel Analytics V1.5, Posthog V2). Donc le
  banner V1 affiche : "Capiwise utilise uniquement des cookies
  essentiels (session, sécurité). Aucun tracking analytics ni marketing.
  [En savoir plus] [OK]"
- Stockage : cookie `cookie_consent_v1` (1 an), version dans le nom
  pour invalidation auto si on bouge.
- Pas de toggle granulaire V1 (cohérent avec le scope cookies).
- Banner se cache à `cookie_consent_v1=acknowledged`.

### A4 — Rate limit V1 = in-memory Map vs Vercel KV

**Recommandation : in-memory Map V1**, Vercel KV V1.5.

- Justification : on n'est pas encore sur Vercel (déploiement post
  Module 14). En dev local + sur la prod future Vercel, in-memory
  suffit pour bloquer 95 % des bots (cf. brief §"Pièges" #5).
- Helper extensible : `apps/web/src/lib/rate-limit/memory-store.ts`
  expose `checkRateLimit(key, limit, windowMs)` que la V1.5 swappera
  vers Upstash/KV sans toucher les call-sites.
- Limites V1 :
  - `/api/signup` : 5/15min/IP
  - `/login` (POST signInWithOtp) : 5/15min/IP (already protected
    Supabase-side `429 over_email_send_rate_limit` mais on doublonne
    edge-side)
  - `/accept-invite` : 10/15min/IP

### A5 — Tests E2E Playwright cibles

Foundation E2E PR #44 disponible (`/api/test/login` bypass, helper
`loginAs`, Mailpit catcher). Cibles V1 (3 scénarios neufs) :

1. **`signup-flow.spec.ts`** : visiteur anon → `/signup` →
   email + ToS → click magic-link Mailpit → callback → wizard
   `/onboarding/profile` → `/onboarding/company` (créer) → `/dashboard`.
2. **`invitation-accept.spec.ts`** : OWNER seedé → `/dashboard/settings/members`
   → invite `qa+invitee@capiwise.com` → Mailpit catcher → click accept
   → user créé + membership ACTIVE → redirect `/dashboard`.
3. **`onboarding-wizard.spec.ts`** : user déjà signé up sans org →
   `/onboarding` redirect → 4 étapes → state persisted → completed_at
   set → redirect `/dashboard`.

Cible workspace : 15 → 18 scénarios E2E. Les 1293 Vitest passent à
1320+ (B6 livre 27-30 tests pure : trigger SQL, signup form, onboarding
state, cookie consent, rate limit).

---

## 6. Plan B1–B6 ajusté

### B1 — DB trigger + signup public minimal (~3h)

- Migration `00095_handle_new_user_trigger.sql` : trigger AFTER INSERT
  on `auth.users` → INSERT `user_profiles (id, email)` ON CONFLICT DO
  NOTHING. SECURITY DEFINER lockdown (search_path empty + REVOKE).
- Migration même fichier : backfill orphelin `sasportasdavid@gmail.com`.
- Migration `00096_user_profiles_onboarding_cols.sql` : ALTER TABLE
  `user_profiles` ADD `onboarding_completed_at timestamptz`,
  `tos_accepted_at timestamptz`, `tos_version_accepted text`,
  `cookie_preferences jsonb DEFAULT '{}'`.
- Page `/signup` (Option C) : email + ToS checkbox + Server Action
  `signupWithMagicLink(input)` qui set `tos_accepted_at` + `tos_version_accepted`
  via admin pre-INSERT puis triggera `signInWithOtp` côté browser
  (callback → `/onboarding`).
- Tests Vitest B1 : trigger SQL helper test (1) + signup zod schema (3).

### B2 — Onboarding wizard 4 étapes (~5h)

- Restructurer `/(auth)/onboarding/`:
  - `layout.tsx` (stepper visuel, header "● Capiwise Étape X/4")
  - `page.tsx` (router server-side selon état user)
  - `profile/page.tsx` + `profile-form.tsx`
  - `company/page.tsx` + `company-form.tsx` (refacto de
    `create-org-form.tsx` + intègre branchement "rejoindre" via token)
  - `welcome/page.tsx` (CTA `/dashboard`)
- Server Actions :
  - `updateOnboardingProfile(input)` — UPDATE user_profiles
  - `completeOnboarding()` — sets `onboarding_completed_at` + audit
- Proxy gate : `proxy.ts` ajoute redirect `/dashboard/* → /onboarding`
  si `user_profiles.onboarding_completed_at IS NULL` (lookup admin
  client cached). Cf. brief §"Pièges" #8.
- Audit `user.onboarding_completed`.
- Tests Vitest B2 : zod schemas (5) + state inference (3).

### B3 — Invitation flow consolidation (~1h, l'essentiel existe)

- Garder l'existant `/accept-invite?token=` end-to-end.
- Améliorer **page invitation expirée** (brief §"Pièges" #10) :
  message graceful "demande à inviteur de t'en envoyer une nouvelle"
  - bouton "Renvoyer" qui déclenche email à l'inviteur (Server Action
    `notifyInviterOfExpiredInvitation`).
- Tests Vitest B3 : 5 tests (token expiry edge cases).

### B4 — RGPD basique (~3h)

- 3 pages statiques `/legal/privacy` `/legal/terms` `/legal/dpa`
  (server components, content placeholder à compléter par David ou
  via Termly.io URL embed).
- Composant `<CookieConsent />` client + persistence cookie + persistence
  `user_profiles.cookie_preferences` si user logged.
- Checkbox ToS sur `/signup` form (B1) + validation Zod
  `tosAccepted: z.literal(true)`.
- Migration : déjà couverte par 00096 (B1).
- Tests Vitest B4 : 4 tests (banner show/hide, persistence).

### B5 — Rate limit middleware (~2h)

- Helper `apps/web/src/lib/rate-limit/memory-store.ts` + tests Vitest
  (4 tests : limit reached, window reset, key isolation).
- Wire dans `proxy.ts` pour les 3 routes auth (signup, login,
  accept-invite). Si dépassé → 429 + JSON
  `{ error: "rate_limited", retry_after: <seconds> }`.
- Audit `auth.rate_limit_exceeded` (best-effort, ne bloque pas le 429).

### B6 — Polish + tests Vitest final + 3 scénarios E2E (~4h)

- Vitest cible : +27-30 tests (cumul B1-B5 = ~22 + B6 polish ~5-8).
- Playwright : `signup-flow`, `invitation-accept`, `onboarding-wizard`.
- Memory closure `memory/module_14_complete.md` : inventaire fichiers,
  dettes V1.X (SSO, 2FA, audit log connexions, photo upload, notifs
  préférences) + V2 (SAML/SCIM, Enterprise SSO, multi-org UI propre).

**Total estimé** : 18h ≈ 2 jours dev (alignée brief 1.5–2j si Option C).

---

## 7. Risques & pièges identifiés

| #   | Risque                                  | Mitigation V1                                                                                                                                                                                                                                                               |
| --- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Trigger SECURITY DEFINER bypass**     | `SET search_path = public, pg_temp` + REVOKE EXECUTE FROM public + GRANT EXECUTE TO supabase_auth_admin uniquement. Test SQL : un user normal ne peut pas l'invoquer manuellement.                                                                                          |
| 2   | **Token invitation UUID vs JWT**        | Existant utilise `crypto.randomBytes(32).toString('hex')` (64 char hex) + DB `expires_at` → conforme spec. RAS.                                                                                                                                                             |
| 3   | **Race condition onboarding parallèle** | Lock optimiste : `UPDATE user_profiles SET onboarding_completed_at=now() WHERE id=$1 AND onboarding_completed_at IS NULL` — 2e UPDATE no-op.                                                                                                                                |
| 4   | **Cookie consent essentiels**           | Banner V1 ne propose PAS de toggle "désactiver cookies essentiels" (pas de granularité analytics V1). `sb-*-auth-token` jamais bloqué.                                                                                                                                      |
| 5   | **Rate limit serverless mémoire**       | Map en module global TS — partagée entre routes du même Lambda Vercel. Cold start = reset = OK selon brief. V1.5 = Upstash.                                                                                                                                                 |
| 6   | **ToS versioning**                      | Col `tos_version_accepted text` + env `process.env.CURRENT_TOS_VERSION='v1.0-2026-05-05'`. Au login, si user.tos_version != env → redirect `/legal/accept-update`. V1.5.                                                                                                    |
| 7   | **GDPR right to erasure**               | V2 (Module 13.5 ou ad hoc), pas couvert M14.                                                                                                                                                                                                                                |
| 8   | **Onboarding skip via URL directe**     | Proxy gate côté `proxy.ts` lit `user_profiles.onboarding_completed_at` (admin client) et redirect → `/onboarding`. ATTENTION : un lookup DB par requête peut être cher. Solution : caché dans `app_metadata.onboarding_completed=true` set à completion (lecture JWT only). |
| 9   | **Supabase email rate limit**           | Pas pertinent V1 (login = magic-link via Supabase Auth, signup-V1-Option-C aussi). En V1.5 avec scale, switch Auth Hook "Send Email" vers Resend.                                                                                                                           |
| 10  | **Invitation expirée UX**               | B3 livre la page graceful + bouton "Renvoyer" (notif inviter via Resend).                                                                                                                                                                                                   |

---

## 8. Décisions à valider par David avant code

1. **Option C (magic-link + signup public + onboarding wizard 4 étapes)
   au lieu de Option B (password + email confirmation classique).**
   Cohérent spec, 80 % existant réutilisé, sécurité ↑.
   _→ Je commence sur cette base si pas de retour sous 5 min._

2. **Garder path `/accept-invite?token=`** (pas de migration vers
   `/accept-invitation/[token]`). Pas de plus-value.
   _→ Sauf objection, je garde l'existant._

3. **Wizard onboarding sous `/(auth)/onboarding/{profile,company,welcome}`**
   (l'étape 3 "permissions" est inline transition 2→4, pas une route
   distincte — moins de friction UX).
   _→ Sauf objection, j'implémente cette structure._

4. **Cookie banner V1 light** : pas de toggle granulaire analytics,
   message simple "cookies essentiels uniquement".
   _→ Sauf objection, je livre cette version._

5. **Rate limit V1 in-memory Map** (Vercel KV V1.5).
   _→ Sauf objection, je livre cette version._

6. **Memo audit B0 commité dans le 1er commit de la PR** :
   `chore(module-14): audit B0 + arbitrages magic-link Option C`.

---

## 9. Fichiers de référence existants (call-sites à toucher)

```
apps/web/src/app/(auth)/layout.tsx                        # à étendre DS V1 Editorial
apps/web/src/app/(auth)/login/login-form.tsx              # ajouter lien "Pas de compte ? S'inscrire"
apps/web/src/app/(auth)/onboarding/create-org/*           # à refacto en wizard étape 2
apps/web/src/app/(auth)/select-org/page.tsx               # à wirer post-onboarding (RAS V1)
apps/web/src/app/accept-invite/page.tsx                   # à étendre avec page expired graceful
apps/web/src/app/auth/callback/route.ts                   # branche redirect → /onboarding si profile incomplet
apps/web/src/proxy.ts                                     # ajouter rate limit + gate onboarding
apps/web/src/server/actions/auth.ts                       # ADD signupWithMagicLink
apps/web/src/server/actions/invitations.ts                # ADD notifyInviterOfExpiredInvitation
apps/web/src/server/actions/profile.ts                    # ADD updateOnboardingProfile + completeOnboarding
apps/web/src/lib/resend/templates/InvitationExpiredRenotify.tsx  # à créer
apps/web/src/lib/rate-limit/memory-store.ts               # à créer
apps/web/src/components/legal/CookieConsent.tsx           # à créer
apps/web/src/app/legal/{privacy,terms,dpa}/page.tsx       # à créer
apps/web/e2e/signup-flow.spec.ts                          # à créer
apps/web/e2e/invitation-accept.spec.ts                    # à créer
apps/web/e2e/onboarding-wizard.spec.ts                    # à créer
```

---

## 10. Conclusion

**Module 14 est consolidation à 80 %, build à 20 %.** L'essentiel
manquant est le wizard onboarding 4 étapes, le signup public V1
(magic-link selon Option C recommandée), les pages legal + cookie banner,
le rate limit, et 3 scénarios E2E.

**Action requise David** : valider Option C (magic-link only) vs
Option B (password) avant que je touche au code (B1).
