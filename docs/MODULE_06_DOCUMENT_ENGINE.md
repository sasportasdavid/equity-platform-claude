# MODULE 6 — DOCUMENT ENGINE & SIGNATURES

> **Projet :** Equity Platform (Capiwise)
> **Version :** 1.0
> **Date :** Avril 2026
> **Prérequis :** Modules 1, 2, 3a, 3b, 4 et 5 terminés et validés
> **Audience :** Claude Code (développement)

---

## 0. CONTEXTE & OBJECTIFS

### 0.1 Mission du module

Implémenter le **moteur de documents** qui transforme les awards `APPROVED` en awards `GRANTED` via **génération automatique de PDF + signature électronique Yousign**. C'est le module qui rend le SaaS utilisable en prod : sans signature légale, un award reste une intention.

### 0.2 Périmètre exact

**Inclus dans ce module :**

- Tables `document_templates`, `document_instances`, `signature_requests`, `signers` (préfigurées Module 1, à finaliser)
- Bucket Supabase Storage `documents` avec RLS
- Génération PDF via `@react-pdf/renderer` côté serveur
- 3 templates V1 : BSPCE attribution, AGA attribution, Stock Options grant letter
- Système de variables substitution depuis award + plan + beneficiary + org
- Server Actions : générer doc, prévisualiser, envoyer pour signature, voider
- Intégration Yousign V3 (créer signature request, gérer signers, fetch status)
- Webhook Yousign (Edge Function Supabase) pour mise à jour status
- Page admin `/dashboard/awards/[id]/documents` (preview + send + status)
- Hook avec Module 5 : quand award → APPROVED, option "générer + envoyer pour signature"
- Hook au webhook : signature complète → award → GRANTED automatique
- Compliance V1 : 3 règles (signataires complets, FMV récente, document non périmé)
- Audit events sur génération + envoi + webhooks reçus

**Exclus (modules ultérieurs) :**

