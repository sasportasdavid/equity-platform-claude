# MODULE 3b — AWARDS LIFECYCLE

> **Projet :** Equity Platform
> **Version :** 1.0
> **Date :** Avril 2026
> **Prérequis :** Modules 1, 2 et 3a terminés et validés (B1 → B5 inclus)
> **Audience :** Claude Code (développement)

---

## 0. CONTEXTE & OBJECTIFS

### 0.1 Mission du module

Implémenter **toute la couche d'attribution individuelle** : création d'awards à partir d'un plan, workflow d'émission (draft → proposal → approbation → board → signature → granted), suivi du vesting dans le temps, gestion des modifications IFRS 2.27-28, gestion des leavers, et préparation de l'exercice (qui sera en Module 9).

L'award est l'objet **central** de la plateforme : tout y converge (plans en amont, signatures, notifications, valorisation, cap table, exercice en aval).

### 0.2 Périmètre exact

**Inclus dans ce module** :

- CRUD Awards (création, lecture, modification draft, cancellation)
- State machine Awards 16 états avec transitions contrôlées
- Création unitaire d'award (1 bénéficiaire, 1 plan, N units)
- Création bulk d'awards (CSV import, max 500 lignes)
- Snapshots du plan au moment du grant (vesting, conditions, leavers)
- Génération vesting_events à la création (PENDING)
- Audit du cycle de vie complet
- Page liste des awards (filtres status / plan / beneficiary / type)
- Page détail d'un award (synthèse + vesting + modifications + history)
- Numérotation auto award_number (`AWD-{year}-{NNNN}`)
- Vérification cohérence pool (units_granted total ≤ pool_size du plan)
- Compliance checks bloquants (BSPCE quotas, AGA seuil 30 %, etc.)
- Cancellation d'un award (avant GRANTED uniquement)
- Modifications post-grant (IFRS 2.27-28 — repricing, extension, acceleration)
- Lock du plan parent dès le 1er award PROPOSED+
- Lien award_modifications avec recalcul d'incremental fair value (déclenche un `valuation_run` en Module 11)

**Exclus (modules ultérieurs)** :

- Workflow d'approbation multi-étapes configurable (Module 5 — Approval Engine — l'API est branchée mais l'UI de configuration vient au M5)
- Génération des documents et envoi pour signature Yousign (Module 6 — Document Engine)
- Notifications email aux bénéficiaires (Module 7 — Notifications)
- Vue bénéficiaire de ses awards (Module 8 — Beneficiary Portal)
- Exercice des awards (Module 9 — Exercise Workflow)
- Cap table dynamique consommant les awards (Module 10 — Cap Table)
- Calcul détaillé IFRS 2 expense schedule par award (Module 11 — repris du Module 3a B5)
- Compliance Engine complet — règles bloquantes hard codées V1 ici (Module 12 — engine configurable)
- Reporting CSV/Excel global (Module 13)

### 0.3 Dépendances

- Tables créées en Module 1 :
  - `awards`, `vesting_events`, `award_modifications`, `beneficiaries`
  - `audit_events`, `notifications`, `compliance_warnings`
