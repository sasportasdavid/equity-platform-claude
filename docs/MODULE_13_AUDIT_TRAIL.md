# Module 13 — Audit Trail (Journal d'audit cryptographique)

> **Statut** : 📋 SPEC — prêt pour implémentation B0 → B6  
> **Estimation** : 1.5-2j (révisée à la baisse — découverte audit_events existante)  
> **Cible démo** : J4 (premier client CFO)  
> **Tag prévisionnel** : `v0.13.0` après merge complet

---

## §1 — Vue d'ensemble

### 1.1 Business value

L'audit trail est **l'écran qui justifie le prix premium** de Capiwise face aux concurrents (Carta, Pulley, Equify). Sans lui, on est une plateforme « cap table moderne ». Avec lui, on devient **l'outil de référence pour CFO et auditeur externe (E&Y, Mazars, KPMG)**.

**Promesse client** :

- _« Chaque action sur Capiwise est tracée, horodatée, signée cryptographiquement, et exportable pour votre auditeur. La chaîne d'événements est immuable et vérifiable. »_

**Use cases prioritaires** :

1. **CFO (interne)** : « Qui a modifié l'attribution de Marie le 12 mars ? » — réponse en 3 clics.
2. **Auditeur externe (E&Y)** : « Donnez-moi l'audit trail Q1 2026 signé pour le contrôle annuel. » — export PDF + JSON signé en 1 clic.
3. **Comité de rémunération** : « Quelles décisions ont été prises sur les plans depuis 6 mois ? » — filtre par type + période.

### 1.2 Ancrage mockup

Mockup référence : `Mockup_capiwise.pdf` page 3 — **Audit Trail Editorial Finance**.

Éléments clés du mockup :

- Hero italique Fraunces : _« Le journal des décisions, sans détour. »_
- Subtitle : _« Chaque action signée, horodatée, vérifiable. »_
- Status badge cuivre : `SHA-256 · genesis 01.01.2024 · CHAÎNE INTÈGRE ✓`
- 5 KPI tiles : Plans (47) / Signatures (86) / Modifications (31) / Exports CAC (17) / Calculs IFRS 2 (29)
- Liste timeline : event card avec icône type + acteur + horodatage + diff résumé + hash tronqué (8 caractères mono)
- Filters : Type + Période + Acteur + Ressource
- Export : PDF (avec watermark) + JSON signé

### 1.3 Décisions architecturales (Q1-Q5 figées)

| #   | Question         | Choix                      | Implication                                                       |
| --- | ---------------- | -------------------------- | ----------------------------------------------------------------- |
| Q1  | Périmètre events | **(a) Tous les 5 types**   | Plans + Signatures + Modifications + Exports CAC + Calculs IFRS 2 |
| Q2  | Hash chain       | **(a) SHA-256 chained**    | Chaque event signe `hash(previous_hash + event_payload)`          |
| Q3  | Source events    | **(c) Mix triggers + SAs** | DB triggers pour intégrité + SAs pour business events             |
| Q4  | Granularité diff | **(a) JSONB before/after** | Diff complet stocké, audit total                                  |
| Q5  | Export           | **(a) PDF + JSON signé**   | Export auditeur avec hash chain inclus                            |

---

## §2 — État existant (DÉCOUVERTE CRITIQUE)

### 2.1 Table `audit_events` déjà en production

**La table existe depuis Module 1 (foundation)** et contient déjà 232 events réels.

**Schema actuel** (vérifié via MCP Supabase le 05.05.2026) :

```sql
CREATE TABLE public.audit_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid REFERENCES organizations(id),
  user_id         uuid REFERENCES auth.users(id),
  user_email      text,
  event_type      text NOT NULL,
  resource_type   text,
  resource_id     uuid,
  before_state    jsonb,         -- ✅ Q4 satisfait nativement
  after_state     jsonb,         -- ✅ Q4 satisfait nativement
  metadata        jsonb NOT NULL DEFAULT '{}',
  ip_address      inet,
  user_agent      text,
  request_id      text,
  api_key_id      uuid,
  occurred_at     timestamptz NOT NULL DEFAULT now()
);
```

### 2.2 Inventaire events actifs (au 05.05.2026)

**232 events stockés, 29 types distincts, 5 utilisateurs, 1 organisation.**

| Event type                    | Count | Module source        |
| ----------------------------- | ----- | -------------------- |
| `award.status_changed`        | 43    | Module 3 (awards)    |
| `auth.login_success`          | 30    | Module 2 (identity)  |
| `approval.decision_recorded`  | 26    | Module 5 (approval)  |
| `auth.logout`                 | 18    | Module 2             |
| `approval.workflow_started`   | 17    | Module 5             |
| `document.preview_accessed`   | 16    | Module 6 (documents) |
| `award.created`               | 11    | Module 3             |
| `approval.workflow_approved`  | 8     | Module 5             |
| `document.generated`          | 8     | Module 6             |
| `document.sent_for_signature` | 8     | Module 6             |
| `valuation.started`           | 8     | Module 11 (IFRS 2)   |
| `plan.created`                | 5     | Module 3a            |
| `document.signed`             | 5     | Module 6             |
| `auth.magic_link_sent`        | 4     | Module 2             |
| `beneficiary.created`         | 3     | Module 4             |
| `award.modified`              | 3     | Module 3             |
| `portal.leaver_simulated`     | 3     | Module 8             |
| `beneficiary.invited`         | 2     | Module 4             |
| `exercise.requested`          | 2     | Module 9             |
| `approval.workflow_rejected`  | 2     | Module 5             |
| ...                           | ...   | ...                  |

**Modules couverts** : 9 sur 12 modules livrés (auth, plans, awards, beneficiaries, approval, documents, valuation, exercise, portal).

