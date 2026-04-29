# MODULE 5 — APPROVAL ENGINE

> **Projet :** Equity Platform
> **Version :** 1.0
> **Date :** Avril 2026
> **Prérequis :** Modules 1, 2, 3a, 3b et 4 terminés et validés
> **Audience :** Claude Code (développement)

---

## 0. CONTEXTE & OBJECTIFS

### 0.1 Mission du module

Implémenter un **moteur d'approbation multi-étapes configurable** qui transforme les workflows manuels actuels (admin flippe les statuts via "Forcer transition") en vrais circuits d'approbation séquentiels ou parallèles.

Aujourd'hui, un award qui passe `PROPOSED → PENDING_APPROVAL → APPROVED` se fait via clics admin manuels. Après ce module, ces transitions seront déclenchées par les **décisions des approbateurs configurés** dans des workflows attachés à des plans (ou par défaut à l'organisation).

### 0.2 Périmètre exact

**Inclus dans ce module :**

- Tables `approval_workflows`, `approval_workflow_steps`, `approval_requests`, `approval_decisions` (préfigurées en Module 1, à finaliser)
- RPCs : `start_approval_workflow`, `record_approval_decision`, `evaluate_approval_request`
- Server Actions : créer/éditer un workflow, lancer un circuit, prendre une décision, lister "mes approbations en attente"
- Page admin de configuration des workflows (par plan ou par défaut org)
- Page "Mes approbations en attente" (inbox pour approbateurs)
- Hook dans Module 3b : `transitionAward(*, 'PENDING_APPROVAL')` lance automatiquement un workflow
- Hook dans Module 3b : décisions APPROVED/REJECTED transitions automatiquement les awards
- Audit complet de chaque décision
- Compliance V1 : workflow nécessaire avant grant pour les types AGA et BSPCE par défaut
- Notifications minimales (insert dans table `notifications` — Module 7 enverra les emails)

**Exclus (modules ultérieurs) :**

- Envoi d'emails aux approbateurs (Module 7 — Notifications Resend)
- Génération de documents pour signature après APPROVED (Module 6 — Yousign)
- Délégation et substitution d'approbateurs (V2)
- SLA + escalade automatique (V2 — colonnes prévues mais non actionnées en V1)
- Workflow sur EXERCISE_REQUESTS (Module 9)
- UI mobile dédiée approbateur (V2)
- Approval depuis email signed link (V2)

### 0.3 Dépendances

- Module 1 : tables `approval_workflows`, `approval_workflow_steps`, `approval_requests` préfigurées
- Module 2 : RBAC, permissions, rôles APPROVER
- Module 3b : awards.status='PENDING_APPROVAL' existe et `transitionAward()` est en place
- Module 4 : bénéficiaires créés (les approbateurs sont des `auth.users` avec rôle APPROVER, pas des beneficiaries)

### 0.4 Référence

Ce module s'appuie sur :

- MODULE*01_FOUNDATION sections 4.6 (tables approval*\*)
- MODULE_03B_AWARDS_LIFECYCLE section 2 (state machine, transition PENDING_APPROVAL)
- MODULE_03B_AWARDS_LIFECYCLE section 5.1 (`transitionAward` Server Action — à étendre)

---

## 1. ARCHITECTURE GÉNÉRALE

### 1.1 Vue d'ensemble du flux

```
┌─────────────────────────────────────────────────────────────┐
│                  CONFIGURATION (admin)                      │
│   Crée un workflow "BSPCE Standard" :                       │
│     Step 1 : Approbateur RH (rôle ADMIN_HR)                 │
│     Step 2 : Approbateur CFO (user spécifique)              │
│     Step 3 : Board (any_of_role APPROVER + board flag)      │
│   Attache au plan ou en default org                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│           DÉCLENCHEMENT (transitionAward DRAFT→PROPOSED)    │
│   Si plan a un workflow rattaché :                          │
│   - Crée approval_request                                   │
│   - Insert N approval_decisions (PENDING) selon workflow    │
│   - Award status = PENDING_APPROVAL                         │
│   - Notify approbateurs Step 1                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│           DÉCISION (chaque approbateur)                     │
│   approver clique APPROVE / REJECT + comment                │
│   record_approval_decision RPC :                            │
│   - Update decision row (status APPROVED/REJECTED)          │
│   - Si REJECTED → workflow KO → award DRAFT                 │
│   - Si APPROVED + step requis_approvals atteint :           │
│     - Si dernier step → workflow OK → award APPROVED        │
│     - Sinon → next step + notify                            │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Décisions structurantes

| Décision                   | Choix retenu                                                                                                                                  | Justification                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Workflow attachable**    | Soit au plan (priorité 1), soit à l'org (default), soit absent (pas de workflow → admin flippe manuellement comme avant)                      | Permet de configurer fin par plan ou large par org                                                    |
| **Approbateurs**           | 4 modes : ROLE, USER, ANY_OF_ROLE, ALL_OF_ROLE                                                                                                | Couvre 90% des cas. Délégation/substitution = V2.                                                     |
| **Modes de step**          | 2 modes : SEQUENTIAL (par défaut) ou PARALLEL                                                                                                 | Sequential pour board hierarchique, parallel pour CFO+Legal en même temps                             |
| **Stockage des décisions** | Une row par approbateur sollicité dans `approval_decisions`                                                                                   | Permet l'audit qui a approuvé/rejeté + quand + pourquoi. ANY_OF_ROLE = N rows mais 1 décision suffit. |
| **Trigger automatique**    | Hook dans `transitionAward(*, 'PROPOSED')` lance le workflow et passe direct PENDING_APPROVAL                                                 | Simplifie le UX, pas besoin de cliquer "Soumettre pour approbation" séparément                        |
| **Rejet**                  | award retombe en DRAFT (pas FAILED ni similaire), avec audit du rejet et reason                                                               | Permet de corriger et re-proposer. État terminal = trop strict.                                       |
| **Workflow versioning**    | Pas de versioning V1 — on duplique le workflow si besoin                                                                                      | Simple. V2 pourra ajouter parent_workflow_id.                                                         |
| **Approver permission**    | Permission `approvals.act` sur le rôle pour pouvoir prendre des décisions. Toute personne dans l'org peut LIRE les approval_requests (audit). | RBAC clair.                                                                                           |
| **Notification V1**        | Insert dans `notifications` table avec `recipient_user_id` et `type='approval_pending'`. Module 7 enverra les emails.                         | Sépare bien les responsabilités.                                                                      |

### 1.3 Permissions

Permissions à seeder :

| Permission            | Description                                              | Roles par défaut                   |
| --------------------- | -------------------------------------------------------- | ---------------------------------- |
| `approvals.read`      | Lire les approval_requests et decisions                  | OWNER, ADMIN_HR, APPROVER, AUDITOR |
| `approvals.act`       | Prendre une décision (approve/reject)                    | OWNER, APPROVER                    |
| `approvals.configure` | Créer/éditer un workflow                                 | OWNER, ADMIN_HR                    |
| `approvals.attach`    | Attacher un workflow à un plan ou définir le default org | OWNER, ADMIN_HR                    |

---

## 2. SCHÉMA DB — FINALISATION DES TABLES PRÉFIGURÉES

### 2.1 État actuel (Module 1)

Les tables `approval_workflows`, `approval_workflow_steps`, `approval_requests` ont été créées en Module 1 mais probablement avec un schéma minimal et possiblement obsolète. Recon obligatoire avant de procéder.

### 2.2 Migration `00029_module_5_approval_engine.sql`

```sql
-- ============================================================
-- MODULE 5 B1 — Approval Engine schema finalization
-- Pre-existing tables (Module 1) :
--   approval_workflows, approval_workflow_steps, approval_requests
-- ============================================================