- Module 2 : RBAC, permissions `awards.*`
- Module 3a : `plans`, `vesting_schedules`, `vesting_tranches`, `performance_conditions`, `early_termination_rules`
- Module 4 (anticipé partiellement) : table `beneficiaries` doit exister avec colonnes minimales (id, org_id, user_id nullable, full_name, email, type (employee/consultant/dirigeant), tax_residence, hire_date). On crée un mini-CRUD bénéficiaire ICI **uniquement** ce qui est nécessaire pour démarrer (création rapide depuis la modale d'attribution). Le CRUD complet bénéficiaire vient au Module 4.

### 0.4 Référence

Ce module s'appuie sur :

- MODULE_01_FOUNDATION section 4.5 (table `awards`, `vesting_events`, `award_modifications`)
- MODULE_01_FOUNDATION section 6 (state machine awards)
- MODULE_03A_PLANS section 8 (versioning et snapshots)
- HANDOVER_PACK V4.2 du moteur Python (pour les modifications IFRS 2.27-28 — recalcul fair value incrémental)

---

## 1. ARCHITECTURE GÉNÉRALE

### 1.1 Vue d'ensemble du flux

```
PLAN (locked dès le 1er award)
   │
   ├─ Award #1 (DRAFT → PROPOSED → … → GRANTED → VESTING → …)
   │   ├─ snapshot vesting_schedule (JSONB)
   │   ├─ snapshot performance_conditions (JSONB)
   │   ├─ snapshot leaver_rules (JSONB)
   │   ├─ vesting_events × N (générés à GRANTED, status PENDING)
   │   └─ award_modifications × M (post-GRANTED)
   │
   ├─ Award #2 (...)
   └─ Award #N (...)
```

### 1.2 Décisions structurantes

| Décision               | Choix retenu                                                                                                         | Justification                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Snapshots**          | JSONB dans `awards` (pas de FK vers les tables `vesting_*`)                                                          | Permet au plan de versionner sans casser les awards émis                          |
| **Numérotation award** | RPC `next_award_number(org_id)` qui retourne `AWD-{year}-{NNNN}`                                                     | Atomique via `SELECT FOR UPDATE` sur une table compteur par org                   |
| **Vesting events**     | Générés à `GRANTED`, pas à la création                                                                               | Évite des vesting_events orphelins si l'award est cancelled                       |
| **Lock du plan**       | Trigger `BEFORE INSERT ON awards` met `plans.is_locked = true`                                                       | Garantit que le plan ne peut plus être édité dès qu'il y a un award en circuit    |
| **Cancellation**       | Soft (status=CANCELLED) avant GRANTED, modification (IFRS 2.27 type CANCELLATION) après                              | IFRS 2 oblige à comptabiliser la charge pour les awards déjà partiellement vested |
| **Bulk import**        | CSV via Server Action, max 500 lignes, pré-validation Zod par ligne, transaction atomique (RPC `bulk_create_awards`) | Évite les états bancals (50 inserted, 450 errored sans rollback)                  |

### 1.3 Permissions

Permissions à ajouter au seed `permissions_catalog` (migration ou ajustement du seed Module 1) :

| Permission             | Description                                 | Roles par défaut                                                |
| ---------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| `awards.read.own`      | Lire ses propres awards (bénéficiaire)      | BENEFICIARY                                                     |
| `awards.read.all`      | Lire tous les awards de l'org               | OWNER, ADMIN_HR, APPROVER, AUDITOR                              |
| `awards.propose`       | Créer un award en DRAFT/PROPOSED            | OWNER, ADMIN_HR                                                 |
| `awards.approve`       | Approuver un award en PENDING_APPROVAL      | OWNER, APPROVER                                                 |
| `awards.board.approve` | Approuver un award en PENDING_BOARD         | OWNER, APPROVER (avec flag `is_board_member` sur la membership) |
| `awards.cancel`        | Cancel un award avant GRANTED               | OWNER, ADMIN_HR                                                 |
| `awards.modify`        | Créer une `award_modification` post-GRANTED | OWNER, ADMIN_HR                                                 |
| `awards.bulk_import`   | Lancer un bulk import CSV                   | OWNER, ADMIN_HR                                                 |

Si ces permissions n'existent pas dans le seed, créer une migration `00019_seed_award_permissions.sql` qui les ajoute idempotemment (`ON CONFLICT DO NOTHING`).

---

## 2. STATE MACHINE — AWARDS

### 2.1 États (16)

```typescript
export type AwardStatus =
  | 'DRAFT' // Admin a commencé la saisie
  | 'PROPOSED' // Admin a soumis pour approbation
  | 'PENDING_APPROVAL' // Approbation en cours (1 ou plusieurs étapes)
  | 'APPROVED' // Toutes les approbations recueillies
  | 'PENDING_BOARD' // En attente du board (si nécessaire)
  | 'BOARD_APPROVED' // Board OK
  | 'PENDING_SIGNATURE' // Documents envoyés pour signature
  | 'GRANTED' // Effectif (signé par bénéficiaire), vesting commence
  | 'VESTING' // Vesting en cours (alias de GRANTED quand vesting_start_date passée)
  | 'PARTIALLY_VESTED' // Au moins une tranche vestée
  | 'FULLY_VESTED' // Toutes les tranches vestées
  | 'PARTIALLY_EXERCISED' // Au moins un exercise (options)
  | 'FULLY_EXERCISED' // Tout exercé
  | 'EXPIRED' // Fenêtre d'exercice écoulée
  | 'FORFEITED' // Annulé suite à un leaver event
  | 'CANCELLED'; // Annulé volontairement avant GRANTED
```

### 2.2 Transitions autorisées

```typescript
const ALLOWED_TRANSITIONS: Record<AwardStatus, AwardStatus[]> = {
  DRAFT: ['PROPOSED', 'CANCELLED'],
  PROPOSED: ['PENDING_APPROVAL', 'DRAFT', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'PROPOSED', 'CANCELLED'],
  APPROVED: ['PENDING_BOARD', 'PENDING_SIGNATURE', 'CANCELLED'],
  PENDING_BOARD: ['BOARD_APPROVED', 'CANCELLED'],
  BOARD_APPROVED: ['PENDING_SIGNATURE', 'CANCELLED'],
  PENDING_SIGNATURE: ['GRANTED', 'CANCELLED'],
  GRANTED: ['VESTING', 'FORFEITED'],
  VESTING: ['PARTIALLY_VESTED', 'FULLY_VESTED', 'FORFEITED'],
  PARTIALLY_VESTED: ['FULLY_VESTED', 'PARTIALLY_EXERCISED', 'FORFEITED'],
  FULLY_VESTED: ['PARTIALLY_EXERCISED', 'FULLY_EXERCISED', 'EXPIRED'],
  PARTIALLY_EXERCISED: ['FULLY_EXERCISED', 'EXPIRED'],
  FULLY_EXERCISED: [],
  EXPIRED: [],
  FORFEITED: [],
  CANCELLED: [],
};

export function canTransition(from: AwardStatus, to: AwardStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
```

### 2.3 Implémentation

À placer dans `apps/web/src/lib/stateMachines/awardStateMachine.ts`.

À chaque transition (Server Action `transitionAward(awardId, toStatus, payload?)`) :

1. Charger l'award + lock SELECT FOR UPDATE pour éviter les race conditions
2. `canTransition(award.status, toStatus)` → si false, throw
3. Vérifier les permissions de l'acteur (mapping ci-dessous)
4. Vérifier les pré-conditions métier (cf §2.4)
5. Effectuer les side-effects (générer vesting_events si GRANTED, etc.)
6. UPDATE le status
7. Log `audit_event` (`award.status_changed`, metadata: `{from, to, actor_id, reason?}`)
8. Émettre les notifications (queue Module 7 — pour V1, juste insérer dans `notifications`)

### 2.4 Pré-conditions par transition

| Transition                           | Pré-conditions                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `DRAFT → PROPOSED`                   | `units_granted > 0`, `beneficiary_id` non-null, `grant_date` non-null, plan en `ACTIVE` ou `LOCKED`, pool restant ≥ units_granted    |
| `PROPOSED → PENDING_APPROVAL`        | Permission `awards.propose`, lance `runComplianceChecks('AWARD_PROPOSAL')` — si `hasHardBlocks` → reject                             |
| `PENDING_APPROVAL → APPROVED`        | Toutes les `approval_steps` du plan sont OK (Module 5 — pour V1, simple permission `awards.approve`)                                 |
| `APPROVED → PENDING_BOARD`           | Plan a `requires_board_approval = true`                                                                                              |
| `BOARD_APPROVED → PENDING_SIGNATURE` | Génération doc Module 6 — pour V1, juste flip status (le hook Module 6 viendra brancher Yousign)                                     |
| `PENDING_SIGNATURE → GRANTED`        | `accepted_at` rempli (signé par bénéficiaire) — pour V1, bouton manuel "Marquer comme signé"                                         |
| `GRANTED → VESTING`                  | Trigger horaire ou cron : si `vesting_start_date <= today` → flip auto                                                               |
| `VESTING → PARTIALLY_VESTED`         | Au moins un `vesting_event` est passé en VESTED (cron Module 1 `recalc-vesting`)                                                     |
| `* → CANCELLED`                      | Permission `awards.cancel`, status ∈ {DRAFT, PROPOSED, PENDING_APPROVAL, APPROVED, PENDING_BOARD, BOARD_APPROVED, PENDING_SIGNATURE} |
| `* → FORFEITED`                      | Leaver event traité (Module 9) — V1 : Server Action manuelle `forfeitAward(awardId, reason)`                                         |

### 2.5 Tests state machine

À placer dans `apps/web/src/lib/stateMachines/__tests__/awardStateMachine.test.ts` :

- ✅ Toutes les transitions du tableau ALLOWED retournent `true`
- ✅ Toutes les transitions hors tableau retournent `false`
- ✅ Aucun état terminal (FULLY_EXERCISED, EXPIRED, FORFEITED, CANCELLED) n'a de sortie
- ✅ DRAFT et CANCELLED ne sont pas accessibles depuis un état post-GRANTED

---

## 3. SCHÉMA DB — AJUSTEMENTS

Le schéma `awards`, `vesting_events`, `award_modifications` est déjà créé en Module 1. Il faut ajouter :

### 3.1 Compteur d'awards par org

Migration `00018_award_number_counter.sql` :

```sql
CREATE TABLE IF NOT EXISTS award_number_counters (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  current_year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM now())::INTEGER,
  current_seq INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE award_number_counters ENABLE ROW LEVEL SECURITY;

-- Lecture restreinte (pas vraiment utile mais cohérence)
CREATE POLICY award_number_counters_select ON award_number_counters
  FOR SELECT USING (org_id = current_org_id());

-- RPC atomique
CREATE OR REPLACE FUNCTION next_award_number(p_org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_year INTEGER := EXTRACT(YEAR FROM now())::INTEGER;
  v_seq INTEGER;
BEGIN
  -- Auth check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Lock + upsert atomique
  INSERT INTO award_number_counters (org_id, current_year, current_seq)
  VALUES (p_org_id, v_year, 1)
  ON CONFLICT (org_id) DO UPDATE
    SET current_year = v_year,
        current_seq = CASE
          WHEN award_number_counters.current_year = v_year
            THEN award_number_counters.current_seq + 1
          ELSE 1
        END,
        updated_at = now()
  RETURNING current_seq INTO v_seq;

  RETURN format('AWD-%s-%s', v_year, lpad(v_seq::TEXT, 4, '0'));
END $$;

GRANT EXECUTE ON FUNCTION next_award_number(UUID) TO authenticated;
```

### 3.2 Trigger lock plan

Migration `00018_award_number_counter.sql` (suite) :

```sql
-- Quand un award passe en PROPOSED ou plus, locker le plan parent
CREATE OR REPLACE FUNCTION lock_plan_on_award_proposal()
RETURNS TRIGGER AS $$
BEGIN
  -- Si le status passe à PROPOSED ou plus avancé
  IF NEW.status NOT IN ('DRAFT', 'CANCELLED')
     AND (OLD.status IS NULL OR OLD.status IN ('DRAFT', 'CANCELLED'))
  THEN
    UPDATE plans
       SET is_locked = true,
           locked_at = COALESCE(locked_at, now())
     WHERE id = NEW.plan_id
       AND is_locked = false;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_award_lock_plan
  AFTER INSERT OR UPDATE OF status ON awards
  FOR EACH ROW EXECUTE FUNCTION lock_plan_on_award_proposal();
```

### 3.3 Vérifier cohérence pool

Trigger `BEFORE INSERT/UPDATE OF units_granted ON awards` :

```sql
CREATE OR REPLACE FUNCTION enforce_award_pool_consistency()
RETURNS TRIGGER AS $$
DECLARE
  v_pool_size BIGINT;
  v_total_granted BIGINT;
BEGIN
  -- Skip si le status reste DRAFT (on autorise les drafts > pool, ils seront bloqués au PROPOSED)
  IF NEW.status = 'DRAFT' THEN
    RETURN NEW;
  END IF;

  -- Pool du plan
  SELECT pool_size INTO v_pool_size
    FROM plans
   WHERE id = NEW.plan_id;

  IF v_pool_size IS NULL THEN
    RAISE EXCEPTION 'Plan % does not exist', NEW.plan_id;
  END IF;

  -- Total alloué (hors CANCELLED, hors le row actuel si UPDATE)
  SELECT COALESCE(SUM(units_granted), 0) INTO v_total_granted
    FROM awards
   WHERE plan_id = NEW.plan_id
     AND status NOT IN ('CANCELLED', 'FORFEITED', 'DRAFT')
     AND deleted_at IS NULL
     AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);

  IF v_total_granted + NEW.units_granted > v_pool_size THEN
    RAISE EXCEPTION 'Pool exceeded: requesting % units but pool has only % remaining (% allocated of % total)',
      NEW.units_granted, v_pool_size - v_total_granted, v_total_granted, v_pool_size
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_award_pool_check
  BEFORE INSERT OR UPDATE OF units_granted, status ON awards
  FOR EACH ROW EXECUTE FUNCTION enforce_award_pool_consistency();
```

### 3.4 Mini-table `beneficiaries` (préparation Module 4)

Si la table `beneficiaries` n'existe pas encore (vérifier d'abord avec `\d beneficiaries`), créer migration `00018_beneficiaries_minimal.sql` :