- Templates 6+ (BSA, RSU, Phantom, BCE, BSAR, AGAr) → V2 ou Module dédié
- Editeur de templates UI (TipTap WYSIWYG) → V2 — V1 = templates en code, modifiables uniquement par dev
- Templates personnalisés par org → V2
- Resend templates email pour notifier signataires (Module 7) — V1 utilise les emails Yousign hosted natifs
- Multi-langue (EN/DE) → V2 (V1 = FR uniquement)
- Versioning des templates (re-edit history) → V2
- Signature qualifiée eIDAS niveau 3 (carte d'identité) → V2 (V1 = niveau 2 simple electronic signature)
- Documents pour exercise (Module 9) — schéma compatible mais hook côté Module 9
- Documents board resolution / plan rules (juste award letters en V1)

### 0.3 Dépendances

- Module 1 : tables `document_templates`, `document_instances`, `signature_requests`, `signers` préfigurées
- Module 3b : awards.status + transition `APPROVED → PENDING_SIGNATURE → GRANTED`
- Module 4 : beneficiaries.email + full_name pour signatures
- Module 5 : hook côté approveDecision final pour déclencher génération automatique
- Yousign API V3 : sandbox d'abord, prod ensuite

### 0.4 Référence

- MODULE_01_FOUNDATION sections 4.7 (tables documents+signatures)
- MODULE_03B_AWARDS_LIFECYCLE section 2 (state machine : APPROVED, PENDING_SIGNATURE, GRANTED, REFUSED)
- MODULE_05_APPROVAL_ENGINE section 4 (hook après approveDecision final)

---

## 1. ARCHITECTURE GÉNÉRALE

### 1.1 Vue d'ensemble du flux

```
┌─────────────────────────────────────────────────────────────────────┐
│                  AWARD APPROVED (Module 5)                          │
│   Workflow d'approbation OK → award.status = APPROVED               │
│   Hook : génération auto si plan.auto_generate_document=true        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│         GÉNÉRATION DOCUMENT (Server Action)                         │
│   1. Charge le template selon plan_type (BSPCE/AGA/SO)             │
│   2. Charge le contexte (award + plan + beneficiary + org)         │
│   3. Render PDF via react-pdf serveur                               │
│   4. Upload vers Supabase Storage (bucket 'documents')              │
│   5. Insert document_instance (status='GENERATED')                  │
│   6. Calcule SHA-256 hash → rendered_pdf_hash (intégrité)          │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│           ENVOI POUR SIGNATURE (Server Action)                      │
│   Admin clique "Envoyer pour signature"                             │
│   1. Crée signature_request en DB (status='CREATED')               │
│   2. Insert signers (1 ou 2 : bénéficiaire + repr. société)        │
│   3. Appel Yousign V3 API : create signature_request               │
│   4. Yousign renvoie procedure_id + sign_urls                      │
│   5. Update DB avec yousign_procedure_id                            │
│   6. Activate signature_request → Yousign envoie les emails        │
│   7. award.status passe à PENDING_SIGNATURE                         │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│           SIGNATURE WORKFLOW (Yousign hosted)                       │
│   - Bénéficiaire reçoit email Yousign                               │
│   - Clique → page Yousign hosted                                    │
│   - Identifie via SMS / email                                       │
│   - Signe                                                           │
│   - Webhook Yousign → notre Edge Function                           │
│     * signer_request.viewed → update signers.viewed_at              │
│     * signer_request.signed → update signers.signed_at              │
│     * signature_request.completed → update sig_request + award      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│           SIGNATURE COMPLÈTE (Webhook Edge Function)                │
│   Tous les signers SIGNED → signature_request.status='COMPLETED'    │
│   Hook : award.status passe à GRANTED                               │
│   Download proof certificate Yousign → upload Storage               │
│   Audit events : document.signed, award.granted                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Décisions structurantes

| Décision                     | Choix retenu                                                            | Justification                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Génération PDF**           | `@react-pdf/renderer` côté Server Action                                | Léger (~10 MB), composants React typés, pas de Chromium en prod. Limite : pas tout le CSS HTML mais OK pour docs légaux structurés. |
| **Stockage**                 | Supabase Storage bucket `documents`                                     | Cohérent stack, RLS native, URLs signées, versioning natif.                                                                         |
| **Templates V1**             | 3 (BSPCE + AGA + Stock Options)                                         | Couvre ~80% du marché FR. Code-defined (pas d'éditeur WYSIWYG V1).                                                                  |
| **Yousign API**              | V3 (REST, JSON) avec auth API key                                       | API moderne, webhooks fiables. V2 deprecated.                                                                                       |
| **Signature method**         | SIMPLE_ELECTRONIC niveau 2 (email + SMS OTP)                            | Suffisant légal FR pour BSPCE/AGA. Niveau qualifié = V2 (carte ID).                                                                 |
| **Webhook handling**         | Edge Function Supabase (Deno)                                           | Latence faible, HMAC validation, isolé du Next.js.                                                                                  |
| **Signers V1**               | 1 ou 2 max : bénéficiaire (toujours) + représentant société (optionnel) | Couvre 95% des cas. Multi-signataires (board) = V2.                                                                                 |
| **Order signing**            | SEQUENTIAL (bénéficiaire d'abord, puis société) ou PARALLEL             | Configurable par template. SEQUENTIAL recommandé V1.                                                                                |
| **Préview**                  | iframe avec URL signée Storage (1h validity)                            | Pas de re-render côté client. Le PDF de preview = le PDF final.                                                                     |
| **Versioning documents**     | document_instances.template_version snapshot                            | Si template change, anciens docs gardent leur version. Pas de re-generation.                                                        |
| **Signed PDF**               | Yousign retourne le PDF signé final + certificat de preuve              | On stocke les 2 dans Storage, hash both.                                                                                            |
| **Auto-generate à APPROVED** | Optionnel, contrôlé par `plan.auto_generate_document` boolean           | Default false en V1 pour éviter spam. Admin clique manuellement.                                                                    |

### 1.3 Permissions

Permissions à seeder dans `permissions_catalog` :

| Permission                   | Description                                | Roles par défaut                                 |
| ---------------------------- | ------------------------------------------ | ------------------------------------------------ |
| `documents.read.all`         | Lire tous les documents de l'org           | OWNER, ADMIN_HR, AUDITOR                         |
| `documents.read.own`         | Lire ses propres documents (bénéficiaire)  | BENEFICIARY                                      |
| `documents.generate`         | Générer un document depuis un template     | OWNER, ADMIN_HR                                  |
| `documents.send_signature`   | Envoyer un document pour signature Yousign | OWNER, ADMIN_HR                                  |
| `documents.cancel_signature` | Annuler une signature en cours             | OWNER, ADMIN_HR                                  |
| `documents.void`             | Voider un document (rare, audit critique)  | OWNER                                            |
| `documents.download`         | Télécharger un PDF (signed ou unsigned)    | OWNER, ADMIN_HR, AUDITOR, BENEFICIARY (own only) |

Vérifier ce qui existe déjà depuis Module 1. Migration idempotente avec `ON CONFLICT DO NOTHING`.

---

## 2. SCHÉMA DB — FINALISATION

### 2.1 État actuel (Module 1)

Les tables `document_templates`, `document_instances`, `signature_requests`, `signers` ont été créées en Module 1 avec un schéma préfiguré. **Recon obligatoire** avant ALTER TABLE.

### 2.2 Recon attendue

```sql
\d document_templates
\d document_instances
\d signature_requests
\d signers
\d notifications  -- déjà connue Module 5

-- RLS policies
SELECT tablename, policyname FROM pg_policies
 WHERE tablename IN ('document_templates','document_instances',
                     'signature_requests','signers');

-- Triggers
SELECT tgname FROM pg_trigger
 WHERE tgrelid IN ('document_templates'::regclass,
                   'document_instances'::regclass);

-- Permissions actuelles
SELECT code FROM permissions_catalog
 WHERE code LIKE 'documents.%';

-- Vérifier extension pgcrypto pour SHA-256
SELECT * FROM pg_extension WHERE extname = 'pgcrypto';
```

### 2.3 Migration `00033_module_6_documents_extend.sql`

```sql
-- ============================================================
-- MODULE 6 B1 — Documents schema finalization
-- ============================================================

-- document_templates : assurer les colonnes nécessaires V1
ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS code TEXT,  -- ex: 'BSPCE_GRANT', 'AGA_GRANT', 'SO_GRANT'
  ADD COLUMN IF NOT EXISTS template_engine TEXT NOT NULL DEFAULT 'REACT_PDF'
    CHECK (template_engine IN ('REACT_PDF','TIPTAP','HTML','MARKDOWN')),
  ADD COLUMN IF NOT EXISTS supported_languages TEXT[] DEFAULT ARRAY['fr'];

-- Code unique par org pour les templates système
CREATE UNIQUE INDEX IF NOT EXISTS uq_document_templates_code
  ON document_templates(org_id, code)
  WHERE deleted_at IS NULL;

-- document_instances : extension pour signature workflow
ALTER TABLE document_instances
  ADD COLUMN IF NOT EXISTS storage_path TEXT,  -- ex: 'documents/org_id/awards/award_id/file.pdf'
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT DEFAULT 'documents',
  ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS signed_pdf_url TEXT,  -- URL du PDF signé final (Yousign post-completion)
  ADD COLUMN IF NOT EXISTS signed_pdf_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS proof_certificate_url TEXT;  -- certificat preuve Yousign

CREATE INDEX IF NOT EXISTS idx_document_instances_award
  ON document_instances(related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS idx_document_instances_status
  ON document_instances(status) WHERE status != 'ARCHIVED';

-- signature_requests : extension Yousign V3
ALTER TABLE signature_requests
  ADD COLUMN IF NOT EXISTS yousign_environment TEXT DEFAULT 'sandbox'
    CHECK (yousign_environment IN ('sandbox','production')),
  ADD COLUMN IF NOT EXISTS yousign_workflow_status TEXT,  -- raw status from Yousign
  ADD COLUMN IF NOT EXISTS signing_order TEXT DEFAULT 'SEQUENTIAL'
    CHECK (signing_order IN ('SEQUENTIAL','PARALLEL'));

CREATE INDEX IF NOT EXISTS idx_signature_requests_status
  ON signature_requests(status) WHERE status NOT IN ('COMPLETED','CANCELLED');
CREATE INDEX IF NOT EXISTS idx_signature_requests_yousign
  ON signature_requests(yousign_procedure_id)
  WHERE yousign_procedure_id IS NOT NULL;

-- signers : déjà bien structuré Module 1, juste indexes
CREATE INDEX IF NOT EXISTS idx_signers_request
  ON signers(signature_request_id);
CREATE INDEX IF NOT EXISTS idx_signers_yousign
  ON signers(yousign_signer_id)
  WHERE yousign_signer_id IS NOT NULL;

-- RLS sur les 4 tables
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE signature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE signers ENABLE ROW LEVEL SECURITY;

-- Templates : visible org-wide pour lecture
CREATE POLICY document_templates_select ON document_templates FOR SELECT
  USING (org_id = current_org_id() AND deleted_at IS NULL);

CREATE POLICY document_templates_insert ON document_templates FOR INSERT
  WITH CHECK (org_id = current_org_id() AND user_has_permission('documents.generate'));

-- Documents : visible si org match + permission OU si bénéficiaire propriétaire
CREATE POLICY document_instances_select ON document_instances FOR SELECT
  USING (
    org_id = current_org_id()
    AND (
      user_has_permission('documents.read.all')
      OR (
        user_has_permission('documents.read.own')
        AND related_entity_type = 'AWARD'
        AND related_entity_id IN (
          SELECT a.id FROM awards a
            JOIN beneficiaries b ON b.id = a.beneficiary_id
           WHERE b.user_id = auth.uid()
        )
      )
    )
  );

-- Pas de DELETE direct (soft delete via voided_at)

-- Signature requests : org-wide (audit transparent)
CREATE POLICY signature_requests_select ON signature_requests FOR SELECT
  USING (org_id = current_org_id());

-- Signers : visible si on voit le signature_request parent
CREATE POLICY signers_select ON signers FOR SELECT
  USING (
    signature_request_id IN (
      SELECT id FROM signature_requests WHERE org_id = current_org_id()
    )
  );

-- Trigger updated_at standard
CREATE TRIGGER trg_document_templates_updated_at
  BEFORE UPDATE ON document_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_document_instances_updated_at
  BEFORE UPDATE ON document_instances
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### 2.4 Migration `00034_module_6_storage_bucket.sql`

```sql
-- ============================================================
-- Bucket Storage 'documents' avec RLS Storage policies
-- ============================================================

-- Vérifier si le bucket existe (peut avoir été créé manuellement)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,  -- privé (URLs signées uniquement)
  52428800,  -- 50 MB max par fichier
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Policies Storage (path pattern : {org_id}/awards/{award_id}/{filename}.pdf)

-- READ : org members peuvent lire les docs de leur org
CREATE POLICY documents_storage_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1]::uuid = current_org_id()
  );

-- WRITE : permission documents.generate
CREATE POLICY documents_storage_insert ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND user_has_permission('documents.generate')
    AND (storage.foldername(name))[1]::uuid = current_org_id()
  );

-- UPDATE/DELETE : OWNER uniquement (rare)
CREATE POLICY documents_storage_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'documents'
    AND user_has_permission('documents.void')
    AND (storage.foldername(name))[1]::uuid = current_org_id()
  );
```

### 2.5 Migration `00035_module_6_seed_templates_metadata.sql`

```sql
-- ============================================================
-- Seed les 3 templates V1 (metadata uniquement, le code React
-- PDF est dans apps/web/src/lib/pdf/templates/)
-- ============================================================

INSERT INTO document_templates (
  org_id, code, name, description, category, applies_to_plan_types,
  template_engine, content_format, content, available_variables,
  is_active, version, supported_languages
)
SELECT
  o.id,
  'BSPCE_GRANT_LETTER',
  'Lettre d''attribution BSPCE',
  'Document légal d''attribution de Bons de Souscription de Parts de Créateur d''Entreprise',
  'AWARD_LETTER',
  ARRAY['BSPCE'],
  'REACT_PDF',
  'CODE',
  '{"componentName": "BspceGrantLetterTemplate"}'::jsonb,
  '{"award": ["award_number","grant_date","units_granted","exercise_price"], "plan": ["name","plan_type"], "beneficiary": ["full_name","email","tax_residence"], "org": ["name","legal_name","siren","registered_address"]}'::jsonb,
  true,
  1,
  ARRAY['fr']
FROM organizations o
ON CONFLICT (org_id, code) WHERE deleted_at IS NULL DO NOTHING;

INSERT INTO document_templates (
  org_id, code, name, description, category, applies_to_plan_types,
  template_engine, content_format, content, available_variables,
  is_active, version, supported_languages
)
SELECT
  o.id,
  'AGA_GRANT_LETTER',
  'Lettre d''attribution AGA',
  'Document légal d''attribution d''Actions Gratuites',
  'AWARD_LETTER',
  ARRAY['AGA','AGA_PERFORMANCE'],
  'REACT_PDF',
  'CODE',
  '{"componentName": "AgaGrantLetterTemplate"}'::jsonb,
  '{"award": ["award_number","grant_date","units_granted"], "plan": ["name","plan_type","vesting_schedule"], "beneficiary": ["full_name","email","tax_residence"], "org": ["name","legal_name","siren","registered_address"]}'::jsonb,
  true,
  1,
  ARRAY['fr']
FROM organizations o
ON CONFLICT (org_id, code) WHERE deleted_at IS NULL DO NOTHING;

INSERT INTO document_templates (
  org_id, code, name, description, category, applies_to_plan_types,
  template_engine, content_format, content, available_variables,
  is_active, version, supported_languages
)
SELECT
  o.id,
  'SO_GRANT_LETTER',
  'Stock Option Grant Letter',
  'Stock Option Grant Agreement (English)',
  'AWARD_LETTER',
  ARRAY['STOCK_OPTION'],
  'REACT_PDF',
  'CODE',
  '{"componentName": "StockOptionGrantLetterTemplate"}'::jsonb,
  '{"award": ["award_number","grant_date","units_granted","exercise_price"], "plan": ["name","plan_type"], "beneficiary": ["full_name","email","tax_residence"], "org": ["name","legal_name","registered_address"]}'::jsonb,
  true,
  1,
  ARRAY['fr','en']
FROM organizations o
ON CONFLICT (org_id, code) WHERE deleted_at IS NULL DO NOTHING;
```

---

## 3. RPCs

### 3.1 RPC `create_document_for_award`

Migration `00036_module_6_documents_rpcs.sql` :

```sql
CREATE OR REPLACE FUNCTION create_document_for_award(
  p_award_id UUID,
  p_template_code TEXT,
  p_storage_path TEXT,
  p_pdf_hash TEXT,
  p_file_size_bytes BIGINT,
  p_variables_used JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID := current_org_id();
  v_template RECORD;
  v_award RECORD;
  v_document_id UUID;
  v_document_number TEXT;
BEGIN
  IF NOT user_has_permission('documents.generate') THEN
    RAISE EXCEPTION 'Permission denied: documents.generate';
  END IF;

  -- Charger le template
  SELECT * INTO v_template
    FROM document_templates
   WHERE org_id = v_org_id
     AND code = p_template_code
     AND is_active = true
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template % not found or inactive', p_template_code;
  END IF;

  -- Charger l'award
  SELECT * INTO v_award FROM awards WHERE id = p_award_id AND org_id = v_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award % not found', p_award_id;
  END IF;

  -- Generate document number : DOC-YYYY-NNNN
  v_document_number := 'DOC-' || EXTRACT(YEAR FROM now())::TEXT || '-' ||
    LPAD((
      SELECT COUNT(*) + 1
        FROM document_instances
       WHERE org_id = v_org_id
         AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now())
    )::TEXT, 4, '0');

  -- Insert
  INSERT INTO document_instances (
    org_id, template_id, template_version,
    document_number, category, title,
    related_entity_type, related_entity_id,
    storage_path, storage_bucket, rendered_pdf_hash, file_size_bytes,
    variables_used, status, generated_at, generated_by
  )
  VALUES (
    v_org_id, v_template.id, v_template.version,
    v_document_number, v_template.category,
    v_template.name || ' — ' || v_award.award_number,
    'AWARD', p_award_id,
    p_storage_path, 'documents', p_pdf_hash, p_file_size_bytes,
    p_variables_used, 'GENERATED', now(), v_user_id
  )
  RETURNING id INTO v_document_id;

  -- Audit
  INSERT INTO audit_events (org_id, user_id, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id, v_user_id, 'document.generated', 'document_instance', v_document_id,
    jsonb_build_object(
      'template_code', p_template_code,
      'award_id', p_award_id,
      'document_number', v_document_number
    )
  );

  RETURN v_document_id;
END $$;

GRANT EXECUTE ON FUNCTION create_document_for_award(UUID, TEXT, TEXT, TEXT, BIGINT, JSONB)
  TO authenticated;
```

### 3.2 RPC `create_signature_request_full`

```sql
CREATE OR REPLACE FUNCTION create_signature_request_full(
  p_document_id UUID,
  p_yousign_procedure_id TEXT,
  p_yousign_environment TEXT,
  p_signing_order TEXT,
  p_expiry_date TIMESTAMPTZ,
  p_signers JSONB  -- array of { user_id?, beneficiary_id?, full_name, email, role_in_signature, signing_order, yousign_signer_id, yousign_sign_url }
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID := current_org_id();
  v_request_id UUID;
  v_signer JSONB;
BEGIN
  IF NOT user_has_permission('documents.send_signature') THEN
    RAISE EXCEPTION 'Permission denied: documents.send_signature';
  END IF;

  -- Insert signature_request
  INSERT INTO signature_requests (
    org_id, document_id, yousign_procedure_id, yousign_environment,
    signing_order, status, expiry_date, sent_at
  )
  VALUES (
    v_org_id, p_document_id, p_yousign_procedure_id, p_yousign_environment,
    p_signing_order, 'SENT', p_expiry_date, now()
  )
  RETURNING id INTO v_request_id;

  -- Insert signers
  FOR v_signer IN SELECT * FROM jsonb_array_elements(p_signers)
  LOOP
    INSERT INTO signers (
      org_id, signature_request_id,
      user_id, beneficiary_id,
      full_name, email, role_in_signature, signing_order,
      status, yousign_signer_id, yousign_sign_url, invited_at
    )
    VALUES (
      v_org_id, v_request_id,
      NULLIF(v_signer->>'user_id', '')::UUID,
      NULLIF(v_signer->>'beneficiary_id', '')::UUID,
      v_signer->>'full_name',
      v_signer->>'email',
      v_signer->>'role_in_signature',
      (v_signer->>'signing_order')::INTEGER,
      'SENT',
      v_signer->>'yousign_signer_id',
      v_signer->>'yousign_sign_url',
      now()
    );
  END LOOP;

  -- Update document status
  UPDATE document_instances
     SET status = 'SENT_FOR_SIGNATURE'
   WHERE id = p_document_id;

  -- Audit
  INSERT INTO audit_events (org_id, user_id, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id, v_user_id, 'document.sent_for_signature', 'signature_request', v_request_id,
    jsonb_build_object(
      'document_id', p_document_id,
      'signers_count', jsonb_array_length(p_signers),
      'yousign_procedure_id', p_yousign_procedure_id
    )
  );

  RETURN v_request_id;
END $$;

GRANT EXECUTE ON FUNCTION create_signature_request_full(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB)
  TO authenticated;
```

### 3.3 RPC `update_signer_from_webhook` (called by Edge Function)

```sql
CREATE OR REPLACE FUNCTION update_signer_from_webhook(
  p_yousign_signer_id TEXT,
  p_event_type TEXT,  -- 'viewed', 'signed', 'declined'
  p_metadata JSONB  -- ip, signed_at, decline_reason, etc.
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signer RECORD;
  v_request_id UUID;
BEGIN
  SELECT * INTO v_signer
    FROM signers
   WHERE yousign_signer_id = p_yousign_signer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Signer not found for yousign_signer_id %', p_yousign_signer_id;
  END IF;

  v_request_id := v_signer.signature_request_id;

  -- Update selon event_type
  IF p_event_type = 'viewed' THEN
    UPDATE signers
       SET status = 'VIEWED',
           viewed_at = COALESCE(viewed_at, now()),
           ip_address = NULLIF(p_metadata->>'ip_address', '')::INET
     WHERE id = v_signer.id;
  ELSIF p_event_type = 'signed' THEN
    UPDATE signers
       SET status = 'SIGNED',
           signed_at = COALESCE((p_metadata->>'signed_at')::TIMESTAMPTZ, now()),
           ip_address = NULLIF(p_metadata->>'ip_address', '')::INET,
           signature_method = COALESCE(p_metadata->>'signature_method', 'SIMPLE_ELECTRONIC')
     WHERE id = v_signer.id;
  ELSIF p_event_type = 'declined' THEN
    UPDATE signers
       SET status = 'DECLINED',
           decline_reason = p_metadata->>'reason'
     WHERE id = v_signer.id;
  END IF;

  -- Append to webhook history
  UPDATE signature_requests
     SET webhook_payload_history = webhook_payload_history || jsonb_build_object(
       'event', p_event_type,
       'signer_id', p_yousign_signer_id,
       'received_at', now(),
       'metadata', p_metadata
     )
   WHERE id = v_request_id;

  RETURN v_request_id;
END $$;

GRANT EXECUTE ON FUNCTION update_signer_from_webhook(TEXT, TEXT, JSONB) TO service_role;
```

### 3.4 RPC `complete_signature_request` (when all signers signed)

```sql
CREATE OR REPLACE FUNCTION complete_signature_request(
  p_request_id UUID,
  p_signed_pdf_storage_path TEXT,
  p_proof_certificate_url TEXT
)
RETURNS UUID  -- award_id
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request RECORD;
  v_document RECORD;
  v_award_id UUID;
BEGIN
  -- Charger
  SELECT * INTO v_request FROM signature_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Signature request not found';
  END IF;

  IF v_request.status = 'COMPLETED' THEN
    -- Idempotent : déjà traité
    RETURN NULL;
  END IF;

  SELECT * INTO v_document FROM document_instances WHERE id = v_request.document_id;

  -- Update signature_request
  UPDATE signature_requests
     SET status = 'COMPLETED',
         completed_at = now(),
         proof_certificate_url = p_proof_certificate_url
   WHERE id = p_request_id;

  -- Update document_instance
  UPDATE document_instances
     SET status = 'SIGNED',
         signed_at = now(),
         signed_pdf_storage_path = p_signed_pdf_storage_path,
         signed_pdf_url = p_signed_pdf_storage_path,  -- même path, on génère URL signée à la lecture
         proof_certificate_url = p_proof_certificate_url
   WHERE id = v_request.document_id;

  -- Récupérer l'award lié
  IF v_document.related_entity_type = 'AWARD' THEN
    v_award_id := v_document.related_entity_id;
    -- La transition award → GRANTED est faite côté TS (pour passer par
    -- transitionAward avec audit standard)
  END IF;

  -- Audit
  INSERT INTO audit_events (org_id, user_id, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_request.org_id, NULL, 'document.signed', 'document_instance', v_document.id,
    jsonb_build_object(
      'signature_request_id', p_request_id,
      'award_id', v_award_id
    )
  );

  RETURN v_award_id;
END $$;

GRANT EXECUTE ON FUNCTION complete_signature_request(UUID, TEXT, TEXT) TO service_role;
```

### 3.5 RPC `cancel_signature_request`

```sql
CREATE OR REPLACE FUNCTION cancel_signature_request(p_request_id UUID, p_reason TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id UUID := current_org_id();
  v_doc_id UUID;
BEGIN
  IF NOT user_has_permission('documents.cancel_signature') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE signature_requests
     SET status = 'CANCELLED',
         completed_at = now(),
         webhook_payload_history = webhook_payload_history || jsonb_build_object(
           'event', 'cancelled_by_admin',
           'reason', p_reason,
           'received_at', now()
         )
   WHERE id = p_request_id
     AND org_id = v_org_id
     AND status NOT IN ('COMPLETED','CANCELLED')
  RETURNING document_id INTO v_doc_id;

  IF v_doc_id IS NULL THEN
    RAISE EXCEPTION 'Cannot cancel : already completed or not found';
  END IF;

  -- Update signers PENDING/SENT → DECLINED
  UPDATE signers
     SET status = 'DECLINED', decline_reason = 'Cancelled by admin: ' || p_reason
   WHERE signature_request_id = p_request_id
     AND status NOT IN ('SIGNED','DECLINED');

  -- Update document → revert to GENERATED (peut être renvoyé)
  UPDATE document_instances
     SET status = 'GENERATED'
   WHERE id = v_doc_id;

  INSERT INTO audit_events (org_id, user_id, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_org_id, auth.uid(), 'document.signature_cancelled', 'signature_request', p_request_id,
    jsonb_build_object('reason', p_reason)
  );

  RETURN p_request_id;
END $$;
```

---

## 4. GÉNÉRATION PDF — `@react-pdf/renderer`

### 4.1 Installation

```bash
pnpm -F web add @react-pdf/renderer
```

### 4.2 Architecture

```
apps/web/src/lib/pdf/
├── index.ts              # Export principal : renderPdfFromTemplate
├── render.ts             # Fonction generic de render
├── templates/
│   ├── BspceGrantLetterTemplate.tsx
│   ├── AgaGrantLetterTemplate.tsx
│   └── StockOptionGrantLetterTemplate.tsx
├── components/           # Composants partagés
│   ├── PdfHeader.tsx
│   ├── PdfFooter.tsx
│   ├── PdfSignatureBlock.tsx
│   └── PdfSection.tsx
└── styles.ts             # Styles partagés
```

### 4.3 Template BSPCE (exemple)

`apps/web/src/lib/pdf/templates/BspceGrantLetterTemplate.tsx` :

```tsx
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { PdfHeader } from '../components/PdfHeader';
import { PdfFooter } from '../components/PdfFooter';
import { PdfSignatureBlock } from '../components/PdfSignatureBlock';
import { formatDate, formatCurrency, formatNumber } from '@/lib/formatters';

interface BspceGrantData {
  award: {
    award_number: string;
    grant_date: string;
    units_granted: number;
    exercise_price: number;
    vesting_start_date?: string;
    cliff_months?: number;
  };
  plan: {
    name: string;
    fmv_at_grant?: number;
  };
  beneficiary: {
    full_name: string;
    email: string;
    tax_residence: string;
    address?: string;
  };
  org: {
    name: string;
    legal_name: string;
    siren: string;
    registered_address?: string;
  };
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: 'Helvetica' },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 20, textAlign: 'center' },
  section: { marginBottom: 15 },
  sectionTitle: { fontSize: 13, fontWeight: 700, marginBottom: 8 },
  paragraph: { marginBottom: 6, lineHeight: 1.5 },
  bold: { fontWeight: 700 },
  table: {
    flexDirection: 'column',
    border: 1,
    borderColor: '#cccccc',
    marginVertical: 10,
  },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#eeeeee' },
  tableLabel: {
    width: '50%',
    padding: 6,
    backgroundColor: '#f5f5f5',
    fontWeight: 700,
  },
  tableValue: { width: '50%', padding: 6 },
});

export function BspceGrantLetterTemplate({ data }: { data: BspceGrantData }) {
  return (
    <Document title={`BSPCE ${data.award.award_number}`}>
      <Page size="A4" style={styles.page}>
        <PdfHeader org={data.org} />

        <Text style={styles.title}>ATTRIBUTION DE BSPCE</Text>

        <View style={styles.section}>
          <Text style={styles.paragraph}>
            La société <Text style={styles.bold}>{data.org.legal_name}</Text>, SIREN{' '}
            {data.org.siren}, attribue à :
          </Text>
        </View>

        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={styles.tableLabel}>Bénéficiaire</Text>
            <Text style={styles.tableValue}>{data.beneficiary.full_name}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableLabel}>Email</Text>
            <Text style={styles.tableValue}>{data.beneficiary.email}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableLabel}>Résidence fiscale</Text>
            <Text style={styles.tableValue}>{data.beneficiary.tax_residence}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Conditions d'attribution</Text>

        <View style={styles.table}>
          <View style={styles.tableRow}>
            <Text style={styles.tableLabel}>Numéro d'attribution</Text>
            <Text style={styles.tableValue}>{data.award.award_number}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableLabel}>Date d'attribution</Text>
            <Text style={styles.tableValue}>{formatDate(data.award.grant_date, 'fr')}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableLabel}>Nombre de BSPCE</Text>
            <Text style={styles.tableValue}>{formatNumber(data.award.units_granted)}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.tableLabel}>Prix d'exercice</Text>
            <Text style={styles.tableValue}>
              {formatCurrency(data.award.exercise_price, 'EUR')} par BSPCE
            </Text>
          </View>
          {data.award.vesting_start_date && (
            <View style={styles.tableRow}>
              <Text style={styles.tableLabel}>Début vesting</Text>
              <Text style={styles.tableValue}>
                {formatDate(data.award.vesting_start_date, 'fr')}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>Conditions générales du Plan</Text>

        <Text style={styles.paragraph}>
          Le présent BSPCE est attribué dans le cadre du Plan « {data.plan.name} ». Les conditions
          générales sont fournies en annexe et font partie intégrante de la présente lettre
          d'attribution.
        </Text>

        <Text style={styles.paragraph}>
          Ces BSPCE sont régis par les articles 163 bis G du Code Général des Impôts.
        </Text>

        <PdfSignatureBlock
          signers={[
            { role: 'Bénéficiaire', name: data.beneficiary.full_name },
            { role: 'Société', name: data.org.legal_name },
          ]}
        />

        <PdfFooter org={data.org} />
      </Page>
    </Document>
  );
}
```

### 4.4 Render serveur

`apps/web/src/lib/pdf/render.ts` :

```typescript
import { renderToBuffer } from '@react-pdf/renderer';
import { BspceGrantLetterTemplate } from './templates/BspceGrantLetterTemplate';
import { AgaGrantLetterTemplate } from './templates/AgaGrantLetterTemplate';
import { StockOptionGrantLetterTemplate } from './templates/StockOptionGrantLetterTemplate';
import crypto from 'crypto';

const TEMPLATE_MAP = {
  BSPCE_GRANT_LETTER: BspceGrantLetterTemplate,
  AGA_GRANT_LETTER: AgaGrantLetterTemplate,
  SO_GRANT_LETTER: StockOptionGrantLetterTemplate,
};

export async function renderPdfFromTemplate(
  templateCode: keyof typeof TEMPLATE_MAP,
  data: any
): Promise<{ buffer: Buffer; hash: string; size: number }> {
  const Template = TEMPLATE_MAP[templateCode];
  if (!Template) {
    throw new Error(`Unknown template code: ${templateCode}`);
  }

  const buffer = await renderToBuffer(<Template data={data} />);

  const hash = crypto.createHash('sha256').update(buffer).digest('hex');

  return {
    buffer,
    hash,
    size: buffer.length,
  };
}
```

---

## 5. INTÉGRATION YOUSIGN V3

### 5.1 Documentation

Yousign API V3 : https://developers.yousign.com/reference/

Endpoints clés V1 :

- `POST /signature_requests` — créer une signature request
- `POST /signature_requests/{id}/documents` — attacher un document PDF
- `POST /signature_requests/{id}/signers` — ajouter un signer
- `POST /signature_requests/{id}/activate` — activer (envoie les emails)
- `GET /signature_requests/{id}` — récupérer le statut
- `DELETE /signature_requests/{id}` — annuler
- `GET /signature_requests/{id}/documents/{docId}/download` — télécharger PDF signé final
- `GET /signature_requests/{id}/audit_trails/download` — télécharger certificat preuve

### 5.2 Configuration

`.env.example` (déjà préfiguré Module 1) :

```
YOUSIGN_API_KEY=your-api-key
YOUSIGN_API_BASE_URL=https://api.yousign.app/v3  # ou api-sandbox.yousign.app/v3
YOUSIGN_WEBHOOK_SECRET=your-webhook-secret
YOUSIGN_ENVIRONMENT=sandbox  # ou production
```

### 5.3 Client Yousign

`apps/web/src/lib/yousign/client.ts` :

```typescript
const BASE_URL = process.env.YOUSIGN_API_BASE_URL!;
const API_KEY = process.env.YOUSIGN_API_KEY!;

async function yousignFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Yousign API error ${response.status}: ${errorText}`);
  }

  return response.json() as Promise<T>;
}