-- approval_workflows (extension si déjà existante)
ALTER TABLE approval_workflows
  ADD COLUMN IF NOT EXISTS attach_to_plan_id UUID REFERENCES plans(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_approval_workflows_org
  ON approval_workflows(org_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_approval_workflows_plan
  ON approval_workflows(attach_to_plan_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_approval_workflows_default
  ON approval_workflows(org_id, applies_to)
  WHERE is_default = true AND deleted_at IS NULL;

-- Constraint : un seul workflow par plan_id (si attaché)
CREATE UNIQUE INDEX IF NOT EXISTS uq_approval_workflows_plan
  ON approval_workflows(attach_to_plan_id)
  WHERE attach_to_plan_id IS NOT NULL AND deleted_at IS NULL;

-- Constraint : un seul default par (org, applies_to)
CREATE UNIQUE INDEX IF NOT EXISTS uq_approval_workflows_default
  ON approval_workflows(org_id, applies_to)
  WHERE is_default = true AND deleted_at IS NULL;

-- approval_workflow_steps (Module 1 a déjà la base — vérifier)
-- Vérifier les colonnes step_order, step_name, approver_type, approver_role,
-- approver_user_id, mode, required_approvals, sla_hours, etc.

-- approval_requests (extension)
ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS award_id UUID REFERENCES awards(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id),
  ADD COLUMN IF NOT EXISTS current_step_order INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'IN_PROGRESS'
    CHECK (status IN ('IN_PROGRESS','APPROVED','REJECTED','CANCELLED')),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS started_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_approval_requests_org
  ON approval_requests(org_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_award
  ON approval_requests(award_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status
  ON approval_requests(status);

-- approval_decisions (NOUVELLE table)
CREATE TABLE IF NOT EXISTS approval_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES approval_workflow_steps(id),
  step_order INTEGER NOT NULL,

  -- L'approbateur sollicité
  approver_user_id UUID REFERENCES auth.users(id),  -- si type USER ou résolu depuis ROLE
  approver_role TEXT,                                -- si type ROLE non encore résolu à un user

  -- Décision
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED','SKIPPED','EXPIRED')),
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES auth.users(id),  -- l'utilisateur qui a effectivement décidé
  comment TEXT,

  -- Metadata
  notified_at TIMESTAMPTZ,  -- quand on a inséré la notification
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_approval_decisions_request ON approval_decisions(request_id);
CREATE INDEX idx_approval_decisions_user ON approval_decisions(approver_user_id);
CREATE INDEX idx_approval_decisions_role ON approval_decisions(approver_role);
CREATE INDEX idx_approval_decisions_pending ON approval_decisions(status)
  WHERE status = 'PENDING';

-- RLS
ALTER TABLE approval_decisions ENABLE ROW LEVEL SECURITY;

-- Policy : tout le monde dans l'org peut LIRE (audit)
CREATE POLICY approval_decisions_select ON approval_decisions FOR SELECT
  USING (org_id = current_org_id() AND user_has_permission('approvals.read'));

-- Policy : seul le décideur peut UPDATE sa décision (via RPC, pas direct)
CREATE POLICY approval_decisions_update_self ON approval_decisions FOR UPDATE
  USING (
    org_id = current_org_id()
    AND status = 'PENDING'
    AND (
      approver_user_id = auth.uid()
      OR (approver_role IS NOT NULL AND user_has_permission('approvals.act'))
    )
  );

-- Pas de DELETE (immuable)
-- INSERT seulement via RPC SECURITY DEFINER
```

### 2.3 RLS sur approval_workflows et approval_requests

```sql
-- approval_workflows : visible si org match + lecture libre
ALTER TABLE approval_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY approval_workflows_select ON approval_workflows FOR SELECT
  USING (org_id = current_org_id() AND deleted_at IS NULL);

CREATE POLICY approval_workflows_insert ON approval_workflows FOR INSERT
  WITH CHECK (org_id = current_org_id() AND user_has_permission('approvals.configure'));

CREATE POLICY approval_workflows_update ON approval_workflows FOR UPDATE
  USING (org_id = current_org_id() AND user_has_permission('approvals.configure'));

-- approval_requests : visible org-wide
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY approval_requests_select ON approval_requests FOR SELECT
  USING (org_id = current_org_id() AND user_has_permission('approvals.read'));

-- INSERT/UPDATE seulement via RPC SECURITY DEFINER
```

### 2.4 Trigger pour audit des décisions

```sql
CREATE OR REPLACE FUNCTION audit_approval_decision()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status != 'PENDING' THEN
    INSERT INTO audit_events (org_id, actor_id, event_type, resource_type, resource_id, metadata)
    VALUES (
      NEW.org_id,
      auth.uid(),
      'approval.decision_recorded',
      'approval_decision',
      NEW.id,
      jsonb_build_object(
        'request_id', NEW.request_id,
        'step_order', NEW.step_order,
        'status', NEW.status,
        'decided_by', NEW.decided_by,
        'comment', NEW.comment
      )
    );
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_approval_decision_audit
  BEFORE UPDATE OF status ON approval_decisions
  FOR EACH ROW EXECUTE FUNCTION audit_approval_decision();
```

---

## 3. RPCs PRINCIPAUX

### 3.1 RPC `start_approval_workflow`

Migration `00030_module_5_start_workflow_rpc.sql` :

```sql
CREATE OR REPLACE FUNCTION start_approval_workflow(
  p_award_id UUID,
  p_workflow_id UUID DEFAULT NULL  -- si NULL, résolu depuis le plan ou le default org
)
RETURNS JSONB  -- { request_id, workflow_id, decisions_count }
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID := current_org_id();
  v_award RECORD;
  v_workflow RECORD;
  v_step RECORD;
  v_request_id UUID;
  v_decision_count INTEGER := 0;
  v_resolved_users UUID[];
  v_user_id_iter UUID;
BEGIN
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Charger l'award
  SELECT * INTO v_award FROM awards WHERE id = p_award_id AND org_id = v_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award % not found', p_award_id;
  END IF;

  -- Résoudre le workflow
  IF p_workflow_id IS NOT NULL THEN
    SELECT * INTO v_workflow FROM approval_workflows
     WHERE id = p_workflow_id AND org_id = v_org_id AND deleted_at IS NULL;
  ELSE
    -- 1. Workflow attaché au plan
    SELECT * INTO v_workflow FROM approval_workflows
     WHERE attach_to_plan_id = v_award.plan_id
       AND deleted_at IS NULL
       AND is_active = true;

    -- 2. Sinon workflow default de l'org pour AWARD_GRANT
    IF NOT FOUND THEN
      SELECT * INTO v_workflow FROM approval_workflows
       WHERE org_id = v_org_id
         AND applies_to = 'AWARD_GRANT'
         AND is_default = true
         AND deleted_at IS NULL
         AND is_active = true;
    END IF;
  END IF;

  IF v_workflow IS NULL THEN
    -- Pas de workflow configuré → return null, le caller saura qu'il faut
    -- transitionner manuellement (legacy behavior)
    RETURN jsonb_build_object('request_id', NULL, 'workflow_id', NULL, 'reason', 'no_workflow_configured');
  END IF;

  -- Créer l'approval_request
  INSERT INTO approval_requests (
    org_id, workflow_id, award_id, plan_id, subject_type,
    current_step_order, status, started_at, started_by
  )
  VALUES (
    v_org_id, v_workflow.id, p_award_id, v_award.plan_id, 'AWARD',
    1, 'IN_PROGRESS', now(), v_user_id
  )
  RETURNING id INTO v_request_id;

  -- Créer les approval_decisions pour le step 1 (et seulement step 1 en V1,
  -- les steps suivants seront créés à la complétion du précédent)
  FOR v_step IN
    SELECT * FROM approval_workflow_steps
     WHERE workflow_id = v_workflow.id
       AND step_order = 1
     ORDER BY step_order
  LOOP
    -- Résoudre les approbateurs selon approver_type
    v_resolved_users := ARRAY[]::UUID[];

    IF v_step.approver_type = 'USER' AND v_step.approver_user_id IS NOT NULL THEN
      v_resolved_users := ARRAY[v_step.approver_user_id];
    ELSIF v_step.approver_type IN ('ROLE','ANY_OF_ROLE','ALL_OF_ROLE') THEN
      -- Récupérer les users avec ce rôle dans l'org
      SELECT array_agg(m.user_id) INTO v_resolved_users
        FROM memberships m
        JOIN roles r ON r.id = m.role_id
       WHERE m.org_id = v_org_id
         AND r.code = v_step.approver_role
         AND m.status = 'active';
    END IF;

    IF array_length(v_resolved_users, 1) IS NULL THEN
      RAISE EXCEPTION 'No approvers resolved for step %', v_step.step_order;
    END IF;

    -- Insert une row par approver
    FOREACH v_user_id_iter IN ARRAY v_resolved_users
    LOOP
      INSERT INTO approval_decisions (
        org_id, request_id, step_id, step_order,
        approver_user_id, approver_role, status, notified_at
      )
      VALUES (
        v_org_id, v_request_id, v_step.id, v_step.step_order,
        v_user_id_iter, v_step.approver_role, 'PENDING', now()
      );
      v_decision_count := v_decision_count + 1;

      -- Insert notification (Module 7 enverra l'email)
      INSERT INTO notifications (
        org_id, recipient_user_id, type, resource_type, resource_id,
        metadata, status
      )
      VALUES (
        v_org_id, v_user_id_iter, 'approval_pending', 'approval_request', v_request_id,
        jsonb_build_object(
          'award_id', p_award_id,
          'award_number', v_award.award_number,
          'step_order', v_step.step_order,
          'step_name', v_step.step_name
        ),
        'pending'  -- Module 7 changera à 'sent' après envoi
      );
    END LOOP;
  END LOOP;

  -- Audit
  INSERT INTO audit_events (org_id, actor_id, event_type, resource_type, resource_id, metadata)
  VALUES (v_org_id, v_user_id, 'approval.workflow_started', 'approval_request', v_request_id,
    jsonb_build_object('workflow_id', v_workflow.id, 'award_id', p_award_id,
                       'decisions_count', v_decision_count));

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'workflow_id', v_workflow.id,
    'decisions_count', v_decision_count
  );
END $$;

GRANT EXECUTE ON FUNCTION start_approval_workflow(UUID, UUID) TO authenticated;
```

### 3.2 RPC `record_approval_decision`

```sql
CREATE OR REPLACE FUNCTION record_approval_decision(
  p_decision_id UUID,
  p_status TEXT,        -- 'APPROVED' ou 'REJECTED'
  p_comment TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID := current_org_id();
  v_decision RECORD;
  v_request RECORD;
  v_step RECORD;
BEGIN
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_status NOT IN ('APPROVED','REJECTED') THEN
    RAISE EXCEPTION 'Invalid status %', p_status;
  END IF;

  IF NOT user_has_permission('approvals.act') THEN
    RAISE EXCEPTION 'Permission denied: approvals.act';
  END IF;

  -- Charger la décision
  SELECT * INTO v_decision FROM approval_decisions
   WHERE id = p_decision_id AND org_id = v_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Decision not found';
  END IF;

  IF v_decision.status != 'PENDING' THEN
    RAISE EXCEPTION 'Decision already resolved (status=%)', v_decision.status;
  END IF;

  -- Vérifier que l'utilisateur courant est légitime pour cette décision
  IF v_decision.approver_user_id IS NOT NULL
     AND v_decision.approver_user_id != v_user_id THEN
    RAISE EXCEPTION 'You are not the designated approver for this decision';
  END IF;

  -- Update la décision
  UPDATE approval_decisions
     SET status = p_status,
         decided_at = now(),
         decided_by = v_user_id,
         comment = p_comment,
         updated_at = now()
   WHERE id = p_decision_id;

  -- Évaluer le request (déléguer à la fonction d'évaluation)
  RETURN evaluate_approval_request(v_decision.request_id);
END $$;

GRANT EXECUTE ON FUNCTION record_approval_decision(UUID, TEXT, TEXT) TO authenticated;
```

### 3.3 RPC `evaluate_approval_request`

```sql
CREATE OR REPLACE FUNCTION evaluate_approval_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request RECORD;
  v_step RECORD;
  v_step_decisions RECORD;
  v_step_approved_count INTEGER;
  v_step_rejected_count INTEGER;
  v_step_total_count INTEGER;
  v_award_status TEXT;
  v_next_step RECORD;
  v_user_id_iter UUID;
  v_resolved_users UUID[];
BEGIN
  -- Charger la request
  SELECT * INTO v_request FROM approval_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_request.status != 'IN_PROGRESS' THEN
    RETURN jsonb_build_object('request_id', p_request_id, 'status', v_request.status, 'reason', 'already_resolved');
  END IF;

  -- Charger le step courant
  SELECT * INTO v_step FROM approval_workflow_steps
   WHERE workflow_id = v_request.workflow_id AND step_order = v_request.current_step_order;

  -- Compter les décisions du step courant
  SELECT
    COUNT(*) FILTER (WHERE status = 'APPROVED'),
    COUNT(*) FILTER (WHERE status = 'REJECTED'),
    COUNT(*)
  INTO v_step_approved_count, v_step_rejected_count, v_step_total_count
  FROM approval_decisions
  WHERE request_id = p_request_id AND step_order = v_step.step_order;

  -- 1. Si une décision REJECTED dans le step → workflow KO
  IF v_step_rejected_count > 0 THEN
    UPDATE approval_requests
       SET status = 'REJECTED',
           resolved_at = now(),
           rejected_reason = (
             SELECT comment FROM approval_decisions
              WHERE request_id = p_request_id
                AND status = 'REJECTED'
              ORDER BY decided_at DESC LIMIT 1
           )
     WHERE id = p_request_id;

    -- Mark all PENDING decisions as SKIPPED
    UPDATE approval_decisions
       SET status = 'SKIPPED', updated_at = now()
     WHERE request_id = p_request_id AND status = 'PENDING';

    -- Audit
    INSERT INTO audit_events (org_id, actor_id, event_type, resource_type, resource_id, metadata)
    VALUES (v_request.org_id, auth.uid(), 'approval.workflow_rejected', 'approval_request', p_request_id,
      jsonb_build_object('award_id', v_request.award_id));

    -- Trigger transition de l'award (DRAFT)
    -- Note : la Server Action côté TS gérera cette transition pour avoir accès
    -- à transitionAward + audit cohérent. Le RPC retourne juste l'info.

    RETURN jsonb_build_object(
      'request_id', p_request_id,
      'status', 'REJECTED',
      'next_award_status', 'DRAFT'
    );
  END IF;

  -- 2. Si requis_approvals atteint dans le step → step OK
  IF v_step_approved_count >= v_step.required_approvals THEN
    -- Mark remaining PENDING decisions as SKIPPED (cas ANY_OF_ROLE atteint)
    UPDATE approval_decisions
       SET status = 'SKIPPED', updated_at = now()
     WHERE request_id = p_request_id
       AND step_order = v_step.step_order
       AND status = 'PENDING';

    -- Y a-t-il un step suivant ?
    SELECT * INTO v_next_step FROM approval_workflow_steps
     WHERE workflow_id = v_request.workflow_id
       AND step_order = v_step.step_order + 1
     ORDER BY step_order LIMIT 1;

    IF FOUND THEN
      -- Avancer au step suivant
      UPDATE approval_requests
         SET current_step_order = v_next_step.step_order,
             updated_at = now()
       WHERE id = p_request_id;

      -- Créer les decisions du step suivant (résoudre approbateurs)
      v_resolved_users := ARRAY[]::UUID[];

      IF v_next_step.approver_type = 'USER' AND v_next_step.approver_user_id IS NOT NULL THEN
        v_resolved_users := ARRAY[v_next_step.approver_user_id];
      ELSIF v_next_step.approver_type IN ('ROLE','ANY_OF_ROLE','ALL_OF_ROLE') THEN
        SELECT array_agg(m.user_id) INTO v_resolved_users
          FROM memberships m JOIN roles r ON r.id = m.role_id
         WHERE m.org_id = v_request.org_id
           AND r.code = v_next_step.approver_role
           AND m.status = 'active';
      END IF;

      FOREACH v_user_id_iter IN ARRAY v_resolved_users
      LOOP
        INSERT INTO approval_decisions (
          org_id, request_id, step_id, step_order,
          approver_user_id, approver_role, status, notified_at
        )
        VALUES (
          v_request.org_id, p_request_id, v_next_step.id, v_next_step.step_order,
          v_user_id_iter, v_next_step.approver_role, 'PENDING', now()
        );

        INSERT INTO notifications (
          org_id, recipient_user_id, type, resource_type, resource_id, metadata, status
        )
        VALUES (
          v_request.org_id, v_user_id_iter, 'approval_pending', 'approval_request', p_request_id,
          jsonb_build_object(
            'award_id', v_request.award_id,
            'step_order', v_next_step.step_order,
            'step_name', v_next_step.step_name
          ),
          'pending'
        );
      END LOOP;

      RETURN jsonb_build_object(
        'request_id', p_request_id,
        'status', 'IN_PROGRESS',
        'next_step_order', v_next_step.step_order
      );
    ELSE
      -- Dernier step → workflow OK
      UPDATE approval_requests
         SET status = 'APPROVED', resolved_at = now()
       WHERE id = p_request_id;

      INSERT INTO audit_events (org_id, actor_id, event_type, resource_type, resource_id, metadata)
      VALUES (v_request.org_id, auth.uid(), 'approval.workflow_approved', 'approval_request', p_request_id,
        jsonb_build_object('award_id', v_request.award_id));

      RETURN jsonb_build_object(
        'request_id', p_request_id,
        'status', 'APPROVED',
        'next_award_status', 'APPROVED'
      );
    END IF;
  END IF;

  -- 3. Sinon : encore en attente
  RETURN jsonb_build_object(
    'request_id', p_request_id,
    'status', 'IN_PROGRESS',
    'pending_in_current_step', v_step_total_count - v_step_approved_count - v_step_rejected_count
  );
END $$;

GRANT EXECUTE ON FUNCTION evaluate_approval_request(UUID) TO authenticated;
```

### 3.4 RPC `cancel_approval_request`

Pour les cas où un admin veut annuler un workflow en cours (ex: l'award a été cancel) :

```sql
CREATE OR REPLACE FUNCTION cancel_approval_request(p_request_id UUID, p_reason TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID := current_org_id();
BEGIN
  IF NOT user_has_permission('approvals.configure') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE approval_requests
     SET status = 'CANCELLED', resolved_at = now(), rejected_reason = p_reason
   WHERE id = p_request_id
     AND org_id = v_org_id
     AND status = 'IN_PROGRESS';

  -- Skip remaining decisions
  UPDATE approval_decisions
     SET status = 'SKIPPED', updated_at = now()
   WHERE request_id = p_request_id AND status = 'PENDING';

  -- Audit
  INSERT INTO audit_events (org_id, actor_id, event_type, resource_type, resource_id, metadata)
  VALUES (v_org_id, auth.uid(), 'approval.workflow_cancelled', 'approval_request', p_request_id,
    jsonb_build_object('reason', p_reason));

  RETURN p_request_id;
END $$;
```

---

## 4. SERVER ACTIONS

### 4.1 Liste des actions

`apps/web/src/server/actions/approvals.ts` (créer ce fichier) :

```typescript
'use server';

// CRUD workflows
export async function createWorkflow(input: CreateWorkflowInput): Promise<Result<{ id: string }>>;
export async function updateWorkflow(id: string, patch: UpdateWorkflowInput): Promise<Result<void>>;
export async function deleteWorkflow(id: string): Promise<Result<void>>;
export async function listWorkflows(filters?: {
  appliesTo?: string;
  planId?: string;
}): Promise<WorkflowListItem[]>;
export async function getWorkflowDetail(id: string): Promise<WorkflowDetail>;

// Attach
export async function setDefaultWorkflow(workflowId: string): Promise<Result<void>>;
export async function attachWorkflowToPlan(
  workflowId: string,
  planId: string,
): Promise<Result<void>>;
export async function detachWorkflow(workflowId: string): Promise<Result<void>>;

// Décisions
export async function approveDecision(
  decisionId: string,
  comment?: string,
): Promise<Result<EvaluateResult>>;
export async function rejectDecision(
  decisionId: string,
  comment: string,
): Promise<Result<EvaluateResult>>;

// Inbox
export async function getMyPendingApprovals(): Promise<PendingApprovalItem[]>;
export async function getApprovalRequestDetail(requestId: string): Promise<ApprovalRequestDetail>;

// Admin
export async function cancelApprovalRequest(
  requestId: string,
  reason: string,
): Promise<Result<void>>;
```

### 4.2 Schémas Zod

`packages/shared/src/schemas/approval.ts` :

```typescript
import { z } from 'zod';

export const approverTypeEnum = z.enum(['ROLE', 'USER', 'ANY_OF_ROLE', 'ALL_OF_ROLE']);
export const stepModeEnum = z.enum(['SEQUENTIAL', 'PARALLEL']);
export const appliesToEnum = z.enum([
  'AWARD_GRANT',
  'AWARD_MODIFICATION',
  'EXERCISE_REQUEST',
  'PLAN_CREATION',
]);

export const workflowStepSchema = z
  .object({
    stepOrder: z.number().int().positive(),
    stepName: z.string().min(1).max(100),
    approverType: approverTypeEnum,
    approverRole: z.string().optional(),
    approverUserId: z.string().uuid().optional(),
    mode: stepModeEnum.default('SEQUENTIAL'),
    requiredApprovals: z.number().int().positive().default(1),
    slaHours: z.number().int().positive().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.approverType === 'USER' && !data.approverUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approverUserId'],
        message: 'approverUserId requis quand approverType=USER',
      });
    }
    if (['ROLE', 'ANY_OF_ROLE', 'ALL_OF_ROLE'].includes(data.approverType) && !data.approverRole) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['approverRole'],
        message: 'approverRole requis pour ce type',
      });
    }
  });

export const createWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  appliesTo: appliesToEnum,
  planTypeFilter: z.array(z.string()).optional(),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  steps: z.array(workflowStepSchema).min(1).max(10),
});