```sql
CREATE TABLE IF NOT EXISTS beneficiaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  external_id TEXT,                 -- HRIS id éventuel
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  beneficiary_type TEXT NOT NULL CHECK (beneficiary_type IN ('employee','consultant','dirigeant','external')),
  tax_residence TEXT NOT NULL DEFAULT 'FR',  -- ISO country code
  hire_date DATE,
  termination_date DATE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX uq_beneficiaries_email_org
  ON beneficiaries(org_id, lower(email)) WHERE deleted_at IS NULL;
CREATE INDEX idx_beneficiaries_org ON beneficiaries(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_beneficiaries_user ON beneficiaries(user_id);

ALTER TABLE beneficiaries ENABLE ROW LEVEL SECURITY;

-- Pattern 2 (admin org + bénéficiaire lit son propre row)
CREATE POLICY beneficiaries_select_admin ON beneficiaries FOR SELECT
  USING (
    org_id = current_org_id() AND deleted_at IS NULL
    AND user_has_permission('beneficiaries.read.all')
  );

CREATE POLICY beneficiaries_select_self ON beneficiaries FOR SELECT
  USING (user_id = auth.uid() AND deleted_at IS NULL);

CREATE POLICY beneficiaries_insert ON beneficiaries FOR INSERT
  WITH CHECK (
    org_id = current_org_id()
    AND user_has_permission('beneficiaries.create')
  );

CREATE POLICY beneficiaries_update ON beneficiaries FOR UPDATE
  USING (
    org_id = current_org_id()
    AND user_has_permission('beneficiaries.update')
  );

-- Pas de DELETE: soft-delete via deleted_at
```

