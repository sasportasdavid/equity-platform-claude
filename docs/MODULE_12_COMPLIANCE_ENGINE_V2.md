# MODULE 12 — Compliance Engine V2

**Status** : 📋 SPEC DRAFT
**Owner** : @sasportasdavid
**Predecessor** : Modules 1-11 (rules dispersées en code dur)
**Estimated effort** : 5-7 jours
**Target release** : v0.12.0

---

## 0. Vision et scope V1

### 0.1 Pourquoi ce module

Au cours de Modules 1-11, **22 compliance rules** ont été développées pour valider les actions critiques (création de plan, transition d'award, exercice, valuation, dilution, etc.). Ces rules sont actuellement **codées en dur** dans les fichiers TypeScript du repo, avec des seuils figés (90 jours pour valuation stale, 20% pour FMV deviation, etc.).

Ce design présente 4 limitations majeures :

1. **Pas de configurabilité par tenant**. Tous les clients Capiwise ont les mêmes seuils. Or un fond d'investissement peut vouloir un seuil "valuation stale" à 60j (CFO paranoïaque), tandis qu'une PME peut accepter 180j.

2. **Pas d'audit trail des changements**. Si un OWNER demande "pourquoi cette transition a été bloquée hier ?", impossible de retracer les seuils en vigueur à la date de la transition.

3. **Pas de simulation "what-if"**. Avant de durcir un seuil, un OWNER ne peut pas voir combien d'awards seraient impactés.

4. **Pas d'extension sans deploy**. Activer/désactiver une rule nécessite un git commit + CI + deploy. Pour un produit B2B SaaS, c'est inacceptable.

**Module 12 résout ces 4 limitations** en introduisant un système de configuration par org, avec UI dédiée, audit log, simulation what-if, et migration automatique des 22 rules existantes vers la DB.

### 0.2 Scope V1

| Inclus V1                                     | Exclus V1 (V2 futur)                                    |
| --------------------------------------------- | ------------------------------------------------------- |
| Migration automatique des 22 rules existantes | Création de rules custom no-code                        |
| Override des seuils numériques par org        | Logique conditionnelle complexe (if-then-else)          |
| Activation/désactivation par rule             | Branchement entre rules (rule chains)                   |
| Audit log des changements                     | Versioning rollbackable des configurations              |
| What-if simulation (count d'awards impactés)  | What-if simulation avancée (preview détaillé par award) |
| Effet prospectif uniquement                   | Effet rétroactif (override admin uniquement)            |
| Page dédiée `/dashboard/settings/compliance`  | API publique pour configuration externe                 |
| Permissions OWNER pour configurer             | Permissions granulaires par rule                        |

### 0.3 Décisions architecture validées

| #   | Question           | Choix V1                                         |
| --- | ------------------ | ------------------------------------------------ |
| Q1  | Granularité config | (b) Seuils + activation/désactivation            |
| Q2  | UI                 | (a) Page dédiée `/dashboard/settings/compliance` |
| Q3  | Versioning         | (b) Audit log only                               |
| Q4  | Rétroactivité      | (b) Prospectif par défaut                        |
| Q5  | What-if simulation | (a) Dashboard preview avant enregistrement       |
| Q6  | Migration rules    | (a) Migration automatique des 22 rules en DB     |

### 0.4 Non-objectifs explicites

Module 12 ne traite PAS :

- La création de NOUVELLES rules (toutes les rules V1 sont la consolidation des rules existantes)
- Le moteur d'exécution des rules (ça reste `runChecks.ts` côté code, on le rend juste paramétrable)
- L'UI d'affichage des warnings/errors aux end-users (ça reste les pages existantes Module 3-11)
- L'export d'audit logs (présent en V2, ou via Module 6 docs si besoin)

### 0.5 Dépendances

- **Module 1** : `audit_events` table, RLS patterns
- **Module 2** : RBAC, permissions (création de `compliance_rules.config.write` permission)
- **Modules 3-11** : ce sont eux qui exposent les rules à migrer en DB

### 0.6 Glossaire

| Terme               | Définition                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Rule**            | Une vérification compliance déclenchée à un événement (ex: `VALUATION_STALE_BLOCKING`)                             |
| **Rule code**       | Identifier unique d'une rule (ex: `VALUATION_STALE_BLOCKING`)                                                      |
| **Rule definition** | Métadonnées de la rule en DB (description, scope, severity_default, params_schema)                                 |
| **Rule override**   | Configuration spécifique à une org (seuils custom, activation/désactivation)                                       |
| **Severity**        | `error` (blocking) ou `warning` (soft, n'empêche pas l'action)                                                     |
| **Scope**           | Domaine fonctionnel : `plan`, `award`, `beneficiary`, `valuation`, `cap_table`, `exercise`, `approval`, `document` |
| **Param**           | Paramètre numérique d'une rule (ex: `staleDays = 90`, `deviationPct = 20`)                                         |

---

## 1. Inventaire des 22 rules existantes

Ces rules sont actuellement codées en dur dans le repo et seront migrées en DB via Module 12 B5.

### 1.1 Scope `plan` (4 rules)

| Code                                | Severity | Description V1                                                               | Params           |
| ----------------------------------- | -------- | ---------------------------------------------------------------------------- | ---------------- |
| `PLAN_VESTING_SCHEDULE_VALID`       | error    | Le vesting schedule doit sommer à 100% et avoir au moins 1 tranche           | aucun            |
| `PLAN_DRAFT_HAS_REQUIRED_FIELDS`    | error    | Avant publication, plan doit avoir name, type, total_units, vesting_schedule | aucun            |
| `PLAN_PUBLISH_REQUIRES_VALUATION`   | error    | Plan ne peut passer DRAFT→PUBLISHED sans valuation_run SUCCESS récent        | `staleDays` (90) |
| `PLAN_TYPE_FRENCH_REQUIRES_AGRMENT` | warning  | Plans BSPCE/AGA en France nécessitent une assemblée générale                 | aucun            |

### 1.2 Scope `award` (5 rules)

| Code                                          | Severity | Description V1                                                                         | Params           |
| --------------------------------------------- | -------- | -------------------------------------------------------------------------------------- | ---------------- |
| `AWARD_UNITS_POSITIVE`                        | error    | units_granted > 0 obligatoire                                                          | aucun            |
| `AWARD_BENEFICIARY_ACTIVE`                    | error    | Le bénéficiaire doit être ACTIVE (pas TERMINATED)                                      | aucun            |
| `AWARD_GRANT_DATE_VALID`                      | error    | grant_date doit être dans le passé ou aujourd'hui                                      | aucun            |
| `AWARD_DRAFT_TO_PROPOSED_VALIDATION`          | error    | Transition DRAFT→PROPOSED nécessite plan PUBLISHED + beneficiary ACTIVE + valuation OK | `staleDays` (90) |
| `AWARD_PROPOSED_TO_GRANTED_REQUIRES_APPROVAL` | error    | Transition PROPOSED→GRANTED nécessite approval workflow validé                         | aucun            |

### 1.3 Scope `beneficiary` (2 rules)

| Code                               | Severity | Description V1                                            | Params |
| ---------------------------------- | -------- | --------------------------------------------------------- | ------ |
| `BENEFICIARY_TAX_PROFILE_REQUIRED` | warning  | Profile fiscal manquant peut bloquer l'exercice plus tard | aucun  |
| `BENEFICIARY_TERMINATION_HAS_DATE` | error    | Si status = TERMINATED, termination_date obligatoire      | aucun  |

### 1.4 Scope `valuation` (2 rules — livrées Module 11 B6)

| Code                       | Severity | Description V1                                            | Params              |
| -------------------------- | -------- | --------------------------------------------------------- | ------------------- |
| `VALUATION_STALE_BLOCKING` | error    | Valorisation IFRS 2 datée de moins de N jours obligatoire | `staleDays` (90)    |
| `FMV_DEVIATION_WARNING`    | warning  | Alerte si FMV diffère de >X% vs valorisation précédente   | `deviationPct` (20) |

### 1.5 Scope `cap_table` (3 rules — livrées Module 10 B7)

| Code                              | Severity | Description V1                                      | Params                          |
| --------------------------------- | -------- | --------------------------------------------------- | ------------------------------- |
| `DILUTION_THRESHOLD_WARNING`      | warning  | Si nouvelle émission > X% de la cap table → warning | `dilutionPct` (15)              |
| `POOL_DEPLETION_WARNING`          | warning  | Si pool ESOP utilisé > X% → alerte                  | `poolUsagePct` (80)             |
| `SHAREHOLDER_AGREEMENT_VIOLATION` | error    | Émission > seuil pacte d'actionnaires sans approval | `agreementThreshold` (variable) |

### 1.6 Scope `exercise` (3 rules — livrées Module 9)

| Code                          | Severity | Description V1                                            | Params |
| ----------------------------- | -------- | --------------------------------------------------------- | ------ |
| `EXERCISE_WINDOW_VALID`       | error    | exercise_date dans la fenêtre d'exercice du plan          | aucun  |
| `EXERCISE_AVAILABLE_UNITS`    | error    | units_exercised <= units_vested - units_already_exercised | aucun  |
| `EXERCISE_TAX_WITHHOLDING_OK` | warning  | Si tax withholding requis et pas configuré → warning      | aucun  |

### 1.7 Scope `approval` (2 rules — livrées Module 5)

| Code                       | Severity | Description V1                              | Params                     |
| -------------------------- | -------- | ------------------------------------------- | -------------------------- |
| `APPROVAL_QUORUM_REQUIRED` | error    | Approval doit avoir N approbateurs minimum  | `minApprovers` (2)         |
| `APPROVAL_DUAL_SIGNATURE`  | warning  | Plans > X € exigent 2 signatures distinctes | `amountThreshold` (500000) |

### 1.8 Scope `document` (1 rule — livrée Module 6)

| Code                         | Severity | Description V1                                           | Params |
| ---------------------------- | -------- | -------------------------------------------------------- | ------ |
| `DOCUMENT_TEMPLATE_REQUIRED` | error    | Award PROPOSED nécessite document généré depuis template | aucun  |

### 1.9 Total

**22 rules** réparties sur 8 scopes. Toutes seront migrées en DB en Module 12 B5.

---

## 2. Modèle de données

### 2.1 Tables

#### `compliance_rule_definitions`

Catalogue maître des rules. **Cette table est seedée par migration**, pas modifiable par les users (sauf super-admin Anthropic en cas de bug).

```sql
CREATE TABLE public.compliance_rule_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL CHECK (scope IN (
    'plan', 'award', 'beneficiary', 'valuation',
    'cap_table', 'exercise', 'approval', 'document'
  )),
  severity_default TEXT NOT NULL CHECK (severity_default IN ('error', 'warning')),
  description_fr TEXT NOT NULL,
  description_en TEXT,
  params_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Ex pour VALUATION_STALE_BLOCKING:
  --   {"staleDays": {"type": "integer", "min": 30, "max": 365, "default": 90, "label_fr": "Seuil péremption (jours)"}}
  default_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Ex: {"staleDays": 90}
  is_active_by_default BOOLEAN NOT NULL DEFAULT TRUE,
  is_severity_overridable BOOLEAN NOT NULL DEFAULT FALSE,
  -- V1 : sévérité non modifiable (Q1 choix b). FALSE par défaut.
  -- V2 : passer à TRUE pour les rules où c'est pertinent.
  cta_url_template TEXT,
  -- Ex: "/dashboard/plans/{planId}/valuations" pour VALUATION_STALE_BLOCKING
  documentation_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compliance_rule_definitions_scope
  ON compliance_rule_definitions(scope);

GRANT SELECT ON compliance_rule_definitions TO authenticated;
-- Pas de INSERT/UPDATE/DELETE pour les users : seedé par migration uniquement
```

#### `compliance_rule_overrides`

Configuration par org. Une row par (org_id, rule_code) si l'org a customisé la rule.

```sql
CREATE TABLE public.compliance_rule_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL REFERENCES compliance_rule_definitions(rule_code) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  params_override JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Si vide : utiliser default_params de la definition
  -- Si rempli : merge avec default_params (override partiel)
  severity_override TEXT CHECK (severity_override IN ('error', 'warning')),
  -- NULL = utiliser severity_default
  -- V1 : doit être NULL si is_severity_overridable = FALSE (vérifié par trigger)
  notes TEXT,
  -- Note libre du OWNER, ex: "Durci à 60j sur demande comité d'audit 2026-Q1"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE (org_id, rule_code)
);

CREATE INDEX idx_compliance_rule_overrides_org
  ON compliance_rule_overrides(org_id);
CREATE INDEX idx_compliance_rule_overrides_rule
  ON compliance_rule_overrides(rule_code);

ALTER TABLE compliance_rule_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compliance_rule_overrides_select_org"
  ON compliance_rule_overrides FOR SELECT
  USING (org_id = current_org_id());

CREATE POLICY "compliance_rule_overrides_write_with_perm"
  ON compliance_rule_overrides FOR ALL
  USING (
    org_id = current_org_id()
    AND has_permission('compliance_rules.config.write')
  );
```

#### `compliance_rule_audit_log`

Audit log dédié des changements de configuration. Réutilise `audit_events` de Module 1 pour cohérence.

```sql
-- Pas de nouvelle table : on utilise audit_events existant
-- avec event_type spécifiques :
--   'compliance_rule.activated'
--   'compliance_rule.deactivated'
--   'compliance_rule.params_updated'
--   'compliance_rule.severity_overridden' (V2 only)

-- metadata JSONB schema:
-- {
--   "rule_code": "VALUATION_STALE_BLOCKING",
--   "before": { "is_active": true, "params": {"staleDays": 90} },
--   "after":  { "is_active": true, "params": {"staleDays": 60} },
--   "diff": { "staleDays": {"from": 90, "to": 60} },
--   "notes": "Durci à 60j sur demande comité d'audit"
-- }
```

### 2.2 Vue helper `effective_compliance_rules`

Vue calculée qui retourne, pour chaque (org, rule), la configuration effective (default merged with override).

```sql
CREATE OR REPLACE VIEW public.effective_compliance_rules AS
SELECT
  o.id AS org_id,
  d.rule_code,
  d.scope,
  d.description_fr,
  COALESCE(ovr.is_active, d.is_active_by_default) AS is_active,
  COALESCE(ovr.severity_override, d.severity_default) AS effective_severity,
  -- Merge default_params + params_override
  d.default_params || COALESCE(ovr.params_override, '{}'::jsonb) AS effective_params,
  d.cta_url_template,
  ovr.id IS NOT NULL AS is_overridden,
  ovr.notes AS override_notes,
  ovr.updated_at AS override_updated_at,
  ovr.updated_by AS override_updated_by
FROM orgs o
CROSS JOIN compliance_rule_definitions d
LEFT JOIN compliance_rule_overrides ovr
  ON ovr.org_id = o.id AND ovr.rule_code = d.rule_code;

GRANT SELECT ON effective_compliance_rules TO authenticated;
```

⚠️ **Note** : la vue retourne 22 rules × N orgs. Pour un usage en code (filtre par `current_org_id()`), c'est OK. Pour l'UI admin, on filtre par `org_id = current_org_id()`.

### 2.3 RPC helper `get_effective_rule(p_rule_code)`

Pour usage côté code TypeScript via Supabase client :

```sql
CREATE OR REPLACE FUNCTION public.get_effective_rule(p_rule_code TEXT)
RETURNS TABLE (
  rule_code TEXT,
  scope TEXT,
  is_active BOOLEAN,
  effective_severity TEXT,
  effective_params JSONB,
  cta_url_template TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    rule_code, scope, is_active, effective_severity,
    effective_params, cta_url_template
  FROM effective_compliance_rules
  WHERE org_id = current_org_id()
    AND rule_code = p_rule_code
$$;

GRANT EXECUTE ON FUNCTION get_effective_rule(TEXT) TO authenticated;
```

### 2.4 Permissions à seeder

Migration séparée (00094 ou intégrée à 00094-compliance-engine-v2) :

```sql
-- 1 nouvelle permission
INSERT INTO permissions (code, label, description) VALUES
  ('compliance_rules.config.write', 'Configurer les règles compliance',
   'Permet de modifier seuils, activer/désactiver compliance rules');

-- Seeder dans le rôle OWNER seulement (pas ADMIN_HR, pas ADMIN_FINANCE)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.code = 'OWNER'
  AND p.code = 'compliance_rules.config.write';
```

---

## 3. Backend — Server Actions et helpers

### 3.1 Helper `loadEffectiveRule(ruleCode)` (côté Node)

`apps/web/src/lib/compliance/effectiveRules.ts`

Fonction lue **à chaque check compliance**, qui retourne la config effective de la rule pour l'org courante.

```typescript
import 'server-only';
import { createServerClient } from '@/lib/supabase/server';
import { z } from 'zod';

export const effectiveRuleSchema = z.object({
  rule_code: z.string(),
  scope: z.enum([
    'plan',
    'award',
    'beneficiary',
    'valuation',
    'cap_table',
    'exercise',
    'approval',
    'document',
  ]),
  is_active: z.boolean(),
  effective_severity: z.enum(['error', 'warning']),
  effective_params: z.record(z.unknown()),
  cta_url_template: z.string().nullable(),
});

export type EffectiveRule = z.infer<typeof effectiveRuleSchema>;

/**
 * Charge la configuration effective d'une rule pour l'org courante.
 * Retourne null si la rule n'existe pas dans le catalogue.
 *
 * Cette fonction est appelée à CHAQUE check compliance. Performance critique.
 * En V2 on pourra ajouter un cache TTL court (~30s) côté Node.
 */
export async function loadEffectiveRule(ruleCode: string): Promise<EffectiveRule | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .rpc('get_effective_rule', { p_rule_code: ruleCode })
    .single();

  if (error || !data) return null;
  const parsed = effectiveRuleSchema.safeParse(data);
  if (!parsed.success) {
    console.warn(`[Module 12] Invalid effective rule for ${ruleCode}:`, parsed.error);
    return null;
  }
  return parsed.data;
}

/**
 * Charge toutes les rules effectives pour l'org courante.
 * Utilisée par la page de settings UI (B4).
 */
export async function loadAllEffectiveRules(): Promise<EffectiveRule[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('effective_compliance_rules')
    .select('rule_code, scope, is_active, effective_severity, effective_params, cta_url_template');
  if (error || !data) return [];
  return data.map((r) => effectiveRuleSchema.parse(r));
}
```

### 3.2 Refactor de `runChecks.ts` pour lire depuis DB

Le pattern existant (Module 10/11) avait des rules codées en dur :

```typescript
// AVANT (Module 11 B6)
import { VALUATION_STALE_BLOCKING } from './rules/valuationRules';

export async function runValuationComplianceChecks(ctx) {
  return Promise.all([
    VALUATION_STALE_BLOCKING.check(ctx), // seuil 90j en dur
    FMV_DEVIATION_WARNING.check(ctx), // seuil 20% en dur
  ]);
}
```

Module 12 transforme ça en :

```typescript
// APRÈS (Module 12 B5)
import { loadEffectiveRule } from '@/lib/compliance/effectiveRules';
import { VALUATION_RULE_CHECKERS } from './rules/valuationRules';

export async function runValuationComplianceChecks(ctx) {
  const ruleCodes = Object.keys(VALUATION_RULE_CHECKERS);
  const checks = await Promise.all(
    ruleCodes.map(async (code) => {
      const effective = await loadEffectiveRule(code);
      if (!effective || !effective.is_active) {
        return null; // rule désactivée par l'org
      }
      const checker = VALUATION_RULE_CHECKERS[code];
      // Le checker reçoit les params effectifs
      return checker(ctx, effective.effective_params, effective.effective_severity);
    }),
  );
  return checks.filter(Boolean);
}
```

Les checkers individuels (`VALUATION_STALE_BLOCKING.check`) sont refactorés pour prendre les params en argument :

```typescript
// AVANT
async check(ctx) {
  // ...
  if (ageInDays > 90) { ... }  // 90 en dur
}

// APRÈS
async check(ctx, params, severity) {
  const staleDays = params.staleDays as number; // 90 ou override
  if (ageInDays > staleDays) {
    return {
      passed: false,
      severity, // 'error' ou 'warning' selon override
      message: `Valorisation périmée (${ageInDays} jours, seuil = ${staleDays})`,
      ...
    };
  }
}
```

### 3.3 Server Action `updateComplianceRuleOverride`

`apps/web/src/server/actions/complianceRules.ts`

Permet à un OWNER de modifier la config d'une rule.

```typescript
'use server';

import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/permissions';
import { logAuditEvent } from '@/lib/audit/log';

const inputSchema = z.object({
  ruleCode: z.string(),
  isActive: z.boolean(),
  paramsOverride: z.record(z.union([z.number(), z.string(), z.boolean()])),
  notes: z.string().max(500).optional(),
});

export async function updateComplianceRuleOverride(
  rawInput: z.input<typeof inputSchema>,
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  const parsed = inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: 'Validation: ' + parsed.error.message };
  }
  const { ruleCode, isActive, paramsOverride, notes } = parsed.data;

  const permCheck = await requirePermission('compliance_rules.config.write');
  if (!permCheck.ok) return permCheck;

  const supabase = createServerClient();

  // 1. Charger la definition pour valider params_schema
  const { data: definition } = await supabase
    .from('compliance_rule_definitions')
    .select('params_schema, default_params, severity_default, is_active_by_default')
    .eq('rule_code', ruleCode)
    .single();

  if (!definition) return { ok: false, error: `Rule ${ruleCode} introuvable` };

  // 2. Valider paramsOverride contre params_schema
  const validation = validateParamsAgainstSchema(paramsOverride, definition.params_schema);
  if (!validation.ok) return { ok: false, error: validation.error };

  // 3. Charger l'override existant pour computer le diff
  const { data: existing } = await supabase
    .from('compliance_rule_overrides')
    .select('*')
    .eq('rule_code', ruleCode)
    .maybeSingle();

  const before = {
    is_active: existing?.is_active ?? definition.is_active_by_default,
    params: existing?.params_override ?? {},
  };
  const after = { is_active: isActive, params: paramsOverride };
  const diff = computeDiff(before, after);

  // 4. UPSERT override
  const { data: upserted, error: upsertError } = await supabase
    .from('compliance_rule_overrides')
    .upsert(
      {
        rule_code: ruleCode,
        is_active: isActive,
        params_override: paramsOverride,
        notes: notes ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'org_id,rule_code' },
    )
    .select('id')
    .single();

  if (upsertError) return { ok: false, error: upsertError.message };

  // 5. Audit log
  await logAuditEvent({
    event_type: !isActive
      ? 'compliance_rule.deactivated'
      : Object.keys(diff).length === 0
        ? 'compliance_rule.activated'
        : 'compliance_rule.params_updated',
    metadata: { rule_code: ruleCode, before, after, diff, notes },
  });

  return { ok: true, data: { id: upserted.id } };
}

function validateParamsAgainstSchema(
  params: Record<string, unknown>,
  schema: Record<string, { type: string; min?: number; max?: number }>,
): { ok: true } | { ok: false; error: string } {
  for (const [key, value] of Object.entries(params)) {
    const def = schema[key];
    if (!def) return { ok: false, error: `Paramètre inconnu: ${key}` };
    if (def.type === 'integer' && (typeof value !== 'number' || !Number.isInteger(value))) {
      return { ok: false, error: `${key} doit être un entier` };
    }
    if (def.type === 'number' && typeof value !== 'number') {
      return { ok: false, error: `${key} doit être un nombre` };
    }
    if (typeof value === 'number') {
      if (def.min !== undefined && value < def.min) {
        return { ok: false, error: `${key} doit être >= ${def.min}` };
      }
      if (def.max !== undefined && value > def.max) {
        return { ok: false, error: `${key} doit être <= ${def.max}` };
      }
    }
  }
  return { ok: true };
}

function computeDiff(before: any, after: any): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  if (before.is_active !== after.is_active) {
    diff.is_active = { from: before.is_active, to: after.is_active };
  }
  const allKeys = new Set([...Object.keys(before.params), ...Object.keys(after.params)]);
  for (const k of allKeys) {
    if (before.params[k] !== after.params[k]) {
      diff[k] = { from: before.params[k], to: after.params[k] };
    }
  }
  return diff;
}
```

### 3.4 Server Action `simulateComplianceChange`

Pour la fonctionnalité what-if (Q5 = a).

```typescript
'use server';

import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/permissions';

const simulateInputSchema = z.object({
  ruleCode: z.string(),
  proposedParams: z.record(z.union([z.number(), z.string(), z.boolean()])),
  proposedActive: z.boolean(),
});

type SimulationResult = {
  ruleCode: string;
  scope: string;
  // Counts d'objets actuellement compliants vs après changement
  currentCompliant: number;
  currentNonCompliant: number;
  afterCompliant: number;
  afterNonCompliant: number;
  // Delta : nouveaux blocking
  newlyBlocked: number;
  newlyUnblocked: number;
  // Sample des objets impactés (max 10)
  sampleNewlyBlocked: Array<{ id: string; label: string; reason: string }>;
};

export async function simulateComplianceChange(
  raw: z.input<typeof simulateInputSchema>,
): Promise<{ ok: true; data: SimulationResult } | { ok: false; error: string }> {
  const parsed = simulateInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.message };

  const permCheck = await requirePermission('compliance_rules.config.write');
  if (!permCheck.ok) return permCheck;

  const { ruleCode, proposedParams, proposedActive } = parsed.data;
  const supabase = createServerClient();

  // 1. Charger definition + override actuel
  const { data: definition } = await supabase
    .from('compliance_rule_definitions')
    .select('scope, default_params')
    .eq('rule_code', ruleCode)
    .single();
  if (!definition) return { ok: false, error: `Rule ${ruleCode} introuvable` };

  const { data: currentOverride } = await supabase
    .from('compliance_rule_overrides')
    .select('is_active, params_override')
    .eq('rule_code', ruleCode)
    .maybeSingle();

  const currentParams = {
    ...definition.default_params,
    ...(currentOverride?.params_override ?? {}),
  };
  const currentActive = currentOverride?.is_active ?? true;
  const futureParams = { ...definition.default_params, ...proposedParams };

  // 2. Selon le scope, exécuter la rule sur l'ensemble des objets de l'org
  // V1 : on ne supporte que les rules avec un seuil temporel ou numérique simple
  // (les autres rules retournent { simulationSupported: false })
  const result = await runSimulationForScope(
    definition.scope,
    ruleCode,
    currentParams,
    currentActive,
    futureParams,
    proposedActive,
  );

  return { ok: true, data: result };
}

async function runSimulationForScope(
  scope: string,
  ruleCode: string,
  currentParams: Record<string, unknown>,
  currentActive: boolean,
  futureParams: Record<string, unknown>,
  futureActive: boolean,
): Promise<SimulationResult> {
  // Implémentation par scope (ne couvre que les rules paramétriques simples V1)
  // Voir section 4.5 pour le mapping scope → simulation function
  switch (ruleCode) {
    case 'VALUATION_STALE_BLOCKING':
      return simulateValuationStale(currentParams, currentActive, futureParams, futureActive);
    case 'FMV_DEVIATION_WARNING':
      return simulateFmvDeviation(currentParams, currentActive, futureParams, futureActive);
    case 'PLAN_PUBLISH_REQUIRES_VALUATION':
      return simulatePlanPublishStale(currentParams, currentActive, futureParams, futureActive);
    case 'AWARD_DRAFT_TO_PROPOSED_VALIDATION':
      return simulateAwardTransitionStale(currentParams, currentActive, futureParams, futureActive);
    case 'DILUTION_THRESHOLD_WARNING':
      return simulateDilutionThreshold(currentParams, currentActive, futureParams, futureActive);
    // ... pour les rules V1
    default:
      return {
        ruleCode,
        scope: 'unsupported',
        currentCompliant: 0,
        currentNonCompliant: 0,
        afterCompliant: 0,
        afterNonCompliant: 0,
        newlyBlocked: 0,
        newlyUnblocked: 0,
        sampleNewlyBlocked: [],
      };
  }
}

// Implémentation détaillée pour VALUATION_STALE_BLOCKING (les autres suivent le même pattern)
async function simulateValuationStale(
  current: Record<string, unknown>,
  currentActive: boolean,
  future: Record<string, unknown>,
  futureActive: boolean,
): Promise<SimulationResult> {
  const supabase = createServerClient();
  // SELECT all plans of the org with their latest valuation
  const { data: plans } = await supabase
    .from('plans')
    .select(
      `
      id, name,
      latest_valuation:latest_valuation_per_plan!plan_id(valued_at)
    `,
    )
    .eq('archived_at', null);

  if (!plans) return emptySimulation('VALUATION_STALE_BLOCKING', 'plan');

  const currentStaleDays = (current.staleDays as number) ?? 90;
  const futureStaleDays = (future.staleDays as number) ?? 90;
  const now = Date.now();

  let currentCompliant = 0,
    currentNonCompliant = 0;
  let afterCompliant = 0,
    afterNonCompliant = 0;
  const sampleNewlyBlocked: SimulationResult['sampleNewlyBlocked'] = [];

  for (const plan of plans) {
    const valuedAt = plan.latest_valuation?.[0]?.valued_at;
    const ageDays = valuedAt
      ? Math.floor((now - new Date(valuedAt).getTime()) / 86400000)
      : Infinity;

    const isCurrentCompliant = !currentActive || ageDays <= currentStaleDays;
    const isFutureCompliant = !futureActive || ageDays <= futureStaleDays;

    if (isCurrentCompliant) currentCompliant++;
    else currentNonCompliant++;
    if (isFutureCompliant) afterCompliant++;
    else afterNonCompliant++;

    if (isCurrentCompliant && !isFutureCompliant && sampleNewlyBlocked.length < 10) {
      sampleNewlyBlocked.push({
        id: plan.id,
        label: plan.name,
        reason: `Valuation à ${ageDays}j > nouveau seuil ${futureStaleDays}j`,
      });
    }
  }

  const newlyBlocked =
    sampleNewlyBlocked.length > 10 ? sampleNewlyBlocked.length : sampleNewlyBlocked.length;
  // Le compteur exact est computed séparément si > 10
  // ...

  return {
    ruleCode: 'VALUATION_STALE_BLOCKING',
    scope: 'plan',
    currentCompliant,
    currentNonCompliant,
    afterCompliant,
    afterNonCompliant,
    newlyBlocked: currentCompliant - afterCompliant,
    newlyUnblocked: afterCompliant - currentCompliant,
    sampleNewlyBlocked,
  };
}

function emptySimulation(ruleCode: string, scope: string): SimulationResult {
  return {
    ruleCode,
    scope,
    currentCompliant: 0,
    currentNonCompliant: 0,
    afterCompliant: 0,
    afterNonCompliant: 0,
    newlyBlocked: 0,
    newlyUnblocked: 0,
    sampleNewlyBlocked: [],
  };
}
```

### 3.5 Server Action `listComplianceRulesForUI`

Pour la page settings UI.

```typescript
'use server';

import { createServerClient } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/permissions';

export async function listComplianceRulesForUI() {
  const permCheck = await requirePermission('compliance_rules.config.write');
  if (!permCheck.ok) return permCheck;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('effective_compliance_rules')
    .select(
      `
      rule_code, scope, description_fr,
      is_active, effective_severity, effective_params,
      is_overridden, override_notes, override_updated_at, override_updated_by,
      cta_url_template
    `,
    )
    .order('scope')
    .order('rule_code');

  if (error) return { ok: false, error: error.message };

  // Group par scope
  const grouped = data.reduce(
    (acc, row) => {
      if (!acc[row.scope]) acc[row.scope] = [];
      acc[row.scope].push(row);
      return acc;
    },
    {} as Record<string, typeof data>,
  );

  return { ok: true, data: grouped };
}
```

### 3.6 Server Action `getComplianceRuleAuditLog`

```typescript
'use server';

export async function getComplianceRuleAuditLog(ruleCode: string) {
  const permCheck = await requirePermission('compliance_rules.config.write');
  if (!permCheck.ok) return permCheck;

  const supabase = createServerClient();
  const { data } = await supabase
    .from('audit_events')
    .select('id, event_type, metadata, created_at, user_id, user:users(email)')
    .in('event_type', [
      'compliance_rule.activated',
      'compliance_rule.deactivated',
      'compliance_rule.params_updated',
    ])
    .eq('metadata->>rule_code', ruleCode)
    .order('created_at', { ascending: false })
    .limit(50);

  return { ok: true, data: data ?? [] };
}
```

---

## 4. UI — Page settings compliance

### 4.1 Localisation

`apps/web/src/app/(dashboard)/dashboard/settings/compliance/page.tsx`

Server Component qui charge la liste groupée par scope, et délègue à un Client Component pour l'interactivité (toggle + dialog d'édition).

Permission requise : `compliance_rules.config.write` (OWNER seulement V1).

### 4.2 Layout et hiérarchie

```
┌──────────────────────────────────────────────────────────────────┐
│ Configuration Compliance                                          │
│ Personnalisez les règles de validation pour votre organisation.   │
│                                                                    │
│ [Réinitialiser tout aux défauts]                                  │
│                                                                    │
│ ┌──── Section : VALORISATION ────────────────────────────────┐    │
│ │ ▶ VALUATION_STALE_BLOCKING                            [✓] │    │
│ │   error · Valorisation IFRS 2 datée de moins de N jours    │    │
│ │   Seuil actuel : 90 jours                                  │    │
│ │   [Modifier]  [Voir l'historique]                          │    │
│ │                                                              │    │
│ │ ▶ FMV_DEVIATION_WARNING                              [✓]  │    │
│ │   warning · Alerte si FMV diffère de >X% vs précédente    │    │
│ │   Seuil actuel : 20%                                       │    │
│ │   [Modifier]  [Voir l'historique]                          │    │
│ └────────────────────────────────────────────────────────────┘    │
│                                                                    │
│ ┌──── Section : PLANS ────────────────────────────────────┐       │
│ │ ▶ PLAN_VESTING_SCHEDULE_VALID                       [✓] │       │
│ │   error · Pas de paramètre configurable                  │       │
│ │   ...                                                     │       │
│ └─────────────────────────────────────────────────────────┘       │
│                                                                    │
│ [+ 6 autres sections : awards, beneficiaries, exercise, etc.]     │
└──────────────────────────────────────────────────────────────────┘
```

### 4.3 Composants

#### `ComplianceRuleCard` (Client Component)

Une card par rule. Affiche état actuel + boutons.

```typescript
'use client';

import { useState } from 'react';
import { Toggle } from '@/components/ui/toggle';
import { Button } from '@/components/ui/button';
import { ComplianceRuleEditDialog } from './ComplianceRuleEditDialog';
import { ComplianceRuleAuditDialog } from './ComplianceRuleAuditDialog';

type ComplianceRuleCardProps = {
  rule: {
    rule_code: string;
    description_fr: string;
    is_active: boolean;
    effective_severity: 'error' | 'warning';
    effective_params: Record<string, unknown>;
    is_overridden: boolean;
    paramsSchema?: Record<string, { type: string; min?: number; max?: number; label_fr?: string }>;
  };
  onUpdate: () => void; // refresh server component
};

export function ComplianceRuleCard({ rule, onUpdate }: ComplianceRuleCardProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  const hasParams = Object.keys(rule.effective_params).length > 0;
  const severityColor = rule.effective_severity === 'error' ? 'text-red-600' : 'text-amber-600';

  return (
    <div className={`border rounded-lg p-4 ${rule.is_overridden ? 'bg-paper-100 border-brass-300' : 'bg-white'}`}>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono">{rule.rule_code}</code>
            <span className={`text-xs uppercase ${severityColor}`}>
              {rule.effective_severity}
            </span>
            {rule.is_overridden && (
              <span className="text-xs bg-brass-200 text-brass-900 px-2 py-0.5 rounded-full">
                Personnalisée
              </span>
            )}
          </div>
          <p className="text-sm text-ink-700 mt-1">{rule.description_fr}</p>
          {hasParams && rule.is_active && (
            <p className="text-xs text-ink-500 mt-2 font-mono">
              {Object.entries(rule.effective_params)
                .map(([k, v]) => `${k} = ${v}`)
                .join(' · ')}
            </p>
          )}
        </div>
        <Toggle
          checked={rule.is_active}
          onChange={(active) => updateActive(rule.rule_code, active, onUpdate)}
        />
      </div>
      <div className="flex gap-2 mt-3">
        {hasParams && (
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            Modifier les seuils
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => setAuditOpen(true)}>
          Historique
        </Button>
      </div>
      {editOpen && (
        <ComplianceRuleEditDialog
          rule={rule}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); onUpdate(); }}
        />
      )}
      {auditOpen && (
        <ComplianceRuleAuditDialog
          ruleCode={rule.rule_code}
          onClose={() => setAuditOpen(false)}
        />
      )}
    </div>
  );
}

async function updateActive(ruleCode: string, active: boolean, refresh: () => void) {
  const { updateComplianceRuleOverride } = await import('@/server/actions/complianceRules');
  await updateComplianceRuleOverride({ ruleCode, isActive: active, paramsOverride: {} });
  refresh();
}
```

#### `ComplianceRuleEditDialog`

Dialog d'édition des seuils. Inclut le **what-if simulator** (Q5 = a).

```typescript
'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input, Button, Alert } from '@/components/ui';
import { simulateComplianceChange, updateComplianceRuleOverride } from '@/server/actions/complianceRules';

export function ComplianceRuleEditDialog({ rule, onClose, onSaved }) {
  const [params, setParams] = useState<Record<string, unknown>>(rule.effective_params);
  const [simulation, setSimulation] = useState<any>(null);
  const [simLoading, setSimLoading] = useState(false);

  // Run simulation on params change (debounced)
  useEffect(() => {
    if (JSON.stringify(params) === JSON.stringify(rule.effective_params)) {
      setSimulation(null);
      return;
    }
    setSimLoading(true);
    const timeoutId = setTimeout(async () => {
      const result = await simulateComplianceChange({
        ruleCode: rule.rule_code,
        proposedParams: params,
        proposedActive: rule.is_active,
      });
      setSimulation(result.ok ? result.data : null);
      setSimLoading(false);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [params]);

  async function handleSave() {
    const result = await updateComplianceRuleOverride({
      ruleCode: rule.rule_code,
      isActive: rule.is_active,
      paramsOverride: params,
    });
    if (result.ok) onSaved();
    else alert('Erreur : ' + result.error);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Modifier {rule.rule_code}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Inputs pour chaque param */}
          {Object.entries(rule.paramsSchema ?? {}).map(([key, def]) => (
            <div key={key}>
              <label className="block text-sm font-medium mb-1">
                {def.label_fr ?? key}
                <span className="text-xs text-ink-500 ml-2">
                  (entre {def.min ?? '∞'} et {def.max ?? '∞'})
                </span>
              </label>
              <Input
                type={def.type === 'integer' ? 'number' : 'text'}
                value={params[key] as number}
                onChange={(e) => setParams({ ...params, [key]: Number(e.target.value) })}
                min={def.min}
                max={def.max}
              />
            </div>
          ))}

          {/* What-if simulator */}
          {simLoading && <p className="text-sm text-ink-500">Calcul de l'impact en cours…</p>}
          {simulation && (
            <Alert variant={simulation.newlyBlocked > 0 ? 'warning' : 'info'}>
              <h4 className="font-semibold">Impact prévu</h4>
              <ul className="text-sm space-y-1 mt-2">
                <li>{simulation.afterCompliant} objets resteront conformes (vs {simulation.currentCompliant} actuellement)</li>
                <li>{simulation.afterNonCompliant} objets seront non-conformes (vs {simulation.currentNonCompliant})</li>
                {simulation.newlyBlocked > 0 && (
                  <li className="text-red-700 font-semibold">
                    ⚠ {simulation.newlyBlocked} nouveaux objets seront bloqués
                  </li>
                )}
              </ul>
              {simulation.sampleNewlyBlocked.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm">
                    Aperçu des objets impactés
                  </summary>
                  <ul className="mt-2 text-sm">
                    {simulation.sampleNewlyBlocked.map((s) => (
                      <li key={s.id}>• <strong>{s.label}</strong> — {s.reason}</li>
                    ))}
                  </ul>
                </details>
              )}
              <p className="text-xs text-ink-500 mt-2">
                Note : le changement est <strong>prospectif</strong>. Les transitions déjà effectuées ne sont pas affectées.
              </p>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuler</Button>
          <Button onClick={handleSave}>Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

#### `ComplianceRuleAuditDialog`

Affiche l'historique des changements pour cette rule (audit_events).

```typescript
'use client';

import { useEffect, useState } from 'react';
import { getComplianceRuleAuditLog } from '@/server/actions/complianceRules';

export function ComplianceRuleAuditDialog({ ruleCode, onClose }) {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    getComplianceRuleAuditLog(ruleCode).then((res) => {
      if (res.ok) setEvents(res.data);
    });
  }, [ruleCode]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Historique de {ruleCode}</DialogTitle>
        </DialogHeader>
        {events.length === 0 ? (
          <p className="text-sm text-ink-500">
            Aucune modification depuis la configuration par défaut.
          </p>
        ) : (
          <ul className="space-y-3 max-h-96 overflow-y-auto">
            {events.map((e) => (
              <li key={e.id} className="border-l-2 border-brass-300 pl-3 py-1">
                <div className="text-xs text-ink-500">
                  {new Date(e.created_at).toLocaleString('fr-FR')}
                  {e.user?.email && ` · ${e.user.email}`}
                </div>
                <div className="text-sm font-medium mt-1">{eventTypeLabel(e.event_type)}</div>
                {e.metadata.diff && Object.keys(e.metadata.diff).length > 0 && (
                  <div className="text-xs text-ink-600 mt-1 font-mono">
                    {Object.entries(e.metadata.diff).map(([k, change]: any) => (
                      <div key={k}>{k}: {String(change.from)} → {String(change.to)}</div>
                    ))}
                  </div>
                )}
                {e.metadata.notes && (
                  <p className="text-xs text-ink-500 italic mt-1">{e.metadata.notes}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function eventTypeLabel(et: string) {
  switch (et) {
    case 'compliance_rule.activated': return '✓ Règle activée';
    case 'compliance_rule.deactivated': return '✗ Règle désactivée';
    case 'compliance_rule.params_updated': return '✏ Seuils modifiés';
    default: return et;
  }
}
```

### 4.4 Reset to defaults

Bouton global "Réinitialiser tout aux défauts" qui appelle un SA `resetAllComplianceOverrides`.

```typescript
'use server';

export async function resetAllComplianceOverrides() {
  const permCheck = await requirePermission('compliance_rules.config.write');
  if (!permCheck.ok) return permCheck;

  const supabase = createServerClient();
  // Soft delete : on supprime tous les overrides → la vue retombe sur les défauts
  const { error } = await supabase
    .from('compliance_rule_overrides')
    .delete()
    .eq('org_id' /* current org via RLS */);

  if (error) return { ok: false, error: error.message };

  await logAuditEvent({
    event_type: 'compliance_rule.reset_all',
    metadata: { all_overrides_removed: true },
  });

  return { ok: true };
}
```

⚠️ **Confirmation modale obligatoire** avant ce reset (scope global = action irréversible sans audit individuel).

### 4.5 Sidebar nav

Ajouter dans `apps/web/src/components/shared/dashboard-sidebar.tsx` :

```typescript
// Section "PARAMÈTRES" (existante)
{
  label: 'Compliance',
  href: '/dashboard/settings/compliance',
  icon: ShieldCheckIcon,
  // Visible uniquement si user a la permission
  requiredPermission: 'compliance_rules.config.write',
}
```

---

## 5. Migration des 22 rules existantes

C'est le cœur opérationnel de Module 12. La migration est en 3 étapes :

### 5.1 Étape A — Inventaire et seed des definitions

Migration `00094_module_12_compliance_engine_v2.sql` :

```sql
-- 1. Création des tables (cf section 2.1)
CREATE TABLE compliance_rule_definitions (...);
CREATE TABLE compliance_rule_overrides (...);
CREATE VIEW effective_compliance_rules AS (...);
CREATE FUNCTION get_effective_rule(...) ...;

-- 2. Seed des 22 rules (chacune avec ses params + default + description)

-- VALORISATION (2)
INSERT INTO compliance_rule_definitions (rule_code, scope, severity_default, description_fr, params_schema, default_params, cta_url_template) VALUES
('VALUATION_STALE_BLOCKING', 'valuation', 'error',
 'Valorisation IFRS 2 datée de moins de N jours obligatoire',
 '{"staleDays": {"type": "integer", "min": 30, "max": 365, "default": 90, "label_fr": "Seuil péremption (jours)"}}',
 '{"staleDays": 90}',
 '/dashboard/plans/{planId}/valuations'),
('FMV_DEVIATION_WARNING', 'valuation', 'warning',
 'Alerte si dernière FMV diffère de >X% vs valorisation précédente',
 '{"deviationPct": {"type": "integer", "min": 5, "max": 100, "default": 20, "label_fr": "Seuil déviation (%)"}}',
 '{"deviationPct": 20}',
 NULL);

-- PLANS (4)
INSERT INTO compliance_rule_definitions (rule_code, scope, severity_default, description_fr, params_schema, default_params) VALUES
('PLAN_VESTING_SCHEDULE_VALID', 'plan', 'error',
 'Le vesting schedule doit sommer à 100% et avoir au moins 1 tranche',
 '{}', '{}'),
('PLAN_DRAFT_HAS_REQUIRED_FIELDS', 'plan', 'error',
 'Avant publication, plan doit avoir name, type, total_units, vesting_schedule',
 '{}', '{}'),
('PLAN_PUBLISH_REQUIRES_VALUATION', 'plan', 'error',
 'Plan ne peut passer DRAFT→PUBLISHED sans valuation_run SUCCESS récent',
 '{"staleDays": {"type": "integer", "min": 30, "max": 365, "default": 90, "label_fr": "Seuil péremption (jours)"}}',
 '{"staleDays": 90}'),
('PLAN_TYPE_FRENCH_REQUIRES_AGREEMENT', 'plan', 'warning',
 'Plans BSPCE/AGA en France nécessitent une assemblée générale',
 '{}', '{}');

-- AWARDS (5)
INSERT INTO compliance_rule_definitions (rule_code, scope, severity_default, description_fr, params_schema, default_params) VALUES
('AWARD_UNITS_POSITIVE', 'award', 'error',
 'units_granted > 0 obligatoire',
 '{}', '{}'),
('AWARD_BENEFICIARY_ACTIVE', 'award', 'error',
 'Le bénéficiaire doit être ACTIVE (pas TERMINATED)',
 '{}', '{}'),
('AWARD_GRANT_DATE_VALID', 'award', 'error',
 'grant_date doit être dans le passé ou aujourd''hui',
 '{}', '{}'),
('AWARD_DRAFT_TO_PROPOSED_VALIDATION', 'award', 'error',
 'Transition DRAFT→PROPOSED nécessite plan PUBLISHED + beneficiary ACTIVE + valuation OK',
 '{"staleDays": {"type": "integer", "min": 30, "max": 365, "default": 90, "label_fr": "Seuil péremption valuation (jours)"}}',
 '{"staleDays": 90}'),
('AWARD_PROPOSED_TO_GRANTED_REQUIRES_APPROVAL', 'award', 'error',
 'Transition PROPOSED→GRANTED nécessite approval workflow validé',
 '{}', '{}');

-- BENEFICIARIES (2)
INSERT INTO compliance_rule_definitions (rule_code, scope, severity_default, description_fr, params_schema, default_params) VALUES
('BENEFICIARY_TAX_PROFILE_REQUIRED', 'beneficiary', 'warning',
 'Profile fiscal manquant peut bloquer l''exercice plus tard',
 '{}', '{}'),
('BENEFICIARY_TERMINATION_HAS_DATE', 'beneficiary', 'error',
 'Si status = TERMINATED, termination_date obligatoire',
 '{}', '{}');

-- CAP TABLE (3)
INSERT INTO compliance_rule_definitions (rule_code, scope, severity_default, description_fr, params_schema, default_params) VALUES
('DILUTION_THRESHOLD_WARNING', 'cap_table', 'warning',
 'Si nouvelle émission > X% de la cap table → warning',
 '{"dilutionPct": {"type": "number", "min": 1, "max": 50, "default": 15, "label_fr": "Seuil dilution (%)"}}',
 '{"dilutionPct": 15}'),
('POOL_DEPLETION_WARNING', 'cap_table', 'warning',
 'Si pool ESOP utilisé > X% → alerte',
 '{"poolUsagePct": {"type": "integer", "min": 50, "max": 100, "default": 80, "label_fr": "Seuil utilisation pool (%)"}}',
 '{"poolUsagePct": 80}'),
('SHAREHOLDER_AGREEMENT_VIOLATION', 'cap_table', 'error',
 'Émission > seuil pacte d''actionnaires sans approval',
 '{"agreementThreshold": {"type": "number", "min": 0.01, "max": 100, "default": 5, "label_fr": "Seuil pacte (%)"}}',
 '{"agreementThreshold": 5}');

-- EXERCISE (3)
INSERT INTO compliance_rule_definitions (rule_code, scope, severity_default, description_fr, params_schema, default_params) VALUES
('EXERCISE_WINDOW_VALID', 'exercise', 'error',
 'exercise_date dans la fenêtre d''exercice du plan',
 '{}', '{}'),
('EXERCISE_AVAILABLE_UNITS', 'exercise', 'error',
 'units_exercised <= units_vested - units_already_exercised',
 '{}', '{}'),
('EXERCISE_TAX_WITHHOLDING_OK', 'exercise', 'warning',
 'Si tax withholding requis et pas configuré → warning',
 '{}', '{}');

-- APPROVAL (2)
INSERT INTO compliance_rule_definitions (rule_code, scope, severity_default, description_fr, params_schema, default_params) VALUES
('APPROVAL_QUORUM_REQUIRED', 'approval', 'error',
 'Approval doit avoir N approbateurs minimum',
 '{"minApprovers": {"type": "integer", "min": 1, "max": 10, "default": 2, "label_fr": "Approbateurs minimum"}}',
 '{"minApprovers": 2}'),
('APPROVAL_DUAL_SIGNATURE', 'approval', 'warning',
 'Plans > X € exigent 2 signatures distinctes',
 '{"amountThreshold": {"type": "integer", "min": 10000, "max": 10000000, "default": 500000, "label_fr": "Seuil double signature (€)"}}',
 '{"amountThreshold": 500000}');

-- DOCUMENT (1)
INSERT INTO compliance_rule_definitions (rule_code, scope, severity_default, description_fr, params_schema, default_params) VALUES
('DOCUMENT_TEMPLATE_REQUIRED', 'document', 'error',
 'Award PROPOSED nécessite document généré depuis template',
 '{}', '{}');

-- 3. Seeder permission compliance_rules.config.write
INSERT INTO permissions (code, label, description) VALUES
  ('compliance_rules.config.write', 'Configurer les règles compliance',
   'Permet de modifier seuils, activer/désactiver compliance rules');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'OWNER' AND p.code = 'compliance_rules.config.write';
```

### 5.2 Étape B — Refactor des fichiers rules.ts

Pour chaque fichier `apps/web/src/lib/compliance/rules/*.ts`, remplacer les seuils en dur par lecture des params.

Exemple `valuationRules.ts` (déjà partiellement OK depuis Module 11) :

**AVANT** :

```typescript
export const VALUATION_STALE_BLOCKING: ComplianceRule = {
  id: 'VALUATION_STALE_BLOCKING',
  type: 'hard',
  scope: 'plan',
  description: 'Valorisation IFRS 2 datée de moins de 90 jours obligatoire',
  async check(ctx) {
    const ageInDays = Math.floor(...);
    if (ageInDays > 90) {  // ← seuil en dur
      return { passed: false, severity: 'blocking', ... };
    }
    return { passed: true, ... };
  },
};
```

**APRÈS** :

```typescript
export const VALUATION_STALE_BLOCKING_CHECKER = async (
  ctx: ComplianceCheckContext,
  params: Record<string, unknown>,
  severity: 'error' | 'warning'
): Promise<ComplianceResult> => {
  const staleDays = (params.staleDays as number) ?? 90;
  const ageInDays = Math.floor(...);
  if (ageInDays > staleDays) {
    return {
      passed: false,
      severity,
      message: `Valorisation périmée (${ageInDays} jours, seuil = ${staleDays})`,
      metadata: { ageInDays, threshold: staleDays },
    };
  }
  return { passed: true, severity: 'info' };
};

export const VALUATION_RULE_CHECKERS = {
  VALUATION_STALE_BLOCKING: VALUATION_STALE_BLOCKING_CHECKER,
  FMV_DEVIATION_WARNING: FMV_DEVIATION_WARNING_CHECKER,
};
```

Le `runValuationComplianceChecks` (déjà mis à jour en B6 Module 11) sera refactoré une fois pour utiliser `loadEffectiveRule` (cf section 3.2).

### 5.3 Étape C — Inventaire des fichiers à modifier

| Fichier                                                 | Rules concernées        | LOC estimé             |
| ------------------------------------------------------- | ----------------------- | ---------------------- |
| `apps/web/src/lib/compliance/rules/valuationRules.ts`   | 2 (déjà fait Module 11) | ~30                    |
| `apps/web/src/lib/compliance/rules/planRules.ts`        | 4                       | ~60                    |
| `apps/web/src/lib/compliance/rules/awardRules.ts`       | 5                       | ~80                    |
| `apps/web/src/lib/compliance/rules/beneficiaryRules.ts` | 2                       | ~30                    |
| `apps/web/src/lib/compliance/rules/capTableRules.ts`    | 3                       | ~50                    |
| `apps/web/src/lib/compliance/rules/exerciseRules.ts`    | 3                       | ~40                    |
| `apps/web/src/lib/compliance/rules/approvalRules.ts`    | 2                       | ~30                    |
| `apps/web/src/lib/compliance/rules/documentRules.ts`    | 1                       | ~15                    |
| `apps/web/src/lib/compliance/runChecks.ts`              | wiring orchestrateur    | ~80                    |
| **Total**                                               | **22 rules**            | **~415 LOC modifiées** |

### 5.4 Effet prospectif (Q4 = b)

**Important** : tous les overrides ont effet **prospectif uniquement**. Concrètement :

- Les awards déjà transités (DRAFT→PROPOSED→GRANTED) ne sont PAS re-validés rétroactivement
- Les checks tournent uniquement à chaque NOUVELLE action utilisateur (transition, exercice, etc.)
- Les warnings/errors sont calculés à chaque chargement de page (UI) avec les params **courants**

→ Cela signifie qu'une rule désactivée puis réactivée ne fait pas re-vérifier l'historique. C'est un choix de **stabilité opérationnelle**.

**Override admin (V2)** : si un OWNER a vraiment besoin de re-valider l'historique, il peut lancer un `recheckHistorical` job manuel (pas dans V1).

---

## 6. Tests

### 6.1 Tests Vitest backend

**`compliance_rule_overrides` SA tests (10+ tests)**

- updateOverride happy path
- Permission denied (non-OWNER)
- ruleCode invalide
- params invalide (out of range)
- Diff calculé correctement
- Audit log inséré
- UPSERT (overwrite) fonctionnel
- Toggle is_active = true → false → true
- params merge default + override

**`simulateComplianceChange` tests (8+ tests)**

- VALUATION_STALE_BLOCKING : simulation 90j → 60j sur 5 plans
- FMV_DEVIATION_WARNING : simulation 20% → 10%
- Rule désactivée → simulation retourne tous compliants
- Empty data (org sans plans) → counts à 0
- Sample newlyBlocked limité à 10 max
- Compteur exact si > 10
- Permission denied

**`loadEffectiveRule` tests (4 tests)**

- Rule sans override → retourne defaults
- Rule avec override actif → retourne merged
- Rule désactivée → is_active=false
- Rule inexistante → null

### 6.2 Tests refactorés des rules existantes

Les tests existants des rules (Module 11 valuationRules.test.ts, Module 10 capTableRules.test.ts, etc.) doivent être **refactorés** pour passer les params en argument au lieu de tester avec seuils en dur.

Exemple :

```typescript
// AVANT
it('blocks if valuation > 90 days old', async () => {
  // ...
  const result = await VALUATION_STALE_BLOCKING.check(ctx);
  expect(result.passed).toBe(false);
});

// APRÈS
it('blocks if valuation > staleDays threshold', async () => {
  const ctx = makeCtxWithStaleValuation(95);
  const result = await VALUATION_STALE_BLOCKING_CHECKER(ctx, { staleDays: 90 }, 'error');
  expect(result.passed).toBe(false);
});

it('does not block if staleDays raised to 120', async () => {
  const ctx = makeCtxWithStaleValuation(95);
  const result = await VALUATION_STALE_BLOCKING_CHECKER(ctx, { staleDays: 120 }, 'error');
  expect(result.passed).toBe(true);
});
```

### 6.3 Tests UI (jsdom)

- ComplianceRuleCard : toggle on/off
- ComplianceRuleEditDialog : input validation (out of range)
- What-if simulator : debounce 500ms, affichage Alert avec sample
- Permission gate : page vide si pas de permission

### 6.4 Tests d'intégration end-to-end

- E2E manuel scénarios :
  1. OWNER se connecte, ouvre `/dashboard/settings/compliance`
  2. Désactive `VALUATION_STALE_BLOCKING`
  3. Tente une transition d'award sur plan stale → passe (rule désactivée)
  4. Réactive la rule + change seuil 90 → 60
  5. Voit la what-if simulation : "3 plans seront non-compliants"
  6. Enregistre → 3 plans deviennent flagged
  7. Vérifie l'audit log : 3 events (deactivated → params_updated → activated)

---

## 7. Phases d'implémentation B0-B6

Module 12 suit le même pattern de phasage que Modules 10/11.

### B0 — Pre-flight (David, hors-Claude)

- [ ] Vérifier que master est stable (925 tests verts)
- [ ] Créer branche `feat/module-12-compliance-engine-v2` depuis master
- [ ] Créer PR draft #28 pour traçabilité
- [ ] Commit cette spec dans `docs/MODULE_12_COMPLIANCE_ENGINE_V2.md`

**Estimation** : 30 minutes.

### B1 — Migration DB + types Zod (0.5j)

Pour ClaudeCode :

- Créer migration `00094_module_12_compliance_engine_v2.sql` :
  - 2 tables (definitions, overrides)
  - 1 vue (effective_compliance_rules)
  - 1 RPC (get_effective_rule)
  - 22 INSERT seed pour les rules
  - 1 nouvelle permission + assign OWNER
- Dry-run BEGIN/ROLLBACK via MCP execute_sql
- Apply via MCP apply_migration
- Régénérer types Supabase
- Créer `packages/shared/src/types/compliance.ts` avec Zod schemas
- 8+ tests Zod
- Commit : "feat(module-12): migration 00094 + types compliance V2"

### B2 — Helper loadEffectiveRule + refactor runChecks orchestrateur (1j)

- Créer `apps/web/src/lib/compliance/effectiveRules.ts`
- Refactor `runChecks.ts` pour lire depuis DB via loadEffectiveRule
- Refactor `runValuationComplianceChecks` (déjà partiellement migré Module 11)
- Refactor des 8 fichiers `*Rules.ts` pour passer params en argument
- Tests refactorés (les anciens passent toujours, +12 nouveaux pour params variables)
- Commit : "refactor(module-12): rules read params from DB"

### B3 — Server Actions configuration (1j)

- updateComplianceRuleOverride
- listComplianceRulesForUI
- getComplianceRuleAuditLog
- resetAllComplianceOverrides
- 15+ tests Vitest sur ces SAs
- Commit : "feat(module-12): server actions configuration"

### B4 — UI page settings + dialogs (1.5j)

- `app/(dashboard)/dashboard/settings/compliance/page.tsx`
- `components/compliance/ComplianceRuleCard.tsx`
- `components/compliance/ComplianceRuleEditDialog.tsx`
- `components/compliance/ComplianceRuleAuditDialog.tsx`
- Sidebar nav update
- Tests UI rendering (jsdom)
- Validation visuelle live (snapshot via preview)
- Commit : "feat(module-12): settings UI compliance"

### B5 — What-if simulator (1j)

- Server Action simulateComplianceChange (5 rules paramétriques V1)
- Wiring dans ComplianceRuleEditDialog avec debounce
- Tests Vitest 8+ sur simulation
- Validation visuelle : modifier seuil VALUATION_STALE_BLOCKING 90→60, voir 3 plans nouvellement bloqués
- Commit : "feat(module-12): what-if simulator"

### B6 — Closure (0.5j)

- E2E manuel 7 scénarios documentés
- `memory/module_12_complete.md` consolidée
- CLAUDE.md update (Module 12 livré, dette éventuelle)
- README repo si nécessaire (page settings compliance documentée)
- Commit : "docs(module-12): closure memory + CLAUDE.md update"

### Estimation totale

| Phase     | Estimation   |
| --------- | ------------ |
| B0        | 0.5h (David) |
| B1        | 0.5j         |
| B2        | 1j           |
| B3        | 1j           |
| B4        | 1.5j         |
| B5        | 1j           |
| B6        | 0.5j         |
| **Total** | **~5.5j**    |

Avec les habituels imprévus, viser **6-7 jours**.

---

## 8. Permissions et RBAC

### 8.1 Nouvelle permission

| Code                            | Label                            | Assignée à          |
| ------------------------------- | -------------------------------- | ------------------- |
| `compliance_rules.config.write` | Configurer les règles compliance | OWNER uniquement V1 |

### 8.2 Permissions héritées

Les utilisateurs normaux (ADMIN_HR, ADMIN_FINANCE, BENEFICIARY) **ne peuvent pas** voir `/dashboard/settings/compliance` ni modifier les rules. Ils continuent à subir les rules effectives normalement.

### 8.3 Permission granulaire V2 (hors scope V1)

V2 pourrait introduire :

- `compliance_rules.config.read` (voir mais pas modifier — pour audit committee)
- `compliance_rules.config.write.scope.<scope>` (modifier rules d'un scope spécifique)

Pas dans V1.

---

## 9. Compatibilité et migration

### 9.1 Pas de breaking change pour les end-users

Module 12 est **transparent pour les end-users** :

- Rien ne change côté UI awards/plans/etc.
- Les rules continuent à se déclencher comme avant
- Seul l'OWNER voit la nouvelle page settings

### 9.2 Breaking change pour les développeurs

Les fichiers `apps/web/src/lib/compliance/rules/*.ts` ont un nouvelle signature :

```typescript
// AVANT
RULE.check(ctx) → ComplianceResult

// APRÈS
RULE_CHECKER(ctx, params, severity) → ComplianceResult
```

Tout le code qui appelle directement les rules (sans passer par `runChecks.ts`) devra être adapté. **Inventaire** : aucun callsite direct identifié dans les Modules 1-11 (toujours via `runChecks.ts`).

### 9.3 Effet rétroactif vs prospectif (rappel Q4)

**Choix V1 : prospectif uniquement**.

Les awards déjà GRANTED restent GRANTED même si on durcit la rule. C'est un choix conservateur pour éviter qu'un OWNER mal intentionné (ou maladroit) ne casse le portefeuille existant.

V2 pourrait introduire un job `recheckHistoricalCompliance` lancé manuellement, mais **pas dans V1**.

---

## 10. Closure et dettes V2

### 10.1 Critères de done Module 12

- [ ] Migration 00094 appliquée cloud
- [ ] 22 rules seedées en DB
- [ ] Page `/dashboard/settings/compliance` fonctionnelle
- [ ] What-if simulator opérationnel sur ≥5 rules
- [ ] Audit log enregistre tous les changements
- [ ] Permission OWNER seulement (V1)
- [ ] Tests workspace verts (estimation ~970 cumul = 925 + 45 nouveaux)
- [ ] 0 régression
- [ ] CLAUDE.md mis à jour
- [ ] memory/module_12_complete.md créée

### 10.2 Dettes V2 attendues

Au cours de B0-B6, on documentera probablement les dettes suivantes (à confirmer à la closure) :

| #    | Dette anticipée                                                                                  | Module ciblé              |
| ---- | ------------------------------------------------------------------------------------------------ | ------------------------- |
| #104 | What-if simulator ne couvre que 5 rules paramétriques sur 22 (les autres retournent unsupported) | 12.5                      |
| #105 | Pas de versioning rollbackable des configurations (Q3 = b uniquement audit)                      | 13                        |
| #106 | Pas de création de rules custom no-code (Q1 = b uniquement)                                      | 13                        |
| #107 | Pas d'override de sévérité (Q1 = b, is_severity_overridable=FALSE par défaut)                    | 13                        |
| #108 | Pas de re-check rétroactif des awards existants après changement de seuil                        | 13                        |
| #109 | Pas d'export d'audit log (CSV/PDF)                                                               | 12.5 ou via Module 6 docs |

### 10.3 Erratums anticipés (post-merge consolidation)

Comme pour Module 10/11, prévoir un patch erratums post-merge si ClaudeCode trouve des incohérences entre cette spec et le code réel.

### 10.4 Suite logique après Module 12

Une fois Module 12 livré, le produit Capiwise dispose de :

- 11 modules métier complets
- Compliance Engine V2 configurable par tenant
- Cap Table dynamique
- Valorisation IFRS 2 + Monte Carlo
- ~970 tests verts
- 8+ Edge Functions deployed
- 90+ migrations cloud appliquées

**Suite recommandée** : Hardening V1.0 release (cf Option C précédente) avant onboarding 1er client beta. Module 13 (rules custom no-code) attend le retour terrain de plusieurs clients.

---

**Fin de spec MODULE_12_COMPLIANCE_ENGINE_V2.md**

Cette spec a été rédigée le 2026-05-04 avec validation choix V1 par David (Q1=b, Q2=a, Q3=b, Q4=b, Q5=a, Q6=a).

Cible : commit dans `docs/MODULE_12_COMPLIANCE_ENGINE_V2.md`, branche `feat/module-12-compliance-engine-v2`, PR #28.