export const recordDecisionSchema = z.object({
  decisionId: z.string().uuid(),
  comment: z.string().max(2000).optional(),
});
```

### 4.3 Hook dans transitionAward

Le point critique : modifier `transitionAward` du Module 3b pour qu'il déclenche automatiquement le workflow quand un award passe en PROPOSED.

```typescript
// apps/web/src/server/actions/awards.ts (étendre)

export async function transitionAward(input) {
  // ... existing code ...

  // Hook approval workflow lors de la transition vers PROPOSED
  if (toStatus === 'PROPOSED') {
    // Lancer le workflow si configuré
    const { data: workflowResult } = await supabase.rpc('start_approval_workflow', {
      p_award_id: awardId,
      p_workflow_id: null, // résolution auto plan → org default → null
    });

    if (workflowResult?.request_id) {
      // Workflow démarré → award doit aller en PENDING_APPROVAL au lieu de PROPOSED
      // Re-call transitionAward(awardId, 'PENDING_APPROVAL')
      // OU update directement (mais perd l'audit propre)
      // → Choix : re-appel transitionAward(awardId, 'PENDING_APPROVAL') juste après
      // Le caller voit l'award arriver direct en PENDING_APPROVAL, c'est attendu.
      // Note : transitionAward(*, 'PENDING_APPROVAL') doit être autorisé depuis
      // 'PROPOSED' selon ALLOWED_TRANSITIONS du Module 3b. Vérifier.
    }
    // Si workflowResult.request_id is null → pas de workflow configuré →
    // award reste en PROPOSED (legacy behavior, admin flippe manuellement)
  }

  // ... rest of code
}
```

### 4.4 Hook après décision finale

Quand `evaluate_approval_request` retourne `status='APPROVED'` ou `status='REJECTED'`, il faut transitionner l'award correspondant :

```typescript
// Dans approveDecision et rejectDecision Server Actions