Permissions à ajouter au seed : `beneficiaries.read.all`, `beneficiaries.create`, `beneficiaries.update`, `beneficiaries.delete` → mapping similaire (OWNER + ADMIN_HR).

> **Note Claude Code** : si la table existe déjà (créée par un Module 4 partiel), juste vérifier que les colonnes minimales sont présentes et ajouter avec `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` celles qui manquent.

---

## 4. RPC PRINCIPAL — `create_award_full`

Sur le modèle de `create_plan_full` (Module 3a B2), un RPC atomique pour insérer un award et préparer ses snapshots.

### 4.1 Signature

```sql
CREATE OR REPLACE FUNCTION create_award_full(p_data JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID := current_org_id();
  v_plan_id UUID := (p_data->>'planId')::UUID;
  v_beneficiary_id UUID := (p_data->>'beneficiaryId')::UUID;
  v_award_id UUID;
  v_award_number TEXT;
  v_plan_record RECORD;
  v_vesting_snapshot JSONB;
  v_conditions_snapshot JSONB;
  v_leavers_snapshot JSONB;
BEGIN
  -- Auth
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT user_has_permission('awards.propose') THEN
    RAISE EXCEPTION 'Permission denied: awards.propose required';
  END IF;

  -- Charger le plan
  SELECT * INTO v_plan_record
    FROM plans
   WHERE id = v_plan_id
     AND org_id = v_org_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan % not found in org %', v_plan_id, v_org_id;
  END IF;

  -- Build snapshots (vesting, conditions, leavers)
  SELECT jsonb_build_object(
    'schedule', row_to_json(vs),
    'tranches', COALESCE(jsonb_agg(row_to_json(vt) ORDER BY vt.tranche_index), '[]'::jsonb)
  ) INTO v_vesting_snapshot
  FROM vesting_schedules vs
  LEFT JOIN vesting_tranches vt ON vt.schedule_id = vs.id
  WHERE vs.plan_id = v_plan_id
  GROUP BY vs.id;

  SELECT COALESCE(jsonb_agg(row_to_json(pc) ORDER BY pc.created_at), '[]'::jsonb)
    INTO v_conditions_snapshot
    FROM performance_conditions pc
   WHERE pc.plan_id = v_plan_id;

  SELECT COALESCE(jsonb_agg(row_to_json(etr) ORDER BY etr.leaver_type), '[]'::jsonb)
    INTO v_leavers_snapshot
    FROM early_termination_rules etr
   WHERE etr.plan_id = v_plan_id;

  -- Numérotation
  v_award_number := next_award_number(v_org_id);

  -- INSERT
  INSERT INTO awards (
    org_id, plan_id, beneficiary_id, award_number,
    units_granted, exercise_price,
    grant_date, vesting_start_date, expiry_date, acceptance_deadline,
    status,
    plan_version,
    vesting_schedule_snapshot, performance_conditions_snapshot, leaver_rules_snapshot,
    created_by
  )
  VALUES (
    v_org_id, v_plan_id, v_beneficiary_id, v_award_number,
    (p_data->>'unitsGranted')::BIGINT,
    NULLIF(p_data->>'exercisePrice','')::NUMERIC,
    (p_data->>'grantDate')::DATE,
    NULLIF(p_data->>'vestingStartDate','')::DATE,
    NULLIF(p_data->>'expiryDate','')::DATE,
    NULLIF(p_data->>'acceptanceDeadline','')::DATE,
    COALESCE(p_data->>'initialStatus', 'DRAFT'),
    v_plan_record.version,
    v_vesting_snapshot, v_conditions_snapshot, v_leavers_snapshot,
    v_user_id
  )
  RETURNING id INTO v_award_id;

  -- Audit
  INSERT INTO audit_events (org_id, actor_id, event_type, resource_type, resource_id, metadata)
  VALUES (v_org_id, v_user_id, 'award.created', 'award', v_award_id,
    jsonb_build_object('award_number', v_award_number, 'plan_id', v_plan_id,
                       'beneficiary_id', v_beneficiary_id,
                       'units_granted', (p_data->>'unitsGranted')::BIGINT));

  RETURN v_award_id;
END $$;

GRANT EXECUTE ON FUNCTION create_award_full(JSONB) TO authenticated;
```

