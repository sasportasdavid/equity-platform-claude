# Module 9 B4 — closure complète

Branche : `feat/module-9-b4-admin` (depuis master `d6863a3` post-PR #16 mergée)
PR : `#17` (draft, à ouvrir post-commits)

## Périmètre B4 livré

Pages dashboard admin pour le workflow d'exercice : inbox + détail +
paliers read-only. Décisions D1-D5 du brief implémentées strictement.

### 3 pages livrées

| Route                                    | Description                                        |
| ---------------------------------------- | -------------------------------------------------- |
| `/dashboard/exercises`                   | Inbox avec quick-filters Tabs + DataTable + counts |
| `/dashboard/exercises/[id]`              | Détail demande + KPIs + actions admin              |
| `/dashboard/settings/exercise-workflows` | Paliers read-only (V2 = edit)                      |

Sidebar dashboard étendu avec un nouveau lien "Exercices" (icon
TrendingUp) sous la section "Analyse".

### Server-side livré

```
apps/web/src/server/queries/exercises-admin.ts    # 4 queries admin
apps/web/src/server/actions/exercises-admin.ts    # 4 Server Actions
```

### Composants livrés

```
apps/web/src/components/exercises/
└── AdminActionDialogs.tsx    # 4 dialogs inline (Approve/Reject/Pay/Cancel)
```

Composants B3 réutilisés : ExerciseRequestStatusBadge,
TaxBreakdownDisplay, format-helpers.

## Décisions D1-D5 implémentées

| ID  | Décision                | Implémentation                                                                                                                                                                                       |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Inbox hybride           | `/dashboard/exercises` avec 4 Tabs filters (PENDING / APPROVED+SIGNED / COMPLETED / REJECTED+CANCELLED), DataTable Editorial avec count badges, tri created_at DESC                                  |
| D2  | Mapping rôles → actions | Approve/Reject : ownership de la décision PENDING (auto-resolve user → decision). Confirm : permission `exercises.confirm_payment`. Cancel admin : permission `exercises.cancel.any` (réservé OWNER) |
| D3  | Paliers READ-ONLY V1    | `/dashboard/settings/exercise-workflows` affiche workflows + steps en lecture seule. Banner amber "L'édition est disponible en V2." Aucun bouton edit/delete/add                                     |
| D5  | AWD-2026-0007 SKIP      | Award maintenu en `PARTIALLY_EXERCISED` units_exercised=50 résiduel. Documenté en dette (cf. memory module_9_b1_complete.md)                                                                         |

## Migration 00067 — résolution dette #81

ADD-only, idempotente, 2 actions :

1. **Ajouter ADMIN_HR au membership** de
   `sasportasdavid+test@gmail.com` (user `7f56d666`) sur l'org test
   `9b72d914`. Le user avait déjà APPROVER → roles devient
   `['APPROVER', 'ADMIN_HR']`.

2. **Back-fill approval_decisions** pour les exercise_requests
   IN_PROGRESS qui n'avaient pas de decision (cas EXR-2026-0002 créée
   pendant E2E B3 sans approbateur dispo). Insère 1 row PENDING par
   user matchant le rôle Step 1 du workflow.

Vérifié post-migration :

- `sasportasdavid+test` a maintenant `roles = ['APPROVER', 'ADMIN_HR']`
- EXR-2026-0002 a 1 decision PENDING assignée à
  `sasportasdavid+test` avec approver_role=ADMIN_HR

→ Débloque le test E2E B4 et tout futur exercise demandé via portal.

## Server Actions

Pattern Result `{ ok: true } | { ok: false, error }` :

- **`approveExerciseDecision({ exerciseRequestId, comment })`**
  Lookup auto-décision PENDING du user → délègue au RPC Module 5
  `record_approval_decision('APPROVED')`. Le trigger DB Module 5
  propage `exercise_requests.status` quand toutes les steps sont OK.

- **`rejectExerciseDecision({ exerciseRequestId, comment })`**
  Comment ≥ 10 chars (Zod). Délègue au RPC `record_approval_decision('REJECTED')`.

- **`confirmExercisePayment({ exerciseRequestId, paymentAmountReceived, paymentReference, adminNotes })`**
  Permission `exercises.confirm_payment` (RPC re-vérifie côté DB).
  Délègue au RPC Module 9 B1 `confirm_exercise_payment`. Trigger DB
  update `awards.units_exercised` + status PARTIALLY/FULLY_EXERCISED.

- **`adminCancelExercise({ exerciseRequestId, reason })`**
  Permission `exercises.cancel.any` (réservé OWNER). Reason ≥ 3 chars.
  Délègue au RPC Module 9 B1 `cancel_exercise_request`.

## Inbox UX

- **4 quick-filters Tabs** avec count badge :
  - "En attente (N)" — PENDING
  - "Approuvées (N)" — APPROVED + SIGNED (combinés)
  - "Terminées (N)" — COMPLETED
  - "Rejetées et annulées (N)" — REJECTED + CANCELLED (combinés)
- **DataTable** colonnes : N° request | Bénéficiaire | Award (+ plan_type) |
  Unités | Montant € | Statut (badge) | Demandée le | Actions
- **Lien "Voir détail"** sur chaque ligne → `/dashboard/exercises/[id]`
- **EmptyState** par filtre si 0 row

## Détail UX

Sections Editorial :

- Hero : numéro request + status badge + breadcrumb (award · plan)
- KPIs grid 4 colonnes : units, coût exercice, FMV, type plan
- Section "Demandeur" (nom, email, hire_date)
- Section "Award" (numéro, plan, strike, units granted/exercised, grant_date)
- Section "Simulation fiscale" (TaxBreakdownDisplay du snapshot)
- Section "Notes & contexte" (beneficiary_notes, admin_notes,
  rejected_reason, cancellation_reason — affichage conditionnel)
