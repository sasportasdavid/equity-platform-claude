---
name: Module 9 B5 — Notifications + Documents Exercise (closure)
description: Closure complète du sous-module B5 — 5 templates email, 2 templates PDF, RPC load_exercise_document_context, helper propagateExerciseApprovalDecision (fix dette #106), 5 hooks fire-and-forget, wiring 5 Server Actions, UI changes (portal form bank coords + admin/portal detail download buttons + rename "Confirmer la réception du paiement"). PR #18 draft.
type: project
---

# Module 9 B5 — closure complète

Branche : `feat/module-9-b5-notifications-documents` (depuis master `9e165d0` post-PR #17 mergée)
PR : `#18` (draft, à ouvrir post-commits)

## Périmètre B5 livré

Workflow notifications + documents exercise (post-Module 9 B4 admin pages) :

1. **5 templates email Resend** (workflow exercise complet)
2. **2 templates PDF react-pdf** (notification + bulletin avec mentions légales)
3. **RPC `load_exercise_document_context`** (DB-side context loader)
4. **Helper `propagateExerciseApprovalDecision`** (fix dette #106 propagation status)
5. **3 hooks notification + 2 hooks PDF** (fire-and-forget, idempotents)
6. **Wiring 5 Server Actions** (`requestExercise`, approve/reject, confirmPayment, adminCancel)
7. **UI changes** : portal form coordonnées bancaires (UX #108), admin/portal download buttons, rename "Confirmer la réception du paiement"

## Décisions D1-D5 implémentées

| ID  | Décision                   | Implémentation                                                                                                                                                                       |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Hooks architecture         | (a) Server Action TS fire-and-forget, pattern Module 7 B5 (notifyApproversOfPendingApproval) reproduit                                                                               |
| D2  | 5 templates email V1       | `exercise_request_submitted/approved/rejected`, `exercise_payment_confirmed`, `exercise_request_cancelled_by_admin` (5e ajouté post-validation user). Channel EMAIL only             |
| D3  | 2 templates PDF + RPC      | `EXERCISE_NOTIFICATION` (post-APPROVED) + `SUBSCRIPTION_BULLETIN` (post-COMPLETED) + RPC `load_exercise_document_context`                                                            |
| D4  | V1 SANS Yousign signature  | APPROVED → CONFIRMED direct via `confirmExercisePayment`. Dette #109 V2 = signature Yousign exercise                                                                                 |
| D5  | Propagation #106 + UX #108 | Helper TS-side `propagateExerciseApprovalDecision` (re-fetch approval_request status + UPDATE exercise + audit). UX #108 wording strict propagé : portal form + email approved + PDF |

## Migrations livrées (2)

- **00068** : Seed 5 templates email exercise (PK composite (code, channel, locale) idempotent ON CONFLICT DO UPDATE)
- **00069** : Seed 2 doc_templates + RPC `load_exercise_document_context(p_exercise_request_id UUID)` SECURITY INVOKER, retour JSONB 6 sections (exercise/award/plan/beneficiary/company/org), NULL-safe (FK cassée → partial)

Drift cloud : 70 → 72 (locales 67 → 69 fichiers).

## 7 commits granulaires

| Commit    | Description                                                              |
| --------- | ------------------------------------------------------------------------ |
| `6bfd57d` | C1 — seed 5 templates email exercise (migration 00068)                   |
| `340d032` | C2 — 5 templates react-email + tests render (+8 tests)                   |
| `b0039be` | C3 — doc templates exercise + RPC load_exercise_document_context         |
| `ecfa4a1` | C4 — 2 templates react-pdf + tests render (+19 tests)                    |
| `90a9cbf` | C5 — helper propagateExerciseApprovalDecision (fix dette #106, +8 tests) |
| `e8c3ee6` | C6 — 3 hooks notification + 2 hooks PDF + tests isolation (+22 tests)    |
| `(C7)`    | wiring + UI + closure (avec ce fichier memory)                           |

## Tests Vitest

Baseline post-B4 : 558. Final post-B5 : **614** (+56 nouveaux).

- C2 : +8 (templates email render)
- C4 : +19 (PDF helpers + resolver)
- C5 : +8 (propagation helper)
- C6 : +22 (3 hooks notif + 2 hooks PDF)
- C7 : +0 (mocks ajoutés aux tests existants pour isolation)

Typecheck : ✅ 0 erreur

## Hooks fire-and-forget — pattern

3 notifications + 2 PDF dans `apps/web/src/server/actions/_helpers/` :

```
exercise-notifications.ts
├── notifyAdminsOfExerciseRequest({ exerciseRequestId })
│   → memberships ADMIN_HR/OWNER actifs, dédup user_id, dispatch
│     N emails template `exercise_request_submitted`
├── notifyBeneficiaryOfExerciseDecision({ exerciseRequestId, decision, ... })
│   → switch decision : APPROVED / REJECTED / CANCELLED_BY_ADMIN
│     → 3 templates distincts + payloads adaptés
└── notifyBeneficiaryOfExercisePayment({ exerciseRequestId })
    → template `exercise_payment_confirmed`

exercise-documents.ts
├── generateExerciseNotification({ exerciseRequestId })  [idempotent]
│   → guard notification_document_id NOT NULL, RPC ctx, render react-pdf,
│     upload Storage, INSERT document_instances, UPDATE FK, audit
└── generateSubscriptionBulletin({ exerciseRequestId })  [idempotent]
    → même pattern, FK bulletin_document_id

propagate-exercise-status.ts
└── propagateExerciseApprovalDecision({ exerciseRequestId, approvalRequestId,
    decision, reason?, actorUserId })  [résolution dette #106]
    → re-fetch approval_request.status, UPDATE exercise WHERE PENDING,
      audit exercise.approved/rejected
```

## Wiring Server Actions

```ts
requestExercise (exercises.ts)
└── après RPC request_exercise OK
    └── notifyAdminsOfExerciseRequest (fire-and-forget)

approveExerciseDecision (exercises-admin.ts)
└── après record_approval_decision OK
    ├── propagateExerciseApprovalDecision
    └── si newExerciseStatus=APPROVED :
        ├── generateExerciseNotification (fire-and-forget)
        └── notifyBeneficiaryOfExerciseDecision('APPROVED')

rejectExerciseDecision (exercises-admin.ts)
└── après record_approval_decision OK
    ├── propagateExerciseApprovalDecision
    └── si newExerciseStatus=REJECTED :
        └── notifyBeneficiaryOfExerciseDecision('REJECTED', { reason, stepName })

confirmExercisePayment (exercises-admin.ts)
└── après RPC confirm_exercise_payment OK
    ├── generateSubscriptionBulletin (fire-and-forget)
    └── notifyBeneficiaryOfExercisePayment

adminCancelExercise (exercises-admin.ts)
└── après RPC cancel_exercise_request OK
    └── notifyBeneficiaryOfExerciseDecision('CANCELLED_BY_ADMIN', { reason, adminName })
```

Toutes les Server Actions retournent `ok: true` même si les hooks fire-and-forget foirent — la décision/transition est persistée, hooks rejouables manuellement (résilience).

## UI changes

### Portal `/portal/awards/[id]/exercise/new` (form)

Section "Coordonnées de paiement" ajoutée en bas du form :

- Banner emerald avec wording UX #108 strict :
  > « Pour exercer ces {N} {plan_type}, vous virerez {totalCost} € (coût d'exercice = {N} × {strike} €) sur le compte bancaire de {orgName}. Vous deviendrez actionnaire dès réception du paiement par l'entreprise. »
- Si bank_iban/bic/name non null → affichage Banque + IBAN + BIC mono-font
- Si tous null → banner amber "Coordonnées non renseignées par l'administration"
- Référence à indiquer = numéro de demande (post-soumission)

### Admin `/dashboard/exercises/[id]`

- Section "Documents générés" (nouvelle) :
  - Bouton "Télécharger la notification d'exercice" (si notification_document_id)
  - Bouton "Télécharger le bulletin de souscription" (si bulletin_document_id)
  - Placeholder "en cours de génération…" si status=APPROVED/COMPLETED mais doc encore null
- Bouton AdminConfirmPaymentButton renommé "Confirmer la réception du paiement" (déjà fait B4)
- Bouton intra-dialog "Confirmer le paiement" → "Confirmer la réception du paiement"
- Query `getExerciseRequestAdminDetail` étendue avec `notification_document_id` + `bulletin_document_id`

### Portal `/portal/exercises/[id]`

- Section "Documents disponibles" (nouvelle) avec mêmes boutons download (scope=portal, TTL 5min)

### Composant partagé

`ExerciseDocumentDownloadButton.tsx` (client) qui dispatch `getDocumentPreviewUrl` (admin) ou `getPortalDocumentSignedUrl` (portal) selon le scope, ouvre le signed URL dans un nouvel onglet.

## Mentions légales V1

`apps/web/src/lib/pdf/exercise-template-helpers.ts` expose 2 constantes :

- `LEGAL_MENTIONS.EXERCISE_NOTIFICATION` : réfs **L228-91**, **L225-177**, **art. 163 bis G CGI** + mention "ne constitue ni un titre, ni un certificat"
- `LEGAL_MENTIONS.SUBSCRIPTION_BULLETIN` : réfs **L228-7**, **L228-1**, mention "actions nominatives" + **placeholder V2 #110** (validation avocat avant production)

Helper `assertExercisableType(planType)` throw sur AGA/AGA_PERFORMANCE — dernière ligne de défense post-compliance + applies_to_plan_types restriction.

## Dettes V2

| #   | Description                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 100 | Page edit paliers (`/dashboard/settings/exercise-workflows/edit`) — V1 read-only                                                                                  |
| 101 | Filtres avancés DataTable inbox (recherche bénéficiaire, plage dates, montant) — V1 = 4 tabs + tri                                                                |
| 102 | Bulk approve/reject — V1 = 1 demande à la fois                                                                                                                    |
| 103 | Notifications admin auto (résolu B5 — `notifyAdminsOfExerciseRequest`) ✅                                                                                         |
| 104 | Email confirmation paiement (résolu B5 — `notifyBeneficiaryOfExercisePayment`) ✅                                                                                 |
| 105 | Bouton "Renvoyer email rappel" stagnation > N jours — V1 absent                                                                                                   |
| 106 | Propagation status approval → exercise (résolu C5 — `propagateExerciseApprovalDecision`) ✅                                                                       |
| 107 | "Confirmer paiement" attend SIGNED ou APPROVED ? V1 accepte les 2 (RPC `confirm_exercise_payment` `IN ('SIGNED','APPROVED')`) — choix conscient pas-de-Yousign V1 |
| 108 | UX paiement (résolu B5 — wording strict + coords bancaires + rename bouton) ✅                                                                                    |
| 109 | Yousign signature exercise — V1 SANS, EF webhook à étendre pour subject EXERCISE_REQUEST en V2                                                                    |
| 110 | Validation juridique formulations légales par avocat — placeholder explicite dans LEGAL_MENTIONS.SUBSCRIPTION_BULLETIN                                            |

## EXR-2026-0002 — artefact post-hotfix

Le test E2E B4 avait créé EXR-2026-0002 et a fait l'objet d'un UPDATE manuel SQL pour palier la dette #106 (avant son fix C5). Cette demande reste en état hybride et **ne doit pas être utilisée** pour valider B5 E2E.

**Validation E2E final B5** : créer une fresh demande sur l'org test pour vérifier le flow complet :

1. Bénéficiaire submit → notif admins ADMIN_HR/OWNER reçoivent email
2. Admin clique "Approuver" → propagation status APPROVED + email bénéficiaire avec IBAN + PDF notification généré
3. Admin clique "Confirmer la réception du paiement" → status COMPLETED + email + bulletin de souscription PDF généré
4. Vérif download des 2 PDFs côté admin et portal
5. Vérif wording UX #108 dans le form portal + dans l'email approved

## Patterns réutilisés

- `vi.hoisted` pour TEST\_\*\_ID + mockState (pattern Module 9 B3+B4)
- `insertNotificationWithRender` (Module 7) — queue pattern email
- `getDocumentPreviewUrl` (Module 6) / `getPortalDocumentSignedUrl` (Module 8) — signed URLs
- `logAuditEvent` (Module 1) — audit best-effort fire-and-forget
- Pattern Result `{ ok: true, ...data } | { ok: false, error }`

## Métriques

- Migrations : +2 (00068, 00069)
- Tests Vitest : 558 → 614 (+56)
- Lignes TS ajoutées : ~3 000 (helpers + templates + tests + UI)
- Server Actions : wiring 5 (4 admin + 1 portal)
- Composants UI nouveaux : 1 (`ExerciseDocumentDownloadButton`)
- Templates : 5 react-email + 2 react-pdf
- RPC SECURITY INVOKER : 1 (`load_exercise_document_context`)
- Helpers `_helpers/` : 3 (notifications, documents, propagate-status)
- Drift cloud : 0 (72/72)

## Sécurité

- Tous les hooks utilisent `getSupabaseAdminClient` (service_role) pour bypass RLS — context déjà autorisé en amont par les Server Actions caller
- `propagateExerciseApprovalDecision` requiert `actorUserId` validé (throws si vide)
- `assertExercisableType` runtime guard pour AGA — dernière ligne de défense
- Helper PDF : rollback Storage si INSERT DB foire (pas de fichier orphelin)
- Idempotence forte : guard `notification_document_id` / `bulletin_document_id` NOT NULL → skip render

## Pas de wiring sandbox /dev

V1 SANS sandbox. La sandbox `/dev/notifications` (Module 7) liste maintenant 14 templates total (vs 9 pre-B5) automatiquement via le registry. Pas de page sandbox dédiée pour les PDFs exercise — testés par le flow E2E manuel sur fresh demande.