export async function createSignatureRequest(input: {
  name: string;
  delivery_mode: 'email'; // V1
  ordered_signers?: boolean;
  expiration_date?: string; // ISO 8601
}): Promise<{ id: string; status: string }> {
  return yousignFetch('/signature_requests', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function uploadDocument(
  signatureRequestId: string,
  pdfBuffer: Buffer,
  filename: string,
): Promise<{ id: string }> {
  // Upload en multipart form
  const formData = new FormData();
  formData.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), filename);
  formData.append('nature', 'signable_document');

  const response = await fetch(`${BASE_URL}/signature_requests/${signatureRequestId}/documents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Yousign upload error: ${await response.text()}`);
  }
  return response.json();
}

export async function addSigner(
  signatureRequestId: string,
  input: {
    info: {
      first_name: string;
      last_name: string;
      email: string;
      phone_number?: string;
      locale?: string;
    };
    signature_level: 'electronic_signature'; // V1
    signature_authentication_mode: 'otp_email' | 'otp_sms' | 'no_otp';
    fields?: Array<{ document_id: string; type: 'signature'; page: number; x: number; y: number }>;
  },
): Promise<{ id: string; signature_link: string }> {
  return yousignFetch(`/signature_requests/${signatureRequestId}/signers`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function activateSignatureRequest(id: string): Promise<{ status: string }> {
  return yousignFetch(`/signature_requests/${id}/activate`, {
    method: 'POST',
  });
}

export async function getSignatureRequest(id: string) {
  return yousignFetch(`/signature_requests/${id}`);
}

export async function downloadSignedDocument(
  signatureRequestId: string,
  documentId: string,
): Promise<Buffer> {
  const response = await fetch(
    `${BASE_URL}/signature_requests/${signatureRequestId}/documents/${documentId}/download`,
    { headers: { Authorization: `Bearer ${API_KEY}` } },
  );
  if (!response.ok) {
    throw new Error(`Yousign download error: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function downloadAuditTrail(signatureRequestId: string): Promise<Buffer> {
  const response = await fetch(
    `${BASE_URL}/signature_requests/${signatureRequestId}/audit_trails/download`,
    { headers: { Authorization: `Bearer ${API_KEY}` } },
  );
  if (!response.ok) {
    throw new Error(`Audit trail error: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function cancelSignatureRequest(id: string): Promise<void> {
  await yousignFetch(`/signature_requests/${id}`, { method: 'DELETE' });
}
```

### 5.4 Edge Function webhook

`supabase/functions/yousign-webhook/index.ts` :

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import crypto from 'node:crypto';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const WEBHOOK_SECRET = Deno.env.get('YOUSIGN_WEBHOOK_SECRET')!;

Deno.serve(async (req) => {
  // 1. Verify HMAC signature
  const signature = req.headers.get('x-yousign-signature');
  const body = await req.text();

  if (!signature || !verifyHmac(body, signature, WEBHOOK_SECRET)) {
    return new Response('Invalid signature', { status: 401 });
  }

  const payload = JSON.parse(body);
  const eventName = payload.event_name; // 'signer_request.viewed', 'signer_request.signed', 'signature_request.completed', etc.

  // 2. Route by event
  try {
    if (eventName === 'signer_request.viewed') {
      await supabase.rpc('update_signer_from_webhook', {
        p_yousign_signer_id: payload.data.signer.id,
        p_event_type: 'viewed',
        p_metadata: { ip_address: payload.data.metadata?.ip_address },
      });
    } else if (eventName === 'signer_request.signed') {
      await supabase.rpc('update_signer_from_webhook', {
        p_yousign_signer_id: payload.data.signer.id,
        p_event_type: 'signed',
        p_metadata: {
          signed_at: payload.data.signer.signed_at,
          ip_address: payload.data.metadata?.ip_address,
          signature_method: 'SIMPLE_ELECTRONIC',
        },
      });
    } else if (eventName === 'signer_request.declined') {
      await supabase.rpc('update_signer_from_webhook', {
        p_yousign_signer_id: payload.data.signer.id,
        p_event_type: 'declined',
        p_metadata: { reason: payload.data.signer.decline_reason },
      });
    } else if (eventName === 'signature_request.completed') {
      // Tous les signers ont signé : download le PDF signé + certificat
      const sigRequestId = payload.data.signature_request.id;

      // Récupérer la signature_request DB
      const { data: dbRequest } = await supabase
        .from('signature_requests')
        .select('id, document_id, org_id')
        .eq('yousign_procedure_id', sigRequestId)
        .single();

      if (!dbRequest) {
        return new Response('Signature request not found', { status: 404 });
      }

      // Download signed PDF + audit trail via Yousign API
      // (Inline ici simplifié, en réalité on fait un fetch via le client)
      const documentId = payload.data.signature_request.documents[0].id;
      const yousignBaseUrl = Deno.env.get('YOUSIGN_API_BASE_URL')!;
      const yousignApiKey = Deno.env.get('YOUSIGN_API_KEY')!;

      const signedPdfResponse = await fetch(
        `${yousignBaseUrl}/signature_requests/${sigRequestId}/documents/${documentId}/download`,
        { headers: { Authorization: `Bearer ${yousignApiKey}` } },
      );
      const signedPdfBuffer = await signedPdfResponse.arrayBuffer();

      const auditTrailResponse = await fetch(
        `${yousignBaseUrl}/signature_requests/${sigRequestId}/audit_trails/download`,
        { headers: { Authorization: `Bearer ${yousignApiKey}` } },
      );
      const auditTrailBuffer = await auditTrailResponse.arrayBuffer();

      // Upload to Storage
      const signedPdfPath = `${dbRequest.org_id}/awards/signed/${dbRequest.document_id}.pdf`;
      const auditTrailPath = `${dbRequest.org_id}/awards/proofs/${dbRequest.document_id}_proof.pdf`;

      await supabase.storage
        .from('documents')
        .upload(signedPdfPath, signedPdfBuffer, { contentType: 'application/pdf', upsert: true });

      await supabase.storage
        .from('documents')
        .upload(auditTrailPath, auditTrailBuffer, { contentType: 'application/pdf', upsert: true });

      // Update DB via RPC
      const { data: awardId } = await supabase.rpc('complete_signature_request', {
        p_request_id: dbRequest.id,
        p_signed_pdf_storage_path: signedPdfPath,
        p_proof_certificate_url: auditTrailPath,
      });

      // Trigger award transition GRANTED via Server Action callback
      // (la transition côté TS pour audit standard transitionAward)
      // Ici on ne peut pas appeler Server Action depuis Edge Function,
      // donc on insert un row dans une queue 'pending_award_transitions'
      // OU on update directement awards.status='GRANTED' via le RPC +
      // audit côté DB.

      if (awardId) {
        await supabase.rpc('transition_award_to_granted_after_signature', {
          p_award_id: awardId,
          p_signature_request_id: dbRequest.id,
        });
      }
    }

    // Append raw payload to webhook history (toujours, même si event ignoré)
    // Géré par les RPCs ci-dessus

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Yousign webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

function verifyHmac(body: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
}
```

### 5.5 RPC `transition_award_to_granted_after_signature`

```sql
CREATE OR REPLACE FUNCTION transition_award_to_granted_after_signature(
  p_award_id UUID,
  p_signature_request_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_award RECORD;
BEGIN
  SELECT * INTO v_award FROM awards WHERE id = p_award_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award not found';
  END IF;

  -- Idempotent : si déjà GRANTED, return
  IF v_award.status = 'GRANTED' THEN
    RETURN p_award_id;
  END IF;

  -- Transition uniquement depuis PENDING_SIGNATURE
  IF v_award.status != 'PENDING_SIGNATURE' THEN
    RAISE EXCEPTION 'Cannot transition award from % to GRANTED — must be PENDING_SIGNATURE', v_award.status;
  END IF;

  -- Update
  UPDATE awards
     SET status = 'GRANTED',
         granted_at = now(),
         signed_document_id = (
           SELECT document_id FROM signature_requests WHERE id = p_signature_request_id
         )
   WHERE id = p_award_id;

  -- Audit
  INSERT INTO audit_events (org_id, user_id, event_type, resource_type, resource_id, metadata)
  VALUES (
    v_award.org_id, NULL, 'award.granted', 'award', p_award_id,
    jsonb_build_object(
      'previous_status', v_award.status,
      'signature_request_id', p_signature_request_id,
      'auto_transition', true
    )
  );

  RETURN p_award_id;
END $$;

GRANT EXECUTE ON FUNCTION transition_award_to_granted_after_signature(UUID, UUID) TO service_role;
```

> **Note** : ce RPC est appelé uniquement depuis l'Edge Function webhook (service_role). Il ne va PAS via `transitionAward` Server Action (qui aurait besoin du contexte user). L'audit est cohérent (event_type 'award.granted') mais user_id=NULL pour signaler "auto-transition par webhook".

---

## 6. SERVER ACTIONS

### 6.1 Liste des actions

`apps/web/src/server/actions/documents.ts` (créer) :

```typescript
'use server';

// Génération
export async function generateAwardDocument(input: {
  awardId: string;
  templateCode?: string; // si null, auto-résolu depuis plan_type
}): Promise<Result<{ documentId: string; previewUrl: string }>>;

export async function regenerateAwardDocument(input: {
  documentId: string;
}): Promise<Result<{ documentId: string }>>; // si template a changé

// Preview
export async function getDocumentPreviewUrl(
  documentId: string,
): Promise<Result<{ signedUrl: string; expiresAt: string }>>;

// Signature
export async function sendDocumentForSignature(input: {
  documentId: string;
  signers: Array<{
    type: 'beneficiary' | 'company_representative';
    userId?: string;
    beneficiaryId?: string;
    fullName: string;
    email: string;
    phone?: string;
    signingOrder: number;
  }>;
  signingOrder: 'SEQUENTIAL' | 'PARALLEL';
  expiryDays?: number; // default 30
}): Promise<Result<{ signatureRequestId: string }>>;

export async function getSignatureRequestStatus(
  requestId: string,
): Promise<Result<SignatureRequestStatus>>;

export async function cancelSignatureRequest(
  requestId: string,
  reason: string,
): Promise<Result<void>>;

// Voiding (très rare, audit critique)
export async function voidDocument(documentId: string, reason: string): Promise<Result<void>>;

// Listing
export async function listDocumentsForAward(awardId: string): Promise<DocumentInstance[]>;
export async function listSignaturesPendingForUser(): Promise<PendingSignatureItem[]>;
```

### 6.2 Détail `generateAwardDocument`

```typescript
export async function generateAwardDocument(input: GenerateInput): Promise<Result<{...}>> {
  const supabase = await createServerSupabase();
  await requirePermission('documents.generate');

  // 1. Charger contexte (award + plan + beneficiary + org)
  const { data: contextData } = await supabase.rpc('load_award_document_context', {
    p_award_id: input.awardId
  });

  if (!contextData) {
    return { ok: false, error: 'Award not found' };
  }

  // 2. Résoudre template_code depuis plan_type si non fourni
  const templateCode = input.templateCode ?? resolveTemplateCodeFromPlanType(contextData.plan.plan_type);

  // 3. Compliance check (FMV récente, etc.)
  const compliance = await runDocumentComplianceChecks('GENERATE', contextData);
  if (compliance.hasHardBlocks) {
    return { ok: false, error: 'Compliance blocks: ' + compliance.errors.join(', ') };
  }

  // 4. Render PDF
  let pdfResult;
  try {
    pdfResult = await renderPdfFromTemplate(templateCode, contextData);
  } catch (e: any) {
    return { ok: false, error: `PDF render failed: ${e.message}` };
  }

  // 5. Upload to Storage
  const orgId = contextData.org.id;
  const storagePath = `${orgId}/awards/${input.awardId}/${contextData.award.award_number}-${Date.now()}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, pdfResult.buffer, {
      contentType: 'application/pdf',
      upsert: false,
    });

  if (uploadError) {
    return { ok: false, error: `Storage upload failed: ${uploadError.message}` };
  }

  // 6. Insert via RPC
  const { data: documentId, error: rpcError } = await supabase.rpc('create_document_for_award', {
    p_award_id: input.awardId,
    p_template_code: templateCode,
    p_storage_path: storagePath,
    p_pdf_hash: pdfResult.hash,
    p_file_size_bytes: pdfResult.size,
    p_variables_used: contextData,
  });

  if (rpcError) {
    // Rollback : delete storage
    await supabase.storage.from('documents').remove([storagePath]);
    return { ok: false, error: rpcError.message };
  }

  // 7. Generate preview URL (signed, 1h)
  const { data: previewData } = await supabase.storage
    .from('documents')
    .createSignedUrl(storagePath, 3600);

  return {
    ok: true,
    documentId: documentId!,
    previewUrl: previewData?.signedUrl ?? ''
  };
}
```

### 6.3 Hook dans approveDecision (Module 5)

`apps/web/src/server/actions/approvals.ts` (étendre `approveDecision`) :

```typescript
// Après transitionAward(award, 'APPROVED') final :
if (result.data?.next_award_status === 'APPROVED') {
  await transitionAward({ awardId, toStatus: 'APPROVED', skipApprovalHook: true });

  // Hook B5 Module 6 : auto-generate document si plan.auto_generate_document
  const { data: plan } = await supabase
    .from('plans')
    .select('auto_generate_document, plan_type')
    .eq('id', plannData.plan_id)
    .single();

  if (plan?.auto_generate_document) {
    // Generate doc en async (fire-and-forget — l'admin verra le doc apparaître)
    // OU sync si on veut bloquer le user. Async = mieux pour l'UX.
    generateAwardDocument({ awardId }).catch((e) =>
      console.error('Auto-generate document failed:', e),
    );
  }
}
```

> **Décision** : auto-generate uniquement, **pas** auto-send-for-signature. L'admin doit ouvrir la page documents et cliquer manuellement "Envoyer pour signature" pour avoir le contrôle des signataires (qui sont-ils, ordre, etc.).

---

## 7. UI — PAGES

### 7.1 Page `/dashboard/awards/[id]/documents`

Layout : section dans la page détail award (Module 3b B4) ou page séparée.

Sections :

**Section 1 — Documents générés**

- Liste des document_instances pour cet award (1+ rows)
- Pour chaque doc :
  - document_number + template name + status badge
  - Generated at + by
  - Boutons : Aperçu (iframe modal), Télécharger
  - Si status='GENERATED' : bouton "Envoyer pour signature"
  - Si status='SENT_FOR_SIGNATURE' : statut signers + bouton "Annuler"
  - Si status='SIGNED' : badge ✓ + lien certificat preuve

**Section 2 — Génération**

- Si pas de document : bouton "Générer le document"
- Choix du template (auto-résolu mais override possible)

**Section 3 — Modal preview**

- iframe avec URL signée Storage (1h)
- Boutons : Télécharger, Fermer

### 7.2 Modal "Envoyer pour signature"

Form :

- **Signers** : liste avec ordre
  - Signer 1 (toujours) : bénéficiaire
    - Pré-rempli depuis beneficiary (full_name, email, phone)
  - Signer 2 (optionnel) : représentant société
    - Combobox users (admin, OWNER)
    - Pré-rempli si membership a "is_company_representative" (V2)
- **Ordre** : Radio
  - Sequential (recommandé V1)
  - Parallel
- **Délai d'expiration** : input number (default 30 jours)
- **Bouton "Envoyer"** : disabled si compliance fails

À submit : appelle sendDocumentForSignature.

### 7.3 Page bénéficiaire (anticipée Module 8 — placeholder V1)

Pour V1, le bénéficiaire reçoit l'email Yousign hosted, signe, et c'est tout. Pas de page dédiée Capiwise.

Module 8 (Beneficiary Portal) ajoutera une page `/portal/awards` où le bénéficiaire voit ses awards avec leurs documents.

### 7.4 Sandbox `/dev/document-engine`

- Liste des templates seedés
- Bouton "Générer un PDF de test" → renvoie un PDF avec données factices
- Bouton "Test webhook Yousign" → simule un webhook payload pour tester l'Edge Function
- Liste des derniers documents générés avec preview iframe

---

## 8. COMPLIANCE V1

3 règles dans `apps/web/src/lib/compliance/rules/documentRules.ts` :

```typescript
export const DOCUMENT_COMPLIANCE_RULES = [
  {
    code: 'FMV_RECENT_ENOUGH',
    description: 'FMV utilisée pour le strike doit être < 12 mois',
    appliesTo: ['GENERATE'],
    enforcement: 'soft', // warning seulement
    check: (data, ctx) => {
      const fmvDate = ctx.plan?.fmv_set_at;
      if (!fmvDate) return null;
      const monthsAgo = differenceInMonths(new Date(), new Date(fmvDate));
      if (monthsAgo > 12) {
        return {
          severity: 'WARNING',
          code: 'FMV_RECENT_ENOUGH',
          message: `FMV datée de ${monthsAgo} mois. Recommander une nouvelle valorisation avant attribution.`,
        };
      }
      return null;
    },
  },
  {
    code: 'SIGNERS_COMPLETE_INFO',
    description: 'Chaque signataire doit avoir email + nom complet',
    appliesTo: ['SEND_SIGNATURE'],
    enforcement: 'hard',
    check: (data, ctx) => {
      for (const signer of data.signers) {
        if (!signer.email || !signer.fullName) {
          return {
            severity: 'ERROR',
            code: 'SIGNERS_COMPLETE_INFO',
            message: `Signataire ${signer.fullName || 'sans nom'} : informations manquantes`,
          };
        }
      }
      return null;
    },
  },
  {
    code: 'DOCUMENT_NOT_VOIDED',
    description: 'Document ne doit pas avoir été voided',
    appliesTo: ['SEND_SIGNATURE'],
    enforcement: 'hard',
    check: (data, ctx) => {
      if (ctx.document?.status === 'VOIDED') {
        return {
          severity: 'ERROR',
          code: 'DOCUMENT_NOT_VOIDED',
          message: 'Ce document a été voided. Régénérer un nouveau document.',
        };
      }
      return null;
    },
  },
];
```

---

## 9. AUDIT EVENTS

| Event                          | Quand                                       | Metadata                                                     |
| ------------------------------ | ------------------------------------------- | ------------------------------------------------------------ |
| `document.generated`           | RPC create_document_for_award               | `{ template_code, award_id, document_number }`               |
| `document.preview_accessed`    | getDocumentPreviewUrl                       | `{ document_id }`                                            |
| `document.sent_for_signature`  | RPC create_signature_request_full           | `{ document_id, signers_count, yousign_procedure_id }`       |
| `document.signature_cancelled` | RPC cancel_signature_request                | `{ reason }`                                                 |
| `document.signed`              | RPC complete_signature_request              | `{ signature_request_id, award_id }`                         |
| `document.voided`              | voidDocument Server Action                  | `{ reason }`                                                 |
| `signer.viewed`                | webhook → update_signer_from_webhook        | `{ signer_id, ip_address }`                                  |
| `signer.signed`                | webhook                                     | `{ signer_id, signed_at, ip_address }`                       |
| `signer.declined`              | webhook                                     | `{ signer_id, reason }`                                      |
| `award.granted`                | transition_award_to_granted_after_signature | `{ previous_status, signature_request_id, auto_transition }` |

---

## 10. PLAN DE LIVRAISON — 6 SOUS-MODULES

### B1 — DB & Storage (1 jour)

- Recon des 4 tables Module 1
- Migration 00033 : extend tables + RLS + triggers
- Migration 00034 : Storage bucket + Storage policies
- Migration 00035 : seed des 3 templates metadata
- Migration 00036 : 5 RPCs (create_document, create_sig_request, update_signer, complete_sig_request, transition_award_after_sig)
- Migration 00037 : seed permissions documents.\*
- Tests SQL purs : 8 scénarios
  - A : Recon + migration
  - B : Storage bucket + RLS
  - C : create_document_for_award happy path
  - D : create_signature_request_full + signers
  - E : update_signer_from_webhook viewed/signed
  - F : complete_signature_request + auto-transition award
  - G : cancel_signature_request flow
  - H : Permission denied tests

**Livrable** : DB + Storage prêts. Drift cloud à 0.

### B2 — Génération PDF react-pdf (1 jour)

- Install @react-pdf/renderer
- Composants partagés (PdfHeader, PdfFooter, PdfSignatureBlock)
- 3 templates : BSPCE, AGA, SO
- render.ts (renderPdfFromTemplate)
- Server Action generateAwardDocument
- Sandbox /dev/document-engine pour tester en visuel
- Tests Vitest : 5+ assertions sur la génération (pas de rendu visuel, juste shape du buffer + hash)

**Livrable** : 3 PDFs générés visualisables, uploadés en Storage.

### B3 — Intégration Yousign (1 jour)

- Wrapper client.ts avec 8 fonctions
- Edge Function yousign-webhook (HMAC + 4 events handled)
- Server Actions sendDocumentForSignature, cancelSignatureRequest, getSignatureRequestStatus
- Variables env Yousign (sandbox d'abord)
- Tests Vitest : mock Yousign API + verify webhook signature
- Test E2E SQL : simuler payload webhook → verify DB update

**Livrable** : signature flow E2E sandbox. Email Yousign reçu, click, signe, webhook → DB mis à jour.

### B4 — UI documents (0.5 jour)

- Section "Documents" sur page détail award
- Modal preview iframe
- Modal "Envoyer pour signature"
- Status badges + actions par doc
- Sidebar nav update si nécessaire

**Livrable** : admin peut générer un doc + l'envoyer pour signature depuis la UI.

### B5 — Hook avec Module 5 (0.5 jour)

- Étendre approveDecision (Module 5) pour appeler generateAwardDocument si plan.auto_generate_document=true
- Migration : ALTER plans ADD COLUMN auto_generate_document BOOLEAN DEFAULT false
- UI : checkbox sur wizard plan creation (Module 3a) — ajout simple
- Tests E2E : approve final → doc généré automatiquement

**Livrable** : workflow complet APPROVED → doc généré → admin envoie → signed → GRANTED.

### B6 — Tests E2E + closure + merge (0.5 jour)

- 5 scénarios E2E manuels (sandbox Yousign)
- Cleanup données test
- Memory closure
- Update CLAUDE.md
- PR #8 ready + squash-merge

**Livrable** : Module 6 mergé sur master.

---

## 11. INSTRUCTIONS POUR CLAUDE CODE

### Phase 1 — Bootstrap

1. Lire `memory/module_5_complete.md` pour le contexte des hooks award.
2. Faire branche `feat/module-6-documents`.
3. Vérifier checks Module 5 OK (typecheck, tests workspace ≥ 196, drift 0).
4. Patterns à réutiliser :
   - Module 5 B1 (RPCs SECURITY DEFINER)
   - Module 5 B2 (Server Actions Result + audit + hook chain)
   - Module 4 B5 (Modale form RHF + Zod)
   - Module 3b B4 (Page détail award onglets)
   - Module 3a B5 (Edge Function + Realtime updates pattern)

### Phase 2 — DB & Storage (B1)

- Recon obligatoire des tables Module 1 avant migration
- Storage bucket via SQL (insert into storage.buckets) plutôt que Dashboard
- Tester chaque RPC en SQL pur via mcp Supabase

### Phase 3 — PDF (B2)

- @react-pdf/renderer : utiliser `renderToBuffer` côté Server Action (pas client)
- Tester chaque template avec données factices avant intégration
- Calculer SHA-256 hash du buffer pour intégrité
- Storage path : `{org_id}/awards/{award_id}/{award_number}-{timestamp}.pdf`

### Phase 4 — Yousign (B3)

- Configurer env sandbox YOUSIGN_API_KEY + YOUSIGN_WEBHOOK_SECRET
- Edge Function deploy via supabase CLI
- Tester webhook en local avec ngrok ou supabase functions serve
- HMAC verification critique (sécurité)

### Phase 5 — UI (B4)

- iframe pour preview (URL signée 1h)
- Modal Send for Signature : form simple, signers pré-remplis depuis context

### Phase 6 — Hook (B5)

- Migration plan auto_generate_document boolean
- Étendre approveDecision côté Server Action
- Wizard Module 3a : ajouter checkbox simple

### Phase 7 — Validation (B6)

Checkpoints :

- [ ] Migration drift à 0
- [ ] Tests SQL : 8/8
- [ ] Tests Vitest : workspace ≥ 215 (196 + 20 nouveaux)
- [ ] PDF généré visuellement OK pour les 3 templates
- [ ] Webhook Yousign fonctionne en sandbox
- [ ] Flow E2E complet : APPROVED → doc → signature → GRANTED
- [ ] PR #8 mergée

### Conventions strictes (rappel)

- 'use server' = uniquement async
- Pattern Result strict
- Validation Zod sur chaque Server Action
- Audit log systématique
- Hash SHA-256 sur les PDFs (intégrité)
- HMAC sur les webhooks (sécurité)

### Points de vigilance

- **Recon Module 1** : les 4 tables sont peut-être plus complètes que dans la spec ; ne pas dupliquer.
- **react-pdf en Server Action** : pas de SSR direct, juste `renderToBuffer`. Pas besoin de DOM.
- **Storage RLS** : tester explicitement qu'un bénéficiaire ne peut pas accéder aux docs d'un autre.
- **Webhook idempotency** : Yousign peut envoyer le même event 2 fois. RPCs doivent être idempotents (vérifier `IF status = 'COMPLETED' RETURN` early).
- **HMAC verification** : ne JAMAIS skip en prod. Sandbox peut bypasser pour tests, prod absolument requis.
- **Edge Function vs Server Action** : Edge Function = pour webhooks externes (Yousign). Server Action = pour calls user-initiated. Ne pas mélanger.
- **PDF size** : limit 50 MB par template. Au-delà, problème de mise en page.
- **Auto-generate** : default `auto_generate_document=false`. L'admin doit explicitement opt-in par plan.
- **Variables substitution** : tout via `variables_used` JSONB snapshot. Si template change après génération, le doc reste figé.
- **Multi-environnement Yousign** : sandbox vs production. Toujours tagger `yousign_environment` en DB pour distinguer.
- **Tests E2E nécessitent Yousign sandbox account** : créer un compte sandbox Yousign avant B3, ou stub l'API en mode test.

---

**FIN DU MODULE 6 — DOCUMENT ENGINE & SIGNATURES**

_Quand le Module 6 est implémenté et validé, reviens vers Claude (chat) pour "go module 7" (Notifications Resend)._
