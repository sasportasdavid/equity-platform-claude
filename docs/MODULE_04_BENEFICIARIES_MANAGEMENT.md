# MODULE 4 — BENEFICIARIES MANAGEMENT

> **Projet :** Equity Platform
> **Version :** 1.0
> **Date :** Avril 2026
> **Prérequis :** Modules 1, 2, 3a et 3b terminés et validés
> **Audience :** Claude Code (développement)

---

## 0. CONTEXTE & OBJECTIFS

### 0.1 Mission du module

Compléter le mini-CRUD bénéficiaire créé en Module 3b avec un système complet de gestion des bénéficiaires : CRUD avancé, lifecycle (active / on_leave / terminated), import RH par CSV générique, fiscalité (tax_residence + statut résident), informations de paiement (IBAN/BIC pour Module 9 Exercise), gestion documentaire (lien vers Module 6), invitation manuelle au portail (magic link), et compliance V1 (cohérence tax_residence avec contrat, dates).

Le bénéficiaire est l'**objet humain** de la plateforme : tout l'objectif business est de gérer son parcours d'attribution + acquisition + exercice + sortie. Sans une bonne gestion bénéficiaire, le reste du SaaS ne sert à rien.

### 0.2 Périmètre exact

**Inclus dans ce module :**

- Étendre la table `beneficiaries` (Module 3b minimal → V1 complet)
- CRUD complet : création, lecture, mise à jour, archivage (soft delete)
- Lifecycle : active / on_leave / terminated avec transitions auditées
- Import CSV générique (max 500 lignes, validation Zod par ligne, atomicité RPC)
- Page liste avec filtres avancés (status, type, tax_residence, has_awards, hire_date range)
- Page détail avec 4 onglets (Profil / Awards / Documents / Audit)
- Bouton "Inviter au portail" (Server Action séparée — déclenche un magic link Supabase Auth pour l'utilisateur)
- Compliance V1 : règles bloquantes sur cohérence (BSPCE_BENEFICIARY_TYPE_REVERSE, tax_residence FR cohérent avec contrat, hire_date avant grant_date, etc.)
- Audit events sur toutes les actions critiques
- Permissions `beneficiaries.*` complètes
- Sandbox `/dev/beneficiary-lifecycle` pour tester les transitions

**Exclus (modules ultérieurs) :**

- Connectors HRIS (Lucca, Payfit, BambooHR, Workday, Personio) — Module 4.5 V2 ou Module dédié
- Documents personnels stockés (contrat, KYC, attestations) — Module 6 (Document Engine)
- Notifications email à l'invitation — Module 7 (Notifications) — pour V1, le magic link est envoyé directement via Supabase Auth standard
- Vue bénéficiaire de ses awards (espace personnel) — Module 8 (Beneficiary Portal)
- Workflow exercise (RIB/IBAN nécessaire) — Module 9
- Reporting RH bulk (export CSV de toute la base) — Module 13

### 0.3 Dépendances

- Module 1 : tables `auth.users`, `audit_events`, RLS patterns 1 et 2
- Module 2 : RBAC, permissions
- Module 3b : la mini-table `beneficiaries` créée en B1, qu'on va étendre. CRUD basique (`upsertBeneficiary`, `searchBeneficiaries`) déjà en place.
- Module 6 (anticipé) : la table `documents` et la relation document↔beneficiary seront posées en Module 6, mais on ajoute déjà ici une colonne `documents_count` calculée pour la page détail.

### 0.4 Référence

Ce module s'appuie sur :

- MODULE_01_FOUNDATION sections 4.5 (table beneficiaries préfigurée)
- MODULE_03B_AWARDS_LIFECYCLE section 3.4 (mini-table beneficiaries V0.1)

---

## 1. ARCHITECTURE GÉNÉRALE

### 1.1 Vue d'ensemble du flux

```
RH crée un bénéficiaire (manuel ou import CSV)
    │
    ├─ status='active', user_id=null (pas encore invité)
    │
    ├─ Optionnel : RH clique "Inviter au portail"
    │   → Supabase Auth.signInWithOtp(email)
    │   → user_id rempli au login (custom_access_token_hook)
    │
    ├─ Bénéficiaire reçoit un award (Module 3b)
    │
    ├─ Lifecycle :
    │   active → on_leave (congé maternité, sabbatique, maladie)
    │   active → terminated (départ entreprise)
    │   on_leave → active (retour de congé)
    │   on_leave → terminated (non-retour)
    │
    └─ Soft delete possible si pas d'awards actifs
```

### 1.2 Décisions structurantes

| Décision                              | Choix retenu                                                               | Justification                                                                                                                                                                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Lifecycle**                         | Champ `status` enum (active/on_leave/terminated) avec transitions auditées | Modélise le réel (RH gère les leavers de manière différenciée). Termination n'est PAS soft delete : un terminated reste en base pour audit historique des awards passés.                                                                              |
| **user_id nullable**                  | Oui (un bénéficiaire peut exister sans compte user)                        | RH crée d'abord le bénéficiaire, l'invite plus tard. Simplifie le flow et évite de spammer Auth de comptes vides.                                                                                                                                     |
| **Lifecycle distinct de soft delete** | active/on_leave/terminated ≠ deleted_at                                    | Soft delete = "ce bénéficiaire n'aurait jamais dû exister, on le cache". Termination = "le bénéficiaire a quitté l'entreprise, mais ses awards passés restent légitimes". Très différent IFRS 2 : un terminated continue d'amortir certaines charges. |
| **Invitation séparée**                | Server Action `inviteBeneficiary(id)` indépendante                         | Donne le contrôle à RH (timing, communication interne avant invitation). Évite l'auto-spam.                                                                                                                                                           |
| **Import CSV**                        | Pattern identique au bulk awards (Module 3b B5)                            | Cohérence UX, réutilisation de papaparse, modale wizard 3 étapes.                                                                                                                                                                                     |
| **Tax residence**                     | ISO 3166-1 alpha-2 + colonne booléenne `is_tax_resident_france`            | Distingue "résident fiscal France" (BSPCE éligible) de "FR avec mobilité internationale". Module 12 (Compliance V2) affinera.                                                                                                                         |
| **IBAN/BIC**                          | Colonnes optionnelles dans beneficiaries                                   | Nécessaire pour Module 9 (Exercise) — payment des cash-settled awards. Optionnel à la création.                                                                                                                                                       |
| **Numérotation**                      | Pas de numérotation lisible (ex: BEN-2026-0001)                            | Contrairement aux awards, les bénéficiaires sont déjà identifiés par email + nom. Pas besoin d'identifiant lisible.                                                                                                                                   |

### 1.3 Permissions

Permissions à seeder dans `permissions_catalog` (vérifier ce qui existe déjà depuis Module 3b) :

| Permission                  | Description                                                     | Roles par défaut                   |
| --------------------------- | --------------------------------------------------------------- | ---------------------------------- |
| `beneficiaries.read.all`    | Lire tous les bénéficiaires de l'org                            | OWNER, ADMIN_HR, APPROVER, AUDITOR |
| `beneficiaries.read.own`    | Lire son propre profil bénéficiaire                             | BENEFICIARY                        |
| `beneficiaries.create`      | Créer un bénéficiaire                                           | OWNER, ADMIN_HR                    |
| `beneficiaries.update`      | Modifier un bénéficiaire                                        | OWNER, ADMIN_HR                    |
| `beneficiaries.delete`      | Soft-delete un bénéficiaire (uniquement si pas d'awards actifs) | OWNER                              |
| `beneficiaries.lifecycle`   | Transitionner le statut (on_leave / terminated / active)        | OWNER, ADMIN_HR                    |
| `beneficiaries.invite`      | Envoyer un magic link d'invitation                              | OWNER, ADMIN_HR                    |
| `beneficiaries.bulk_import` | Importer un CSV de bénéficiaires                                | OWNER, ADMIN_HR                    |
| `beneficiaries.export`      | Export CSV de la liste (Module 13 mais permission posée)        | OWNER, ADMIN_HR, AUDITOR           |

Si certaines existent déjà depuis Module 3b ou un seed Module 1, créer migration idempotente avec `ON CONFLICT DO NOTHING`.

---

## 2. SCHÉMA DB — EXTENSION DE LA TABLE `beneficiaries`

### 2.1 Colonnes à ajouter

Migration `00025_module_4_beneficiaries_extend.sql` :

```sql
-- ============================================================
-- MODULE 4 B1 — Extend beneficiaries table to V1 complete
-- Pre-existing columns from Module 3b minimal:
--   id, org_id, user_id, external_id, full_name, email,
--   beneficiary_type, tax_residence, hire_date, termination_date,
--   metadata, created_at, updated_at, deleted_at
-- ============================================================

-- Status (lifecycle) — transitions auditées
ALTER TABLE beneficiaries
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'on_leave', 'terminated'));

-- Identifiants additionnels
ALTER TABLE beneficiaries
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS preferred_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('M', 'F', 'X', NULL));

-- Adresse postale
ALTER TABLE beneficiaries
  ADD COLUMN IF NOT EXISTS address_line_1 TEXT,
  ADD COLUMN IF NOT EXISTS address_line_2 TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'FR';  -- ISO 3166-1 alpha-2

-- Fiscalité
ALTER TABLE beneficiaries
  ADD COLUMN IF NOT EXISTS is_tax_resident_france BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS tax_id TEXT,  -- numéro fiscal (NIF, SSN, etc.)
  ADD COLUMN IF NOT EXISTS social_security_number TEXT;  -- chiffré V2

-- Contrat
ALTER TABLE beneficiaries
  ADD COLUMN IF NOT EXISTS contract_type TEXT
    CHECK (contract_type IN ('CDI', 'CDD', 'STAGE', 'ALTERNANCE', 'CONSULTANT', 'MANDATAIRE_SOCIAL', 'AUTRE', NULL)),
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES beneficiaries(id) ON DELETE SET NULL;

-- Banque (pour Module 9 — cash-settled exercise)
ALTER TABLE beneficiaries
  ADD COLUMN IF NOT EXISTS iban TEXT,  -- chiffré V2
  ADD COLUMN IF NOT EXISTS bic TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_holder_name TEXT;

-- Invitation
ALTER TABLE beneficiaries
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ,  -- date du dernier magic link envoyé
  ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMPTZ,  -- date du 1er login réussi
  ADD COLUMN IF NOT EXISTS invitation_count INTEGER DEFAULT 0;

-- Audit lifecycle
ALTER TABLE beneficiaries
  ADD COLUMN IF NOT EXISTS lifecycle_changed_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS lifecycle_change_reason TEXT;

-- Compteurs (computed via subquery dans les queries — pas de stored)
-- Pas besoin de colonne, on calcule à la lecture pour avoir des données fraîches

-- Indexes
CREATE INDEX IF NOT EXISTS idx_beneficiaries_status ON beneficiaries(status)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_beneficiaries_tax_resident ON beneficiaries(is_tax_resident_france)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_beneficiaries_manager ON beneficiaries(manager_id);
CREATE INDEX IF NOT EXISTS idx_beneficiaries_contract ON beneficiaries(contract_type);
```

### 2.2 Trigger pour audit lifecycle

Migration suite (même fichier ou `00026_module_4_beneficiaries_lifecycle_trigger.sql`) :

```sql
CREATE OR REPLACE FUNCTION audit_beneficiary_lifecycle()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.lifecycle_changed_at := now();

    -- Audit
    INSERT INTO audit_events (org_id, actor_id, event_type, resource_type, resource_id, metadata)
    VALUES (
      NEW.org_id,
      auth.uid(),
      'beneficiary.lifecycle_changed',
      'beneficiary',
      NEW.id,
      jsonb_build_object(
        'from', OLD.status,
        'to', NEW.status,
        'reason', NEW.lifecycle_change_reason,
        'termination_date', NEW.termination_date
      )
    );
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_beneficiary_lifecycle
  BEFORE UPDATE OF status ON beneficiaries
  FOR EACH ROW EXECUTE FUNCTION audit_beneficiary_lifecycle();
```

### 2.3 Trigger pour vérifier l'absence d'awards actifs avant soft delete

```sql
CREATE OR REPLACE FUNCTION enforce_beneficiary_soft_delete()
RETURNS TRIGGER AS $$
DECLARE
  active_awards_count INTEGER;
BEGIN
  -- Si on tente de soft-delete (deleted_at est mis non-null)
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    SELECT COUNT(*) INTO active_awards_count
      FROM awards
     WHERE beneficiary_id = NEW.id
       AND status NOT IN ('CANCELLED', 'FORFEITED', 'EXPIRED', 'FULLY_EXERCISED')
       AND deleted_at IS NULL;

    IF active_awards_count > 0 THEN
      RAISE EXCEPTION 'Cannot soft-delete beneficiary with % active awards. Use lifecycle status="terminated" instead.',
        active_awards_count
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_beneficiary_soft_delete_check
  BEFORE UPDATE OF deleted_at ON beneficiaries
  FOR EACH ROW EXECUTE FUNCTION enforce_beneficiary_soft_delete();
```

### 2.4 Migration de données existantes

Si la mini-table beneficiaries du Module 3b a des rows existants, ils doivent migrer proprement :

```sql
-- Tous les bénéficiaires existants sont 'active' par défaut
UPDATE beneficiaries SET status = 'active' WHERE status IS NULL;

-- Si full_name existe mais pas first_name/last_name, splitter best-effort
-- (split sur le premier espace, prénom = avant, nom = reste)
UPDATE beneficiaries
   SET first_name = SPLIT_PART(full_name, ' ', 1),
       last_name = NULLIF(SUBSTRING(full_name FROM POSITION(' ' IN full_name) + 1), '')
 WHERE first_name IS NULL AND full_name IS NOT NULL AND POSITION(' ' IN full_name) > 0;

-- is_tax_resident_france par défaut TRUE pour tax_residence='FR'
UPDATE beneficiaries
   SET is_tax_resident_france = (tax_residence = 'FR')
 WHERE is_tax_resident_france IS NULL;
```

> **Note Claude Code** : faire ces UPDATEs dans la même migration avec `ON CONFLICT` ou des guards. Tester avec un dataset minimal (1-2 rows existants depuis tests Module 3b) avant d'appliquer.

### 2.5 RLS — patterns à appliquer

La RLS existe déjà depuis Module 3b. Vérifier que les nouvelles colonnes ne nécessitent pas d'ajustement (elles ne devraient pas, RLS filtre par org_id et permissions).

À ajouter — policy bénéficiaire pour son propre row :

```sql
-- Bénéficiaire peut UPDATE son propre profil (champs limités)
CREATE POLICY beneficiaries_update_self ON beneficiaries FOR UPDATE
  USING (user_id = auth.uid() AND deleted_at IS NULL);

-- Trigger qui restreint les colonnes modifiables par le bénéficiaire
CREATE OR REPLACE FUNCTION enforce_beneficiary_self_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Si l'acteur n'a PAS la permission beneficiaries.update (= il agit en tant que bénéficiaire)
  IF NOT user_has_permission('beneficiaries.update') THEN
    -- Seuls quelques champs sont modifiables par le bénéficiaire
    IF NEW.status != OLD.status
       OR NEW.org_id != OLD.org_id
       OR NEW.email != OLD.email  -- email change uniquement par admin
       OR NEW.beneficiary_type != OLD.beneficiary_type
       OR NEW.contract_type != OLD.contract_type
       OR NEW.tax_residence != OLD.tax_residence
       OR NEW.is_tax_resident_france != OLD.is_tax_resident_france
       OR NEW.hire_date != OLD.hire_date
       OR NEW.termination_date != OLD.termination_date
       OR NEW.deleted_at IS NOT NULL
    THEN
      RAISE EXCEPTION 'Beneficiary can only update personal details (phone, address, banking)';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_beneficiary_self_update
  BEFORE UPDATE ON beneficiaries
  FOR EACH ROW EXECUTE FUNCTION enforce_beneficiary_self_update();
```

---

## 3. RPC ET HELPERS

### 3.1 RPC `transition_beneficiary_lifecycle`

Migration `00027_module_4_lifecycle_rpc.sql` :

```sql
CREATE OR REPLACE FUNCTION transition_beneficiary_lifecycle(
  p_beneficiary_id UUID,
  p_to_status TEXT,
  p_reason TEXT,
  p_termination_date DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID := current_org_id();
  v_beneficiary RECORD;
BEGIN
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT user_has_permission('beneficiaries.lifecycle') THEN
    RAISE EXCEPTION 'Permission denied: beneficiaries.lifecycle required';
  END IF;

  -- Lock + load
  SELECT * INTO v_beneficiary FROM beneficiaries
   WHERE id = p_beneficiary_id AND org_id = v_org_id AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Beneficiary % not found', p_beneficiary_id;
  END IF;

  -- Validate transition
  IF NOT (
    (v_beneficiary.status = 'active' AND p_to_status IN ('on_leave', 'terminated'))
    OR (v_beneficiary.status = 'on_leave' AND p_to_status IN ('active', 'terminated'))
    -- terminated est terminal (sauf cas exceptionnel via UPDATE direct admin)
  ) THEN
    RAISE EXCEPTION 'Invalid lifecycle transition: % -> %', v_beneficiary.status, p_to_status;
  END IF;

  -- Validate termination_date when needed
  IF p_to_status = 'terminated' AND p_termination_date IS NULL THEN
    RAISE EXCEPTION 'termination_date required when transitioning to terminated';
  END IF;

  -- Apply transition (le trigger trg_beneficiary_lifecycle gère l'audit)
  UPDATE beneficiaries
     SET status = p_to_status,
         termination_date = COALESCE(p_termination_date, termination_date),
         lifecycle_change_reason = p_reason
   WHERE id = p_beneficiary_id;

  RETURN p_beneficiary_id;
END $$;

GRANT EXECUTE ON FUNCTION transition_beneficiary_lifecycle(UUID, TEXT, TEXT, DATE) TO authenticated;
```

### 3.2 RPC `bulk_create_beneficiaries`

Migration suite (même fichier ou `00028_module_4_bulk_beneficiaries.sql`) :

```sql
CREATE OR REPLACE FUNCTION bulk_create_beneficiaries(p_rows JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID := current_org_id();
  v_row JSONB;
  v_created_count INTEGER := 0;
  v_errors JSONB[] := ARRAY[]::JSONB[];
  v_created_ids UUID[] := ARRAY[]::UUID[];
  v_email TEXT;
  v_existing_id UUID;
  v_new_id UUID;
BEGIN
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT user_has_permission('beneficiaries.bulk_import') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'Bulk limit: 500 rows max';
  END IF;

  -- Loop avec rollback sur erreur
  FOR v_row IN SELECT jsonb_array_elements(p_rows)
  LOOP
    v_email := lower(v_row->>'email');

    -- Check existence (par email lowercased)
    SELECT id INTO v_existing_id
      FROM beneficiaries
     WHERE org_id = v_org_id AND lower(email) = v_email AND deleted_at IS NULL;

    IF v_existing_id IS NOT NULL THEN
      -- Skip ou update — on choisit skip avec un warning dans errors
      v_errors := array_append(v_errors, jsonb_build_object(
        'rowIndex', v_row->>'rowIndex',
        'email', v_email,
        'severity', 'WARNING',
        'message', 'Beneficiary already exists, skipped',
        'existing_id', v_existing_id
      ));
      CONTINUE;
    END IF;

    -- Insert new
    INSERT INTO beneficiaries (
      org_id, email, full_name, first_name, last_name,
      beneficiary_type, contract_type, job_title, department,
      tax_residence, is_tax_resident_france,
      hire_date, status
    )
    VALUES (
      v_org_id,
      v_email,
      v_row->>'fullName',
      v_row->>'firstName',
      v_row->>'lastName',
      v_row->>'beneficiaryType',
      v_row->>'contractType',
      v_row->>'jobTitle',
      v_row->>'department',
      COALESCE(v_row->>'taxResidence', 'FR'),
      COALESCE((v_row->>'isTaxResidentFrance')::BOOLEAN, true),
      NULLIF(v_row->>'hireDate', '')::DATE,
      'active'
    )
    RETURNING id INTO v_new_id;

    v_created_count := v_created_count + 1;
    v_created_ids := array_append(v_created_ids, v_new_id);
  END LOOP;

  -- Audit event global
  INSERT INTO audit_events (org_id, actor_id, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id, v_user_id, 'beneficiary.bulk_imported', 'beneficiary', NULL,
    jsonb_build_object(
      'rows_count', jsonb_array_length(p_rows),
      'created_count', v_created_count,
      'errors_count', array_length(v_errors, 1),
      'created_ids', v_created_ids
    )
  );

  RETURN jsonb_build_object(
    'created', v_created_count,
    'errors', to_jsonb(v_errors),
    'created_ids', to_jsonb(v_created_ids)
  );
END $$;

GRANT EXECUTE ON FUNCTION bulk_create_beneficiaries(JSONB) TO authenticated;
```

### 3.3 RPC `invite_beneficiary`

```sql
CREATE OR REPLACE FUNCTION mark_beneficiary_invited(p_beneficiary_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID := current_org_id();
  v_beneficiary_email TEXT;
BEGIN
  IF NOT user_has_permission('beneficiaries.invite') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE beneficiaries
     SET invited_at = now(),
         invitation_count = invitation_count + 1
   WHERE id = p_beneficiary_id AND org_id = v_org_id
   RETURNING email INTO v_beneficiary_email;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Beneficiary not found';
  END IF;

  -- Audit
  INSERT INTO audit_events (org_id, actor_id, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id, auth.uid(), 'beneficiary.invited', 'beneficiary', p_beneficiary_id,
    jsonb_build_object('email', v_beneficiary_email)
  );

  RETURN p_beneficiary_id;
END $$;

GRANT EXECUTE ON FUNCTION mark_beneficiary_invited(UUID) TO authenticated;
```

> **Note** : ce RPC met juste à jour les colonnes `invited_at`, `invitation_count` et logge un audit event. **L'envoi du magic link** est fait côté Server Action en TS via `supabase.auth.signInWithOtp()`. Le RPC sert juste à marquer en DB qu'on a invité.

### 3.4 RPC `link_beneficiary_to_user_on_login` (custom_access_token_hook)

Module 2 a posé `custom_access_token_hook`. On l'étend pour qu'au 1er login d'un user dont l'email matche un bénéficiaire, on lie automatiquement `beneficiaries.user_id`.

Migration `00029_module_4_link_beneficiary_user.sql` :

```sql
-- Triggered au login via custom_access_token_hook
-- (à hook dans la fonction custom_access_token_hook si possible,
-- ou via trigger ON INSERT auth.users si c'est plus simple)

CREATE OR REPLACE FUNCTION link_beneficiary_to_user(p_user_id UUID, p_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE beneficiaries
     SET user_id = p_user_id,
         first_login_at = COALESCE(first_login_at, now())
   WHERE lower(email) = lower(p_email)
     AND user_id IS NULL  -- ne pas réécraser
     AND deleted_at IS NULL;
END $$;
```

> **Note Claude Code** : à intégrer dans `custom_access_token_hook` du Module 2 ou via trigger sur `auth.users`. Vérifier comment Module 2 a implémenté le hook et étendre proprement (plutôt qu'un trigger séparé qui pourrait s'exécuter dans le mauvais ordre).

---

## 4. SERVER ACTIONS

### 4.1 Liste des actions

`apps/web/src/server/actions/beneficiaries.ts` (étendre l'existant) :

```typescript
'use server';

// CRUD
export async function createBeneficiary(
  input: CreateBeneficiaryInput,
): Promise<Result<{ id: string }>>;
export async function updateBeneficiary(
  id: string,
  patch: UpdateBeneficiaryInput,
): Promise<Result<void>>;
export async function loadBeneficiaryDetail(id: string): Promise<BeneficiaryDetail>;
export async function archiveBeneficiary(id: string, reason: string): Promise<Result<void>>;

// Lifecycle
export async function transitionBeneficiaryLifecycle(
  id: string,
  toStatus: 'active' | 'on_leave' | 'terminated',
  reason: string,
  terminationDate?: string,
): Promise<Result<void>>;

// Invitation
export async function inviteBeneficiary(id: string): Promise<Result<{ invitedAt: string }>>;
export async function reinviteBeneficiary(id: string): Promise<Result<{ invitedAt: string }>>;

// Bulk import
export async function bulkCreateBeneficiaries(
  rows: BulkBeneficiaryRow[],
): Promise<Result<BulkResult>>;

// Self-service (bénéficiaire qui modifie son propre profil)
export async function updateMyBeneficiaryProfile(patch: SelfUpdateInput): Promise<Result<void>>;
```

### 4.2 Validation Zod

`packages/shared/src/schemas/beneficiary.ts` :

```typescript
import { z } from 'zod';

export const beneficiaryTypeEnum = z.enum(['employee', 'consultant', 'dirigeant', 'external']);
export const contractTypeEnum = z.enum([
  'CDI',
  'CDD',
  'STAGE',
  'ALTERNANCE',
  'CONSULTANT',
  'MANDATAIRE_SOCIAL',
  'AUTRE',
]);
export const lifecycleStatusEnum = z.enum(['active', 'on_leave', 'terminated']);

export const createBeneficiarySchema = z.object({
  email: z.string().email().toLowerCase(),
  fullName: z.string().min(1).max(200),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  preferredName: z.string().max(100).optional(),
  beneficiaryType: beneficiaryTypeEnum,
  contractType: contractTypeEnum.optional(),
  jobTitle: z.string().max(200).optional(),
  department: z.string().max(200).optional(),
  managerId: z.string().uuid().optional().nullable(),

  // Adresse
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  postalCode: z.string().max(20).optional(),
  city: z.string().max(100).optional(),
  country: z.string().length(2).default('FR'), // ISO 3166-1 alpha-2

  // Fiscalité
  taxResidence: z.string().length(2).default('FR'),
  isTaxResidentFrance: z.boolean().default(true),
  taxId: z.string().max(50).optional(),

  // Contrat
  hireDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),

  // Banking (optionnel — Module 9 le rendra requis pour cash-settled)
  iban: z.string().max(34).optional(),
  bic: z.string().max(11).optional(),
  bankName: z.string().max(100).optional(),
  bankAccountHolderName: z.string().max(200).optional(),

  // Phone, gender
  phone: z.string().max(30).optional(),
  gender: z.enum(['M', 'F', 'X']).optional().nullable(),
});

export const updateBeneficiarySchema = createBeneficiarySchema.partial();

export const bulkBeneficiaryRowSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1).max(200),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  beneficiaryType: beneficiaryTypeEnum,
  contractType: contractTypeEnum.optional(),
  jobTitle: z.string().max(200).optional(),
  department: z.string().max(200).optional(),
  taxResidence: z.string().length(2).default('FR'),
  isTaxResidentFrance: z.boolean().default(true),
  hireDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const bulkBeneficiaryImportSchema = z.object({
  rows: z.array(bulkBeneficiaryRowSchema).min(1).max(500),
});

export const lifecycleTransitionSchema = z
  .object({
    beneficiaryId: z.string().uuid(),
    toStatus: lifecycleStatusEnum,
    reason: z.string().min(10).max(500),
    terminationDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.toStatus === 'terminated' && !data.terminationDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['terminationDate'],
        message: "La date de termination est requise pour passer un bénéficiaire en 'terminated'",
      });
    }
  });

// Self-service : un sous-ensemble bien plus restreint
export const selfUpdateBeneficiarySchema = z.object({
  phone: z.string().max(30).optional(),
  preferredName: z.string().max(100).optional(),
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  postalCode: z.string().max(20).optional(),
  city: z.string().max(100).optional(),
  country: z.string().length(2).optional(),
  iban: z.string().max(34).optional(),
  bic: z.string().max(11).optional(),
  bankName: z.string().max(100).optional(),
  bankAccountHolderName: z.string().max(200).optional(),
});
```

### 4.3 Détails action `inviteBeneficiary`

```typescript
export async function inviteBeneficiary(id: string): Promise<Result<{ invitedAt: string }>> {
  const supabase = await createServerSupabase();
  await requirePermission('beneficiaries.invite');

  // 1. Charger le bénéficiaire
  const { data: beneficiary, error: loadError } = await supabase
    .from('beneficiaries')
    .select('id, email, full_name, status')
    .eq('id', id)
    .single();

  if (loadError || !beneficiary) {
    return { ok: false, error: 'Beneficiary not found' };
  }

  if (beneficiary.status === 'terminated') {
    return {
      ok: false,
      error: 'Cannot invite a terminated beneficiary. Set lifecycle to active first.',
    };
  }

  // 2. Envoyer le magic link via Supabase Auth (côté Server Component)
  // Note V1 : on utilise signInWithOtp standard. Module 7 (Notifications)
  // peut surcharger pour personnaliser le template email plus tard.
  const { error: authError } = await supabase.auth.signInWithOtp({
    email: beneficiary.email,
    options: {
      // Redirige vers le portail bénéficiaire après login (Module 8)
      // Pour V1, redirige vers /dashboard (ils verront leur profil)
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    },
  });

  if (authError) {
    return { ok: false, error: `Failed to send magic link: ${authError.message}` };
  }

  // 3. Marquer en DB + audit (via RPC)
  const { error: rpcError } = await supabase.rpc('mark_beneficiary_invited', {
    p_beneficiary_id: id,
  });

  if (rpcError) {
    return { ok: false, error: rpcError.message };
  }

  return { ok: true, invitedAt: new Date().toISOString() };
}
```

> **Note** : `supabase.auth.signInWithOtp()` envoie le magic link via le template email standard de Supabase. Pour personnaliser (logo, langue FR, etc.), il faudra passer par Resend en Module 7. En V1, le template par défaut suffit.

---

## 5. UI — PAGES

### 5.1 Page liste `/dashboard/beneficiaries`

Pattern identique à `/dashboard/awards` (DataTable + filtres + actions).

Colonnes :

- Nom complet (lien vers détail)
- Email
- Type (badge employee / consultant / dirigeant / external)
- Status lifecycle (badge active / on_leave / terminated)
- Contrat (CDI / CDD / etc.)
- Date d'embauche
- # Awards (compteur, lien filtré sur /dashboard/awards?beneficiary=id)
- Invité (✓ / pas invité)
- Actions (DropdownMenu)

Filtres :

- Recherche (full_name, email, job_title)
- Status lifecycle (multi-select)
- Type (multi-select)
- Contract type (multi-select)
- Has awards (toggle "Avec attributions" / "Sans attribution")
- Tax residence FR (toggle "Résident FR" / "Non-résident")
- Hire date range (date picker from/to)

Actions par ligne :

- Voir détail
- Modifier
- Inviter au portail (si pas invité OU bouton "Réinviter" si déjà invité)
- Lifecycle → on_leave / terminated / active (selon current status)
- Archiver (si pas d'awards actifs)

Bouton "Nouveau bénéficiaire" en haut à droite (visible si has_permission('beneficiaries.create')) → ouvre `CreateBeneficiaryModal`.
Bouton "Import CSV" → ouvre `BulkImportBeneficiariesModal`.

### 5.2 Page détail `/dashboard/beneficiaries/[id]`

Layout : PageShell + Tabs (4 onglets).

#### Onglet 1 — Profil

Layout 2 colonnes :

**Colonne gauche — Informations personnelles**

- Carte "Identité" : prénom, nom, preferred_name, gender, phone
- Carte "Adresse" : address_line_1, address_line_2, postal_code, city, country
- Carte "Banque" : IBAN partiellement masqué (FRXX \***\* \*\*** \*\*XX), BIC, bank_name, bank_account_holder_name
- Bouton "Modifier" en haut de la carte (admin only)

**Colonne droite — Informations professionnelles**

- Carte "Statut" : badge lifecycle + dates (hire_date, lifecycle_changed_at, termination_date si applicable) + boutons de transition (admin)
- Carte "Contrat" : contract_type, job_title, department, manager (lien vers son profil si défini)
- Carte "Fiscalité" : tax_residence, is_tax_resident_france, tax_id
- Carte "Compte" : email, user_id (lien si invité), invited_at, first_login_at, invitation_count, bouton "(Ré)inviter"

#### Onglet 2 — Awards

- Liste des awards de ce bénéficiaire (réutiliser le composant DataTable du Module 3b avec filtres pré-appliqués)
- Compteurs en haut : N awards actifs, X units total, Y units vested
- Bouton "Nouvelle attribution" → ouvre la modale du Module 3b avec bénéficiaire pré-sélectionné

#### Onglet 3 — Documents

Placeholder Module 6 :

- Empty state avec message "Documents à venir Module 6 (Document Engine)"
- Pour V1, juste un placeholder avec icône doc

#### Onglet 4 — Audit & history

Identique au pattern Module 3b B4 :

- Liste chronologique des audit_events où resource_id = beneficiary.id
- Events typiques : beneficiary.created, beneficiary.updated, beneficiary.lifecycle_changed, beneficiary.invited, beneficiary.archived

### 5.3 Modale `CreateBeneficiaryModal`

Form RHF + Zod en sections :

1. **Identité** (requis) : firstName, lastName (auto-fill fullName), email, beneficiaryType
2. **Contrat** (optionnel mais conseillé) : contractType, jobTitle, department, hireDate, managerId (autocomplete sur les autres bénéficiaires actifs)
3. **Fiscalité** (requis) : taxResidence (default FR), isTaxResidentFrance (default true)
4. **Adresse** (optionnel) : 4 champs adresse + country
5. **Banque** (optionnel) : 4 champs banque
6. **Phone & gender** (optionnel)

Footer : "Annuler", "Créer en brouillon" (status='active' mais pas invité), "Créer et inviter" (crée + envoie magic link en une fois).

> Note : le bouton "Créer et inviter" appelle `createBeneficiary()` puis `inviteBeneficiary(id)` en séquence. Comme `createAndPropose` du Module 3b. Si l'invitation échoue (email Supabase rejeté), le bénéficiaire est créé quand même, on remonte un message clair.

### 5.4 Modale `BulkImportBeneficiariesModal`

Pattern identique à `BulkImportModal` du Module 3b B5.

Wizard 3 étapes :

1. Upload CSV + template (download `apps/web/public/beneficiaries-import-template.csv`)
2. Preview + validation Zod (rows valides en gris, rows erreur en rouge, rows déjà existants en jaune "skip")
3. Confirmation + résultat (X créés, Y skipped, Z erreurs)

Template :

```csv
email,first_name,last_name,beneficiary_type,contract_type,job_title,department,tax_residence,is_tax_resident_france,hire_date
[email protected],Jean,Dupont,employee,CDI,Software Engineer,Engineering,FR,true,2024-01-15
[email protected],Marie,Martin,employee,CDI,Product Manager,Product,FR,true,2023-06-01
```

### 5.5 Sidebar nav globale

Mettre à jour la sidebar (Module 3a B4) pour que le lien "Bénéficiaires" pointe vers `/dashboard/beneficiaries` (pas placeholder).

---

## 6. COMPLIANCE V1

À placer dans `apps/web/src/lib/compliance/rules/beneficiaryRules.ts` :

```typescript
export const BENEFICIARY_COMPLIANCE_RULES: ComplianceRule[] = [
  {
    code: 'EMAIL_UNIQUE_IN_ORG',
    description: "Email doit être unique dans l'organisation",
    appliesTo: ['*'],
    enforcement: 'hard',
    check: async (data, ctx) => {
      // Géré par index unique DB + trigger côté UI pour feedback rapide
      return null;
    },
  },
  {
    code: 'TAX_RESIDENCE_FRANCE_CONSISTENCY',
    description: 'Si tax_residence !== FR, isTaxResidentFrance doit être false',
    appliesTo: ['*'],
    enforcement: 'hard',
    check: (data, ctx) => {
      if (data.taxResidence !== 'FR' && data.isTaxResidentFrance === true) {
        return {
          severity: 'ERROR',
          code: 'TAX_RESIDENCE_FRANCE_CONSISTENCY',
          message: `Tax residence is ${data.taxResidence} but isTaxResidentFrance is true. Inconsistent.`,
        };
      }
      return null;
    },
  },
  {
    code: 'HIRE_DATE_REASONABLE',
    description: 'hire_date ne doit pas être dans le futur ni avant 1900',
    appliesTo: ['*'],
    enforcement: 'soft',
    check: (data, ctx) => {
      if (!data.hireDate) return null;
      const hire = new Date(data.hireDate);
      if (hire > new Date()) {
        return {
          severity: 'WARNING',
          code: 'HIRE_DATE_FUTURE',
          message: "Date d'embauche dans le futur. Confirmer.",
        };
      }
      if (hire.getFullYear() < 1900) {
        return {
          severity: 'ERROR',
          code: 'HIRE_DATE_INVALID',
          message: "Date d'embauche manifestement invalide.",
        };
      }
      return null;
    },
  },
  {
    code: 'MANAGER_NOT_SELF',
    description: 'manager_id ne peut pas pointer vers soi-même',
    appliesTo: ['*'],
    enforcement: 'hard',
    check: (data, ctx) => {
      if (data.managerId && data.managerId === ctx.beneficiary?.id) {
        return {
          severity: 'ERROR',
          code: 'MANAGER_NOT_SELF',
          message: 'Un bénéficiaire ne peut pas être son propre manager.',
        };
      }
      return null;
    },
  },
  {
    code: 'IBAN_FORMAT',
    description: 'IBAN format basique (commence par 2 lettres + 2 chiffres)',
    appliesTo: ['*'],
    enforcement: 'soft',
    check: (data, ctx) => {
      if (!data.iban) return null;
      if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/i.test(data.iban.replace(/\s/g, ''))) {
        return {
          severity: 'WARNING',
          code: 'IBAN_INVALID_FORMAT',
          message: 'Format IBAN suspect. Vérifier.',
        };
      }
      return null;
    },
  },
];
```

Hook `runComplianceChecks('BENEFICIARY_CREATE', input)` dans `createBeneficiary` et `updateBeneficiary`.

Pas de IBAN/BIC validation MOD-97 en V1 (overkill, juste un format check).

---

## 7. AUDIT EVENTS

| Event                           | Quand                   | Metadata                                                           |
| ------------------------------- | ----------------------- | ------------------------------------------------------------------ |
| `beneficiary.created`           | createBeneficiary       | `{ email, beneficiary_type, source: 'manual' \| 'csv' \| 'auto' }` |
| `beneficiary.updated`           | updateBeneficiary       | `{ changes: { field: { from, to } } }`                             |
| `beneficiary.lifecycle_changed` | trigger DB              | `{ from, to, reason, termination_date? }`                          |
| `beneficiary.invited`           | inviteBeneficiary       | `{ email, invitation_count }`                                      |
| `beneficiary.archived`          | archiveBeneficiary      | `{ reason }`                                                       |
| `beneficiary.bulk_imported`     | bulkCreateBeneficiaries | `{ rows_count, created_count, errors_count }`                      |

---

## 8. PLAN DE LIVRAISON — 6 SOUS-MODULES

### B1 — DB & RPCs (1 jour)

- Migration `00025_module_4_beneficiaries_extend.sql` (alter table + indexes + triggers lifecycle / soft delete)
- Migration `00026_module_4_lifecycle_rpc.sql` (transition_beneficiary_lifecycle)
- Migration `00027_module_4_bulk_beneficiaries.sql` (bulk_create_beneficiaries + mark_beneficiary_invited + link_beneficiary_to_user)
- Migration `00028_module_4_seed_permissions.sql` (seed beneficiaries.\* + role mappings, idempotent)
- Tests SQL purs : 8 scénarios
  - A : Extend table + colonnes nullable correctes
  - B : Trigger lifecycle audit
  - C : Trigger soft delete refusé si awards actifs
  - D : RPC transition active → on_leave
  - E : RPC transition active → terminated requires termination_date
  - F : RPC bulk_create_beneficiaries happy path (3 rows)
  - G : RPC bulk_create avec doublon email → skip avec warning
  - H : RPC bulk_create > 500 rows → reject

**Livrable** : RPCs testés en SQL pur, drift cloud check, memory `module_4_b1_complete.md`.

### B2 — Server Actions + lifecycle (1 jour)

- Server Actions complètes (créer, lire, mettre à jour, archiver, lifecycle, invitation)
- Schémas Zod centralisés dans @equity/shared
- Audit logs systématiques
- Sandbox `/dev/beneficiary-lifecycle` pour tester transitions

**Livrable** : 6+ Server Actions, sandbox accessible, tests Vitest 10+.

### B3 — Page liste + filtres (0.5 jour)

- Server Query `listBeneficiaries(filters)`
- Page + DataTable + 7 filtres
- Sidebar mise à jour
- Empty state propre

**Livrable** : page liste fonctionnelle, filtres réactifs.

### B4 — Page détail + 4 onglets (1 jour)

- Server Query `getBeneficiaryDetail(id)` (joins awards count, audit subset)
- Page Tabs avec 4 onglets
- Composants : BeneficiaryProfileTab, BeneficiaryAwardsTab, BeneficiaryDocumentsTab (placeholder), BeneficiaryAuditTab

**Livrable** : page détail navigable, données cohérentes.

### B5 — Création + import CSV (1 jour)

- Modale CreateBeneficiaryModal (sections collapsibles)
- Modale BulkImportBeneficiariesModal (wizard 3 étapes)
- Template CSV statique
- Tests Vitest helpers parsing

**Livrable** : import 50 bénéficiaires en 1 clic, gestion doublons.

### B6 — Compliance + closure (0.5 jour)

- 5 règles compliance V1
- Hook dans createBeneficiary + updateBeneficiary
- Tests Vitest 10+
- Tests E2E manuels (5 scénarios)
- Memory `module_4_complete.md`
- PR ready-for-review + squash-merge

**Livrable** : module fini, PR mergée sur master.

---

## 9. INSTRUCTIONS POUR CLAUDE CODE

### Phase 1 — Bootstrap

1. Lire `memory/module_3b_complete.md` pour comprendre l'état de la mini-table beneficiaries actuelle.
2. Faire branche `feat/module-4-beneficiaries`.
3. Vérifier que tous les checks Module 3b sont OK (typecheck, tests workspace ≥ 107, drift cloud à 0).
4. Comprendre les patterns établis :
   - Module 3a B4 (DataTable, PageShell, badges)
   - Module 3a B5 (Edge Function pattern, Server Actions Result)
   - Module 3b B3 (Modale création + sub-form, autocomplete bénéficiaires)
   - Module 3b B5 (Bulk CSV wizard 3 étapes)
   - Module 3b B6 (RPC apply_X + JsonDiffViewer)
   - Module 3b B7 (Compliance rules + ComplianceIssuesDialog)

### Phase 2 — DB (B1)

- Suivre §2 et §3 strictement.
- Tester chaque RPC en SQL pur via mcp Supabase avant de toucher au TS.
- Drift check obligatoire à la fin de B1 :
  ```
  SELECT count(*) FROM supabase_migrations.schema_migrations;
  # Comparer avec : ls supabase/migrations/ | wc -l
  ```

### Phase 3 — Server Actions (B2)

- Pattern Result `{ ok: true, ...data } | { ok: false, error: string }` partout.
- Zod parse à l'entrée de chaque action.
- Audit log systématique.
- Sandbox `/dev/beneficiary-lifecycle` pour tester les 4 transitions sans UI dashboard.

### Phase 4 — UI (B3 → B5)

- Réutiliser DataTable, PageShell, StatusBadge du Module 3a B4.
- BeneficiaryStatusBadge nouveau (3 statuts : active vert, on_leave amber, terminated rouge).
- ContractTypeBadge nouveau (CDI bleu, CDD orange, etc.).

### Phase 5 — Validation (B6)

Checkpoints à valider :

- [ ] Migration drift à 0 entre repo et cloud
- [ ] Tests SQL purs : 8/8
- [ ] Tests Vitest workspace ≥ 130 (107 actuels + 20-25 nouveaux)
- [ ] Page liste fonctionnelle avec 7 filtres
- [ ] Page détail 4 onglets avec données cohérentes
- [ ] Modale création complète (5 sections)
- [ ] Bulk CSV : import 50 lignes avec 5 doublons et 3 erreurs → 42 created, 5 skipped, 3 errors
- [ ] Lifecycle : 4 transitions testées via sandbox + UI
- [ ] Invitation : magic link envoyé, audit event présent, invited_at peuplé
- [ ] Compliance : 5 règles testées en unit tests
- [ ] E2E manuels : 5 scénarios passés
- [ ] Sidebar à jour (lien Bénéficiaires actif)
- [ ] PR ready, squash-merge possible

### Conventions strictes (rappel)

- Pas de `any` TypeScript sans justification
- 'use server' = uniquement async (cf CLAUDE.md)
- Validation Zod sur chaque Server Action
- Audit log systématique
- Ne pas modifier les tables Module 3b sans documenter (la table `beneficiaries` est en évolution naturelle, mais structure fondamentale intacte)
- Les snapshots JSONB des awards (vesting, conditions, leavers) ne doivent JAMAIS être affectés par les modifications du bénéficiaire

### Points de vigilance

- **Migration de données existantes** : la table beneficiaries du Module 3b a des rows. Tester l'ALTER TABLE sur cloud avec ces rows en place. Backup avant si tu hésites.
- **Trigger soft delete** : tester explicitement le cas "soft delete refusé car awards actifs" pour s'assurer que le message d'erreur est clair côté UI.
- **link_beneficiary_to_user** : intégrer dans le custom_access_token_hook du Module 2 (existant). Sinon, deux logiques de login coexistent et c'est confus.
- **IBAN affichage** : ne JAMAIS afficher l'IBAN complet en clair. Toujours masquer FRXX \***\* \*\*** \*\*XX (sauf le bénéficiaire lui-même qui peut voir son propre IBAN). Pas de chiffrement DB en V1, mais préparer la voie : colonne `iban` en clair pour V1, à chiffrer en V2 via Supabase Vault ou pgcrypto.
- **Magic link via Supabase Auth standard** : OK en V1 mais notification email standard, pas de branding Capiwise. Module 7 (Notifications) viendra surcharger via Resend pour personnaliser.
- **Tax residence consistency** : la règle compliance doit être enforced. Si user crée avec tax_residence='UK' et isTaxResidentFrance=true → reject. Sinon erreurs en cascade en Module 11 (IFRS 2 tax computation).
- **Manager FK self-reference** : la FK manager_id permet la self-reference (CASCADE SET NULL si manager supprimé). Mais une rule compliance bloque qu'un bénéficiaire soit son propre manager.
- **Soft delete vs terminated** : insister dans le memory que ce sont 2 concepts distincts. La doc UI doit dire "Archiver = soft delete = bénéficiaire qui n'aurait jamais dû exister (saisie en erreur)". "Terminated = lifecycle = bénéficiaire qui a quitté l'entreprise mais dont les awards passés restent légitimes".

---

**FIN DU MODULE 4 — BENEFICIARIES MANAGEMENT**

_Quand le Module 4 est implémenté et validé, reviens vers Claude (chat) pour "go module 5" (Approval Engine)._