const result = await supabase.rpc('record_approval_decision', { ... });

if (result.data?.status === 'APPROVED' && result.data?.next_award_status === 'APPROVED') {
  // Le workflow est OK → transitionner l'award PENDING_APPROVAL → APPROVED
  await transitionAward({ awardId: ..., toStatus: 'APPROVED' });
}

if (result.data?.status === 'REJECTED') {
  // Le workflow est KO → transitionner l'award PENDING_APPROVAL → DRAFT
  await transitionAward({ awardId: ..., toStatus: 'DRAFT', payload: {
    reason: 'Rejected by approval workflow'
  }});
}
```

---

## 5. UI — PAGES

### 5.1 Page admin `/dashboard/settings/approvals`

Liste des workflows + bouton "Nouveau workflow".

Pour chaque workflow :

- Nom, description, appliesTo
- Nombre d'étapes
- Status : actif / inactif
- Default ? Attaché à plan ?
- Actions : Modifier, Dupliquer, Supprimer

### 5.2 Page édition `/dashboard/settings/approvals/[id]`

Form RHF + Zod :

- Section "Général" : name, description, appliesTo, isActive, isDefault
- Section "Étapes" : table éditable (drag-and-drop pour réordonner)
  - Pour chaque step : stepName, approverType (radio), approverRole/User, mode, requiredApprovals
  - Bouton "Ajouter une étape" (max 10)
- Section "Attachement" :
  - Default pour l'org sur ce appliesTo (toggle)
  - Attaché à un plan spécifique (Combobox)
- Bouton "Enregistrer"

Validation Zod côté client + serveur. Compliance check : pas de cycle (un user qui s'auto-approuve), workflow actif requis pour être default.

### 5.3 Page inbox `/dashboard/approvals`

Pour les approbateurs : liste des décisions PENDING qui les concernent.

Colonnes :

- Date de notification
- Type (Award grant)
- Award concerné (lien vers /dashboard/awards/[id])
- Bénéficiaire
- Plan
- Étape (X/N)
- Actions : Approuver / Rejeter (ouvre Dialog avec comment)

Filtres :

- En attente (default)
- Décidées (mes décisions passées)
- Toutes (admin only)

Compteur badge dans la sidebar : "Approbations (3)" si 3 PENDING.

### 5.4 Page détail `/dashboard/approvals/[requestId]`

Visible par tout le monde dans l'org (audit).

Sections :

- Header : Award + bénéficiaire + plan + status request
- Timeline visuelle des étapes :
  - Step 1 [APPROUVÉ par X le date · comment]
  - Step 2 [EN COURS · 2/3 décisions]
  - Step 3 [À VENIR]
- Section décisions par step (tableau)
- Section audit_events liés
- Si admin : bouton "Annuler le workflow" (avec reason)

### 5.5 Awards page détail — onglet Approbation

Sur `/dashboard/awards/[id]`, ajouter (si pertinent) :

- Carte "Workflow d'approbation" dans l'onglet Synthèse
- Si l'award a une approval_request liée :
  - Status request, étape courante
  - Lien vers la page détail request
  - Si je suis approbateur du step courant : boutons rapides Approve/Reject

---

## 6. COMPLIANCE V1

### 6.1 Règles

À placer dans `apps/web/src/lib/compliance/rules/approvalRules.ts` :

```typescript
export const APPROVAL_COMPLIANCE_RULES = [
  {
    code: 'WORKFLOW_REQUIRED_FOR_AGA',
    description: 'Plans AGA doivent avoir un workflow configuré',
    appliesTo: ['*'],
    enforcement: 'soft', // warning, pas blocker en V1
    check: async (data, ctx) => {
      if (ctx.plan?.plan_type === 'AGA' && !ctx.workflowAttached) {
        return {
          severity: 'WARNING',
          code: 'WORKFLOW_REQUIRED_FOR_AGA',
          message:
            "Plans AGA devraient avoir un workflow d'approbation. Configurer dans Settings → Approbations.",
        };
      }
      return null;
    },
  },
  {
    code: 'NO_SELF_APPROVAL',
    description: "Un user ne peut pas s'approuver lui-même",
    appliesTo: ['*'],
    enforcement: 'hard',
    check: (decision, ctx) => {
      if (decision.approver_user_id === ctx.relatedAward?.created_by) {
        return {
          severity: 'ERROR',
          code: 'NO_SELF_APPROVAL',
          message: 'Vous ne pouvez pas approuver un award que vous avez vous-même proposé.',
        };
      }
      return null;
    },
  },
  {
    code: 'WORKFLOW_HAS_VALID_STEPS',
    description: 'Workflow doit avoir au moins 1 étape avec approbateurs résolvables',
    appliesTo: ['*'],
    enforcement: 'hard',
    check: async (workflow, ctx) => {
      // Vérifier que tous les steps ont des approbateurs résolvables
      // (USER existe et est actif, ROLE a au moins 1 user dans l'org)
      // ...
    },
  },
];
```

### 6.2 Hook dans createWorkflow et record_approval_decision

- `createWorkflow` : check WORKFLOW_HAS_VALID_STEPS
- `recordDecision` : check NO_SELF_APPROVAL

---

## 7. AUDIT EVENTS

| Event                         | Quand                                     | Metadata                                                  |
| ----------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| `approval.workflow_started`   | RPC start_approval_workflow               | `{ workflow_id, award_id, decisions_count }`              |
| `approval.decision_recorded`  | trigger DB sur approval_decisions         | `{ request_id, step_order, status, decided_by, comment }` |
| `approval.workflow_approved`  | evaluate_approval_request → APPROVED      | `{ award_id, total_steps }`                               |
| `approval.workflow_rejected`  | evaluate_approval_request → REJECTED      | `{ award_id, rejected_reason }`                           |
| `approval.workflow_cancelled` | cancel_approval_request                   | `{ reason }`                                              |
| `approval.workflow_created`   | createWorkflow                            | `{ name, applies_to }`                                    |
| `approval.workflow_updated`   | updateWorkflow                            | `{ changes }`                                             |
| `approval.workflow_attached`  | attachWorkflowToPlan / setDefaultWorkflow | `{ workflow_id, plan_id, is_default }`                    |

---

## 8. PLAN DE LIVRAISON — 5 SOUS-MODULES

### B1 — DB & RPCs (1 jour)

- Migration 00029 : finalize tables + RLS + indexes + audit trigger
- Migration 00030 : RPCs start_approval_workflow + record_approval_decision + evaluate_approval_request + cancel_approval_request
- Migration 00031 : seed permissions approvals.\* + role mappings
- Tests SQL purs : 7 scénarios :
  - A : Recon tables existantes (Module 1) + adapt
  - B : Create workflow + 3 steps (USER, ROLE, ANY_OF_ROLE)
  - C : start_approval_workflow → request créée + decisions step 1
  - D : record_approval_decision APPROVE step 1 → step 2 commence
  - E : record_approval_decision REJECT step 2 → workflow REJECTED + skip
  - F : ANY_OF_ROLE avec 3 approvers, 1 approve → step OK + 2 SKIPPED
  - G : Permission test : record sans approvals.act → reject

**Livrable** : RPCs testés en SQL pur, drift cloud à 0.

### B2 — Server Actions + Engine + Hook awards (1 jour)

- Server Actions : 11 actions du §4.1
- Schémas Zod centralisés
- Hook dans transitionAward du Module 3b :
  - À la transition PROPOSED → lancer start_approval_workflow
  - Si workflow démarré → re-transition vers PENDING_APPROVAL automatique
  - Sinon legacy : reste en PROPOSED, admin flippe manuellement
- Hook après decision finale :
  - APPROVED → transitionAward → APPROVED
  - REJECTED → transitionAward → DRAFT
- Compliance V1 : 3 règles
- Tests Vitest : 15+ assertions
- Sandbox `/dev/approval-engine` pour tester le flow

**Livrable** : Server Actions + sandbox + 15 tests Vitest.

### B3 — Page admin configuration workflows (1 jour)

- /dashboard/settings/approvals (liste)
- /dashboard/settings/approvals/new (créer)
- /dashboard/settings/approvals/[id] (éditer)
- Modale de confirmation pour suppression
- Drag-and-drop pour réordonner les étapes (utiliser dnd-kit ou similaire si installé, sinon UP/DOWN buttons)
- Compliance preview : le workflow est-il valide ?

**Livrable** : admin peut créer un workflow 3 étapes USER/ROLE/ANY_OF_ROLE et l'attacher à un plan.

### B4 — Page inbox + page détail request (0.5 jour)

- /dashboard/approvals (inbox)
- /dashboard/approvals/[requestId] (détail)
- Compteur sidebar "Approbations (3)"
- Onglet Approbation sur page détail award
- Dialog Approve/Reject avec comment

**Livrable** : approbateur voit ses pendings, approuve avec un comment, est redirigé.

### B5 — Tests E2E + closure (0.5 jour)

- 5 scénarios E2E manuels (cf §10)
- Cleanup données de test
- Memory closure
- PR ready + squash-merge

**Livrable** : module fini, PR mergée sur master.

---

## 9. INSTRUCTIONS POUR CLAUDE CODE

### Phase 1 — Bootstrap

1. Lire `memory/module_4_complete.md` + `memory/module_3b_complete.md` pour le contexte des modules dépendants.
2. Faire branche `feat/module-5-approvals`.
3. Vérifier checks Module 4 OK (typecheck, tests workspace ≥ 156, drift 0).
4. Patterns à réutiliser :
   - Module 3b B6 (RPC apply_X pattern) pour les RPCs approval
   - Module 3b B2 (state machine) pour la logique de transition
   - Module 4 B3 (page liste + filtres) pour pages workflows et inbox
   - Module 4 B4 (page détail + tabs) pour page détail request
   - Module 3b B7 (compliance pattern) pour approvalRules.ts

### Phase 2 — DB & RPCs (B1)

- Recon obligatoire des tables Module 1 préfigurées avant ALTER TABLE
- Suivre §2 et §3 strictement
- Tester chaque RPC en SQL pur via mcp Supabase

### Phase 3 — Server Actions (B2)

- Pattern Result strict
- Hook dans Module 3b doit ÊTRE TESTÉ explicitement :
  - Transition PROPOSED avec workflow → award en PENDING_APPROVAL
  - Transition PROPOSED sans workflow → award reste en PROPOSED (legacy)
  - Décision APPROVED final → award en APPROVED
  - Décision REJECTED → award retombe en DRAFT
- Sandbox /dev/approval-engine couvrant les 4 scénarios

### Phase 4 — UI (B3 + B4)

- Réutiliser DataTable, PageShell, badges
- Nouveaux composants :
  - WorkflowStepEditor (re-orderable list)
  - ApprovalRequestTimeline (vertical timeline)
  - DecisionCard (mini-card avec comment + decided_by + status)
  - ApproverSelectField (Combobox pour USER ou Select pour ROLE)

### Phase 5 — Validation (B5)

Checkpoints :

- [ ] Migration drift à 0
- [ ] Tests SQL purs : 7/7
- [ ] Tests Vitest workspace ≥ 175 (156 actuels + 15-20 nouveaux)
- [ ] Page liste workflows fonctionnelle
- [ ] Page édition workflow avec re-order steps
- [ ] Inbox compteur badge sidebar
- [ ] Hook dans transitionAward fonctionne (testé E2E)
- [ ] Compliance NO_SELF_APPROVAL bloque
- [ ] PR #7 mergée sur master

### Conventions strictes (rappel)

- `'use server'` = uniquement async
- Pattern Result `{ ok: true | false, ... }`
- Validation Zod sur chaque Server Action
- Audit log systématique
- Réutiliser les composants des modules précédents

### Points de vigilance

- **Recon avant migration** : les tables Module 1 ont peut-être déjà des colonnes/triggers qu'on veut pas dupliquer.
- **Hook dans transitionAward** : le re-call dans la même Server Action peut faire 2 audit `award.status_changed`. Pas critique mais à surveiller.
- **Workflow sans approbateur résolvable** : si un workflow ROLE='APPROVER' est utilisé mais qu'il n'y a aucun user APPROVER actif dans l'org, RAISE EXCEPTION dès start_approval_workflow.
- **Self-approval** : la rule NO_SELF_APPROVAL bloque si created_by == approver. Mais si le workflow utilise ROLE et que le créateur a aussi ce rôle, comment gérer ? V1 : skip cette décision automatiquement (status SKIPPED). Documenter.
- **Workflow en cours qu'on supprime** : si un workflow a des requests IN_PROGRESS, refuser la suppression. Soft delete = OK mais pas hard.
- **Cancel d'un award en cours d'approval** : cancelAward(award) → must trigger cancel_approval_request automatically. Hook dans cancelAward du Module 3b.
- **Notifications** : V1 = juste insert dans table notifications. Module 7 enverra les emails. Vérifier que la table existe (Module 1) et que le schema est cohérent.
- **Permission `approvals.act`** : vérifier que les rôles APPROVER l'ont par défaut via le seed.

---

**FIN DU MODULE 5 — APPROVAL ENGINE**

_Quand le Module 5 est implémenté et validé, reviens vers Claude (chat) pour "go module 6" (Document Engine + Yousign)._