### 4.2 Génération vesting_events à GRANTED

Server Action `transitionAward(awardId, 'GRANTED')` doit appeler un RPC `materialize_vesting_events(p_award_id UUID)` qui :

1. Lit `vesting_schedule_snapshot.tranches`
2. Calcule la date de chaque tranche à partir de `vesting_start_date` + offset
3. INSERT dans `vesting_events` un row par tranche avec `status = 'PENDING'`

```sql
CREATE OR REPLACE FUNCTION materialize_vesting_events(p_award_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_award RECORD;
  v_tranche JSONB;
  v_count INTEGER := 0;
  v_units BIGINT;
BEGIN
  SELECT * INTO v_award FROM awards WHERE id = p_award_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award % not found', p_award_id;
  END IF;

  -- Skip si déjà matérialisé
  IF EXISTS (SELECT 1 FROM vesting_events WHERE award_id = p_award_id) THEN
    RETURN 0;
  END IF;

  FOR v_tranche IN
    SELECT jsonb_array_elements(v_award.vesting_schedule_snapshot->'tranches')
  LOOP
    v_units := round(v_award.units_granted * (v_tranche->>'percentage')::NUMERIC / 100);
    INSERT INTO vesting_events (
      org_id, award_id, tranche_id, scheduled_date, units_to_vest, status
    ) VALUES (
      v_award.org_id,
      p_award_id,
      (v_tranche->>'id')::UUID,
      (v_tranche->>'vesting_date')::DATE,
      v_units,
      'PENDING'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $$;
```

> **Drift correction** : la dernière tranche absorbe l'écart d'arrondi pour que `SUM(units_to_vest) = units_granted`. À implémenter en TS dans la Server Action après l'appel RPC, ou directement en SQL via une variable `running_total`.

---

## 5. SERVER ACTIONS

### 5.1 Liste des actions

`apps/web/src/server/actions/awards.ts` :

```typescript
'use server';

// CRUD basique
export async function createAwardDraft(
  input: CreateAwardInput,
): Promise<{ id: string; awardNumber: string }>;
export async function updateAwardDraft(id: string, patch: Partial<CreateAwardInput>): Promise<void>;
export async function loadAward(id: string): Promise<AwardDetail>;

// State machine
export async function transitionAward(
  id: string,
  toStatus: AwardStatus,
  payload?: TransitionPayload,
): Promise<void>;
export async function cancelAward(id: string, reason: string): Promise<void>;
export async function forfeitAward(
  id: string,
  leaverType: string,
  eventDate: string,
  reason?: string,
): Promise<void>;

// Bulk
export async function bulkCreateAwards(
  planId: string,
  csvRows: BulkAwardRow[],
): Promise<BulkResult>;

// Modifications post-grant (IFRS 2.27-28)
export async function createAwardModification(
  awardId: string,
  type: 'REPRICING' | 'EXTENSION' | 'ACCELERATION' | 'ADDITIONAL_GRANT' | 'CANCELLATION',
  changes: Record<string, unknown>,
  reason: string,
): Promise<{ modificationId: string }>;
```

### 5.2 Validation Zod

`packages/shared/src/schemas/award.ts` :

```typescript
export const createAwardSchema = z
  .object({
    planId: z.string().uuid(),
    beneficiaryId: z.string().uuid(),
    unitsGranted: z.number().int().positive().max(1_000_000_000),
    exercisePrice: z.number().nonnegative().nullable().optional(),
    grantDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    vestingStartDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    expiryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    acceptanceDeadline: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    initialStatus: z.enum(['DRAFT', 'PROPOSED']).default('DRAFT'),
  })
  .superRefine((data, ctx) => {
    // grant_date >= today - 30j (anti-fraud) — soft check, juste un warning
    // vesting_start_date >= grant_date
    if (data.vestingStartDate && data.grantDate && data.vestingStartDate < data.grantDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['vestingStartDate'],
        message: "La date de début de vesting doit être ≥ date d'attribution",
      });
    }
    // expiry_date > grant_date
    if (data.expiryDate && data.grantDate && data.expiryDate <= data.grantDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiryDate'],
        message: "La date d'expiration doit être > date d'attribution",
      });
    }
  });
```