- Section "Paiement confirmé" (si COMPLETED)
- Section "Actions admin" (Approve/Reject si user a une decision PENDING,
  ConfirmPayment si APPROVED/SIGNED + perm, AdminCancel si non-terminal +
  perm cancel.any)
- Section "Workflow d'approbation" : lien vers `/dashboard/approvals/[id]`
  pour voir la timeline complète (réutilise Module 5)

## Tests Vitest — 15 nouveaux (558 workspace, +15 vs baseline 543)

### `exercises-admin.test.ts` (15)

- **approveExerciseDecision** (4) : Zod reject UUID, no PENDING decision,
  happy path, RPC error propagation
- **rejectExerciseDecision** (3) : Zod reject comment trop court,
  happy path, no PENDING decision
- **confirmExercisePayment** (4) : sans perm → error, avec perm → ok,
  Zod reject negative amount, Zod reject empty reference
- **adminCancelExercise** (4) : sans perm → error, avec perm → ok,
  Zod reject reason court, RPC error propagation

### Pattern vi.hoisted réutilisé

Pattern Module 9 B3 : `vi.hoisted` pour les TEST\_\*\_ID + mockState pour
permissions Set. Permet de tester les paths sans/avec permission sans
re-mocker le module à chaque test.

## Permissions ajoutées au type TS

`packages/shared/src/constants/permissions.ts` étendu avec les 10
permissions Module 9 (déjà seedées DB en migration 00060) :

- `exercises.request.own / read.own / read.all / approve / cancel.own /
cancel.any / confirm_payment`
- `exercise_workflows.read / update`
- `companies.fmv.update`

Sans cet ajout, `hasPermission('exercises.cancel.any')` levait une
erreur de typage TS car la string n'était pas dans le union type
`Permission`.

## Drift cloud vs local

- Cloud : 70 migrations (69 + 00067)
- Local : 67 fichiers (66 + 00067)
- Drift : +3 (existant — voir `module_9_b1_complete.md` dette)

## Métriques

- Migrations : +1 (00067)
- Tests Vitest : 543 → 558 (+15)
- Lignes TS ajoutées : ~1 200 (queries + actions + dialogs + 3 pages)
- Typecheck : ✅ passing
- Server Actions : 4
- Server queries : 4
- Composants nouveaux : 1 fichier (4 dialog buttons)
- Composants réutilisés : 3 (StatusBadge, TaxBreakdown, format-helpers)
- Pages : 3 (inbox + detail + workflows read-only)
- Sidebar : +1 lien "Exercices"

## V2 documenté

- **#100** Page edit paliers (`/dashboard/settings/exercise-workflows/edit`) :
  CRUD complet workflows + steps + reorder + drag & drop. V1 = read-only.
- **#101** Filtres avancés DataTable inbox : recherche par
  bénéficiaire/award, filtre par plage dates, filtre par montant.
  V1 = 4 tabs + tri created_at DESC.
- **#102** Bulk approve/reject : actions sur sélection multiple.
  V1 = 1 demande à la fois.
- **#103** Notifications admin auto sur nouvelle demande PENDING : V2
  via Module 7 hook `notifyAdminsOfPendingExercise`.
- **#104** Email confirmation paiement : actuellement seulement audit
  log. V2 = template Resend `exercise_payment_confirmed`.
- **#105** Bouton "Renvoyer email rappel" sur demande qui stagne en
  PENDING > N jours.

## Recon clé du code existant

### `record_approval_decision` RPC signature

```ts
Args: {
  p_decision_id: string;
  p_status: string;
  p_comment: string;
}
Returns: Json;
```

Module 5 RPC réutilisé pour Approve/Reject côté admin exercise. La
trick : trouver le `decision_id` du user avant d'appeler le RPC
(query approval_decisions WHERE approver_user_id=current AND status=PENDING).

### `getApprovalRequestDetailFull` Module 5 réutilisé

Lien depuis détail exercise → `/dashboard/approvals/[id]` pour la
timeline complète (déjà construite Module 5 B4). Pas de duplication V1.

## Test E2E human-driven (à faire par l'utilisateur)

1. Login `sasportasdavid+test@gmail.com` (rôle APPROVER + ADMIN_HR
   maintenant grâce à migration 00067)
2. `/dashboard/exercises?status=pending` : voir EXR-2026-0002 dans la
   liste avec status PENDING
3. Cliquer sur la ligne → `/dashboard/exercises/[id]` :
   - Vérifier KPIs (50 units, 75 €, FMV 25 €)
   - Vérifier section Demandeur, Award, Simulation fiscale (BSPCE
     <3y, 49% effective)
   - Vérifier la présence des boutons "Approuver" / "Rejeter" en bas
4. Cliquer "Approuver" → comment optionnel → Confirmer
5. Vérifier status passe à APPROVED + redirect refresh
6. (Si testé en tant que OWNER) Cliquer "Confirmer le paiement" →
   amount + ref → status passe COMPLETED, awards.units_exercised += 50
7. Naviguer `/dashboard/settings/exercise-workflows` :
   - Voir le banner amber "Read-only V1"
   - Voir le workflow par défaut avec ses 3 paliers cumulative

## Sécurité

- Toutes les pages utilisent `requirePermission('exercises.read.all')`
  → seuls OWNER + ADMIN_HR + AUDITOR ont accès au dashboard
- RLS DB filtre par org_id + permission (aucun leak inter-org)
- Server Actions revérifient permissions runtime (pas seulement RLS DB)
- Reasons / comments stockés avec audit_events (déjà en place RPC M9 B1)
