# MODULE 9 — EXERCISE WORKFLOW

> **Projet :** Equity Platform (Capiwise)
> **Version :** 1.0
> **Date :** Mai 2026
> **Prérequis :** Modules 1 à 8 terminés et validés
> **Audience :** Claude Code (développement)

---

## 0. CONTEXTE & OBJECTIFS

### 0.1 Mission du module

Implémenter le **workflow d'exercice** : la procédure par laquelle un bénéficiaire transforme ses options/bons (BSPCE, Stock Options, BSA) acquis en actions réelles, avec :

- Demande d'exercice depuis le portail (Module 8)
- Workflow d'approbation multi-step configurable par seuils € et par plan (extension Module 5)
- Génération de documents légaux (notification + bulletin de souscription V1, reste V2)
- Confirmation de paiement manuelle (hors plateforme V1)
- Émission des actions au registre actionnaires
- **Simulation fiscale FR complète** : tous les instruments (BSPCE, SO, BSA, AGA cession) avec tranches IR et régimes spéciaux
- Mini-add Module 8 portail : simulation fiscale au vesting AGA

C'est le module qui **finalise la chaîne de valeur** : le bénéficiaire passe de "détenteur d'options" à "actionnaire de la société". Sans Module 9, les BSPCE/SO restent virtuels.

### 0.2 Décisions structurantes (déjà tranchées)

| Décision                     | Choix retenu                                                                                        | Justification                                                  |
| ---------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Périmètre exercise**       | Cash exercise V1 (pas de cashless)                                                                  | Cashless = intégration broker complexe, V2                     |
| **Workflow approval**        | Module 5 étendu, multi-step configurable                                                            | Réutilise l'engine existant, pas de duplication                |
| **Seuils approval**          | Paliers en € configurables par org V1                                                               | Flexible sans coder en dur                                     |
| **Workflow par plan ou org** | Plan-specific avec fallback org                                                                     | Cohérent avec Module 5 AWARD_GRANT                             |
| **Documents**                | 2 V1 (notification + bulletin), reste V2                                                            | Minimum légal, V2 pour quittance/certificat/avenant            |
| **Paiement**                 | Hors plateforme + confirmation manuelle admin                                                       | Stripe = module à part V2                                      |
| **FMV à l'exercice**         | Manuelle admin (par défaut) + slider test bénéficiaire + option auto-pull dernière valuation IFRS 2 | Le bénéficiaire doit voir une référence, mais avec disclaimer  |
| **Simulation fiscale**       | Complète FR : BSPCE + SO + BSA + AGA (cession)                                                      | Différenciateur fort vs Carta/Pulley                           |
| **AGA hors workflow**        | AGA fiscalité ajoutée à Module 8 portal (mini-add)                                                  | AGA n'a pas d'exercice, juste calcul fiscal au vesting/cession |

### 0.3 Périmètre exact

**Inclus dans ce module :**

- Schéma DB : `exercise_requests` (préfiguré Module 1, à finaliser)
- 3 RPCs SECURITY DEFINER : `request_exercise`, `approve_exercise_request`, `confirm_exercise_payment`
- Workflow approval Module 5 étendu : nouveau `applies_to='EXERCISE_REQUEST'` + paliers €
- Migration : seed 3 paliers € par défaut + UI configuration paliers
- Server Actions : 8 actions (request, approve, reject, confirm payment, simulate, etc.)
- Pages portal :
  - `/portal/awards/[id]/exercise/new` (form demande exercise)
  - `/portal/exercises` (liste mes demandes)
  - `/portal/exercises/[id]` (détail demande)
  - `/portal/awards/[id]/tax-simulator` (simulateur fiscal complet)
- Pages admin :
  - `/dashboard/exercises` (liste toutes demandes org)
  - `/dashboard/exercises/[id]` (détail + actions admin)
  - `/dashboard/settings/exercise-workflows` (config workflows + paliers €)
  - `/dashboard/companies/[id]/fmv` (saisie FMV admin)
- 2 templates documents : `EXERCISE_NOTIFICATION` + `SUBSCRIPTION_BULLETIN`
- Hook auto-generate documents post-approval (pattern Module 6)
- Hook notifications email (Module 7) sur transitions
- Compliance V1 : 6 règles (ancienneté société pour BSPCE PFU, expiry date, paiement délai, etc.)
- Mini-add Module 8 : simulation AGA fiscalité au vesting (page séparée /portal/awards/[id]/aga-tax)
- Mise à jour state machine awards : nouvelles transitions vers FULLY_EXERCISED / PARTIALLY_EXERCISED
- Audit events sur toutes actions
- Tests SQL (15+) et Vitest (40+)

**Exclus (modules ultérieurs) :**

- Cashless exercise (vente immédiate) — V2
- Intégration Stripe / paiement direct — V2
- Quittance fiscale auto-générée — V2 (template T3)
- Certificat d'inscription registre actionnaires — V2 (template T3)
- Avenant cap table — V2 (template T3)
- Multi-currency (V1 = EUR uniquement)
- Exercice partiel multiple sur même award (V1 supporte 1 partial + 1 final)
- Préemption droit existant actionnaire — V2
- Modification d'une demande après soumission — V2 (V1 = annuler + re-créer)
- Stock Options "qualifiées" article 80 bis (rares post-Macron) — non supporté
- Délégation/substitution approbateur — V2 (déjà exclu Module 5)
- Workflow conditionnel autre que seuils € (ex: par plan_type seul) — V2

### 0.4 Dépendances

- Module 1 : table `exercise_requests` préfigurée
- Module 2 : RBAC, permissions APPROVER, OWNER
- Module 3a : `plans` avec exercise_price, plan_type
- Module 3b : `awards` avec status, units_vested, exercise_price, units_outstanding
- Module 4 : `beneficiaries` (acheteur)
- Module 5 : approval workflows engine (à étendre)
- Module 6 : pdf engine + Yousign signature pour SUBSCRIPTION_BULLETIN
- Module 7 : notifications emails (4 nouveaux templates)
- Module 8 : portal layout + RLS + RPCs portal

### 0.5 Référence

- MODULE*01_FOUNDATION sections 4.5, 4.6 (tables exercise_requests, approval*\*)
- MODULE_03A_PLANS sections 9.x (compliance BSPCE/AGA)
- MODULE_05_APPROVAL_ENGINE sections 1.x (workflow engine), 4.x (Server Actions)
- MODULE_06_DOCUMENT_ENGINE sections 4.x (templates PDF), 5.x (Yousign)
- MODULE_07_NOTIFICATIONS sections 5.x (consumer EF), 7.x (hooks)
- MODULE_08_BENEFICIARY_PORTAL sections 1.x (layout portal), 2.x (RPCs)

---

## 1. ARCHITECTURE GÉNÉRALE

### 1.1 Vue d'ensemble du flux exercise