### 5.3 Bulk import

```typescript
const bulkAwardRowSchema = z.object({
  beneficiaryEmail: z.string().email(),
  beneficiaryFullName: z.string().min(1).max(200),
  beneficiaryType: z.enum(['employee', 'consultant', 'dirigeant', 'external']),
  unitsGranted: z.number().int().positive(),
  exercisePrice: z.number().nonnegative().optional(),
  grantDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vestingStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const bulkAwardImportSchema = z.object({
  planId: z.string().uuid(),
  rows: z.array(bulkAwardRowSchema).min(1).max(500),
});
```

Le RPC `bulk_create_awards(p_plan_id UUID, p_rows JSONB)` :

1. Vérifie le pool restant ≥ SUM(units_granted)
2. Pour chaque row : upsert beneficiary (par email), puis create_award_full avec status='DRAFT'
3. Retourne `{ created: N, errors: [{ rowIndex, error }] }`
4. Si une erreur survient, ROLLBACK complet (transaction)

---

## 6. UI — PAGES

### 6.1 Liste `/dashboard/awards`

Pattern identique à `/dashboard/plans` (DataTable + filtres + actions).

Colonnes :

- Award number (lien)
- Bénéficiaire (nom + email)
- Plan (lien)
- Type plan (badge)
- Statut (badge couleur)
- Units granted
- Units vested (avec %)
- Date attribution

Filtres :

- Recherche (full_name beneficiary, award_number)
- Status (multi-select avec groupes : "Brouillons", "En cours", "Vivants", "Terminés")
- Plan (select)
- Type bénéficiaire

Actions par ligne :

- Voir détail
- Cancel (si avant GRANTED)
- Forfeit (si VESTING+)
- Transition manuelle (admin)

Bouton "Nouvelle attribution" en haut → modale ou page `/dashboard/awards/new`.
Bouton "Import CSV" → modale upload.

### 6.2 Détail `/dashboard/awards/[id]`

Layout : PageShell + Tabs (5 onglets).

#### Onglet 1 — Synthèse

- Carte info : award_number, bénéficiaire, plan, status
- Carte units : granted / vested / exercised / outstanding (progress bars)
- Carte dates : grant_date, vesting_start, expiry, acceptance_deadline, accepted_at
- Carte fair value : fair_value_per_unit, total_fair_value (placeholder si pas encore valorisé)
- Bouton "Faire transitionner" (admin)
- Bouton "Cancel" (si applicable)

#### Onglet 2 — Vesting

- Timeline visuelle (Recharts) des vesting_events
- Table : scheduled_date, units_to_vest, status, performance_multiplier, notification_sent_at
- Bouton "Forcer le vesting d'une tranche" (admin only, pour debug — log audit `award.vesting_forced`)

#### Onglet 3 — Modifications

- Liste des `award_modifications` (chronologique)
- Pour chaque mod : type, effective_date, before/after snapshot diff (JSON viewer), incremental_fair_value, approved_by, approved_at
- Bouton "Nouvelle modification" → modale (REPRICING / EXTENSION / ACCELERATION / ADDITIONAL_GRANT / CANCELLATION)

#### Onglet 4 — Plan rules (snapshot)

- Affiche les snapshots JSONB du plan au moment du grant
- Vesting schedule snapshot (table)
- Conditions de performance snapshot
- Leaver rules snapshot (8 cards)

#### Onglet 5 — Audit & History

- Liste des audit_events filtrés sur `resource_id = awardId`
- Liste des notifications envoyées (lien vers Module 7)
- Liste des documents signés (placeholder Module 6)

### 6.3 Modale création

`apps/web/src/components/awards/CreateAwardModal.tsx` :

Form RHF + Zod :

- Plan (select avec recherche, filtré sur status ∈ {ACTIVE, LOCKED})
- Bénéficiaire :
  - Si existe : autocomplete sur email/nom
  - Si nouveau : sub-form (email, nom, type, tax_residence) → upsert beneficiary
- Units granted
- Exercise price (auto-rempli depuis plan si plan a un strike fixe)
- Grant date
- Vesting start date (auto = grant_date + 0)
- Expiry date (auto-calculée selon plan_type — BSPCE: grant + 10 ans)
- Acceptance deadline (auto = grant + 30 jours)
- Status initial : DRAFT (default) ou PROPOSED (skip le "save brouillon, soumettre plus tard")

Banner pool : "Pool restant : 5 000 / 10 000 unités. Cette attribution consommera 1 000 unités."

Bouton "Créer en brouillon" et "Créer et soumettre".

### 6.4 Modale bulk import

Wizard 3 étapes :

1. Sélection du plan + upload CSV (drag & drop, max 5 MB)
2. Preview des 500 premières lignes avec validation Zod par ligne (rouge si erreur)
3. Confirmation + lancement (loading) + résultat (X created, Y errors avec liens)

Template CSV téléchargeable :

```csv
beneficiary_email,beneficiary_full_name,beneficiary_type,units_granted,exercise_price,grant_date,vesting_start_date
[email protected],Jean Dupont,employee,1000,1.50,2026-05-01,2026-05-01
```

---