### 2.3 Dette identifiée — Issue #117 à créer

⚠️ **CRITIQUE** : sur 232 events, seuls **47 events** ont `before_state` ou `after_state` rempli (uniquement `award.status_changed` et `plan.created`).

**Impact pour Module 13** :

- ✅ La spec Q4=a est _techniquement satisfaite_ (table stocke le diff)
- ❌ Les sources actuelles (Module 2, 4, 5, 6, 8, 9, 11) **n'écrivent pas** before/after
- ⚠️ Pour la **démo**, on ne pourra montrer le diff complet que pour `award.status_changed` (43 events)

**Plan d'action** :

- **V1 (démo J4)** : afficher diff quand disponible, fallback "détails non disponibles" sinon
- **V1.1 (post-démo, Issue #117)** : backfill audit logger sur les 8 modules manquants pour systématiquement remplir before/after_state

### 2.4 Mapping event_type → 5 catégories mockup

Heuristique pour B1 (à coder en `apps/web/src/lib/audit/event-categories.ts`) :

```ts
export const EVENT_CATEGORIES = {
  PLANS: ['plan.created', 'plan.modified', 'plan.published', 'plan.archived'],
  SIGNATURES: [
    'document.signed',
    'document.sent_for_signature',
    'document.signature_completed',
    'document.signature_cancelled',
  ],
  MODIFICATIONS: [
    'award.modified',
    'award.status_changed',
    'award.created',
    'award.cancelled',
    'beneficiary.created',
    'beneficiary.updated',
    'beneficiary.invited',
    'approval.workflow_started',
    'approval.workflow_approved',
    'approval.workflow_rejected',
    'approval.decision_recorded',
    'exercise.requested',
    'exercise.processed',
  ],
  EXPORTS_CAC: [
    'export.cac_generated', // À créer en Module 13 B2
    'export.audit_trail_pdf', // À créer en Module 13 B5
    'export.audit_trail_json', // À créer en Module 13 B5
    'export.cap_table_csv', // Module 10 (à brancher)
  ],
  CALCULS_IFRS2: [
    'valuation.started',
    'valuation.completed',
    'valuation.failed',
    'valuation.published',
  ],
  // Catégorie cachée pour events système (pas affichée par défaut)
  AUTRE: [
    'auth.login_success',
    'auth.logout',
    'auth.magic_link_sent',
    'document.preview_accessed',
    'document.generated',
    'portal.leaver_simulated',
  ],
} as const;
```

---

## §3 — Architecture hash chain SHA-256 (Q2=a)

### 3.1 Principe

Une **hash chain** (chaîne de hash) garantit cryptographiquement qu'aucun event historique n'a été modifié, supprimé, ou réordonné.

**Algorithme** :

1. Chaque event `n` calcule un `event_hash` = `SHA-256(event_payload || previous_hash)`
2. Le tout premier event (genesis) utilise un hash initial connu : `SHA-256("CAPIWISE_AUDIT_GENESIS_2024")`
3. Pour vérifier l'intégrité, on recalcule la chaîne depuis genesis et compare

**Vulnérabilité couverte** :

- ❌ Modification d'un event historique → casse la chaîne (le hash ne match plus)
- ❌ Suppression d'un event → casse la chaîne (chain_position discontinue)
- ❌ Insertion d'un event antidaté → casse la chaîne (occurred_at incompatible avec position)

**Vulnérabilité PAS couverte** :

- ⚠️ Un OWNER avec accès DB direct peut recalculer toute la chaîne (mitigation V1.X : ancrage hash quotidien sur blockchain Bitcoin/Ethereum, ou notarial timestamping)

### 3.2 Schéma `event_payload`

Le payload utilisé pour le hash doit être **déterministe** (même input → même output, peu importe l'ordre JSON).

```ts
// Format canonique JSON (ordered keys, no whitespace)
type EventPayload = {
  id: string; // UUID event
  org_id: string | null;
  user_id: string | null;
  user_email: string | null;
  event_type: string;
  resource_type: string | null;
  resource_id: string | null;
  before_state: object | null;
  after_state: object | null;
  metadata: object;
  occurred_at: string; // ISO 8601 UTC
};

// hash = SHA-256(canonicalJSON(payload) || previous_hash)
```

⚠️ **Critique** : l'ordre des clés JSON doit être **trié alphabétiquement** pour garantir la reproductibilité. On utilise `RFC 8785 Canonical JSON Serialization`.

### 3.3 Migration table

Module 13 ajoute **3 colonnes** à la table existante :

```sql
ALTER TABLE public.audit_events
  ADD COLUMN event_hash      text,           -- SHA-256 hex (64 chars)
  ADD COLUMN previous_hash   text,           -- Hash du previous event ou GENESIS
  ADD COLUMN chain_position  bigint;         -- Position absolue dans la chaîne (1, 2, 3...)

-- Index pour vérification rapide
CREATE UNIQUE INDEX idx_audit_events_chain_position
  ON public.audit_events (chain_position)
  WHERE chain_position IS NOT NULL;

CREATE INDEX idx_audit_events_event_hash
  ON public.audit_events (event_hash)
  WHERE event_hash IS NOT NULL;

-- Constraint : chain_position monotone par occurred_at
COMMENT ON COLUMN public.audit_events.chain_position IS
  'Position absolue dans la hash chain. NULL si event pré-Module 13 non encore chained.';
```

⚠️ **Stratégie de chaining initial** :

- **Option A** (retenue) : on chain UNIQUEMENT les events ≥ Module 13 (mark-and-sweep). Genesis = `SHA-256("CAPIWISE_AUDIT_GENESIS_<date_module_13>")`. Events historiques restent avec `chain_position = NULL` mais affichés avec mention "Pré-chaîne (Module 1-12)".
- **Option B** : backfill chain sur les 232 events existants. Plus complet mais nécessite recalcul + migration plus lourde.

→ **Décision V1 = Option A** (rapide, sûr, pas de risque de casser les 232 events existants).  
→ **Option B en dette V1.X** post-démo si client demande "audit total".

### 3.4 RPC PostgreSQL

Deux fonctions critiques :

```sql
-- Hash un event et le lie à la chaîne
CREATE OR REPLACE FUNCTION public.compute_audit_chain_hash(
  p_event_id uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event       audit_events;
  v_previous    audit_events;
  v_payload     text;
  v_hash        text;
  v_genesis     text := encode(digest('CAPIWISE_AUDIT_GENESIS_2026_05', 'sha256'), 'hex');
BEGIN
  -- Charge event courant
  SELECT * INTO v_event FROM audit_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event % not found', p_event_id;
  END IF;

  -- Charge previous event (chain_position - 1)
  SELECT * INTO v_previous
  FROM audit_events
  WHERE chain_position = v_event.chain_position - 1;

  -- Si pas de previous, utiliser genesis
  IF NOT FOUND THEN
    v_payload := jsonb_build_object(
      'id', v_event.id,
      'event_type', v_event.event_type,
      'occurred_at', v_event.occurred_at
      -- ... (canonical JSON, ordered keys)
    )::text;
    v_hash := encode(digest(v_payload || v_genesis, 'sha256'), 'hex');
  ELSE
    v_payload := jsonb_build_object(...)::text;
    v_hash := encode(digest(v_payload || v_previous.event_hash, 'sha256'), 'hex');
  END IF;

  -- Update event with computed hash
  UPDATE audit_events
  SET event_hash = v_hash,
      previous_hash = COALESCE(v_previous.event_hash, v_genesis)
  WHERE id = p_event_id;

  RETURN v_hash;
END;
$$;

-- Vérifie l'intégrité de la chaîne complète
CREATE OR REPLACE FUNCTION public.verify_audit_chain_integrity(
  p_org_id uuid DEFAULT NULL
) RETURNS TABLE(
  total_events    bigint,
  verified_events bigint,
  broken_at       bigint,
  broken_event_id uuid,
  is_intact       boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
-- Itère depuis chain_position = 1, recalcule chaque hash, compare au stocké
-- Retourne is_intact = true si toute la chaîne match
-- ... (impl complète en B1)
$$;
```

### 3.5 Trigger d'auto-chaining

Pour que **chaque nouvel event** soit automatiquement intégré à la chaîne :

```sql
CREATE OR REPLACE FUNCTION public.trigger_chain_audit_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_max_pos bigint;
BEGIN
  -- Assigner chain_position (suivant)
  SELECT COALESCE(MAX(chain_position), 0) + 1 INTO v_max_pos FROM audit_events;
  NEW.chain_position := v_max_pos;

  -- Calculer hash (NEW row)
  -- Note : on ne peut pas appeler compute_audit_chain_hash ici (NEW pas encore inséré)
  -- → on chain via trigger AFTER INSERT (pas BEFORE)

  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_events_assign_chain_position
  BEFORE INSERT ON audit_events
  FOR EACH ROW
  WHEN (NEW.chain_position IS NULL)
  EXECUTE FUNCTION trigger_chain_audit_event();

CREATE OR REPLACE FUNCTION public.trigger_compute_chain_hash()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM compute_audit_chain_hash(NEW.id);
  RETURN NULL;  -- AFTER trigger
END;
$$;

CREATE TRIGGER audit_events_compute_hash
  AFTER INSERT ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION trigger_compute_chain_hash();
```

⚠️ **Critique RLS** : ces triggers s'exécutent en `SECURITY DEFINER` côté DB, contournent RLS pour pouvoir lire le previous_hash. Sécurité maintenue car ils ne font que **calculer**, pas exposer.

---

## §4 — Sources des events (Q3=c)

### 4.1 Audit logger existant

**Module 1 a livré** : `apps/web/src/lib/audit/logger.ts` (à confirmer en B0 inventory).

Pattern attendu :

```ts
// Helper appelé depuis les Server Actions
export async function logAuditEvent({
  orgId,
  userId,
  userEmail,
  eventType,
  resourceType,
  resourceId,
  beforeState,
  afterState,
  metadata,
}: AuditEventInput): Promise<void> {
  const supabase = await createServerClient();

  await supabase.from('audit_events').insert({
    org_id: orgId,
    user_id: userId,
    user_email: userEmail,
    event_type: eventType,
    resource_type: resourceType,
    resource_id: resourceId,
    before_state: beforeState,
    after_state: afterState,
    metadata: metadata ?? {},
    ip_address: getClientIp(),
    user_agent: getUserAgent(),
    request_id: getRequestId(),
  });

  // Le trigger DB s'occupe du chain_position + event_hash
}
```

### 4.2 Stratégie événementielle V1

**Module 13 ne touche PAS aux sources existantes** (déjà actives sur 9 modules). Il :

1. Ajoute des **triggers DB** sur 3 tables critiques pour catch les modifications hors SAs (cas edge)
2. Ajoute 3 nouveaux events spécifiques Module 13 :
   - `export.audit_trail_pdf` (en B5)
   - `export.audit_trail_json` (en B5)
   - `audit.integrity_verified` (en B4)

### 4.3 Triggers DB additionnels (B1)

Pour les modifications faites **directement en DB** (CSV import, MCP, ou autre), Module 13 ajoute des triggers de safety :

```sql
-- Trigger sur la table awards pour catch toute modification non-SA
CREATE OR REPLACE FUNCTION trigger_audit_awards_modified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  -- Skip si l'event est déjà en cours de logging (évite récursion)
  IF current_setting('audit.skip_trigger', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Detect changement effectif (avant != après sur fields métier)
  IF (OLD.units, OLD.strike_price, OLD.status, OLD.vesting_schedule)
     IS DISTINCT FROM
     (NEW.units, NEW.strike_price, NEW.status, NEW.vesting_schedule)
  THEN
    INSERT INTO audit_events (
      org_id, event_type, resource_type, resource_id,
      before_state, after_state, metadata
    ) VALUES (
      NEW.org_id,
      'award.modified',
      'award',
      NEW.id,
      to_jsonb(OLD),
      to_jsonb(NEW),
      jsonb_build_object('source', 'db_trigger')
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_awards_modified
  AFTER UPDATE ON awards
  FOR EACH ROW
  EXECUTE FUNCTION trigger_audit_awards_modified();
```

**Tables avec triggers similaires** (B1) :

- `awards` (modifications)
- `plans` (modifications)
- `beneficiaries` (modifications)

⚠️ **Attention récursion** : le `audit.skip_trigger = true` est un setting per-transaction. Les SAs doivent le set avant insert pour éviter double-logging.

---

## §5 — Server Actions + queries (B2)

### 5.1 Queries (read)

`apps/web/src/lib/audit/queries.ts` :

```ts
import { createServerClient } from '@/lib/supabase/server';
import type { AuditEvent, AuditCategory } from '@/lib/audit/types';

export async function fetchAuditEvents(params: {
  orgId: string;
  category?: AuditCategory;
  fromDate?: Date;
  toDate?: Date;
  actorId?: string;
  resourceType?: string;
  limit?: number;
  offset?: number;
}): Promise<{ events: AuditEvent[]; total: number }> {
  const supabase = await createServerClient();

  let query = supabase
    .from('audit_events')
    .select('*', { count: 'exact' })
    .eq('org_id', params.orgId)
    .order('chain_position', { ascending: false, nullsFirst: false })
    .order('occurred_at', { ascending: false });

  if (params.category) {
    const eventTypes = EVENT_CATEGORIES[params.category];
    query = query.in('event_type', eventTypes);
  }

  if (params.fromDate) {
    query = query.gte('occurred_at', params.fromDate.toISOString());
  }
  if (params.toDate) {
    query = query.lte('occurred_at', params.toDate.toISOString());
  }
  if (params.actorId) {
    query = query.eq('user_id', params.actorId);
  }
  if (params.resourceType) {
    query = query.eq('resource_type', params.resourceType);
  }

  query = query.range(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 50) - 1);

  const { data, count, error } = await query;
  if (error) throw error;

  return { events: data ?? [], total: count ?? 0 };
}

export async function fetchAuditCategoryCounts(
  orgId: string,
): Promise<Record<AuditCategory, number>> {
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('audit_events')
    .select('event_type')
    .eq('org_id', orgId);

  if (error) throw error;

  const counts: Record<AuditCategory, number> = {
    PLANS: 0,
    SIGNATURES: 0,
    MODIFICATIONS: 0,
    EXPORTS_CAC: 0,
    CALCULS_IFRS2: 0,
    AUTRE: 0,
  };

  for (const { event_type } of data ?? []) {
    for (const [cat, types] of Object.entries(EVENT_CATEGORIES)) {
      if ((types as readonly string[]).includes(event_type)) {
        counts[cat as AuditCategory] += 1;
        break;
      }
    }
  }

  return counts;
}

export async function verifyChainIntegrity(orgId: string): Promise<{
  totalEvents: number;
  verifiedEvents: number;
  isIntact: boolean;
  brokenAt: number | null;
  brokenEventId: string | null;
}> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('verify_audit_chain_integrity', {
    p_org_id: orgId,
  });
  if (error) throw error;
  return data;
}
```

### 5.2 Server Actions (mutations)

`apps/web/src/app/(dashboard)/dashboard/audit/actions.ts` :

```ts
'use server';

import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit/logger';
import { renderAuditPdf, renderAuditJson } from '@/lib/audit/exports';

const ExportSchema = z.object({
  format: z.enum(['pdf', 'json']),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
  category: z
    .enum(['PLANS', 'SIGNATURES', 'MODIFICATIONS', 'EXPORTS_CAC', 'CALCULS_IFRS2', 'AUTRE'])
    .optional(),
});

export async function exportAuditTrail(
  input: z.infer<typeof ExportSchema>,
): Promise<{ downloadUrl: string }> {
  const parsed = ExportSchema.parse(input);

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Permission check : ADMIN_FINANCE ou OWNER seulement
  const hasPermission = await checkPermission(user.id, 'AUDIT_TRAIL_EXPORT');
  if (!hasPermission) throw new Error('Forbidden');

  // Fetch events
  const { events } = await fetchAuditEvents({
    orgId: user.user_metadata.org_id,
    category: parsed.category,
    fromDate: parsed.fromDate,
    toDate: parsed.toDate,
    limit: 10000, // Cap V1
  });

  // Verify chain (inclus dans export)
  const integrity = await verifyChainIntegrity(user.user_metadata.org_id);

  // Generate file
  let buffer: Buffer;
  let mimeType: string;
  let filename: string;

  if (parsed.format === 'pdf') {
    buffer = await renderAuditPdf({ events, integrity, user, range: parsed });
    mimeType = 'application/pdf';
    filename = `capiwise-audit-${parsed.fromDate.toISOString().slice(0, 10)}-${parsed.toDate.toISOString().slice(0, 10)}.pdf`;
  } else {
    buffer = await renderAuditJson({ events, integrity, user, range: parsed });
    mimeType = 'application/json';
    filename = `capiwise-audit-${parsed.fromDate.toISOString().slice(0, 10)}-${parsed.toDate.toISOString().slice(0, 10)}.json`;
  }

  // Upload to storage
  const path = `audit-exports/${user.user_metadata.org_id}/${filename}`;
  const { error: uploadError } = await supabase.storage
    .from('exports')
    .upload(path, buffer, { contentType: mimeType });
  if (uploadError) throw uploadError;

  // Log the export itself (méta-event)
  await logAuditEvent({
    orgId: user.user_metadata.org_id,
    userId: user.id,
    userEmail: user.email,
    eventType: parsed.format === 'pdf' ? 'export.audit_trail_pdf' : 'export.audit_trail_json',
    resourceType: 'audit_export',
    resourceId: null,
    metadata: {
      from_date: parsed.fromDate.toISOString(),
      to_date: parsed.toDate.toISOString(),
      category: parsed.category,
      event_count: events.length,
      file_path: path,
    },
  });

  // Return signed URL
  const { data: urlData } = await supabase.storage.from('exports').createSignedUrl(path, 60 * 5); // 5 min

  return { downloadUrl: urlData?.signedUrl ?? '' };
}
```

### 5.3 Permission `AUDIT_TRAIL_EXPORT`

Migration B1 ajoute :

```sql
-- Permission catalog
INSERT INTO permissions_catalog (code, label, description, category)
VALUES (
  'AUDIT_TRAIL_EXPORT',
  'Exporter le journal d''audit',
  'Permet de télécharger l''audit trail en PDF ou JSON signé pour auditeur externe',
  'AUDIT'
) ON CONFLICT (code) DO NOTHING;

-- Default assignment : OWNER + ADMIN_FINANCE
INSERT INTO role_permissions (role_code, permission_code)
VALUES
  ('OWNER', 'AUDIT_TRAIL_EXPORT'),
  ('ADMIN_FINANCE', 'AUDIT_TRAIL_EXPORT')
ON CONFLICT DO NOTHING;
```

---

## §6 — UI page `/dashboard/audit` (B3)

### 6.1 Layout général

Pattern Editorial Finance, structure verticale :

```
┌──────────────────────────────────────────────────────────────────┐
│  AUDIT TRAIL                                                      │
│                                                                   │
│  Le journal des décisions, sans détour.            [Δ Q1 2026]   │
│  Chaque action signée, horodatée, vérifiable.                    │
│  ─────────                                                        │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ SHA-256 · genesis 05.05.2026 · CHAÎNE INTÈGRE ✓         │    │
│  │ 232 events vérifiés · dernière vérification il y a 2 min │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐      │
│  │  PLANS   │ SIGNATURES│ MODIF.  │EXPORTS CAC│CALCULS  │      │
│  │   47     │    86    │    31    │    17    │    29    │      │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘      │
│                                                                   │
│  [Filtres : Type / Période / Acteur / Ressource] [Export ▼]     │
│                                                                   │
│  ─────────────────                                                │
│  TIMELINE                                                         │
│  ─────────────────                                                │
│                                                                   │
│  • 04.05.2026 18:47    [📝 modif]   David S.                    │
│    Award #5a65cd57 — strike: 288€ → 312€                         │
│    hash: a3f9...e21b · chain pos #232                            │
│                                                                   │
│  • 04.05.2026 16:49    [📊 calcul]  Système                     │
│    Valuation IFRS 2 démarré · Plan BSPCE 2025-Q4                 │
│    hash: 7c4a...0f88 · chain pos #231                            │
│                                                                   │
│  ...                                                              │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 Composants à créer

**Tous nouveaux** dans `apps/web/src/components/audit/` :

| Composant                  | LOC estim. | Rôle                                           |
| -------------------------- | ---------- | ---------------------------------------------- |
| `AuditPageHeader.tsx`      | 80         | Hero italic + subtitle + Δ filter              |
| `ChainIntegrityBadge.tsx`  | 60         | Badge SHA-256 + "CHAÎNE INTÈGRE" + last verify |
| `AuditCategoryKpis.tsx`    | 100        | 5 KPI tiles avec couleurs DS V1                |
| `AuditTimeline.tsx`        | 200        | Liste paginée des events                       |
| `AuditEventCard.tsx`       | 120        | Card unitaire (icone + acteur + diff + hash)   |
| `AuditEventDiff.tsx`       | 80         | Affichage diff JSONB before/after (collapsed)  |
| `AuditFiltersBar.tsx`      | 150        | Filtres type + période + acteur                |
| `AuditExportButton.tsx`    | 90         | Dropdown PDF/JSON avec dialog confirm          |
| `IntegrityCheckDialog.tsx` | 100        | Dialog "Vérifier la chaîne" avec progress      |

**Total nouveau code UI** : ~980 LOC (estim.)

### 6.3 AuditEventCard — design détail

Le composant central de la timeline. Pattern :

```tsx
<div className="relative border-l-2 border-[--brass-300] pb-6 pl-6">
  {/* Timeline dot */}
  <div className="absolute -left-[7px] top-0 h-3 w-3 rounded-full bg-[--brass-500]" />

  {/* Header: timestamp + acteur + type */}
  <div className="flex items-baseline gap-3 text-sm">
    <span className="font-mono tabular-nums text-[--ink-600]">04.05.2026 18:47</span>
    <CategoryIcon category={category} />
    <span className="font-medium text-[--ink-900]">{actorName}</span>
  </div>

  {/* Body: description event */}
  <div className="mt-1 text-base text-[--ink-800]">{eventDescription}</div>

  {/* Footer: hash tronqué + chain position */}
  <div className="mt-2 flex items-center gap-3 font-mono text-xs text-[--ink-500]">
    <span>
      hash: {event_hash.slice(0, 4)}...{event_hash.slice(-4)}
    </span>
    <span>·</span>
    <span>chain pos #{chain_position}</span>

    {/* Bouton diff (si before/after disponibles) */}
    {hasDiff && (
      <button onClick={toggleDiff} className="text-[--brass-500] hover:underline">
        {diffOpen ? 'Masquer le diff' : 'Voir le diff'}
      </button>
    )}
  </div>

  {/* Diff collapsed by default */}
  {diffOpen && hasDiff && <AuditEventDiff before={before_state} after={after_state} />}
</div>
```

### 6.4 AuditEventDiff — affichage JSONB diff

Format choisi : **side-by-side** avec coloration syntax (rouge supprimé / vert ajouté / orange modifié).

Library : `react-diff-viewer-continued` (~25KB, déjà compatible Next.js 16).

Si non disponible, fallback simple :

```tsx
function SimpleDiff({ before, after }: { before: object; after: object }) {
  const beforeKeys = Object.keys(before ?? {});
  const afterKeys = Object.keys(after ?? {});
  const allKeys = new Set([...beforeKeys, ...afterKeys]);

  return (
    <div className="mt-3 rounded-lg bg-[--paper-100] p-4 font-mono text-xs">
      {[...allKeys].map((key) => {
        const b = before?.[key];
        const a = after?.[key];
        if (b === a) return null;
        return (
          <div key={key} className="grid grid-cols-[120px_1fr_1fr] gap-3">
            <span className="text-[--ink-500]">{key}</span>
            <span className="text-red-600 line-through">{JSON.stringify(b)}</span>
            <span className="text-green-700">{JSON.stringify(a)}</span>
          </div>
        );
      })}
    </div>
  );
}
```

### 6.5 ChainIntegrityBadge

```tsx
<div className="flex items-center gap-3 rounded-lg border border-[--brass-300] bg-[--paper-50] px-4 py-3">
  <ShieldCheck className="size-5 text-[--brass-500]" />
  <div className="flex-1">
    <div className="font-mono text-xs text-[--ink-700]">
      SHA-256 · genesis {genesisDate} ·
      <span className="ml-1 font-semibold text-[--brass-600]">CHAÎNE INTÈGRE ✓</span>
    </div>
    <div className="text-xs text-[--ink-500]">
      {totalEvents} events vérifiés · dernière vérification {timeAgo}
    </div>
  </div>
  <button
    onClick={() => openIntegrityDialog()}
    className="text-xs text-[--brass-500] hover:underline"
  >
    Vérifier maintenant
  </button>
</div>
```

Si chaîne brisée :

```tsx
<div className="flex items-center gap-3 rounded-lg border border-red-400 bg-red-50 px-4 py-3">
  <AlertTriangle className="size-5 text-red-600" />
  <div className="flex-1">
    <div className="font-mono text-xs font-semibold text-red-700">CHAÎNE COMPROMISE ⚠</div>
    <div className="text-xs text-red-600">
      Rupture détectée à la position #{brokenAt}. Contactez votre auditeur.
    </div>
  </div>
</div>
```

---

## §7 — Filters + Export (B4-B5)

### 7.1 Filters

`AuditFiltersBar.tsx` permet de filtrer la timeline par :

- **Type** (select) : All / Plans / Signatures / Modifications / Exports CAC / Calculs IFRS 2 / Autre
- **Période** (date range picker) : 7j / 30j / 90j / Q1 / Q2 / Q3 / Q4 / Custom
- **Acteur** (combobox) : All users / specific user (org members + system events)
- **Ressource** (combobox) : All / Plan / Award / Beneficiary / Document / Valuation

Filtres sont **URL params** pour partage de lien (`?category=PLANS&from=2026-01-01&to=2026-03-31`).

### 7.2 Export PDF

Génération via `pdf-lib` (déjà utilisé Module 6) :

```ts
// apps/web/src/lib/audit/exports/pdf.ts

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export async function renderAuditPdf({
  events,
  integrity,
  user,
  range,
}: AuditExportParams): Promise<Buffer> {
  const pdf = await PDFDocument.create();

  // Cover page
  const cover = pdf.addPage([595, 842]); // A4

  cover.drawText('AUDIT TRAIL', {
    x: 50,
    y: 770,
    size: 28,
    font: await pdf.embedFont(StandardFonts.HelveticaBold),
    color: rgb(0.72, 0.53, 0.36), // brass-500
  });

  cover.drawText(`Période : ${formatDate(range.fromDate)} → ${formatDate(range.toDate)}`, {
    x: 50,
    y: 730,
    size: 12,
  });

  // Chain integrity banner
  cover.drawRectangle({
    x: 50,
    y: 650,
    width: 495,
    height: 60,
    borderColor: rgb(0.72, 0.53, 0.36),
    borderWidth: 1,
  });
  cover.drawText('CHAÎNE INTÈGRE ✓', { x: 60, y: 685, size: 11, color: rgb(0, 0.5, 0) });
  cover.drawText(`SHA-256 · ${integrity.totalEvents} events vérifiés`, { x: 60, y: 665, size: 9 });

  // Watermark "AUDIT — usage externe"
  cover.drawText('AUDIT — usage externe', {
    x: 100,
    y: 400,
    size: 60,
    color: rgb(0.85, 0.85, 0.85),
    rotate: { type: 'degrees', angle: 45 },
    opacity: 0.3,
  });

  // Pages events
  for (const evt of events) {
    // Une page par event ou pagination intelligente
    // ... (impl B5)
  }

  // Last page : signature org + hash final

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
```

⚠️ **V1 simplification** : on génère un PDF basique avec cover + liste events texte. Le **vrai watermark E&Y custom** est différé en V1.X (Issue #118).

### 7.3 Export JSON signé

Format :

```json
{
  "format_version": "1.0",
  "generated_at": "2026-05-05T14:30:00Z",
  "generated_by": {
    "user_id": "uuid",
    "user_email": "david@capiwise.fr",
    "org_id": "uuid",
    "org_name": "Capiwise SAS"
  },
  "range": {
    "from": "2026-01-01T00:00:00Z",
    "to": "2026-03-31T23:59:59Z"
  },
  "integrity": {
    "algorithm": "SHA-256",
    "genesis_hash": "abc123...",
    "total_events": 232,
    "verified_events": 232,
    "is_intact": true,
    "broken_at": null
  },
  "events": [
    {
      "id": "uuid",
      "chain_position": 1,
      "occurred_at": "2026-04-27T22:01:56Z",
      "event_type": "auth.login_success",
      "user_email": "david@capiwise.fr",
      "before_state": null,
      "after_state": null,
      "metadata": {...},
      "event_hash": "...",
      "previous_hash": "..."
    },
    ...
  ],
  "export_signature": {
    "algorithm": "SHA-256",
    "value": "hash_du_export_complet"
  }
}
```

L'`export_signature` permet à l'auditeur de **vérifier que l'export n'a pas été modifié** après téléchargement.

---

## §8 — Tests + critères de validation

### 8.1 Tests unitaires

`apps/web/src/lib/audit/__tests__/` :

- `chain-hash.test.ts` (~15 tests)
  - Hash genesis correct
  - Hash chained correct (event N + event N-1)
  - Hash deterministic (même input = même output)
  - Canonical JSON ordering
  - Detection de modification d'event historique
- `event-categories.test.ts` (~10 tests)
  - Mapping correct event_type → category
  - Catégorie AUTRE pour events non mappés
- `queries.test.ts` (~8 tests)
  - fetchAuditEvents avec filters
  - fetchAuditCategoryCounts agrégation
  - Pagination
- `exports.test.ts` (~5 tests)
  - JSON export structure valide
  - JSON signature reproducible
  - PDF génération (smoke test, pas pixel-perfect)

**Total target** : ~38 tests unitaires nouveaux.

### 8.2 Tests E2E

`apps/web/e2e/audit-trail.spec.ts` :

- Page `/dashboard/audit` accessible avec rôle OWNER
- Page bloquée pour rôle BENEFICIARY (403)
- KPI tiles affichent counts corrects
- Filter "Plans" réduit la timeline aux events plan.\*
- Filter période fonctionne
- Bouton "Vérifier l'intégrité" ouvre dialog + check passe
- Export PDF download fichier valide
- Export JSON download fichier avec signature

**Total target** : ~6 tests E2E.

### 8.3 Critères de validation démo J4

- ✅ Page `/dashboard/audit` rend pixel-proche du mockup (validation visuelle live)
- ✅ Hash chain SHA-256 fonctionne (au moins 5 events nouveaux post-Module 13 chained)
- ✅ "CHAÎNE INTÈGRE ✓" badge vert affiché
- ✅ 5 KPI tiles avec counts corrects
- ✅ Timeline scrollable avec ≥20 events visibles
- ✅ Au moins 1 event avec diff before/after expandable
- ✅ Export JSON download fonctionnel (PDF V1 simple OK aussi)
- ✅ Tests : 1083 + ~40 nouveaux = ~1125 verts
- ✅ Lint + typecheck OK
- ✅ ESLint rule no-restricted-syntax ne fire pas (pas de hsl(var()) introduit)

---

## §9 — Phases d'implémentation

### B0 — Spec + inventaire (cette spec, 1h) ✅

- [x] Décisions Q1-Q5 figées
- [x] Découverte audit_events existante (232 events)
- [x] Spec rédigée
- [ ] User valide la spec
- [ ] Branche `feat/module-13-audit-trail` créée

### B1 — DB : hash chain + triggers (4h)

**Migrations** :

- `0009X_module_13_audit_chain_columns.sql` (3 colonnes hash)
- `0009X+1_module_13_audit_chain_rpc.sql` (compute_hash + verify_chain RPC)
- `0009X+2_module_13_audit_triggers.sql` (auto-chaining + DB triggers awards/plans/beneficiaries)
- `0009X+3_module_13_audit_export_permission.sql` (AUDIT_TRAIL_EXPORT permission)

**RLS** :

- `audit_events` : SELECT pour OWNER, ADMIN_FINANCE, ADMIN_HR de l'org. INSERT via service-role uniquement (déjà en place Module 1, à confirmer).

**Tests** :

- 5 tests SQL via pgTAP ou tests Vitest avec connexion DB (chain integrity, hash determinism)

**Critère B1** : RPC `compute_audit_chain_hash` + `verify_audit_chain_integrity` fonctionnels en MCP, 0 régression sur les 232 events historiques (tous restent avec chain_position NULL = OK).

### B2 — Server Actions + queries (3h)

- `apps/web/src/lib/audit/types.ts` (types AuditEvent, AuditCategory, etc.)
- `apps/web/src/lib/audit/event-categories.ts` (mapping)
- `apps/web/src/lib/audit/queries.ts` (fetchAuditEvents + fetchCategoryCounts + verifyChainIntegrity)
- `apps/web/src/lib/audit/logger.ts` (helper SA — peut exister déjà Module 1)
- `apps/web/src/app/(dashboard)/dashboard/audit/actions.ts` (exportAuditTrail SA)

**Tests** : ~20 tests unitaires.

**Critère B2** : queries retournent les bons events filtrés en sandbox local, integrity check passe.

### B3 — UI page `/dashboard/audit` (4h)

- `apps/web/src/app/(dashboard)/dashboard/audit/page.tsx`
- Composants `apps/web/src/components/audit/*.tsx` (9 nouveaux)

**Validation visuelle live** : screenshot comparé au mockup page 3.

**Critère B3** : page visible, KPIs affichés, timeline scrollable, badge intégrité vert.

### B4 — Filters + integrity check UI (2h)

- `AuditFiltersBar.tsx` opérationnel (URL params)
- `IntegrityCheckDialog.tsx` opérationnel (lance verify_audit_chain_integrity RPC)

**Critère B4** : filtres fonctionnels, integrity check affiche progress + résultat.

### B5 — Export PDF + JSON (3h)

- `apps/web/src/lib/audit/exports/pdf.ts` (V1 simple, pas watermark E&Y)
- `apps/web/src/lib/audit/exports/json.ts` (avec signature SHA-256 export complet)
- `AuditExportButton.tsx` opérationnel

**Critère B5** : PDF + JSON téléchargeables, JSON signé reproductible.

### B6 — Tests E2E + closure (2h)

- 6 tests E2E Playwright
- Validation visuelle live finale (screenshot vs mockup)
- Doc README dans `docs/MODULE_13_AUDIT_TRAIL.md` (cette spec) committée
- 1083 + ~40 = ~1125 tests verts
- PR finale créée

**Critère B6** : tests verts, doc committée, PR mergeable.

### Total temps : 18-19h sur 3 jours (très réaliste)

---

## §10 — Items différés V1.X (post-démo)

| ID   | Description                                                                                                             | Priorité |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | -------- |
| #117 | Backfill before/after_state pour 8 modules sources (auth, approval, document, valuation, beneficiary, exercise, portal) | HIGH     |
| #118 | Watermark E&Y custom sur PDF export                                                                                     | MEDIUM   |
| #119 | Backfill chain_position sur 232 events historiques (Option B)                                                           | MEDIUM   |
| #120 | Ancrage hash quotidien sur blockchain Bitcoin/Ethereum (timestamping notarial)                                          | LOW      |
| #121 | Real-time updates : nouveau event → toast + scroll auto en haut de la timeline                                          | LOW      |
| #122 | Recherche full-text dans les diffs (PostgreSQL tsvector)                                                                | LOW      |
| #123 | Audit trail des audit trails (méta-audit) — log qui consulte le journal                                                 | MEDIUM   |
| #124 | Webhooks pour intégration SIEM (Splunk, Datadog)                                                                        | LOW      |

---

## §11 — Annexe : pattern recommandé pour ClaudeCode

### Démarrage B1

ClaudeCode lit cette spec, puis :

```
1. git checkout master && git pull
2. git checkout -b feat/module-13-audit-trail
3. Inventory existant :
   - apps/web/src/lib/audit/* (logger Module 1)
   - Vérifier audit_events RLS (MCP)
4. Apply migration B1 via MCP apply_migration (ne PAS apply localement, cloud uniquement)
5. Vérifier compute_audit_chain_hash sur 1 event test (insertion + check chain_position + event_hash)
6. Tests SQL (5)
7. Commit B1 : "feat(module-13): add hash chain SHA-256 columns + RPC (B1)"
```

### Stop checkpoints

Après chaque phase B1-B6, ClaudeCode reporte :

- ✅ ce qui est fait
- ❌ ce qui est cassé / bloqué
- ⚠️ écarts par rapport à la spec (et justification)
- ⏸️ STOP avant la phase suivante, attend validation David

Ce protocole **strict** a déjà permis Module 11 + Module 12 + Module 12.5 sans accroc.

---

## §12 — Mockup référence (rappel)

```
┌──────────────────────────────────────────────────────────────────┐
│  AUDIT TRAIL · CAPIWISE                                           │
│                                                                   │
│  Le journal des décisions, sans détour.                          │
│  ─────────                                                        │
│  Chaque action signée, horodatée, vérifiable.                    │
│                                                                   │
│  ╔═════════════════════════════════════════════════════════╗    │
│  ║ 🛡 SHA-256 · genesis 01.01.2024 · CHAÎNE INTÈGRE ✓     ║    │
│  ║ 232 events vérifiés · dernière vérification il y a 2 min║    │
│  ╚═════════════════════════════════════════════════════════╝    │
│                                                                   │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐      │
│  │  PLANS   │ SIGNATURES│ MODIF.  │EXPORTS CAC│CALCULS  │      │
│  │   47     │    86    │    31    │    17    │    29    │      │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘      │
│                                                                   │
│  [Type ▼] [Période ▼] [Acteur ▼] [Ressource ▼]    [Export ▼]   │
│                                                                   │
│  ─── TIMELINE ───                                                 │
│                                                                   │
│  ●  04.05.2026 18:47    📝 modif      David S.                  │
│  │  Award #5a65cd57 — strike: 288€ → 312€                        │
│  │  hash: a3f9...e21b · chain pos #232          [Voir le diff]   │
│  │                                                                │
│  ●  04.05.2026 16:49    📊 calcul     Système                   │
│  │  Valuation IFRS 2 démarré · Plan BSPCE 2025-Q4                │
│  │  hash: 7c4a...0f88 · chain pos #231                            │
│  │                                                                │
│  ●  03.05.2026 17:06    ✓ approval    Marie C.                  │
│  │  Approval workflow approuvé · Award FND-001                    │
│  │  hash: 2e7d...5b34 · chain pos #230          [Voir le diff]   │
│  ...                                                              │
└──────────────────────────────────────────────────────────────────┘
```

---

**FIN DE LA SPEC** — ~700 lignes, prêt pour B1 implementation.