```
┌─────────────────────────────────────────────────────────────────────┐
│  BÉNÉFICIAIRE — Portal                                              │
│                                                                       │
│  /portal/awards/[id]/exercise/new                                    │
│  Form :                                                              │
│  - Units à exercer (max = units_vested - units_exercised)           │
│  - Acceptation conditions (checkbox)                                 │
│  - Méthode de paiement : virement bancaire (V1)                      │
│  - Observations optional                                             │
│                                                                       │
│  Affichage :                                                         │
│  - Récap : units × strike = total à payer                           │
│  - Simulation fiscale : net après impôts (cf §4)                     │
│  - Coordonnées bancaires de la société                              │
│                                                                       │
│  Submit → Server Action requestExercise                              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  RPC request_exercise (SECURITY DEFINER)                             │
│                                                                       │
│  1. Validate ownership (beneficiary.user_id = auth.uid())            │
│  2. Compliance checks :                                              │
│     - Award status = GRANTED ou VESTING ou FULLY_VESTED              │
│     - Plan dans liste exerçable (BSPCE, SO, BSA — pas AGA)          │
│     - Profil bénéficiaire complet (PROFILE_COMPLETE_BEFORE_EXERCISE) │
│     - units_to_exercise <= units_vested - units_exercised           │
│     - Award pas expiré (expiry_date > today)                        │
│  3. Calcul total_exercise_amount = units × strike                    │
│  4. INSERT exercise_request status='PENDING'                         │
│  5. Snapshot fmv_per_unit_at_request                                 │
│  6. Trigger workflow approval (cf §3) :                              │
│     - Sélectionne workflow plan-specific OU org default              │
│     - Détermine step set selon montant (paliers €)                   │
│     - INSERT approval_request + approval_decisions PENDING           │
│  7. Notif insérée pour les approbateurs Step 1 (Module 7 hook)      │
│  8. Audit 'exercise.requested'                                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  APPROBATEURS — Dashboard                                           │
│                                                                       │
│  /dashboard/approvals (inbox commune avec awards)                    │
│  Filter : type EXERCISE_REQUEST                                      │
│                                                                       │
│  Click sur une demande → /dashboard/exercises/[id]                   │
│  Sections :                                                          │
│  - Récap exercise (units, prix, montant total, payment_method)       │
│  - Profil bénéficiaire                                              │
│  - Award concerné + history                                          │
│  - Step approval courant (X/N)                                       │
│  - Boutons : Approuver / Rejeter (avec comment)                      │
│                                                                       │
│  Click "Approuver" → record_approval_decision RPC Module 5           │
│  Si dernier step → exercise_request.status = APPROVED               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  HOOK POST-APPROVAL                                                  │
│                                                                       │
│  Quand workflow APPROVED :                                           │
│  1. Generate notification document (PDF léger non-signé)             │
│  2. Generate subscription bulletin (PDF) → envoyer pour signature   │
│     Yousign (bénéficiaire signe)                                     │
│  3. Notif email "Votre exercice est approuvé, signez le bulletin"   │
│  4. Update exercise_request.status = APPROVED + approved_at + by     │
│                                                                       │
│  Bénéficiaire signe le bulletin via Yousign (Module 6 flow)         │
│  → Webhook Yousign signed → exercise_request.status = SIGNED        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PAIEMENT BÉNÉFICIAIRE (HORS PLATEFORME)                             │
│                                                                       │
│  Bénéficiaire fait virement bancaire à la société                    │
│  Référence à utiliser : payment_reference (généré : EXR-2026-0001)  │
│                                                                       │
│  Admin reçoit le paiement, va sur /dashboard/exercises/[id] :        │
│  - Bouton "Confirmer paiement reçu"                                  │
│  - Form : Montant reçu, Date, Référence virement, Notes              │
│  - Submit → confirm_exercise_payment RPC                             │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  RPC confirm_exercise_payment                                        │
│                                                                       │
│  1. Update exercise_request :                                        │
│     - status = COMPLETED                                             │
│     - payment_received_at = NOW                                      │
│     - payment_reference (si admin a override)                        │
│     - completed_at = NOW                                             │
│  2. Update award :                                                   │
│     - units_exercised += units_to_exercise                          │
│     - SI units_exercised == units_granted → status = FULLY_EXERCISED│
│     - SINON → status = PARTIALLY_EXERCISED                          │
│  3. Notif email au bénéficiaire "Exercice finalisé"                  │
│  4. Audit 'exercise.completed'                                       │
│  5. (V2) Hook Cap Table : émission actions                          │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 State machine exercise_requests

```
┌─────────┐
│ PENDING │ ── (workflow démarré)
└────┬────┘
     │ APPROVED par tous les approbateurs
     ▼
┌──────────┐
│ APPROVED │ ── (notif + bulletin envoyé pour signature)
└────┬─────┘
     │ webhook Yousign : bulletin signé
     ▼
┌────────┐
│ SIGNED │ ── (admin attend paiement)
└────┬───┘
     │ admin confirme paiement
     ▼
┌───────────┐
│ COMPLETED │ ── ÉTAT TERMINAL : actions émises
└───────────┘

Branches :
- REJECTED : workflow rejeté → audit + notif au bénéficiaire
- CANCELLED : bénéficiaire annule (statut PENDING ou APPROVED uniquement) ou admin annule
```

States : `PENDING`, `APPROVED`, `SIGNED`, `COMPLETED`, `REJECTED`, `CANCELLED`

### 1.3 Permissions

À seeder :

| Permission                  | Description                                | Roles par défaut         |
| --------------------------- | ------------------------------------------ | ------------------------ |
| `exercises.request.own`     | Demander un exercice sur ses awards        | BENEFICIARY              |
| `exercises.read.own`        | Voir ses propres exercices                 | BENEFICIARY              |
| `exercises.read.all`        | Voir tous les exercices de l'org           | OWNER, ADMIN_HR, AUDITOR |
| `exercises.approve`         | Approuver une demande (gérée via Module 5) | (selon workflow)         |
| `exercises.cancel.own`      | Annuler sa propre demande PENDING          | BENEFICIARY              |
| `exercises.cancel.any`      | Annuler toute demande de l'org             | OWNER                    |
| `exercises.confirm_payment` | Confirmer réception paiement               | OWNER, ADMIN_HR          |
| `exercise_workflows.read`   | Voir les workflows configurés              | OWNER, ADMIN_HR, AUDITOR |
| `exercise_workflows.update` | Modifier workflow + paliers €              | OWNER                    |
| `companies.fmv.update`      | Mettre à jour le FMV de la société         | OWNER, ADMIN_HR          |

### 1.4 Variables d'environnement

Aucune nouvelle. Utilise les existantes (Yousign, Resend, Supabase).

---

## 2. SCHÉMA DB — FINALISATION

### 2.1 État actuel

Table `exercise_requests` préfigurée Module 1. **Recon obligatoire** avant ALTER.

### 2.2 Recon attendue

```sql
-- État schema exercise_requests
\d exercise_requests

-- Vérifier les colonnes attendues :
-- id, org_id, award_id, beneficiary_id, request_number,
-- units_to_exercise, exercise_price_per_unit, total_exercise_amount,
-- fmv_per_unit_at_request, status, requested_at, approved_at, approved_by,
-- rejected_reason, payment_received_at, payment_reference, certificate_issued_at,
-- certificate_document_id, completed_at, beneficiary_notes, admin_notes

-- État RLS
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'exercise_requests';

-- État schema companies (FMV)
\d companies
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'companies'
 AND column_name LIKE '%fmv%' OR column_name LIKE '%valuation%';

-- Approval workflows existants (Module 5)
SELECT id, name, applies_to, plan_type_filter, is_default
  FROM approval_workflows
 WHERE applies_to = 'EXERCISE_REQUEST';
-- Probablement 0 row → on en seedera

-- Permissions existantes
SELECT code FROM permissions_catalog WHERE code LIKE 'exercise%';
```

### 2.3 Migration 00056 — Extend exercise_requests

```sql
-- ============================================================
-- MODULE 9 B1 — Exercise schema finalization
-- ============================================================