## 7. COMPLIANCE V1 — RÈGLES BLOQUANTES

À placer dans `apps/web/src/lib/compliance/rules/awardRules.ts` :

```typescript
export const AWARD_COMPLIANCE_RULES = [
  {
    code: 'BSPCE_BENEFICIARY_TYPE',
    description: 'BSPCE : bénéficiaire doit être employee ou dirigeant (pas consultant externe)',
    appliesTo: ['BSPCE'],
    enforcement: 'hard',
    check: (data, ctx) => {
      if (ctx.plan.plan_type !== 'BSPCE') return null;
      if (!['employee', 'dirigeant'].includes(ctx.beneficiary.beneficiary_type)) {
        return {
          severity: 'ERROR',
          message:
            'BSPCE : seuls les salariés et dirigeants éligibles. Consultant externe → utiliser BSA.',
        };
      }
      return null;
    },
  },
  {
    code: 'AGA_30_PERCENT_CAP',
    description: 'AGA : pas plus de 30 % du capital alloué en AGA cumulées',
    appliesTo: ['AGA'],
    enforcement: 'hard',
    check: async (data, ctx) => {
      /* vérif global cap table */
    },
  },
  {
    code: 'POOL_AVAILABLE',
    description: 'Pool restant doit être >= units_granted',
    appliesTo: ['*'],
    enforcement: 'hard',
    check: async (data, ctx) => {
      /* déjà géré par trigger DB, on duplique en JS pour UX */
    },
  },
  {
    code: 'GRANT_DATE_RECENT',
    description: 'grant_date ne doit pas être antidatée de plus de 30 jours',
    appliesTo: ['*'],
    enforcement: 'soft',
    check: (data, ctx) => {
      const today = new Date();
      const grant = new Date(data.grantDate);
      const diffDays = (today.getTime() - grant.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > 30) {
        return {
          severity: 'WARNING',
          message: `Date d'attribution antérieure de ${Math.round(diffDays)} jours. Justifier dans les notes.`,
        };
      }
      return null;
    },
  },
];
```

Hard checks bloquent le passage en PROPOSED. Soft checks affichent un warning à confirmer.

---

## 8. AUDIT EVENTS

Événements à logger (event_type) :

| Event                  | Quand                      | Metadata                                                   |
| ---------------------- | -------------------------- | ---------------------------------------------------------- |
| `award.created`        | RPC create_award_full      | `{ award_number, plan_id, beneficiary_id, units_granted }` |
| `award.status_changed` | À chaque transition        | `{ from, to, reason? }`                                    |
| `award.cancelled`      | Server Action cancelAward  | `{ reason }`                                               |
| `award.forfeited`      | Server Action forfeitAward | `{ leaver_type, event_date, units_forfeited }`             |
| `award.modified`       | createAwardModification    | `{ modification_type, before, after, incremental_fv }`     |
| `award.bulk_imported`  | bulkCreateAwards           | `{ plan_id, rows_count, errors_count }`                    |
| `award.vesting_forced` | Admin force une tranche    | `{ tranche_id, original_date, forced_date, units }`        |

---

## 9. PLAN DE LIVRAISON — 7 SOUS-MODULES

À découper en 7 sous-modules livrés séquentiellement, chacun se terminant par un commit + push + validation visuelle.

### B1 — DB & RPC (1 jour)

- Migrations 00018 (counter, trigger lock, trigger pool, mini-beneficiaries)
- Migration 00019 (seed permissions awards._ + beneficiaries._)
- Migration 00020 (RPC create_award_full + materialize_vesting_events + bulk_create_awards)
- 4 tests SQL purs : create simple, create avec snapshot, pool exceeded → reject, plan locked après 1er propose
- Régénérer types Supabase

**Livrable** : tous les RPC testés en SQL pur, aucun UI.

### B2 — State machine + Server Actions (1 jour)

- `awardStateMachine.ts` + 16 tests Vitest
- Server Actions : createAwardDraft, updateAwardDraft, loadAward, transitionAward, cancelAward, forfeitAward
- Schémas Zod
- Audit logs systématiques

**Livrable** : sandbox `/dev/award-state-machine` qui permet de simuler les transitions sur un award fictif.

### B3 — Modale création + page liste (1 jour)

- Modale CreateAwardModal avec sub-form bénéficiaire
- Page `/dashboard/awards` (liste + filtres + actions)
- DataTable réutilisé du Module 3a B4

**Livrable** : créer 3 awards via la modale, les voir dans la liste.

### B4 — Page détail (1.5 jours)

- 5 onglets (Synthèse, Vesting, Modifications, Plan rules snapshot, Audit)
- Composants : AwardKPIs, VestingTimeline (Recharts), ModificationDiff (JSON viewer), AuditTimeline
- Actions inline : transition manuelle, cancel, forfeit

**Livrable** : navigation complète depuis liste → détail → onglets.

### B5 — Bulk import CSV (0.5 jour)

- Modale wizard 3 étapes
- Parser CSV (papaparse) + validation Zod par ligne
- Preview avec erreurs inline
- Upsert beneficiaries + RPC bulk_create_awards
- Template CSV téléchargeable

**Livrable** : importer 50 awards d'un coup avec 5 erreurs détectées et corrigées.

### B6 — Modifications IFRS 2.27-28 (1 jour)

- Modale "Nouvelle modification" avec 5 types
- Server Action createAwardModification
- Snapshot before/after dans `award_modifications`
- Pour REPRICING/EXTENSION/ADDITIONAL_GRANT : déclencher un `valuation_run` (recalc fair value incrémental — Module 11 sera relié plus tard, ici on insère juste la valuation_run en QUEUED)
- UI diff JSON dans l'onglet Modifications

**Livrable** : repricer un award, voir le before/after, et qu'un valuation_run soit créé.

### B7 — Compliance + tests E2E (0.5 jour)

- Implémenter les 4 règles V1 dans `awardRules.ts`
- Hook `runComplianceChecks` dans transitionAward (PROPOSED)
- Tests E2E manuels : 5 scénarios (création simple BSPCE, BSPCE consultant → reject, AGA cap → warning, bulk avec erreur → rollback, modification REPRICING → valuation_run)
- Memory closure Module 3b

**Livrable** : module fini, plan de tests passé, prêt pour Module 4.

---

## 10. INSTRUCTIONS POUR CLAUDE CODE

### Phase 1 — Bootstrap

1. Lire la mémoire `memory/module_3a_b1_post_check.md` pour comprendre les écarts résolus en B2 — appliquer le **même rigueur de mapping camelCase ↔ snake_case** ici.
2. Faire une branche `feat/module-3b-awards`
3. Vérifier que tous les check Module 3a sont OK :
   - Plan créé via `/dashboard/plans/new` reste créable (test E2E rapide)
   - Pages liste + détail accessibles
   - 8 leavers présents en DB
   - Sidebar nav fonctionne
   - **B5 status** : si non terminé, OK (le Module 3b ne dépend pas de la valorisation, il peut tourner sans). Documenter dans memory.

### Phase 2 — DB & RPC (B1)

- Suivre §3 et §4 strictement
- Tester chaque RPC en SQL pur via mcp Supabase avant de toucher au TS
- Mémoire `memory/module_3b_b1_recon.md` avec les résultats

### Phase 3 — State machine (B2)

- Suivre §2 strictement, recopier les transitions à l'identique
- Tests Vitest avec coverage 100% sur la state machine

### Phase 4 — UI (B3 → B5)

- Réutiliser DataTable, PageShell, StatusBadge, PlanTypeBadge du Module 3a B4
- Sandbox `/dev/award-*` pour chaque écran complexe (modale création, modale bulk, modale modification)

### Phase 5 — Validation finale (B7)

Before "module 3b done", vérifier :

- [ ] State machine 16 états + 100% transitions testées
- [ ] RPC create_award_full + materialize_vesting_events + bulk_create_awards en place
- [ ] Trigger pool consistency bloque vraiment quand on dépasse
- [ ] Trigger lock plan se déclenche bien à PROPOSED
- [ ] Award number `AWD-YYYY-NNNN` séquentiel par org (test : 3 awards consécutifs → AWD-2026-0001/0002/0003)
- [ ] Snapshots JSONB cohérents (vesting + conditions + leavers du plan au moment du grant)
- [ ] Page liste + détail + 5 onglets fonctionnels
- [ ] Modale création avec sub-form bénéficiaire (upsert)
- [ ] Bulk CSV : import 50 lignes avec 5 erreurs → 45 inserted, 5 reported, 0 partial state
- [ ] Modifications IFRS 2.27-28 : 5 types, before/after diff visible, valuation_run créé
- [ ] Compliance V1 : BSPCE consultant → block, grant_date > 30j → warning
- [ ] Audit events présents pour toutes les actions critiques (8 event_types)
- [ ] Tests E2E manuels : 5 scénarios verts

### Conventions strictes (rappel)

- **Pas de `any` TypeScript** sauf justification commentée
- **Validation Zod** sur chaque Server Action
- **Pas de service_role côté client**
- **Fonctions RPC** pour les insertions multi-tables
- **Audit log** systématique
- **Réutiliser** les composants du Module 3a B4 (PageShell, DataTable, badges)
- **Snapshots immuables** : ne jamais altérer `vesting_schedule_snapshot` etc. après le grant — passer par une `award_modification`

### Points de vigilance

- **Race condition counter** : `next_award_number` doit utiliser `INSERT ... ON CONFLICT DO UPDATE RETURNING` pour être atomique. Tester avec 3 inserts concurrents (`pg_sleep + pg_advisory_lock` en sandbox).
- **Pool exceeded** : géré par trigger DB. Le frontend doit aussi check côté UX (banner pool restant, désactivation du bouton si ≥). Double protection.
- **Snapshots** : copier les vesting_tranches avec leurs vesting_dates calculées **à partir de vesting_start_date** (qui peut différer de plan.boardDate). Ne pas copier tel quel les dates du plan.
- **Drift correction tranches** : la dernière tranche absorbe l'écart d'arrondi pour que `SUM(units_to_vest) = units_granted` exactement. Idem pour les pourcentages.
- **Bulk import** : 500 lignes maximum (anti-DoS). Au-delà, splitter en plusieurs imports.
- **Modifications IFRS 2** : la spec V1 ne déclenche **pas** automatiquement le recalcul Python — on insère juste un `valuation_run` en QUEUED, le Module 11 le picke. Documenter clairement dans le memory closure.
- **Lock du plan** : une fois locked, il ne peut plus être délocké via UI. Seule la duplication crée une nouvelle version éditable. À tester explicitement.

---

**FIN DU MODULE 3b — AWARDS LIFECYCLE**

_Quand le Module 3b est implémenté et validé, reviens vers Claude (chat) pour "go module 4" (Beneficiaries Management) — qui complétera le mini-CRUD bénéficiaire avec import RH, gestion fine, départs, etc._