-- Étendre exercise_requests pour Module 9
ALTER TABLE exercise_requests
  ADD COLUMN IF NOT EXISTS bulletin_document_id UUID REFERENCES document_instances(id),
  ADD COLUMN IF NOT EXISTS notification_document_id UUID REFERENCES document_instances(id),
  ADD COLUMN IF NOT EXISTS approval_request_id UUID REFERENCES approval_requests(id),
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'BANK_TRANSFER',
  ADD COLUMN IF NOT EXISTS payment_amount_received NUMERIC,
  ADD COLUMN IF NOT EXISTS exercise_window_check JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS tax_simulation_snapshot JSONB,  -- snapshot at request time
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Update status CHECK pour inclure les nouveaux états
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'exercise_requests'::regclass
       AND conname = 'exercise_requests_status_check'
  ) THEN
    ALTER TABLE exercise_requests
      DROP CONSTRAINT exercise_requests_status_check;
  END IF;

  ALTER TABLE exercise_requests
    ADD CONSTRAINT exercise_requests_status_check
    CHECK (status IN ('PENDING','APPROVED','SIGNED','COMPLETED','REJECTED','CANCELLED'));
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_exercise_requests_status
  ON exercise_requests(status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_exercise_requests_award
  ON exercise_requests(award_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_exercise_requests_beneficiary
  ON exercise_requests(beneficiary_id, requested_at DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_exercise_requests_approval
  ON exercise_requests(approval_request_id) WHERE approval_request_id IS NOT NULL;

-- Sequence pour numérotation
CREATE SEQUENCE IF NOT EXISTS exercise_request_number_seq;

CREATE OR REPLACE FUNCTION generate_exercise_request_number(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
  v_count INTEGER;
BEGIN
  SELECT COALESCE(MAX(
    CAST(
      SUBSTRING(request_number FROM 'EXR-' || v_year || '-(\d+)$') AS INTEGER
    )
  ), 0) + 1 INTO v_count
  FROM exercise_requests
  WHERE org_id = p_org_id
    AND request_number LIKE 'EXR-' || v_year || '-%';

  RETURN 'EXR-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
END $$;

GRANT EXECUTE ON FUNCTION generate_exercise_request_number(UUID) TO authenticated;
```

### 2.4 Migration 00057 — RLS exercise_requests

```sql
ALTER TABLE exercise_requests ENABLE ROW LEVEL SECURITY;

-- Bénéficiaire voit ses propres demandes
CREATE POLICY exercise_requests_select_own ON exercise_requests FOR SELECT
  USING (
    beneficiary_id IN (
      SELECT id FROM beneficiaries
       WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
    AND deleted_at IS NULL
  );

-- Admin voit tout l'org
CREATE POLICY exercise_requests_select_admin ON exercise_requests FOR SELECT
  USING (
    org_id = current_org_id()
    AND user_has_permission('exercises.read.all')
    AND deleted_at IS NULL
  );

-- INSERT/UPDATE/DELETE uniquement via RPCs SECURITY DEFINER
-- Pas de policy directe (verrouillage)

-- companies : permission FMV update
-- Vérifier RLS existante Module 3a, ajouter policy fmv si nécessaire
```

### 2.5 Migration 00058 — Companies FMV fields

```sql
-- Étendre companies pour FMV manuelle admin (Q7 décision)
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS last_known_fmv_per_share NUMERIC,
  ADD COLUMN IF NOT EXISTS fmv_as_of_date DATE,
  ADD COLUMN IF NOT EXISTS fmv_source TEXT,  -- 'MANUAL', 'LAST_VALUATION', 'EXTERNAL'
  ADD COLUMN IF NOT EXISTS fmv_notes TEXT,
  ADD COLUMN IF NOT EXISTS fmv_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fmv_updated_by UUID REFERENCES auth.users(id);

-- Ancienneté société pour BSPCE PFU 30%
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS founded_at DATE,  -- date création société
  ADD COLUMN IF NOT EXISTS bspce_first_grant_date DATE;  -- pour calcul ancienneté
```

### 2.6 Migration 00059 — Approval workflow paliers €

Module 5 a `approval_workflows` + `approval_workflow_steps`. On étend pour supporter les paliers € :

```sql
-- approval_workflow_steps : ajouter conditions de seuils
ALTER TABLE approval_workflow_steps
  ADD COLUMN IF NOT EXISTS amount_threshold_min NUMERIC,  -- step déclenché si montant >= min
  ADD COLUMN IF NOT EXISTS amount_threshold_max NUMERIC;  -- step déclenché si montant <= max (NULL = illimité)

-- Documentation :
-- Si amount_threshold_min IS NULL et amount_threshold_max IS NULL : step toujours déclenché (legacy)
-- Si amount_threshold_min = 0 et amount_threshold_max = 50000 : step pour montants <= 50K€
-- Si amount_threshold_min = 50000 et amount_threshold_max = 250000 : step pour 50K-250K€
-- Si amount_threshold_min = 250000 et amount_threshold_max IS NULL : step pour > 250K€

-- Index
CREATE INDEX IF NOT EXISTS idx_approval_workflow_steps_thresholds
  ON approval_workflow_steps(workflow_id, amount_threshold_min, amount_threshold_max);
```

### 2.7 Migration 00060 — Seed permissions Module 9

```sql
INSERT INTO permissions_catalog (code, description) VALUES
  ('exercises.request.own', 'Demander un exercice sur ses awards'),
  ('exercises.read.own', 'Voir ses propres exercices'),
  ('exercises.read.all', 'Voir tous les exercices de l''org'),
  ('exercises.approve', 'Approuver une demande d''exercice'),
  ('exercises.cancel.own', 'Annuler sa propre demande PENDING'),
  ('exercises.cancel.any', 'Annuler toute demande de l''org'),
  ('exercises.confirm_payment', 'Confirmer réception paiement'),
  ('exercise_workflows.read', 'Voir les workflows d''exercice'),
  ('exercise_workflows.update', 'Modifier workflow + paliers'),
  ('companies.fmv.update', 'Mettre à jour le FMV de la société')
ON CONFLICT (code) DO NOTHING;

-- Mapping role-permissions
INSERT INTO role_permissions (role, permission_code) VALUES
  ('BENEFICIARY', 'exercises.request.own'),
  ('BENEFICIARY', 'exercises.read.own'),
  ('BENEFICIARY', 'exercises.cancel.own'),
  ('OWNER', 'exercises.read.all'),
  ('OWNER', 'exercises.cancel.any'),
  ('OWNER', 'exercises.confirm_payment'),
  ('OWNER', 'exercise_workflows.read'),
  ('OWNER', 'exercise_workflows.update'),
  ('OWNER', 'companies.fmv.update'),
  ('ADMIN_HR', 'exercises.read.all'),
  ('ADMIN_HR', 'exercises.confirm_payment'),
  ('ADMIN_HR', 'exercise_workflows.read'),
  ('ADMIN_HR', 'companies.fmv.update'),
  ('AUDITOR', 'exercises.read.all'),
  ('AUDITOR', 'exercise_workflows.read')
ON CONFLICT DO NOTHING;
```

### 2.8 Migration 00061 — Seed default workflow EXERCISE_REQUEST

```sql
-- Pour chaque org existant, créer un workflow par défaut EXERCISE_REQUEST
-- avec 3 paliers (configurable ensuite via UI)

INSERT INTO approval_workflows (org_id, name, description, applies_to, is_active, is_default)
SELECT
  o.id,
  'Workflow exercice par défaut',
  'Workflow auto-généré : 1 step si <50K€, 2 steps si 50-250K€, 3 steps si >250K€',
  'EXERCISE_REQUEST',
  true,
  true
FROM organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM approval_workflows aw
   WHERE aw.org_id = o.id
     AND aw.applies_to = 'EXERCISE_REQUEST'
     AND aw.is_default = true
);

-- Steps :
-- Niveau 1 : 0 - 50K€ → 1 step ADMIN_HR
-- Niveau 2 : 50K - 250K€ → 2 steps (ADMIN_HR + OWNER)
-- Niveau 3 : > 250K€ → 3 steps (ADMIN_HR + OWNER + ANY_OF_ROLE BOARD)

WITH wf AS (
  SELECT id FROM approval_workflows
   WHERE applies_to = 'EXERCISE_REQUEST'
     AND is_default = true
)
INSERT INTO approval_workflow_steps (
  workflow_id, step_order, step_name, approver_type, approver_role,
  mode, required_approvals, amount_threshold_min, amount_threshold_max
)
SELECT wf.id, step_order, step_name, approver_type, approver_role,
       'SEQUENTIAL', 1, threshold_min, threshold_max
FROM wf,
LATERAL (VALUES
  -- Step 1 : toujours, mais limité aux faibles montants
  (1, 'Approbation RH', 'ROLE', 'ADMIN_HR', 0, 50000),
  -- Step 2 : pour montants 50-250K€
  (2, 'Validation Direction', 'ROLE', 'OWNER', 50000, 250000),
  -- Step 3 : pour gros montants > 250K€
  (3, 'Validation Board', 'ANY_OF_ROLE', 'BOARD_MEMBER', 250000, NULL)
) AS t(step_order, step_name, approver_type, approver_role, threshold_min, threshold_max)
ON CONFLICT (workflow_id, step_order) DO NOTHING;

-- ⚠️ Note : le rôle BOARD_MEMBER n'existe peut-être pas en V1.
-- Si recon montre qu'il n'existe pas, fallback : Step 3 utilise OWNER +
-- requires manual board notification email V1, V2 = vrai rôle BOARD_MEMBER.
```

### 2.9 Migration 00062 — Seed compliance rules

```sql
INSERT INTO compliance_rules_catalog (code, description, applies_to, enforcement) VALUES
  ('EXERCISE_AWARD_GRANTED', 'L''award doit être GRANTED ou plus avant exercise',
   'EXERCISE_REQUEST', 'hard'),
  ('EXERCISE_PROFILE_COMPLETE', 'Profil bénéficiaire doit être complet',
   'EXERCISE_REQUEST', 'hard'),
  ('EXERCISE_UNITS_AVAILABLE', 'units_to_exercise <= units_vested - units_exercised',
   'EXERCISE_REQUEST', 'hard'),
  ('EXERCISE_NOT_EXPIRED', 'Award expiry_date dans le futur',
   'EXERCISE_REQUEST', 'hard'),
  ('EXERCISE_PLAN_TYPE_EXERCISABLE', 'Plan type doit être BSPCE/SO/BSA (pas AGA)',
   'EXERCISE_REQUEST', 'hard'),
  ('EXERCISE_PAYMENT_DELAY_30D', 'Paiement attendu sous 30 jours après approval',
   'EXERCISE_REQUEST', 'soft')
ON CONFLICT (code) DO NOTHING;
```

---

## 3. RPCS PRINCIPAUX

### 3.1 RPC `request_exercise`

```sql
CREATE OR REPLACE FUNCTION request_exercise(
  p_award_id UUID,
  p_units_to_exercise BIGINT,
  p_payment_method TEXT DEFAULT 'BANK_TRANSFER',
  p_beneficiary_notes TEXT DEFAULT NULL,
  p_tax_simulation JSONB DEFAULT NULL
)
RETURNS JSONB  -- { exercise_request_id, request_number, approval_request_id, total_amount }
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_beneficiary_id UUID;
  v_award RECORD;
  v_plan RECORD;
  v_units_available BIGINT;
  v_total_amount NUMERIC;
  v_fmv NUMERIC;
  v_fmv_date DATE;
  v_company_id UUID;
  v_exercise_id UUID;
  v_request_number TEXT;
  v_workflow_id UUID;
  v_approval_request_id UUID;
  v_org_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_units_to_exercise IS NULL OR p_units_to_exercise <= 0 THEN
    RAISE EXCEPTION 'units_to_exercise must be positive';
  END IF;

  -- 1. Find beneficiary
  SELECT id INTO v_beneficiary_id
    FROM beneficiaries
   WHERE user_id = v_user_id AND deleted_at IS NULL;

  IF v_beneficiary_id IS NULL THEN
    RAISE EXCEPTION 'No beneficiary record';
  END IF;

  -- 2. Compliance : profil complet
  IF NOT EXISTS (
    SELECT 1 FROM beneficiaries
     WHERE id = v_beneficiary_id
       AND first_name IS NOT NULL
       AND last_name IS NOT NULL
       AND tax_residence_country IS NOT NULL
       AND address_line_1 IS NOT NULL
       AND country IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'EXERCISE_PROFILE_COMPLETE: Profile incomplete. Please complete /portal/profile.';
  END IF;

  -- 3. Load award + plan
  SELECT * INTO v_award FROM awards
   WHERE id = p_award_id
     AND beneficiary_id = v_beneficiary_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award not found';
  END IF;

  v_org_id := v_award.org_id;

  -- 4. Compliance : award status
  IF v_award.status NOT IN ('GRANTED','VESTING','FULLY_VESTED','PARTIALLY_EXERCISED') THEN
    RAISE EXCEPTION 'EXERCISE_AWARD_GRANTED: Award status % not exercisable', v_award.status;
  END IF;

  SELECT * INTO v_plan FROM plans WHERE id = v_award.plan_id;
  v_company_id := v_plan.company_id;

  -- 5. Compliance : plan_type exercisable
  IF v_plan.plan_type NOT IN ('BSPCE','STOCK_OPTION','BSA') THEN
    RAISE EXCEPTION 'EXERCISE_PLAN_TYPE_EXERCISABLE: Plan type % not exercisable (AGA = no exercise)', v_plan.plan_type;
  END IF;

  -- 6. Compliance : not expired
  IF v_award.expiry_date IS NOT NULL AND v_award.expiry_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'EXERCISE_NOT_EXPIRED: Award expired on %', v_award.expiry_date;
  END IF;

  -- 7. Compliance : units available
  v_units_available := v_award.units_vested - v_award.units_exercised;
  IF p_units_to_exercise > v_units_available THEN
    RAISE EXCEPTION 'EXERCISE_UNITS_AVAILABLE: Cannot exercise % units (available: %)',
      p_units_to_exercise, v_units_available;
  END IF;

  -- 8. Calcul total + FMV snapshot
  v_total_amount := p_units_to_exercise * v_award.exercise_price;

  SELECT last_known_fmv_per_share, fmv_as_of_date
    INTO v_fmv, v_fmv_date
    FROM companies WHERE id = v_company_id;

  -- 9. Generate request number
  v_request_number := generate_exercise_request_number(v_org_id);

  -- 10. INSERT exercise_request
  INSERT INTO exercise_requests (
    org_id, award_id, beneficiary_id, request_number,
    units_to_exercise, exercise_price_per_unit, fmv_per_unit_at_request,
    status, requested_at, beneficiary_notes, payment_method,
    tax_simulation_snapshot
  )
  VALUES (
    v_org_id, p_award_id, v_beneficiary_id, v_request_number,
    p_units_to_exercise, v_award.exercise_price, v_fmv,
    'PENDING', now(), p_beneficiary_notes, p_payment_method,
    p_tax_simulation
  )
  RETURNING id INTO v_exercise_id;

  -- 11. Resolve workflow (plan-specific OR org default)
  SELECT id INTO v_workflow_id
    FROM approval_workflows
   WHERE org_id = v_org_id
     AND applies_to = 'EXERCISE_REQUEST'
     AND (
       -- Plan-specific (TBD : need linkage table OR plan_type_filter)
       v_plan.plan_type = ANY(plan_type_filter)
       OR plan_type_filter IS NULL
     )
     AND is_active = true
   ORDER BY (plan_type_filter IS NOT NULL) DESC, is_default DESC
   LIMIT 1;

  -- 12. Start approval workflow (filtre selon montant via amount_threshold_*)
  -- Adapt Module 5 RPC : start_approval_workflow_for_exercise
  -- (créer une variante OU étendre start_approval_workflow pour accepter
  -- subject_type='EXERCISE_REQUEST' + amount filter)

  v_approval_request_id := start_approval_workflow_for_exercise(
    v_exercise_id, v_workflow_id, v_total_amount
  );

  UPDATE exercise_requests
     SET approval_request_id = v_approval_request_id
   WHERE id = v_exercise_id;

  -- 13. Audit
  INSERT INTO audit_events (
    org_id, user_id, event_type, resource_type, resource_id, metadata
  ) VALUES (
    v_org_id, v_user_id, 'exercise.requested', 'exercise_request', v_exercise_id,
    jsonb_build_object(
      'award_id', p_award_id,
      'units_to_exercise', p_units_to_exercise,
      'total_amount', v_total_amount,
      'fmv_at_request', v_fmv
    )
  );

  RETURN jsonb_build_object(
    'exercise_request_id', v_exercise_id,
    'request_number', v_request_number,
    'approval_request_id', v_approval_request_id,
    'total_amount', v_total_amount,
    'fmv_per_unit_at_request', v_fmv,
    'status', 'PENDING'
  );
END $$;

GRANT EXECUTE ON FUNCTION request_exercise(UUID, BIGINT, TEXT, TEXT, JSONB) TO authenticated;
```

### 3.2 RPC `start_approval_workflow_for_exercise`

Variante du Module 5 qui filtre les steps selon le montant.

```sql
CREATE OR REPLACE FUNCTION start_approval_workflow_for_exercise(
  p_exercise_request_id UUID,
  p_workflow_id UUID,
  p_total_amount NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request_id UUID;
  v_step RECORD;
  v_org_id UUID;
  v_resolved_users UUID[];
  v_user_id_iter UUID;
  v_first_step_order INTEGER;
BEGIN
  SELECT org_id INTO v_org_id
    FROM exercise_requests
   WHERE id = p_exercise_request_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Exercise request not found';
  END IF;

  -- Insert approval_request
  INSERT INTO approval_requests (
    org_id, workflow_id, subject_type, subject_id,
    status, current_step_order
  )
  VALUES (
    v_org_id, p_workflow_id, 'EXERCISE_REQUEST', p_exercise_request_id,
    'IN_PROGRESS', 0
  )
  RETURNING id INTO v_request_id;

  -- Identifier le premier step applicable (selon montant)
  SELECT step_order INTO v_first_step_order
    FROM approval_workflow_steps
   WHERE workflow_id = p_workflow_id
     AND (amount_threshold_min IS NULL OR p_total_amount >= amount_threshold_min)
     AND (amount_threshold_max IS NULL OR p_total_amount <= amount_threshold_max)
   ORDER BY step_order
   LIMIT 1;

  IF v_first_step_order IS NULL THEN
    RAISE EXCEPTION 'No workflow step applicable for amount %', p_total_amount;
  END IF;

  -- Créer les decisions du premier step + suivants applicables
  FOR v_step IN
    SELECT * FROM approval_workflow_steps
     WHERE workflow_id = p_workflow_id
       AND step_order >= v_first_step_order
       AND (amount_threshold_min IS NULL OR p_total_amount >= amount_threshold_min)
       AND (amount_threshold_max IS NULL OR p_total_amount <= amount_threshold_max)
     ORDER BY step_order
  LOOP
    -- Resolve approbateurs (réutilise pattern Module 5)
    -- (USER, ROLE, ANY_OF_ROLE, ALL_OF_ROLE)
    -- ... (cf Module 5 logic, adapté)
  END LOOP;

  -- Update request avec current_step_order = first applicable
  UPDATE approval_requests
     SET current_step_order = v_first_step_order
   WHERE id = v_request_id;

  RETURN v_request_id;
END $$;

GRANT EXECUTE ON FUNCTION start_approval_workflow_for_exercise(UUID, UUID, NUMERIC) TO authenticated;
```

> **Note** : le code complet est plus long. Pattern complet à inspirer de Module 5 `start_approval_workflow`. La différence clé : filtrage par montant via `amount_threshold_min/max`.

### 3.3 RPC `confirm_exercise_payment`

```sql
CREATE OR REPLACE FUNCTION confirm_exercise_payment(
  p_exercise_request_id UUID,
  p_payment_amount_received NUMERIC,
  p_payment_reference TEXT,
  p_payment_received_at TIMESTAMPTZ DEFAULT now(),
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_request RECORD;
  v_award RECORD;
  v_new_award_status TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT user_has_permission('exercises.confirm_payment') THEN
    RAISE EXCEPTION 'Permission denied : exercises.confirm_payment required';
  END IF;

  SELECT * INTO v_request FROM exercise_requests
   WHERE id = p_exercise_request_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exercise request not found';
  END IF;

  -- Status doit être SIGNED (bulletin signé) ou APPROVED
  -- (V1 : on laisse aussi APPROVED pour le cas où la signature
  -- serait skipped en V1 — à confirmer)
  IF v_request.status NOT IN ('SIGNED','APPROVED') THEN
    RAISE EXCEPTION 'Cannot confirm payment for status %', v_request.status;
  END IF;

  -- Update exercise_request
  UPDATE exercise_requests
     SET status = 'COMPLETED',
         payment_amount_received = p_payment_amount_received,
         payment_received_at = p_payment_received_at,
         payment_reference = p_payment_reference,
         admin_notes = COALESCE(admin_notes, '') ||
                       CASE WHEN p_admin_notes IS NULL THEN ''
                            ELSE E'\n[CONFIRM PAYMENT] ' || p_admin_notes
                       END,
         completed_at = now(),
         updated_at = now()
   WHERE id = p_exercise_request_id;

  -- Update award units_exercised
  SELECT * INTO v_award FROM awards WHERE id = v_request.award_id;

  v_new_award_status := CASE
    WHEN v_award.units_exercised + v_request.units_to_exercise >= v_award.units_granted
      THEN 'FULLY_EXERCISED'
    ELSE 'PARTIALLY_EXERCISED'
  END;

  UPDATE awards
     SET units_exercised = units_exercised + v_request.units_to_exercise,
         status = v_new_award_status,
         updated_at = now()
   WHERE id = v_request.award_id;

  -- Audit
  INSERT INTO audit_events (
    org_id, user_id, event_type, resource_type, resource_id, metadata
  ) VALUES (
    v_request.org_id, v_user_id, 'exercise.completed',
    'exercise_request', p_exercise_request_id,
    jsonb_build_object(
      'award_id', v_request.award_id,
      'units_exercised', v_request.units_to_exercise,
      'payment_amount', p_payment_amount_received,
      'payment_reference', p_payment_reference,
      'new_award_status', v_new_award_status
    )
  );

  RETURN jsonb_build_object(
    'exercise_request_id', p_exercise_request_id,
    'status', 'COMPLETED',
    'award_status', v_new_award_status
  );
END $$;

GRANT EXECUTE ON FUNCTION confirm_exercise_payment(UUID, NUMERIC, TEXT, TIMESTAMPTZ, TEXT) TO authenticated;
```

### 3.4 RPC `cancel_exercise_request`

```sql
CREATE OR REPLACE FUNCTION cancel_exercise_request(
  p_exercise_request_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_request RECORD;
  v_is_owner BOOLEAN;
  v_can_cancel BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT er.*, b.user_id as benef_user_id
    INTO v_request
    FROM exercise_requests er
    JOIN beneficiaries b ON b.id = er.beneficiary_id
   WHERE er.id = p_exercise_request_id AND er.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exercise request not found';
  END IF;

  v_is_owner := (v_request.benef_user_id = v_user_id);

  -- Bénéficiaire peut cancel uniquement PENDING ou APPROVED
  -- Admin peut cancel partout (sauf COMPLETED/CANCELLED/REJECTED)
  v_can_cancel := (
    (v_is_owner
     AND user_has_permission('exercises.cancel.own')
     AND v_request.status IN ('PENDING','APPROVED'))
    OR
    (user_has_permission('exercises.cancel.any')
     AND v_request.status NOT IN ('COMPLETED','CANCELLED','REJECTED'))
  );

  IF NOT v_can_cancel THEN
    RAISE EXCEPTION 'Cannot cancel exercise request in status %', v_request.status;
  END IF;

  UPDATE exercise_requests
     SET status = 'CANCELLED',
         cancelled_at = now(),
         cancelled_by = v_user_id,
         cancellation_reason = p_reason,
         updated_at = now()
   WHERE id = p_exercise_request_id;

  -- Cancel associated approval_request if exists
  IF v_request.approval_request_id IS NOT NULL THEN
    UPDATE approval_requests
       SET status = 'CANCELLED',
           resolved_at = now()
     WHERE id = v_request.approval_request_id
       AND status NOT IN ('APPROVED','REJECTED','CANCELLED');
  END IF;

  INSERT INTO audit_events (
    org_id, user_id, event_type, resource_type, resource_id, metadata
  ) VALUES (
    v_request.org_id, v_user_id, 'exercise.cancelled',
    'exercise_request', p_exercise_request_id,
    jsonb_build_object(
      'reason', p_reason,
      'cancelled_by_owner', v_is_owner,
      'previous_status', v_request.status
    )
  );

  RETURN jsonb_build_object('exercise_request_id', p_exercise_request_id, 'status', 'CANCELLED');
END $$;

GRANT EXECUTE ON FUNCTION cancel_exercise_request(UUID, TEXT) TO authenticated;
```

### 3.5 RPC `get_exercise_detail` + `get_my_exercises`

Helpers de lecture (cf §6 Server queries).

---

## 4. SIMULATION FISCALE FR — CŒUR DU MODULE

### 4.1 Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  apps/web/src/lib/tax/                                            │
│  ├── index.ts                  # exports principaux               │
│  ├── types.ts                  # interfaces                       │
│  ├── rates.ts                  # taux IR/CSG (config)             │
│  ├── bspce.ts                  # régime BSPCE                     │
│  ├── stockOption.ts            # régime SO non qualifiées         │
│  ├── bsa.ts                    # régime BSA                       │
│  ├── aga.ts                    # régime AGA (cession)             │
│  ├── compute.ts                # orchestrateur                    │
│  └── __tests__/                # 30+ tests                        │
└──────────────────────────────────────────────────────────────────┘
```

### 4.2 Types

```typescript
// apps/web/src/lib/tax/types.ts

export interface TaxSimulationInput {
  planType: 'BSPCE' | 'STOCK_OPTION' | 'BSA' | 'AGA';

  // Dates clés
  grantDate: string; // YYYY-MM-DD
  exerciseDate?: string; // pour BSPCE/SO/BSA
  saleDate?: string; // pour cession AGA / SO post-exercise
  companyFoundingDate?: string; // pour BSPCE PFU 30% vs TMI

  // Quantités et prix
  unitsToExercise?: number;
  unitsToSell?: number;
  exercisePrice?: number; // strike (= 0 pour AGA)
  fmvAtExercise?: number; // valeur marché à l'exercice
  fmvAtSale?: number; // valeur marché à la vente
  acquisitionPrice?: number; // pour SO post-exercise vente

  // Profil bénéficiaire
  marginalIncomeTaxRate: 0 | 11 | 30 | 41 | 45; // TMI %
  isTaxResidentFrance: boolean;

  // Régime social (V1 : simplifié)
  socialRegime?: 'EMPLOYEE' | 'EXECUTIVE' | 'CONSULTANT';
}

export interface TaxSimulationResult {
  planType: string;
  regime: string; // ex: "BSPCE_PFU_3Y_PLUS", "AGA_CESSION", "SO_NON_QUALIFIE"

  // Plus-value
  grossGain: number; // (FMV - exercise_price) × units OU (sale - acquisition)

  // Décomposition imposition
  incomeTax: number; // IR + PFU IR
  socialContributions: number; // CSG/CRDS + cotisations
  total: number; // total impôts

  // Net
  netGain: number; // grossGain - total
  effectiveRate: number; // total / grossGain en %

  // Détails (pour affichage)
  breakdown: TaxBreakdownLine[];

  // Disclaimer
  disclaimer: string;

  // Metadata
  calculationDate: string;
  rulesApplied: string[]; // codes des règles appliquées
}

export interface TaxBreakdownLine {
  label: string;
  base: number; // base imposable
  rate: number; // taux %
  amount: number; // montant
  type: 'INCOME_TAX' | 'SOCIAL' | 'CSG_CRDS' | 'OTHER';
}
```

### 4.3 Configuration des taux

```typescript
// apps/web/src/lib/tax/rates.ts

// Taux 2026 — À METTRE À JOUR ANNUELLEMENT
export const TAX_RATES_FR = {
  // Prélèvement Forfaitaire Unique (PFU "flat tax")
  PFU_TOTAL: 0.3,
  PFU_INCOME_TAX_PORTION: 0.128, // 12.8% IR
  PFU_SOCIAL_PORTION: 0.172, // 17.2% prélèvements sociaux

  // CSG/CRDS standard (pour traitement comme rémunération)
  CSG_DEDUCTIBLE: 0.068,
  CSG_NON_DEDUCTIBLE: 0.024,
  CRDS: 0.005,
  CSG_CRDS_TOTAL: 0.097,

  // Tranches IR 2026 (TMI)
  IR_BRACKETS: [
    { up_to: 11497, rate: 0 },
    { up_to: 29315, rate: 0.11 },
    { up_to: 83823, rate: 0.3 },
    { up_to: 180294, rate: 0.41 },
    { up_to: Infinity, rate: 0.45 },
  ],

  // BSPCE
  BSPCE_MIN_HOLDING_YEARS: 3, // pour PFU favorable
  BSPCE_PFU_BEFORE_3Y: 0.3, // = PFU normal
  // Si > 3 ans : reste PFU 30% mais sans abattement durée
  // Si < 3 ans : TMI + 17.2% (défavorable)

  // Stock Options non-qualifiées (post-2017)
  // Plus-value d'acquisition = traitement rémunération (cotisations sociales)
  // Plus-value de cession = PFU 30%

  // BSA
  // Plus-value mobilière = PFU 30% par défaut
  // OU régime IR si option (avec abattement durée détention)

  // AGA "qualifiées" (post-2018 Macron)
  AGA_GAIN_ACQUISITION: {
    PFU_RATE: 0.3, // sur partie ≤ 300K€
    HIGH_RATE_THRESHOLD: 300000,
    HIGH_RATE: 0.41 + 0.097, // au-delà : TMI + CSG/CRDS
  },
};
```

### 4.4 Calcul BSPCE

```typescript
// apps/web/src/lib/tax/bspce.ts

import { TAX_RATES_FR } from './rates';
import { TaxSimulationInput, TaxSimulationResult } from './types';

export function computeBspceTax(input: TaxSimulationInput): TaxSimulationResult {
  if (input.planType !== 'BSPCE') {
    throw new Error('Not a BSPCE');
  }

  if (!input.companyFoundingDate || !input.exerciseDate) {
    throw new Error('Missing companyFoundingDate or exerciseDate');
  }

  const grossGain = (input.fmvAtExercise! - input.exercisePrice!) * input.unitsToExercise!;

  // Ancienneté société (du grant au moment de l'exercice)
  // Note V1 simplifié : on utilise companyFoundingDate. La vraie règle
  // est l'ancienneté de la société à la date du grant (article 163 bis G).
  // V2 = utiliser grant_date au lieu de exercise_date pour le calcul.
  const exerciseDate = new Date(input.exerciseDate);
  const grantDate = new Date(input.grantDate);
  const yearsOfService =
    (exerciseDate.getTime() - grantDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

  const isPfuFavorable = yearsOfService >= TAX_RATES_FR.BSPCE_MIN_HOLDING_YEARS;

  let incomeTax: number;
  let socialContributions: number;
  let regime: string;
  let rulesApplied: string[] = [];

  if (isPfuFavorable) {
    // > 3 ans : PFU 30% (12.8% IR + 17.2% sociaux)
    incomeTax = grossGain * TAX_RATES_FR.PFU_INCOME_TAX_PORTION;
    socialContributions = grossGain * TAX_RATES_FR.PFU_SOCIAL_PORTION;
    regime = 'BSPCE_PFU_3Y_PLUS';
    rulesApplied = ['ARTICLE_163_BIS_G', 'PFU_30PCT'];
  } else {
    // < 3 ans : TMI + 17.2% sociaux (très défavorable)
    incomeTax = grossGain * (input.marginalIncomeTaxRate / 100);
    socialContributions = grossGain * TAX_RATES_FR.PFU_SOCIAL_PORTION;
    regime = 'BSPCE_TMI_BEFORE_3Y';
    rulesApplied = ['ARTICLE_163_BIS_G_DEFAVORABLE'];
  }

  const total = incomeTax + socialContributions;
  const netGain = grossGain - total;

  return {
    planType: 'BSPCE',
    regime,
    grossGain,
    incomeTax,
    socialContributions,
    total,
    netGain,
    effectiveRate: grossGain > 0 ? (total / grossGain) * 100 : 0,
    breakdown: [
      {
        label: isPfuFavorable
          ? 'Prélèvement Forfaitaire Unique (IR)'
          : `IR à votre TMI (${input.marginalIncomeTaxRate}%)`,
        base: grossGain,
        rate: isPfuFavorable
          ? TAX_RATES_FR.PFU_INCOME_TAX_PORTION * 100
          : input.marginalIncomeTaxRate,
        amount: incomeTax,
        type: 'INCOME_TAX',
      },
      {
        label: 'Prélèvements sociaux (CSG/CRDS)',
        base: grossGain,
        rate: TAX_RATES_FR.PFU_SOCIAL_PORTION * 100,
        amount: socialContributions,
        type: 'SOCIAL',
      },
    ],
    disclaimer:
      'Simulation indicative basée sur les taux 2026. ' +
      'Consultez un conseiller fiscal pour votre situation personnelle. ' +
      "L'ancienneté société est calculée du grant à l'exercice (article 163 bis G).",
    calculationDate: new Date().toISOString(),
    rulesApplied,
  };
}
```

### 4.5 Stock Options non-qualifiées

```typescript
// apps/web/src/lib/tax/stockOption.ts

export function computeStockOptionTax(input: TaxSimulationInput): TaxSimulationResult {
  // 2 phases :
  // 1. À l'exercice : plus-value d'acquisition = (FMV - strike) →
  //    traitement rémunération (TMI + CSG/CRDS)
  // 2. À la cession : plus-value de cession = (sale - FMV à exercice) → PFU 30%

  // V1 : on modélise les 2 si saleDate fourni, sinon juste exercise

  const exerciseGain = (input.fmvAtExercise! - input.exercisePrice!) * input.unitsToExercise!;

  // Phase 1 : à l'exercice
  const exerciseIncomeTax = exerciseGain * (input.marginalIncomeTaxRate / 100);
  const exerciseSocial = exerciseGain * TAX_RATES_FR.CSG_CRDS_TOTAL;

  let saleIncomeTax = 0;
  let saleSocial = 0;
  let saleGain = 0;

  if (input.saleDate && input.fmvAtSale) {
    saleGain =
      (input.fmvAtSale - input.fmvAtExercise!) * (input.unitsToSell ?? input.unitsToExercise!);
    saleIncomeTax = saleGain * TAX_RATES_FR.PFU_INCOME_TAX_PORTION;
    saleSocial = saleGain * TAX_RATES_FR.PFU_SOCIAL_PORTION;
  }

  const totalGross = exerciseGain + saleGain;
  const totalTax = exerciseIncomeTax + saleIncomeTax + exerciseSocial + saleSocial;

  return {
    planType: 'STOCK_OPTION',
    regime: 'SO_NON_QUALIFIE',
    grossGain: totalGross,
    incomeTax: exerciseIncomeTax + saleIncomeTax,
    socialContributions: exerciseSocial + saleSocial,
    total: totalTax,
    netGain: totalGross - totalTax,
    effectiveRate: totalGross > 0 ? (totalTax / totalGross) * 100 : 0,
    breakdown: [
      // ... décomposition phase 1 + phase 2
    ],
    disclaimer:
      'Simulation Stock Options non-qualifiées (post-2017). ' +
      'Les Stock Options "qualifiées" article 80 bis (rares) ne sont pas couvertes V1. ' +
      'Consultez un conseiller fiscal.',
    calculationDate: new Date().toISOString(),
    rulesApplied: ['STOCK_OPTION_NON_QUALIFIE_2017'],
  };
}
```

### 4.6 BSA et AGA

`bsa.ts` : régime plus-value mobilière, PFU 30% par défaut.
`aga.ts` : 2 phases (acquisition au vesting + cession). Le gain d'acquisition AGA "qualifiée" post-Macron a un régime spécial (PFU sur partie <= 300K€, TMI + CSG au-delà).

(Détails complets dans le code, voir le pattern bspce.ts ci-dessus.)

### 4.7 Orchestrateur

```typescript
// apps/web/src/lib/tax/compute.ts

export function computeTax(input: TaxSimulationInput): TaxSimulationResult {
  switch (input.planType) {
    case 'BSPCE':
      return computeBspceTax(input);
    case 'STOCK_OPTION':
      return computeStockOptionTax(input);
    case 'BSA':
      return computeBsaTax(input);
    case 'AGA':
      return computeAgaTax(input);
    default:
      throw new Error(`Unsupported planType: ${input.planType}`);
  }
}
```

### 4.8 Tests

Cible : 30+ tests Vitest sur les 4 instruments avec :

- Cas standards (PFU favorable / défavorable)
- Edge cases (gross_gain = 0, negative)
- Tranches IR exactes
- Comparaison vs scénario alternatif (TMI vs PFU)

---

## 5. UI — PORTAL BÉNÉFICIAIRE

### 5.1 Page `/portal/awards/[id]/exercise/new`

Form RHF + Zod :

- Units à exercer (number, max = units_vested - units_exercised)
- Méthode paiement (radio : virement bancaire V1)
- Notes optionnelles (textarea)

Affichage live :

- Récap : units × strike = total à payer (€)
- FMV à l'exercice (read-only, depuis companies.last_known_fmv_per_share)
- Coordonnées bancaires de la société (depuis org settings)

Section "Simulation fiscale" :

- TMI input (slider 0% / 11% / 30% / 41% / 45%)
- Affichage breakdown : IR, CSG/CRDS, total, net après impôts
- Boutons : "Voir détail simulation" (navigue vers /portal/awards/[id]/tax-simulator)

Submit → Server Action requestExercise.

### 5.2 Page `/portal/awards/[id]/tax-simulator`

Simulateur fiscal complet et standalone (pas seulement à l'exercise).

Pour BSPCE/SO/BSA :

- Form : units + FMV simulée + TMI
- Affichage : breakdown IR/CSG, comparaison régimes (PFU vs TMI)

Pour AGA :

- Form : units acquises + FMV au vesting + FMV à la cession (futur) + TMI
- Affichage : 2 phases (acquisition + cession)

Disclaimer permanent.

### 5.3 Page `/portal/exercises`

Liste des exercise_requests du bénéficiaire.

Cards avec :

- Numéro EXR-XXXX
- Award + plan
- Units exercised + total amount
- Status badge
- Actions selon status :
  - PENDING : "Annuler"
  - APPROVED : "Signer le bulletin" (lien Yousign)
  - SIGNED : "Effectuer le virement" (info coordonnées)
  - COMPLETED : "Voir le détail"

### 5.4 Page `/portal/exercises/[id]`

Détail de la demande :

- Récap complet
- Timeline status (PENDING → APPROVED → SIGNED → COMPLETED)
- Documents générés (notification + bulletin)
- Coordonnées bancaires si pending payment
- Audit trail simplifié

### 5.5 Mini-add Module 8 — page AGA tax `/portal/awards/[id]/aga-tax`

Pour les awards AGA (qui n'ont pas d'exercice mais ont une fiscalité).

Affichage :

- Récap award
- Calculateur fiscal AGA acquisition + cession future
- Disclaimer AGA "qualifiée" Macron

---

## 6. UI — DASHBOARD ADMIN

### 6.1 Page `/dashboard/exercises`

Tableau de tous les exercise_requests de l'org.

Colonnes : Numéro, Date demande, Bénéficiaire, Plan, Units, Total €, Status, Actions

Filtres : status, date range, beneficiary, plan_type

Actions par row :

- Click "Voir" → /dashboard/exercises/[id]
- Si status PENDING → on voit le step approval courant + bouton "Approuver/Rejeter"
  (lien vers la page Module 5 /dashboard/approvals/[requestId])

### 6.2 Page `/dashboard/exercises/[id]`

Détail admin :

- Toutes infos exercise_request
- Workflow approval (visualisation Module 5)
- Documents (notification PDF + bulletin Yousign status)
- Actions admin selon status :
  - SIGNED → Bouton "Confirmer paiement" (modal form)
  - PENDING/APPROVED → Bouton "Annuler" (admin override)

### 6.3 Page `/dashboard/settings/exercise-workflows`

Configuration des workflows EXERCISE_REQUEST.

UI :

- Liste workflows existants (org default + plan-specific)
- Pour chaque workflow : tableau des steps avec amount_threshold_min/max
- Drag-and-drop pour réordonner steps
- Form ajout/édition step :
  - step_name, approver_type, approver_role/user
  - amount_threshold_min (€), amount_threshold_max (€) — input numérique avec format FR
  - mode (Sequential/Parallel), required_approvals
- Bouton "Sauvegarder"

Visualisation : "Pour un montant de X€, ces N steps seront déclenchés : ..."

### 6.4 Page `/dashboard/companies/[id]/fmv`

Saisie du FMV manuel par admin.

Form :

- last_known_fmv_per_share (€)
- fmv_as_of_date (date)
- fmv_source (radio : MANUAL / LAST_VALUATION / EXTERNAL)
- fmv_notes (textarea)

Bouton "Enregistrer" → audit event 'company.fmv_updated'.

Affichage :

- Historique des FMV (V2 = audit table)
- Lien vers dernière valuation IFRS 2 (Module 11) si applicable

---

## 7. SERVER ACTIONS

`apps/web/src/server/actions/exercises.ts` :

```typescript
'use server';

// Bénéficiaire
export async function requestExercise(input): Promise<Result<{ exerciseRequestId; requestNumber }>>;
export async function cancelMyExerciseRequest(input): Promise<Result>;
export async function getMyExerciseRequests(): Promise<ExerciseRequestSummary[]>;
export async function getMyExerciseDetail(id): Promise<ExerciseRequestDetail>;
export async function simulateTax(input: TaxSimulationInput): Promise<TaxSimulationResult>;

// Admin
export async function getOrgExerciseRequests(filters): Promise<ExerciseRequestSummary[]>;
export async function getExerciseDetail(id): Promise<ExerciseRequestDetail>;
export async function confirmExercisePayment(input): Promise<Result>;
export async function cancelExerciseAsAdmin(input): Promise<Result>;
export async function updateCompanyFMV(input): Promise<Result>;
export async function updateExerciseWorkflow(input): Promise<Result>;
```

---

## 8. HOOKS MODULES PRÉCÉDENTS

### 8.1 Hook Module 5 (approval) → exercise

Quand `record_approval_decision` workflow APPROVED + subject_type='EXERCISE_REQUEST' :

- Update exercise_request.status = APPROVED
- Generate notification document (REACT_PDF, pas signé)
- Generate subscription bulletin → Yousign for signature
- Notif email "Votre exercice est approuvé"

### 8.2 Hook Module 6 (Yousign) → exercise

Quand webhook Yousign signed + le document est un SUBSCRIPTION_BULLETIN lié à exercise :

- Update exercise_request.status = SIGNED
- Notif email "Bulletin signé, effectuez le virement"

### 8.3 Hook Module 7 (notifications) → exercise

Nouveaux templates email V1 :

- `exercise_pending_approval` (vers approbateurs)
- `exercise_approved` (vers bénéficiaire, "signez le bulletin")
- `exercise_signed_payment_pending` (vers bénéficiaire, "effectuez le virement")
- `exercise_completed` (vers bénéficiaire, "exercice finalisé")

---

## 9. COMPLIANCE V1

6 règles dans `apps/web/src/lib/compliance/rules/exerciseRules.ts` :

```typescript
export const EXERCISE_COMPLIANCE_RULES = [
  // Hard rules
  EXERCISE_AWARD_GRANTED,
  EXERCISE_PROFILE_COMPLETE,
  EXERCISE_UNITS_AVAILABLE,
  EXERCISE_NOT_EXPIRED,
  EXERCISE_PLAN_TYPE_EXERCISABLE,

  // Soft rules
  EXERCISE_PAYMENT_DELAY_30D, // alerte si paiement non reçu sous 30j post-approval
];
```

---

## 10. PLAN DE LIVRAISON — 6 SOUS-MODULES

### B1 — DB & RPCs Exercise (1.5 jour)

- Recon Module 1-8 + tables exercise_requests, companies, approval_workflows
- 7 migrations (00056-00062 : extend tables, RLS, FMV companies, paliers approval, perms, workflow seed, compliance rules)
- 4 RPCs principaux (request_exercise, start_workflow_for_exercise, confirm_payment, cancel)
- 15+ tests SQL purs
- **Livrable** : DB ready pour exercise queries

### B2 — Simulation fiscale FR complète (1.5 jour)

- Lib `apps/web/src/lib/tax/` (8 files)
- 4 régimes : BSPCE, SO non-qualifié, BSA, AGA (cession)
- Configuration taux 2026 + tranches IR
- Server Action simulateTax
- 30+ tests Vitest sur les calculs
- **Livrable** : moteur fiscal complet et testé

### B3 — Pages portal bénéficiaire (1.5 jour)

- Page `/portal/awards/[id]/exercise/new` (form demande)
- Page `/portal/awards/[id]/tax-simulator` (simulateur standalone)
- Page `/portal/awards/[id]/aga-tax` (mini-add AGA fiscalité)
- Page `/portal/exercises` (liste)
- Page `/portal/exercises/[id]` (détail)
- Server Actions bénéficiaire
- Tests Vitest
- **Livrable** : bénéficiaire peut demander un exercice + voir simulation

### B4 — Pages dashboard admin (1 jour)

- Page `/dashboard/exercises` (liste)
- Page `/dashboard/exercises/[id]` (détail + actions)
- Page `/dashboard/settings/exercise-workflows` (config workflows + paliers)
- Page `/dashboard/companies/[id]/fmv` (saisie FMV)
- Server Actions admin
- Tests Vitest
- **Livrable** : admin peut configurer workflows + confirmer paiements

### B5 — Hooks Modules 5/6/7 + documents (1.5 jour)

- 2 templates documents (notification + bulletin)
- Hook Module 5 → notification + bulletin generation post-approval
- Hook Module 6 → exercise SIGNED post-Yousign
- 4 nouveaux templates email Module 7
- Server Action getExerciseDocumentSignedUrl (sécurité)
- Tests Vitest
- **Livrable** : flow complet automated, documents générés et signés

### B6 — E2E + closure + merge (0.5 jour)

- Tests E2E manuels complets (4 scénarios : <50K, 50-250K, >250K, AGA tax sim)
- Memory closure module 9 complet
- Update CLAUDE.md
- PR ready + squash-merge
- **Livrable** : Module 9 mergé sur master

**Total : 7-8 jours**

---

## 11. INSTRUCTIONS POUR CLAUDE CODE

### Phase 1 — Bootstrap

1. Lire `memory/module_8_complete.md` + `memory/module_5_complete.md` + `memory/module_6_complete.md`
2. Branche `feat/module-9-exercise` from master à jour (post Module 8 merge)
3. Pre-checks :
   - Tests workspace 406+/406+ verts (post Module 8)
   - Drift cloud documenté
   - Module 8 mergé sur master

### Phase 2 — Recon B1

Pattern obligatoire (Module 4-8 B1) :

- État `exercise_requests` columns
- État `companies` columns (FMV)
- État `approval_workflows` (filter `EXERCISE_REQUEST` peut être 0 row)
- Permissions existantes
- Workflows existants (Module 5 pour AWARD_GRANT) — pattern à reproduire
- Ancienneté société : champ `founded_at` existe ou pas dans companies ?

### Phase 3 — Migrations

Suivre §2.3 à §2.9. 7 migrations.

⚠️ Migration 00061 (seed default workflow) : si recon montre que rôle BOARD_MEMBER n'existe pas, Step 3 utilise OWNER avec un comment "TODO V2 : créer rôle BOARD_MEMBER".

### Phase 4 — Tests SQL

Cible 15+ tests SQL :

- A : recon + migrations applied
- B : request_exercise happy path BSPCE
- C : request_exercise reject AGA
- D : request_exercise reject profil incomplet
- E : request_exercise reject units > vested
- F : request_exercise reject award expired
- G : start_workflow_for_exercise selon montant (3 paliers)
- H : confirm_payment happy path → award.status FULLY_EXERCISED
- I : confirm_payment partial → award.status PARTIALLY_EXERCISED
- J : confirm_payment reject permission denied
- K : cancel_exercise own happy path
- L : cancel_exercise admin override
- M : cancel_exercise reject COMPLETED
- N : RLS exercise_requests own only
- O : RLS exercise_requests admin all

### Phase 5 — Tax simulation B2

⚠️ Critique : faire tourner les 30+ tests AVANT toute UI.

Cas tests prioritaires :

- BSPCE > 3 ans : PFU 30% (gain 100K → tax 30K)
- BSPCE < 3 ans : TMI 41% + 17.2% sociaux (gain 100K → tax 58.2K)
- Stock Option exercise + cession : 2 phases distinctes
- BSA standard : PFU 30%
- AGA acquisition < 300K€ : PFU 30%
- AGA acquisition > 300K€ : split PFU + TMI
- Edge case gross_gain = 0 → tax = 0
- Edge case TMI 0% : pas d'IR mais sociaux quand même

### Phase 6 — Documents B5

Templates :

- `EXERCISE_NOTIFICATION` (PDF léger non-signé)
- `SUBSCRIPTION_BULLETIN` (PDF officiel signé via Yousign)

Pattern Module 6 REACT_PDF + componentName.

⚠️ Disclaimer dans les templates : "Document généré automatiquement. À valider par votre conseil juridique avant émission officielle."

### Phase 7 — E2E B6

Scénarios :

1. Bénéficiaire demande exercise BSPCE 1000 units × 5€ = 5000€
   → 1 step approval (< 50K€)
   → admin approve
   → bulletin Yousign signé
   → admin confirme paiement
   → award FULLY_EXERCISED

2. Idem mais 50K-250K€ → 2 steps approval
3. Idem mais > 250K€ → 3 steps approval (Board)
4. Bénéficiaire AGA → simulation fiscale acquisition + cession (pas d'exercise)

### Conventions strictes (rappel)

- 'use server' = uniquement async
- Pattern Result strict
- Validation Zod sur chaque input
- Audit log systématique
- RLS + RPC SECURITY DEFINER pour ownership checks
- Mobile-first
- Disclaimer fort sur toutes simulations fiscales

### Points de vigilance

- **Ancienneté société BSPCE** : la règle exacte article 163 bis G est complexe. V1 simplifié = exercice > 3 ans après grant. V2 = checks plus précis.
- **PFU vs TMI** : le calcul peut donner des résultats surprenants (TMI 30% + 17.2% sociaux > PFU 30%). Documenter dans le breakdown.
- **AGA "qualifiée" vs "non qualifiée"** : V1 assume "qualifiée" (post-Macron, plus courant). V2 = champ `aga_regime` dans plans.
- **FMV manuel** : risque que admin oublie de mettre à jour. Alerte si `fmv_updated_at` > 6 mois → soft warning.
- **Coordonnées bancaires de l'org** : où sont-elles stockées ? Module 1 ? Si pas, ajouter à `organizations` table en B1.
- **Workflow paliers** : si admin configure des paliers qui se chevauchent ou laissent un trou, valider en compliance check.
- **Cancel après bulletin signé** : compliqué. V1 = on bloque (status SIGNED ne peut plus être cancelled). V2 = procédure de rétractation.
- **Multi-currency** : V1 = EUR uniquement. Si plan/award a une exercise_price en USD, planter à l'exercise avec message clair.
- **Hook Cap Table** : Module 10 fera l'émission des actions au registre. V1 = stub, juste audit event 'cap_table.shares_to_emit'.
- **Tax 2026** : taux à mettre à jour annuellement. Mettre un commentaire `// LAST UPDATE: 2026-01-01` dans rates.ts.

---

**FIN DU MODULE 9 — EXERCISE WORKFLOW**

_Quand le Module 9 est mergé sur master, reviens vers Claude (chat) pour "go module 10" (Cap Table)._
