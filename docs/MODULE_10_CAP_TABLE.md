# MODULE 10 — CAP TABLE DYNAMIQUE

> **Projet :** Equity Platform (Capiwise)
> **Version :** 1.0
> **Date :** Mai 2026
> **Prérequis :** Modules 1 à 9 terminés et validés
> **Audience :** Claude Code (développement)

---

## 0. CONTEXTE & OBJECTIFS

### 0.1 Mission du module

Implémenter le **cap table dynamique** : la vue consolidée et historisée de qui détient quoi dans la société, à n'importe quelle date passée ou future, avec :

- Modélisation des classes d'actions (Common, Preferred A/B/C, ESOP, etc.)
- Historique des levées de fonds (`funding_rounds`) avec termes (preferred liquidation, anti-dilution)
- Snapshots à date (T-1, T-2... pour les deltas et le reporting historisé)
- Simulateur de dilution (scénarios « Et si on lève 5M€ Series A à 25M€ post-money ? »)
- **Simulateur Monte Carlo de sortie** (intégration moteur Python existant) : « Si on sort à 100M€ avec proba 30%, quelle distribution de gains par stakeholder ? »
- Page UI dédiée `/dashboard/captable` avec matrice + visualisations
- Hook automatique sur les exercices Module 9 (FULLY_EXERCISED → émission au registre)
- **Débloque la rule de compliance `AGA_30_PERCENT_CAP`** (dette technique #3 résolue)

C'est le module qui transforme Capiwise d'un **gestionnaire d'attributions** en un **co-pilote stratégique du capital**. Sans cap table, l'admin ne voit que les awards individuellement et n'a aucune vision consolidée ni capacité de simulation.

### 0.2 Décisions structurantes (déjà tranchées)

| Décision                       | Choix retenu                                                                                  | Justification                               |
| ------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Périmètre V1**               | Statique + scénarios de dilution déterministes + Monte Carlo sortie                           | Différenciation forte vs Carta/Pulley en V1 |
| **Waterfall liquidation pref** | Modélisé en V1 (preferred 1x non-participating par défaut)                                    | Indispensable pour scénario sortie réaliste |
| **3 nouvelles tables**         | `share_classes`, `funding_rounds`, `cap_table_snapshots`                                      | Cf §2                                       |
| **RPC central**                | `compute_cap_table(org_id, asof_date, scenario_id?)`                                          | Single source of truth                      |
| **Python Monte Carlo en V1**   | OUI — endpoint `/compute/dilution-monte-carlo` ajouté au Fly engine                           | Reco utilisateur. Coût dev : +2j.           |
| **UI**                         | S'appuie sur design system PR #12 (cap-table-matrix, valuation-toggle, editorial-waterfall)   | Composants squelette déjà créés             |
| **Diluted vs Undiluted**       | Toggle UI 3 modes (Consolidé / Dilué post-ESOP / Pro forma post-round)                        | Standard métier                             |
| **Granularité positions**      | Par stakeholder (founder, investor, beneficiary) + par share_class                            | Permet drill-down                           |
| **Historique**                 | Snapshots automatiques à chaque round + à la demande + nightly cron                           | Reporting CAC + audit IFRS                  |
| **Import historique**          | CSV par share_class avec validation Zod                                                       | Bootstrap des orgs existantes               |
| **Permissions**                | `cap_table.read.all` (admin), `cap_table.read.own` (BENEFICIARY voit seulement ses positions) | Confidentialité                             |

### 0.3 Périmètre exact

**Inclus dans ce module :**

- 3 nouvelles tables principales : `share_classes`, `funding_rounds`, `cap_table_snapshots`
- 2 tables auxiliaires : `cap_table_positions` (la matrice résolue), `dilution_scenarios`
- 4 RPCs SECURITY DEFINER : `compute_cap_table`, `create_funding_round`, `create_dilution_scenario`, `materialize_snapshot`
- 1 Edge Function : `compute-dilution-monte-carlo` (proxy vers Fly.io engine)
- 12 Server Actions : CRUD share_classes + funding_rounds + scenarios + run simulation + bulk import
- Page liste `/dashboard/captable` avec matrice + 4 vues (Tableau / Camembert / Waterfall / Évolution)
- Page scénario `/dashboard/captable/scenarios/[id]` avec simulateur dilution
- Page sortie `/dashboard/captable/exit-simulator` avec Monte Carlo
- Page bénéficiaire `/portal/positions` (lecture seule de ses propres positions)
- Hook automatique : exercise FULLY_EXERCISED → émission position au registre
- Hook automatique : award GRANTED → réservation pool ESOP (déjà partiel en Module 3b, finalisé ici)
- Compliance V1 : 5 nouvelles rules (cf §5)
- Migration 00080-00088 (9 migrations)
- Sandbox `/dev/cap-table-builder` pour tester scénarios
- Permissions complètes `cap_table.*`, `funding_rounds.*`, `share_classes.*`

**Exclus (modules ultérieurs) :**

- 409A Valuation FR (FMV automatisée par moteur Python) — Module 11 (IFRS 2)
- Reporting cap table CAC formaté pour audit annuel — Module 13
- Export PDF cap table avec branding org — V2
- Watermarking confidentialité PDF — V2
- Vesting acceleration on change of control — Module 9 a posé les rules, Module 10 les **respecte**
- Stock split / reverse split — V2 (rare en startup FR)
- Conversion automatique Preferred → Common à la sortie — V1 = manuel par scénario, V2 = auto trigger
- Gestion des warrants/BSA hors plan — V2 (V1 = uniquement BSA via Module 3a/3b)
- ROFR / drag-along / tag-along terms — V2 (terms enregistrés en JSON V1, pas exécutables)
- Multi-currency cap table — V2 (V1 = EUR uniquement)
- Cap table contributif (réviseur externe) — V2

### 0.4 Dépendances

- **Module 1** : tables `awards`, `vesting_events`, `audit_events`, RLS patterns
- **Module 2** : RBAC, permissions
- **Module 3a** : `plans.pool_reserved` (le pool ESOP par plan)
- **Module 3b** : awards.units_outstanding (consomme le pool)
- **Module 4** : beneficiaries (les détenteurs d'options)
- **Module 5** : workflows d'approbation (réutilisé pour `funding_rounds.create` qui est sensible)
- **Module 9** : exercises FULLY_EXERCISED → émission positions
- **Design System V1 (PR #12)** : composants `cap-table-matrix.tsx`, `valuation-toggle.tsx`, `editorial-waterfall.tsx` déjà créés
- **Moteur Python Fly.io** : nouveau endpoint `/compute/dilution-monte-carlo` à ajouter (cf §6)

### 0.5 Référence

Ce module s'appuie sur :

- `MODULE_01_FOUNDATION.md` sections 4.x (RLS patterns, audit_events)
- `MODULE_03A_PLANS.md` section pool_reserved + ESOP
- `MODULE_03B_AWARDS_LIFECYCLE.md` section 2 (state machine, units_outstanding)
- `MODULE_05_APPROVAL_ENGINE.md` (workflow réutilisé pour `funding_round.create`)
- `MODULE_09_EXERCISE_WORKFLOW.md` section 4 (hook FULLY_EXERCISED)
- Discussion design `claude.ai/chat/95cdf3d0-1808-48a2-95e4-58a096b08232` (composants squelette PR #12)

---

## 1. ARCHITECTURE GÉNÉRALE

### 1.1 Modèle conceptuel

Une cap table est une **somme de positions** où chaque position = (stakeholder, share_class, units, source, asof_date). Les positions viennent de 4 sources :

```
┌────────────────────────────────────────────────────────────────────┐
│  SOURCES DE POSITIONS                                              │
│                                                                    │
│  1. FOUNDER_GRANT (initial founder shares, common stock)          │
│     → INSERT direct via UI ou import CSV historique                │
│                                                                    │
│  2. FUNDING_ROUND (preferred shares émises lors d'une levée)      │
│     → INSERT auto via RPC create_funding_round                     │
│     → Plusieurs investisseurs, chacun = 1 position                 │
│                                                                    │
│  3. AWARD_GRANT (réservation ESOP pool, pas encore émission)      │
│     → Calcul à la volée depuis awards.units_outstanding            │
│     → "Réservé" : pas encore au registre, mais comptable           │
│                                                                    │
│  4. EXERCISE_EMISSION (option exercée → vraie action common)      │
│     → INSERT auto via RPC confirm_exercise_payment hook            │
│     → Trigger Module 9 → écrit ligne cap_table_positions           │
└────────────────────────────────────────────────────────────────────┘
```

Le **résultat consolidé** est calculé par `compute_cap_table()` qui :

1. Lit les positions historiques (sources 1, 2, 4)
2. Ajoute les positions virtuelles (source 3 = awards GRANTED non exercés)
3. Applique le scénario optionnel (dilution future hypothétique)
4. Retourne la matrice complète avec totaux par share_class et par stakeholder

### 1.2 Vue d'ensemble du flux

```
┌─────────────────────────────────────────────────────────────────────┐
│  FLUX 1 : Création d'une levée de fonds                            │
│                                                                       │
│  Admin → /dashboard/captable/rounds/new                             │
│  Form : nom, type (Seed/A/B...), pre-money, amount_raised,          │
│         price_per_share, share_class (existante ou nouvelle),       │
│         investisseurs (nom, units, amount)                          │
│                                                                       │
│  Submit → Server Action createFundingRound                          │
│         → Workflow approval Module 5 (FUNDING_ROUND.create)         │
│         → Approuvé → RPC create_funding_round (atomique)            │
│            INSERT funding_rounds + INSERT N positions               │
│            INSERT cap_table_snapshot post-round                     │
│         → Notification investisseurs (Module 7)                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  FLUX 2 : Exercise → Émission                                       │
│                                                                       │
│  Bénéficiaire exerce 100 BSPCE (Module 9)                          │
│  → Status FULLY_EXERCISED                                           │
│  → Trigger after_exercise_payment_confirmed                         │
│  → INSERT cap_table_positions :                                     │
│       stakeholder_type='BENEFICIARY',                               │
│       stakeholder_id=beneficiary_id,                                │
│       share_class_id=common_class_id,                               │
│       units=100,                                                    │
│       source='EXERCISE_EMISSION',                                   │
│       source_id=exercise_request_id                                 │
│  → Audit event 'cap_table.position_emitted'                         │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  FLUX 3 : Scénario de dilution                                      │
│                                                                       │
│  Admin → /dashboard/captable/scenarios/new                          │
│  Form : type (NEW_ROUND / POOL_TOPUP / BULK_EXERCISE / EXIT)       │
│         params spécifiques par type                                 │
│                                                                       │
│  Submit → Server Action createScenario                              │
│         → INSERT dilution_scenarios                                 │
│         → Calcul à la volée via compute_cap_table(scenario_id)     │
│         → Affichage matrice avant/après + waterfall                 │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  FLUX 4 : Monte Carlo sortie                                        │
│                                                                       │
│  Admin → /dashboard/captable/exit-simulator                         │
│  Form : valuation_mean, valuation_stddev (lognormal),              │
│         time_horizon_years, num_paths                               │
│                                                                       │
│  Submit → Server Action runExitMonteCarlo                           │
│         → Edge Function compute-dilution-monte-carlo                │
│         → POST Python /compute/dilution-monte-carlo                 │
│             { positions, valuation_distribution, exit_horizon }     │
│         → Réponse : pour chaque stakeholder,                        │
│             { mean_payout, p10, p50, p90, distribution_paths }     │
│         → Affichage : violin plot par stakeholder                   │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 Routes Next.js

```
# Admin / RH
/dashboard/captable                          # Page principale (matrice + 4 vues)
/dashboard/captable/share-classes            # Liste classes d'actions
/dashboard/captable/share-classes/new        # Création classe
/dashboard/captable/share-classes/[id]       # Édition classe
/dashboard/captable/rounds                   # Liste levées
/dashboard/captable/rounds/new               # Création levée (wizard 3 étapes)
/dashboard/captable/rounds/[id]              # Détail levée
/dashboard/captable/scenarios                # Liste scénarios
/dashboard/captable/scenarios/new            # Création scénario
/dashboard/captable/scenarios/[id]           # Détail + matrice avant/après
/dashboard/captable/exit-simulator           # Monte Carlo sortie
/dashboard/captable/snapshots                # Historique snapshots
/dashboard/captable/snapshots/[id]           # Vue snapshot à date
/dashboard/captable/import                   # Import CSV historique

# Bénéficiaire (lecture seule)
/portal/positions                            # Liste de ses propres positions

# Sandbox dev
/dev/cap-table-builder                       # Test scénarios sans DB writes
```

### 1.4 Layout

`apps/web/src/app/dashboard/captable/layout.tsx` :

- PageShell avec breadcrumb `Cap Table / [section]`
- Sub-nav horizontal sticky : Vue d'ensemble / Classes / Rounds / Scénarios / Sortie / Snapshots
- Action principale top-right : "Nouveau scénario" ou "Nouvelle levée" selon section
- Toggle global Consolidé / Dilué / Pro forma (composant `valuation-toggle.tsx`)

`apps/web/src/app/portal/positions/layout.tsx` :

- Réutilise le layout `/portal` standard (Module 8)
- Pas de sub-nav, juste la liste

---

## 2. SCHÉMA DB

### 2.1 Migration 00080 — Table `share_classes`

```sql
-- Une classe d'actions par org. Founder Common, Investor Preferred A, Pool ESOP, etc.

CREATE TABLE share_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identification
  code TEXT NOT NULL,              -- 'COMMON', 'PREF_A', 'PREF_B', 'ESOP'
  name TEXT NOT NULL,              -- 'Actions ordinaires', 'Preferred A'
  description TEXT,

  -- Type
  class_type TEXT NOT NULL CHECK (class_type IN (
    'COMMON',           -- Actions ordinaires (founders, exercices)
    'PREFERRED',        -- Actions de préférence (investisseurs)
    'ESOP',             -- Pool de stock-options réservé (pas émis)
    'WARRANT',          -- BSA hors plan (V2, support minimal V1)
    'BSPCE',            -- Bons de souscription (rare en classe dédiée, mais possible)
    'OTHER'
  )),

  -- Économique
  par_value NUMERIC(15,5),         -- Valeur nominale (souvent 0.01 ou 0.10 EUR)
  liquidation_preference_multiple NUMERIC(5,2) DEFAULT 1.0,  -- 1x, 2x non-participating
  liquidation_preference_type TEXT CHECK (liquidation_preference_type IN (
    'NON_PARTICIPATING', 'PARTICIPATING', 'PARTICIPATING_CAPPED'
  )),
  liquidation_preference_cap NUMERIC(5,2),  -- Si PARTICIPATING_CAPPED, ex 3.0 = 3x

  -- Conversion
  conversion_ratio NUMERIC(15,5) DEFAULT 1.0,  -- 1 preferred → N common à la sortie
  is_convertible_to_common BOOLEAN DEFAULT TRUE,

  -- Anti-dilution
  anti_dilution_type TEXT CHECK (anti_dilution_type IN (
    'NONE', 'WEIGHTED_AVERAGE_BROAD', 'WEIGHTED_AVERAGE_NARROW', 'FULL_RATCHET'
  )) DEFAULT 'NONE',

  -- Voting
  voting_rights_per_share NUMERIC(8,4) DEFAULT 1.0,  -- 1 = 1 voix, 0 = non-voting

  -- Pool ESOP spécifique
  pool_total_units NUMERIC(20,4),  -- NULL si pas ESOP. Sinon : taille du pool.

  -- Métadonnées
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  CONSTRAINT share_classes_code_per_org_unique UNIQUE (org_id, code),
  CONSTRAINT share_classes_pool_only_for_esop CHECK (
    (class_type = 'ESOP' AND pool_total_units IS NOT NULL)
    OR (class_type != 'ESOP' AND pool_total_units IS NULL)
  )
);

CREATE INDEX idx_share_classes_org ON share_classes(org_id) WHERE is_active = TRUE;

-- RLS pattern 1 (org-scoped)
ALTER TABLE share_classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY share_classes_select_own_org
  ON share_classes FOR SELECT
  USING (org_id = current_org_id());

CREATE POLICY share_classes_insert_admin
  ON share_classes FOR INSERT
  WITH CHECK (
    org_id = current_org_id()
    AND user_has_permission('share_classes.create')
  );

CREATE POLICY share_classes_update_admin
  ON share_classes FOR UPDATE
  USING (
    org_id = current_org_id()
    AND user_has_permission('share_classes.update')
  );

-- Trigger updated_at
CREATE TRIGGER trigger_share_classes_updated_at
  BEFORE UPDATE ON share_classes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Audit trigger
CREATE TRIGGER trigger_share_classes_audit
  AFTER INSERT OR UPDATE OR DELETE ON share_classes
  FOR EACH ROW EXECUTE FUNCTION audit_table_changes();
```

### 2.2 Migration 00081 — Table `funding_rounds`

```sql
-- Une levée de fonds = un évent d'émission de Preferred shares à un prix donné

CREATE TABLE funding_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identification
  name TEXT NOT NULL,                    -- 'Series A', 'Seed extension'
  round_type TEXT NOT NULL CHECK (round_type IN (
    'PRE_SEED', 'SEED', 'SERIES_A', 'SERIES_B', 'SERIES_C', 'SERIES_D_PLUS',
    'BRIDGE', 'CONVERTIBLE_NOTE', 'SAFE', 'OTHER'
  )),

  -- Économique
  share_class_id UUID NOT NULL REFERENCES share_classes(id),
  pre_money_valuation NUMERIC(20,2) NOT NULL,
  amount_raised NUMERIC(20,2) NOT NULL,
  price_per_share NUMERIC(15,5) NOT NULL,
  total_shares_issued NUMERIC(20,4) NOT NULL,

  -- Computed (CHECK constraint pour cohérence)
  post_money_valuation NUMERIC(20,2) GENERATED ALWAYS AS
    (pre_money_valuation + amount_raised) STORED,

  -- Termes
  liquidation_preference_multiple NUMERIC(5,2) DEFAULT 1.0,
  participating BOOLEAN DEFAULT FALSE,
  participating_cap NUMERIC(5,2),
  conversion_ratio NUMERIC(15,5) DEFAULT 1.0,
  anti_dilution_type TEXT CHECK (anti_dilution_type IN (
    'NONE', 'WEIGHTED_AVERAGE_BROAD', 'WEIGHTED_AVERAGE_NARROW', 'FULL_RATCHET'
  )) DEFAULT 'NONE',

  -- ROFR / drag-along (V1 = enregistré JSON, pas exécuté)
  additional_terms JSONB DEFAULT '{}'::jsonb,

  -- Workflow
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
    'DRAFT', 'PENDING_APPROVAL', 'CLOSED', 'CANCELLED'
  )),
  closed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_reason TEXT,

  -- Workflow de docs (Module 6 V2)
  pacte_actionnaires_doc_id UUID REFERENCES documents(id),

  -- Métadonnées
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  CONSTRAINT funding_rounds_amount_positive CHECK (amount_raised > 0),
  CONSTRAINT funding_rounds_premoney_positive CHECK (pre_money_valuation > 0),
  CONSTRAINT funding_rounds_shares_consistent CHECK (
    -- price * shares ≈ amount (tolérance 1% pour arrondis)
    ABS((price_per_share * total_shares_issued) - amount_raised)
    < (amount_raised * 0.01)
  )
);

CREATE INDEX idx_funding_rounds_org ON funding_rounds(org_id);
CREATE INDEX idx_funding_rounds_status ON funding_rounds(org_id, status)
  WHERE status NOT IN ('CANCELLED');

ALTER TABLE funding_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY funding_rounds_select_own_org
  ON funding_rounds FOR SELECT
  USING (org_id = current_org_id());

CREATE POLICY funding_rounds_insert_admin
  ON funding_rounds FOR INSERT
  WITH CHECK (
    org_id = current_org_id()
    AND user_has_permission('funding_rounds.create')
  );

CREATE TRIGGER trigger_funding_rounds_updated_at
  BEFORE UPDATE ON funding_rounds
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_funding_rounds_audit
  AFTER INSERT OR UPDATE OR DELETE ON funding_rounds
  FOR EACH ROW EXECUTE FUNCTION audit_table_changes();
```

### 2.3 Migration 00082 — Table `cap_table_positions`

```sql
-- Positions atomiques. Une ligne = un détenteur a X units d'une classe à un instant T.
-- Toutes les positions sont "current" sauf si position_closed_at IS NOT NULL.

CREATE TABLE cap_table_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Détenteur (polymorphique)
  stakeholder_type TEXT NOT NULL CHECK (stakeholder_type IN (
    'FOUNDER', 'INVESTOR', 'BENEFICIARY', 'ENTITY', 'POOL_RESERVE'
  )),
  stakeholder_id UUID,                   -- NULL pour POOL_RESERVE
  stakeholder_name TEXT NOT NULL,        -- Dénormalisé pour l'affichage rapide
  stakeholder_email TEXT,                -- Pour investors externes

  -- Quoi
  share_class_id UUID NOT NULL REFERENCES share_classes(id),
  units NUMERIC(20,4) NOT NULL,

  -- Origine
  source TEXT NOT NULL CHECK (source IN (
    'FOUNDER_GRANT',          -- Initial founder shares (import historique)
    'FUNDING_ROUND',          -- Émission via levée
    'EXERCISE_EMISSION',      -- Option exercée Module 9
    'TRANSFER',               -- Transfert entre stakeholders V2
    'BUYBACK',                -- Rachat par société V2
    'POOL_RESERVATION',       -- Réservation pool ESOP (non émis)
    'BULK_IMPORT'             -- Import CSV historique
  )),
  source_id UUID,                        -- FK vers funding_rounds.id, exercise_requests.id, etc.

  -- Vie de la position
  acquired_at DATE NOT NULL,             -- Date d'acquisition légale
  position_opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  position_closed_at TIMESTAMPTZ,        -- NULL si position active
  closed_reason TEXT,

  -- Économique
  cost_basis_per_unit NUMERIC(15,5),     -- Prix d'acquisition unitaire (pour fiscal V2)
  cost_basis_total NUMERIC(20,2) GENERATED ALWAYS AS
    (cost_basis_per_unit * units) STORED,

  -- Voting (override possible vs share_class default)
  voting_units NUMERIC(20,4),            -- NULL = utilise voting_rights_per_share de share_class

  -- Métadonnées
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  CONSTRAINT positions_units_positive CHECK (units > 0),
  CONSTRAINT positions_pool_no_stakeholder CHECK (
    (stakeholder_type = 'POOL_RESERVE' AND stakeholder_id IS NULL)
    OR (stakeholder_type != 'POOL_RESERVE' AND stakeholder_id IS NOT NULL)
  )
);

CREATE INDEX idx_positions_org_active ON cap_table_positions(org_id)
  WHERE position_closed_at IS NULL;
CREATE INDEX idx_positions_stakeholder ON cap_table_positions(stakeholder_type, stakeholder_id)
  WHERE position_closed_at IS NULL;
CREATE INDEX idx_positions_share_class ON cap_table_positions(share_class_id)
  WHERE position_closed_at IS NULL;
CREATE INDEX idx_positions_source ON cap_table_positions(source, source_id);

ALTER TABLE cap_table_positions ENABLE ROW LEVEL SECURITY;

-- Admin voit toute la cap table de son org
CREATE POLICY positions_select_admin
  ON cap_table_positions FOR SELECT
  USING (
    org_id = current_org_id()
    AND user_has_permission('cap_table.read.all')
  );

-- BENEFICIARY voit uniquement ses propres positions
CREATE POLICY positions_select_own
  ON cap_table_positions FOR SELECT
  USING (
    org_id = current_org_id()
    AND stakeholder_type = 'BENEFICIARY'
    AND stakeholder_id IN (
      SELECT id FROM beneficiaries WHERE user_id = auth.uid()
    )
  );

CREATE TRIGGER trigger_positions_updated_at
  BEFORE UPDATE ON cap_table_positions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_positions_audit
  AFTER INSERT OR UPDATE OR DELETE ON cap_table_positions
  FOR EACH ROW EXECUTE FUNCTION audit_table_changes();
```

### 2.4 Migration 00083 — Table `cap_table_snapshots`

```sql
-- Snapshot complet de la cap table à une date donnée. Stocké en JSON pour reporting rapide.
-- Créés : (1) auto post-round, (2) auto nightly cron, (3) manuel "freeze" pour reporting CAC.

CREATE TABLE cap_table_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Snapshot identification
  asof_date DATE NOT NULL,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN (
    'POST_ROUND',         -- Après création d'un funding_round
    'NIGHTLY',            -- Cron quotidien
    'MANUAL_FREEZE',      -- Demandé par admin (label par ex)
    'PRE_AUDIT',          -- Frozen pour audit CAC
    'POST_EXERCISE_BATCH' -- Après batch d'exercises consolidé
  )),
  label TEXT,              -- ex: 'Avant Series B', 'Audit 2026'

  -- Contenu (JSON pour rapidité)
  positions_json JSONB NOT NULL,    -- Array de positions résolues
  totals_by_class JSONB NOT NULL,   -- { share_class_id: { units, percent } }
  totals_by_stakeholder JSONB NOT NULL,
  total_units_issued NUMERIC(20,4) NOT NULL,
  total_units_diluted NUMERIC(20,4) NOT NULL,

  -- Reference
  triggered_by_funding_round_id UUID REFERENCES funding_rounds(id),
  triggered_by_exercise_id UUID REFERENCES exercise_requests(id),

  -- Métadonnées
  notes TEXT,
  is_immutable BOOLEAN NOT NULL DEFAULT FALSE,  -- TRUE = frozen, ne peut plus être supprimé
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_snapshots_org_date ON cap_table_snapshots(org_id, asof_date DESC);
CREATE INDEX idx_snapshots_type ON cap_table_snapshots(org_id, snapshot_type);

-- Pas de UPDATE possible (snapshots = immutables une fois créés)
CREATE POLICY snapshots_select_admin
  ON cap_table_snapshots FOR SELECT
  USING (
    org_id = current_org_id()
    AND user_has_permission('cap_table.read.all')
  );

CREATE POLICY snapshots_insert_admin
  ON cap_table_snapshots FOR INSERT
  WITH CHECK (
    org_id = current_org_id()
    AND user_has_permission('cap_table.snapshot.create')
  );

CREATE POLICY snapshots_no_update
  ON cap_table_snapshots FOR UPDATE
  USING (FALSE);

CREATE POLICY snapshots_delete_admin
  ON cap_table_snapshots FOR DELETE
  USING (
    org_id = current_org_id()
    AND user_has_permission('cap_table.snapshot.delete')
    AND is_immutable = FALSE
  );

ALTER TABLE cap_table_snapshots ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trigger_snapshots_audit
  AFTER INSERT OR DELETE ON cap_table_snapshots
  FOR EACH ROW EXECUTE FUNCTION audit_table_changes();
```

### 2.5 Migration 00084 — Table `dilution_scenarios`

```sql
-- Scénarios "et si" : nouvelle levée hypothétique, top-up pool, exercise batch, etc.
-- Pas de mutation des positions réelles : juste un objet de calcul.

CREATE TABLE dilution_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identification
  name TEXT NOT NULL,
  description TEXT,

  -- Type
  scenario_type TEXT NOT NULL CHECK (scenario_type IN (
    'NEW_ROUND',          -- Nouvelle levée hypothétique
    'POOL_TOPUP',         -- Augmentation du pool ESOP
    'BULK_EXERCISE',      -- Tous les BSPCE vested s'exercent
    'EXIT',               -- Sortie de la société (waterfall)
    'COMBINED'            -- Plusieurs steps en chaîne
  )),

  -- Paramètres (JSON typé selon scenario_type)
  -- NEW_ROUND: { share_class_code, pre_money, amount_raised, anti_dilution_apply }
  -- POOL_TOPUP: { additional_units, target_pool_percent_post }
  -- BULK_EXERCISE: { only_vested: bool, beneficiary_filter? }
  -- EXIT: { exit_valuation, exit_date, conversion_strategy: 'AUTO_BEST'|'AS_PREFERRED'|'AS_COMMON' }
  parameters JSONB NOT NULL,

  -- Steps multi-stage (uniquement si COMBINED)
  steps JSONB DEFAULT '[]'::jsonb,

  -- Base
  base_snapshot_id UUID REFERENCES cap_table_snapshots(id),  -- Si NULL, base = "current"
  base_asof_date DATE,

  -- Résultat (computed à la demande, cache 24h)
  result_cache JSONB,
  result_computed_at TIMESTAMPTZ,

  -- Visibilité
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,  -- Si TRUE, tous les admins de l'org voient

  -- Métadonnées
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES auth.users(id)
);

CREATE INDEX idx_scenarios_org ON dilution_scenarios(org_id);
CREATE INDEX idx_scenarios_creator ON dilution_scenarios(created_by);

ALTER TABLE dilution_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY scenarios_select_own_or_shared
  ON dilution_scenarios FOR SELECT
  USING (
    org_id = current_org_id()
    AND (created_by = auth.uid() OR is_shared = TRUE)
    AND user_has_permission('cap_table.scenarios.read')
  );

CREATE POLICY scenarios_insert_admin
  ON dilution_scenarios FOR INSERT
  WITH CHECK (
    org_id = current_org_id()
    AND user_has_permission('cap_table.scenarios.create')
    AND created_by = auth.uid()
  );

CREATE POLICY scenarios_update_own
  ON dilution_scenarios FOR UPDATE
  USING (created_by = auth.uid() AND org_id = current_org_id());

CREATE POLICY scenarios_delete_own
  ON dilution_scenarios FOR DELETE
  USING (created_by = auth.uid() AND org_id = current_org_id());

CREATE TRIGGER trigger_scenarios_updated_at
  BEFORE UPDATE ON dilution_scenarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2.6 Migration 00085 — RPC `compute_cap_table`

```sql
-- Single source of truth pour le calcul de la cap table.
-- Retourne un JSONB avec : positions résolues + totaux + métriques.

CREATE OR REPLACE FUNCTION compute_cap_table(
  p_org_id UUID,
  p_asof_date DATE DEFAULT CURRENT_DATE,
  p_scenario_id UUID DEFAULT NULL,
  p_view_mode TEXT DEFAULT 'CONSOLIDATED'  -- 'CONSOLIDATED' | 'DILUTED' | 'PRO_FORMA'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
  v_positions JSONB;
  v_totals JSONB;
  v_grand_total NUMERIC;
  v_scenario JSONB;
BEGIN
  -- Permission check
  IF NOT user_has_permission('cap_table.read.all') THEN
    RAISE EXCEPTION 'Insufficient permissions to read cap table';
  END IF;

  -- 1. Charger les positions actives à la date demandée (sources 1, 2, 4)
  SELECT jsonb_agg(jsonb_build_object(
    'id', p.id,
    'stakeholder_type', p.stakeholder_type,
    'stakeholder_id', p.stakeholder_id,
    'stakeholder_name', p.stakeholder_name,
    'share_class_id', p.share_class_id,
    'share_class_code', sc.code,
    'share_class_type', sc.class_type,
    'units', p.units,
    'cost_basis_total', p.cost_basis_total,
    'source', p.source,
    'acquired_at', p.acquired_at
  ))
  INTO v_positions
  FROM cap_table_positions p
  JOIN share_classes sc ON sc.id = p.share_class_id
  WHERE p.org_id = p_org_id
    AND p.acquired_at <= p_asof_date
    AND (p.position_closed_at IS NULL OR p.position_closed_at > p_asof_date::timestamptz);

  -- 2. Si view DILUTED ou PRO_FORMA : ajouter les awards GRANTED non exercés
  IF p_view_mode IN ('DILUTED', 'PRO_FORMA') THEN
    v_positions := v_positions || (
      SELECT jsonb_agg(jsonb_build_object(
        'stakeholder_type', 'BENEFICIARY',
        'stakeholder_id', a.beneficiary_id,
        'stakeholder_name', b.first_name || ' ' || b.last_name,
        'share_class_code', 'ESOP_VIRTUAL',
        'share_class_type', 'ESOP',
        'units', a.units_outstanding - COALESCE(a.units_exercised, 0),
        'source', 'AWARD_GRANTED_VIRTUAL',
        'acquired_at', a.grant_date
      ))
      FROM awards a
      JOIN beneficiaries b ON b.id = a.beneficiary_id
      WHERE a.org_id = p_org_id
        AND a.status IN ('GRANTED', 'PARTIALLY_EXERCISED', 'FULLY_VESTED')
        AND a.grant_date <= p_asof_date
        AND (a.units_outstanding - COALESCE(a.units_exercised, 0)) > 0
    );
  END IF;

  -- 3. Si scenario_id : appliquer le scénario (mutation in-memory)
  IF p_scenario_id IS NOT NULL THEN
    SELECT parameters INTO v_scenario FROM dilution_scenarios
     WHERE id = p_scenario_id AND org_id = p_org_id;

    IF v_scenario IS NULL THEN
      RAISE EXCEPTION 'Scenario % not found', p_scenario_id;
    END IF;

    v_positions := apply_scenario(v_positions, v_scenario);
  END IF;

  -- 4. Calcul des totaux
  SELECT
    SUM((value->>'units')::numeric),
    jsonb_object_agg(
      value->>'share_class_code',
      SUM((value->>'units')::numeric)
    )
  INTO v_grand_total, v_totals
  FROM jsonb_array_elements(v_positions);

  -- 5. Construire le résultat final
  v_result := jsonb_build_object(
    'org_id', p_org_id,
    'asof_date', p_asof_date,
    'view_mode', p_view_mode,
    'scenario_id', p_scenario_id,
    'positions', v_positions,
    'totals_by_class', v_totals,
    'grand_total_units', v_grand_total,
    'computed_at', NOW()
  );

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION compute_cap_table(UUID, DATE, UUID, TEXT) TO authenticated;

-- Helper privé pour appliquer un scenario
CREATE OR REPLACE FUNCTION apply_scenario(p_positions JSONB, p_scenario JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_scenario_type TEXT;
  v_result JSONB;
BEGIN
  v_scenario_type := p_scenario->>'scenario_type';

  IF v_scenario_type = 'NEW_ROUND' THEN
    -- Ajouter une position investisseur fictive + diluer les autres
    v_result := p_positions || jsonb_build_array(jsonb_build_object(
      'stakeholder_type', 'INVESTOR',
      'stakeholder_name', p_scenario->>'investor_name',
      'share_class_code', p_scenario->>'share_class_code',
      'units', (p_scenario->>'amount_raised')::numeric / (p_scenario->>'price_per_share')::numeric,
      'source', 'SCENARIO_NEW_ROUND'
    ));
  ELSIF v_scenario_type = 'POOL_TOPUP' THEN
    v_result := p_positions || jsonb_build_array(jsonb_build_object(
      'stakeholder_type', 'POOL_RESERVE',
      'stakeholder_name', 'Pool ESOP top-up',
      'share_class_code', 'ESOP',
      'units', (p_scenario->>'additional_units')::numeric,
      'source', 'SCENARIO_POOL_TOPUP'
    ));
  -- TODO: BULK_EXERCISE, EXIT, COMBINED
  ELSE
    v_result := p_positions;
  END IF;

  RETURN v_result;
END $$;
```

### 2.7 Migration 00086 — RPC `create_funding_round`

```sql
CREATE OR REPLACE FUNCTION create_funding_round(
  p_org_id UUID,
  p_name TEXT,
  p_round_type TEXT,
  p_share_class_id UUID,
  p_pre_money_valuation NUMERIC,
  p_amount_raised NUMERIC,
  p_price_per_share NUMERIC,
  p_investors JSONB  -- [{ name, email, units, amount, voting_rights? }]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_round_id UUID;
  v_total_shares NUMERIC := 0;
  v_investor JSONB;
BEGIN
  IF NOT user_has_permission('funding_rounds.create') THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Validation cohérence
  FOR v_investor IN SELECT * FROM jsonb_array_elements(p_investors) LOOP
    v_total_shares := v_total_shares + (v_investor->>'units')::numeric;
  END LOOP;

  IF ABS(v_total_shares * p_price_per_share - p_amount_raised) > (p_amount_raised * 0.01) THEN
    RAISE EXCEPTION 'Inconsistent: sum(investor units) * price != amount_raised';
  END IF;

  -- INSERT funding_round
  INSERT INTO funding_rounds (
    org_id, name, round_type, share_class_id,
    pre_money_valuation, amount_raised, price_per_share, total_shares_issued,
    status, closed_at, created_by
  ) VALUES (
    p_org_id, p_name, p_round_type, p_share_class_id,
    p_pre_money_valuation, p_amount_raised, p_price_per_share, v_total_shares,
    'CLOSED', NOW(), auth.uid()
  ) RETURNING id INTO v_round_id;

  -- INSERT N positions investisseurs
  FOR v_investor IN SELECT * FROM jsonb_array_elements(p_investors) LOOP
    INSERT INTO cap_table_positions (
      org_id, stakeholder_type, stakeholder_name, stakeholder_email,
      share_class_id, units, source, source_id,
      acquired_at, cost_basis_per_unit, created_by
    ) VALUES (
      p_org_id, 'INVESTOR', v_investor->>'name', v_investor->>'email',
      p_share_class_id, (v_investor->>'units')::numeric,
      'FUNDING_ROUND', v_round_id,
      CURRENT_DATE, p_price_per_share, auth.uid()
    );
  END LOOP;

  -- Materialize snapshot post-round
  PERFORM materialize_snapshot(p_org_id, CURRENT_DATE, 'POST_ROUND', v_round_id);

  -- Audit
  INSERT INTO audit_events (org_id, event_type, resource_type, resource_id, metadata)
  VALUES (p_org_id, 'cap_table.round_created', 'funding_rounds', v_round_id,
    jsonb_build_object('name', p_name, 'amount', p_amount_raised));

  RETURN v_round_id;
END $$;

GRANT EXECUTE ON FUNCTION create_funding_round TO authenticated;
```

### 2.8 Migration 00087 — RPC `materialize_snapshot`

```sql
CREATE OR REPLACE FUNCTION materialize_snapshot(
  p_org_id UUID,
  p_asof_date DATE,
  p_snapshot_type TEXT,
  p_triggered_by_round_id UUID DEFAULT NULL,
  p_label TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_snapshot_id UUID;
  v_cap_table JSONB;
BEGIN
  v_cap_table := compute_cap_table(p_org_id, p_asof_date, NULL, 'CONSOLIDATED');

  INSERT INTO cap_table_snapshots (
    org_id, asof_date, snapshot_type, label,
    positions_json, totals_by_class, totals_by_stakeholder,
    total_units_issued, total_units_diluted,
    triggered_by_funding_round_id, created_by
  ) VALUES (
    p_org_id, p_asof_date, p_snapshot_type, p_label,
    v_cap_table->'positions',
    v_cap_table->'totals_by_class',
    '{}'::jsonb,  -- TODO: calculer totaux par stakeholder
    (v_cap_table->>'grand_total_units')::numeric,
    (v_cap_table->>'grand_total_units')::numeric,  -- TODO: diluted
    p_triggered_by_round_id, auth.uid()
  ) RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END $$;

GRANT EXECUTE ON FUNCTION materialize_snapshot TO authenticated;
```

### 2.9 Migration 00088 — Hook exercise → cap_table

```sql
-- Trigger : quand une exercise_request passe FULLY_PAID, créer la position
CREATE OR REPLACE FUNCTION on_exercise_payment_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_award RECORD;
  v_common_class_id UUID;
BEGIN
  IF NEW.status = 'FULLY_PAID' AND OLD.status != 'FULLY_PAID' THEN
    SELECT a.*, p.org_id INTO v_award
      FROM awards a
      JOIN plans p ON p.id = a.plan_id
     WHERE a.id = NEW.award_id;

    -- Trouver la common class de l'org
    SELECT id INTO v_common_class_id
      FROM share_classes
     WHERE org_id = v_award.org_id
       AND class_type = 'COMMON'
       AND is_active = TRUE
     LIMIT 1;

    IF v_common_class_id IS NULL THEN
      RAISE WARNING 'No COMMON share class for org %, exercise emission skipped', v_award.org_id;
      RETURN NEW;
    END IF;

    -- Émission de la position
    INSERT INTO cap_table_positions (
      org_id, stakeholder_type, stakeholder_id, stakeholder_name,
      share_class_id, units, source, source_id,
      acquired_at, cost_basis_per_unit
    )
    SELECT
      v_award.org_id, 'BENEFICIARY', v_award.beneficiary_id,
      b.first_name || ' ' || b.last_name,
      v_common_class_id, NEW.units_to_exercise,
      'EXERCISE_EMISSION', NEW.id,
      CURRENT_DATE, NEW.exercise_price_per_unit
    FROM beneficiaries b WHERE b.id = v_award.beneficiary_id;

    -- Audit
    INSERT INTO audit_events (org_id, event_type, resource_type, resource_id, metadata)
    VALUES (v_award.org_id, 'cap_table.position_emitted', 'exercise_requests', NEW.id,
      jsonb_build_object('units', NEW.units_to_exercise, 'beneficiary_id', v_award.beneficiary_id));
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trigger_exercise_to_cap_table
  AFTER UPDATE ON exercise_requests
  FOR EACH ROW EXECUTE FUNCTION on_exercise_payment_confirmed();
```

### 2.10 Migration 00089 — Seed permissions Module 10

```sql
INSERT INTO permissions_catalog (code, description) VALUES
  ('cap_table.read.all', 'Voir toute la cap table de l''org'),
  ('cap_table.read.own', 'Voir ses propres positions (BENEFICIARY)'),
  ('cap_table.snapshot.create', 'Créer un snapshot manuel'),
  ('cap_table.snapshot.delete', 'Supprimer un snapshot non-immutable'),
  ('cap_table.scenarios.read', 'Voir les scénarios partagés'),
  ('cap_table.scenarios.create', 'Créer un scénario'),
  ('cap_table.scenarios.run_montecarlo', 'Lancer une simulation Monte Carlo'),
  ('share_classes.read', 'Voir les classes d''actions'),
  ('share_classes.create', 'Créer une classe d''actions'),
  ('share_classes.update', 'Modifier une classe d''actions'),
  ('funding_rounds.read', 'Voir les levées'),
  ('funding_rounds.create', 'Créer une levée'),
  ('funding_rounds.cancel', 'Annuler une levée DRAFT')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role, permission_code) VALUES
  ('OWNER', 'cap_table.read.all'),
  ('OWNER', 'cap_table.snapshot.create'),
  ('OWNER', 'cap_table.snapshot.delete'),
  ('OWNER', 'cap_table.scenarios.read'),
  ('OWNER', 'cap_table.scenarios.create'),
  ('OWNER', 'cap_table.scenarios.run_montecarlo'),
  ('OWNER', 'share_classes.read'),
  ('OWNER', 'share_classes.create'),
  ('OWNER', 'share_classes.update'),
  ('OWNER', 'funding_rounds.read'),
  ('OWNER', 'funding_rounds.create'),
  ('OWNER', 'funding_rounds.cancel'),
  ('ADMIN_HR', 'cap_table.read.all'),
  ('ADMIN_HR', 'cap_table.scenarios.read'),
  ('ADMIN_HR', 'cap_table.scenarios.create'),
  ('ADMIN_HR', 'share_classes.read'),
  ('ADMIN_HR', 'funding_rounds.read'),
  ('AUDITOR', 'cap_table.read.all'),
  ('AUDITOR', 'share_classes.read'),
  ('AUDITOR', 'funding_rounds.read'),
  ('BENEFICIARY', 'cap_table.read.own')
ON CONFLICT DO NOTHING;
```

---

## 3. SERVER ACTIONS & SCHÉMAS ZOD

Toutes les Server Actions suivent le pattern Result `{ ok: true, data } | { ok: false, error }` (CLAUDE.md). Validation Zod systématique.

### 3.1 Schémas Zod (packages/shared/src/schemas/cap-table.ts)

```typescript
import { z } from 'zod';

export const SHARE_CLASS_TYPES = [
  'COMMON',
  'PREFERRED',
  'ESOP',
  'WARRANT',
  'BSPCE',
  'OTHER',
] as const;
export const ROUND_TYPES = [
  'PRE_SEED',
  'SEED',
  'SERIES_A',
  'SERIES_B',
  'SERIES_C',
  'SERIES_D_PLUS',
  'BRIDGE',
  'CONVERTIBLE_NOTE',
  'SAFE',
  'OTHER',
] as const;
export const SCENARIO_TYPES = [
  'NEW_ROUND',
  'POOL_TOPUP',
  'BULK_EXERCISE',
  'EXIT',
  'COMBINED',
] as const;
export const VIEW_MODES = ['CONSOLIDATED', 'DILUTED', 'PRO_FORMA'] as const;

export const createShareClassSchema = z
  .object({
    code: z
      .string()
      .min(2)
      .max(20)
      .regex(/^[A-Z0-9_]+$/, 'Uppercase + underscore only'),
    name: z.string().min(2).max(100),
    description: z.string().max(500).optional(),
    classType: z.enum(SHARE_CLASS_TYPES),
    parValue: z.number().min(0).max(100).optional(),
    liquidationPreferenceMultiple: z.number().min(0).max(10).default(1.0),
    liquidationPreferenceType: z
      .enum(['NON_PARTICIPATING', 'PARTICIPATING', 'PARTICIPATING_CAPPED'])
      .optional(),
    liquidationPreferenceCap: z.number().min(1).max(20).optional(),
    conversionRatio: z.number().positive().default(1.0),
    isConvertibleToCommon: z.boolean().default(true),
    antiDilutionType: z
      .enum(['NONE', 'WEIGHTED_AVERAGE_BROAD', 'WEIGHTED_AVERAGE_NARROW', 'FULL_RATCHET'])
      .default('NONE'),
    votingRightsPerShare: z.number().min(0).max(100).default(1.0),
    poolTotalUnits: z.number().positive().optional(),
  })
  .refine(
    (data) =>
      data.classType === 'ESOP'
        ? data.poolTotalUnits !== undefined
        : data.poolTotalUnits === undefined,
    { message: 'pool_total_units required iff class_type=ESOP' },
  );

export const investorSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email().optional(),
  units: z.number().positive(),
  amount: z.number().positive(),
});

export const createFundingRoundSchema = z
  .object({
    name: z.string().min(2).max(100),
    roundType: z.enum(ROUND_TYPES),
    shareClassId: z.string().uuid(),
    preMoneyValuation: z.number().positive(),
    amountRaised: z.number().positive(),
    pricePerShare: z.number().positive(),
    liquidationPreferenceMultiple: z.number().min(0).max(10).default(1.0),
    participating: z.boolean().default(false),
    participatingCap: z.number().min(1).max(20).optional(),
    conversionRatio: z.number().positive().default(1.0),
    antiDilutionType: z
      .enum(['NONE', 'WEIGHTED_AVERAGE_BROAD', 'WEIGHTED_AVERAGE_NARROW', 'FULL_RATCHET'])
      .default('NONE'),
    investors: z.array(investorSchema).min(1),
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (data) =>
      Math.abs(
        data.investors.reduce((s, i) => s + i.units, 0) * data.pricePerShare - data.amountRaised,
      ) <
      data.amountRaised * 0.01,
    { message: 'Sum of investor units * price must equal amount_raised (±1%)' },
  );

// Discriminated union pour les params de scénario
export const scenarioNewRoundSchema = z.object({
  scenarioType: z.literal('NEW_ROUND'),
  shareClassCode: z.string(),
  preMoney: z.number().positive(),
  amountRaised: z.number().positive(),
  antiDilutionApply: z.boolean().default(false),
  investorName: z.string().default('Hypothetical Lead'),
});

export const scenarioPoolTopupSchema = z.object({
  scenarioType: z.literal('POOL_TOPUP'),
  additionalUnits: z.number().positive(),
  targetPoolPercentPost: z.number().min(0).max(100).optional(),
});

export const scenarioBulkExerciseSchema = z.object({
  scenarioType: z.literal('BULK_EXERCISE'),
  onlyVested: z.boolean().default(true),
  beneficiaryFilter: z.array(z.string().uuid()).optional(),
});

export const scenarioExitSchema = z.object({
  scenarioType: z.literal('EXIT'),
  exitValuation: z.number().positive(),
  exitDate: z.string().date().optional(),
  conversionStrategy: z.enum(['AUTO_BEST', 'AS_PREFERRED', 'AS_COMMON']).default('AUTO_BEST'),
});

export const createScenarioSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  baseSnapshotId: z.string().uuid().optional(),
  baseAsofDate: z.string().date().optional(),
  isShared: z.boolean().default(false),
  parameters: z.discriminatedUnion('scenarioType', [
    scenarioNewRoundSchema,
    scenarioPoolTopupSchema,
    scenarioBulkExerciseSchema,
    scenarioExitSchema,
  ]),
});

export const runMonteCarloExitSchema = z.object({
  scenarioId: z.string().uuid().optional(),
  valuationMean: z.number().positive(),
  valuationStddev: z.number().positive(),
  timeHorizonYears: z.number().min(0.1).max(20),
  numPaths: z.number().int().min(1000).max(100000).default(10000),
});
```

### 3.2 Server Actions (apps/web/src/server/actions/cap-table.ts)

12 actions. Toutes wrappées en `'use server'`, async only.

```typescript
'use server';

// ============================================================================
// SHARE CLASSES
// ============================================================================

export async function createShareClass(input: unknown): Promise<Result<{ id: string }>> {
  await requirePermission('share_classes.create');
  const parsed = createShareClassSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  // INSERT share_classes + audit
}

export async function updateShareClass(id: string, input: unknown): Promise<Result<void>> {
  await requirePermission('share_classes.update');
  // Validations métier : si déjà des positions sur cette classe, ne pas autoriser
  // changement de class_type
}

export async function deactivateShareClass(id: string): Promise<Result<void>> {
  await requirePermission('share_classes.update');
  // Soft delete : is_active = FALSE
  // Compliance check : aucune position active sur cette classe
}

// ============================================================================
// FUNDING ROUNDS
// ============================================================================

export async function createFundingRound(input: unknown): Promise<Result<{ id: string }>> {
  await requirePermission('funding_rounds.create');
  const parsed = createFundingRoundSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  // Hook Module 5 : si l'org a un workflow FUNDING_ROUND.create, déclenche-le
  // Sinon : create direct
  // RPC create_funding_round (atomique)
  // Notification investisseurs (Module 7)
}

export async function cancelFundingRound(id: string, reason: string): Promise<Result<void>> {
  await requirePermission('funding_rounds.cancel');
  // Reject si status='CLOSED' (impossible de revenir en arrière)
  // OK si status='DRAFT'
}

// ============================================================================
// SCENARIOS
// ============================================================================

export async function createScenario(input: unknown): Promise<Result<{ id: string }>> {
  await requirePermission('cap_table.scenarios.create');
  const parsed = createScenarioSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);
  // INSERT dilution_scenarios + compute initial cache
}

export async function updateScenario(id: string, input: unknown): Promise<Result<void>> {
  // Owner check via RLS (created_by = auth.uid())
  // Invalider result_cache
}

export async function deleteScenario(id: string): Promise<Result<void>> {
  // Owner check via RLS
}

export async function runScenario(id: string): Promise<Result<{ result: CapTableResult }>> {
  // Appel RPC compute_cap_table(p_scenario_id=id)
  // Cache 24h dans result_cache
}

// ============================================================================
// MONTE CARLO
// ============================================================================

export async function runMonteCarloExit(input: unknown): Promise<Result<{ runId: string }>> {
  await requirePermission('cap_table.scenarios.run_montecarlo');
  const parsed = runMonteCarloExitSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error);

  // Insert run dans table valuation_runs (réutilisé Module 11) ou table dédiée cap_table_runs
  // Trigger Edge Function compute-dilution-monte-carlo en background
  // Realtime subscription pour récupérer le résultat (cf Module 3a B5)
  // Retourne run_id immédiatement
}

// ============================================================================
// SNAPSHOTS
// ============================================================================

export async function createManualSnapshot(
  asofDate: string,
  label: string,
): Promise<Result<{ id: string }>> {
  await requirePermission('cap_table.snapshot.create');
  // RPC materialize_snapshot avec snapshot_type='MANUAL_FREEZE'
}

// ============================================================================
// COMPUTE & VIEW
// ============================================================================

export async function getCapTable(
  asofDate?: string,
  scenarioId?: string,
  viewMode: 'CONSOLIDATED' | 'DILUTED' | 'PRO_FORMA' = 'CONSOLIDATED',
): Promise<Result<CapTableResult>> {
  await requirePermission('cap_table.read.all');
  // RPC compute_cap_table
}

// ============================================================================
// IMPORT
// ============================================================================

export async function bulkImportPositions(
  csvContent: string,
): Promise<Result<{ created: number; errors: ImportError[] }>> {
  await requirePermission('cap_table.snapshot.create');
  // Parser papaparse + Zod par row
  // INSERT batch dans cap_table_positions avec source='BULK_IMPORT'
  // Retourne summary
}
```

### 3.3 Pattern Edge Function `compute-dilution-monte-carlo`

`supabase/functions/compute-dilution-monte-carlo/index.ts` :

```typescript
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

Deno.serve(async (req: Request) => {
  // 1. Auth check (verify_jwt = true)
  // 2. Parse input : { runId, orgId, capTablePositions, valuationMean, valuationStddev, ... }
  // 3. Compute base cap table via RPC compute_cap_table
  // 4. POST vers QUANT_ENGINE_URL/compute/dilution-monte-carlo avec :
  //    {
  //      positions: [{ stakeholder_id, units, share_class_type, liquidation_pref, ... }],
  //      valuation_distribution: {
  //        type: 'lognormal',
  //        mean: valuationMean,
  //        stddev: valuationStddev
  //      },
  //      time_horizon_years: number,
  //      num_paths: number,
  //      seed: 42
  //    }
  // 5. Réception réponse Python :
  //    {
  //      run_id, exec_time_ms,
  //      results_per_stakeholder: [{
  //        stakeholder_id, mean_payout, p10, p25, p50, p75, p90,
  //        distribution_paths: [number] (échantillon 100 paths)
  //      }]
  //    }
  // 6. UPDATE cap_table_runs SET status='SUCCESS', result_json=response
  // 7. Realtime push pour la page UI

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

> **⚠️ Engine Python à étendre** : le moteur Fly.io actuel n'a pas l'endpoint `/compute/dilution-monte-carlo`. À ajouter en parallèle de Module 10. Voir §6 (Plan B5).

---

## 4. UI / PAGES

### 4.1 Composants à créer/réutiliser

**Déjà créés en PR #12 (design system V1)** :

- `apps/web/src/components/captable/cap-table-matrix.tsx` (TanStack Table v8 sticky headers)
- `apps/web/src/components/captable/valuation-toggle.tsx` (segmented Consolidé/Dilué/Pro forma)
- `apps/web/src/components/charts/editorial-waterfall.tsx`

**À créer en Module 10** :

- `apps/web/src/components/captable/share-class-form.tsx`
- `apps/web/src/components/captable/funding-round-wizard.tsx` (3 étapes)
- `apps/web/src/components/captable/scenario-builder.tsx`
- `apps/web/src/components/captable/dilution-comparator.tsx` (avant / après)
- `apps/web/src/components/captable/exit-monte-carlo-form.tsx`
- `apps/web/src/components/captable/violin-plot.tsx` (Recharts custom pour MC results)
- `apps/web/src/components/captable/snapshot-list.tsx`
- `apps/web/src/components/captable/cap-table-pie-chart.tsx`
- `apps/web/src/components/portal/my-positions-card.tsx` (lecture seule bénéficiaire)

### 4.2 Page principale `/dashboard/captable/page.tsx`

Layout : PageShell + valuation-toggle (top right) + 4 vues selon tab actif.

**Tab "Tableau"** (cap-table-matrix) :

- Colonnes : Stakeholder / Type / Classe / Units / % consolidé / % dilué / Cost basis
- Sticky header 2 niveaux (groupes par class_type)
- Tri multi-colonne
- Filtres (par stakeholder_type, par class_type)
- Mini-barres % dans la cellule "% consolidé"
- Deltas T-1 (compare au snapshot le plus récent NIGHTLY) en mono italic ink-400

**Tab "Camembert"** :

- cap-table-pie-chart répartition par stakeholder_type
- Légende interactive (click pour filtrer)

**Tab "Waterfall"** :

- editorial-waterfall avec scénario EXIT (valuation actuelle de la dernière levée par défaut)
- Affiche : qui touche quoi en cas de sortie maintenant

**Tab "Évolution"** :

- Line chart avec snapshots historiques (units par class_type au fil du temps)
- Marqueurs verticaux sur chaque funding_round

### 4.3 Page rounds wizard `/dashboard/captable/rounds/new`

Wizard 3 étapes (pattern Module 3b BulkImportModal mais en page) :

**Étape 1 — Termes financiers**

- Nom + type (select)
- Pre-money (input EUR formaté)
- Amount raised (input EUR formaté)
- Price per share (calculated ou manual)
- Total shares issued (calculated)
- Affichage live : post-money, % dilution

**Étape 2 — Termes juridiques**

- Liquidation preference (multiplier + type)
- Conversion ratio
- Anti-dilution type
- Champ libre additional_terms (JSON V1)

**Étape 3 — Investisseurs**

- Tableau editable : nom, email, units, amount
- Validation live : sum(amount) === amount_raised
- Bouton "Importer CSV" (papaparse)

**Footer** : "Sauvegarder brouillon" / "Soumettre pour approbation"

### 4.4 Page scénario `/dashboard/captable/scenarios/[id]`

- Top : carte synthèse scénario + bouton "Recalculer"
- Body : 2 colonnes
  - Gauche : matrice "Avant" (état actuel)
  - Droite : matrice "Après" (avec scénario appliqué)
- Bottom : waterfall comparatif avant/après

### 4.5 Page exit simulator `/dashboard/captable/exit-simulator`

- Form : valuation mean, stddev, horizon, num_paths
- Submit → Edge Function compute-dilution-monte-carlo (async)
- Loading state avec progress bar (Realtime)
- Résultat :
  - Tableau par stakeholder (mean, p10, p50, p90)
  - Violin plot (distribution par stakeholder)
  - Waterfall pour le median path

### 4.6 Page bénéficiaire `/portal/positions`

- Header : "Mes positions"
- Cards par classe d'actions (si plusieurs)
- Pour chaque card :
  - Code classe + name
  - Units détenues
  - % consolidé (par rapport au total org)
  - Cost basis total
  - Valeur estimée (units × dernier prix unitaire connu) avec disclaimer
- Lien "Voir tous mes documents" (vers /portal/documents Module 8)

### 4.7 Sidebar nav

Ajout dans `apps/web/src/components/shared/dashboard-sidebar.tsx` :

- Section "OPÉRATIONS" : nouvel item "Cap Table" (Lucide icon `PieChart`) → `/dashboard/captable`
- Sous-items au survol : Vue d'ensemble / Classes / Rounds / Scénarios / Sortie

Ajout dans `apps/web/src/app/portal/layout.tsx` :

- Nav 4 liens : Awards / Positions / Documents / Profil (au lieu de 3)

### 4.8 Sandbox `/dev/cap-table-builder/page.tsx`

- Préset 1 : "Startup post-Seed" (founders + 1 round Seed + ESOP)
- Préset 2 : "Series A" (idem + Series A 5M€ à 25M€ post-money)
- Préset 3 : "Avant exit" (Series A + B + 50% ESOP exercé)
- Toggle "View mode" en bas
- Bouton "Reset" pour tester d'autres scénarios

---

## 5. COMPLIANCE V1

À placer dans `apps/web/src/lib/compliance/rules/capTableRules.ts`.

### 5.1 Rules

```typescript
export const CAP_TABLE_COMPLIANCE_RULES: ComplianceRule[] = [
  {
    code: 'POOL_OVER_ALLOCATION',
    description: 'Le pool ESOP ne peut pas être sur-alloué',
    appliesTo: ['AWARD_PROPOSED', 'AWARD_GRANTED'],
    enforcement: 'hard',
    check: async (data, ctx) => {
      const pool = await ctx.getEsopPool();
      const allocated = await ctx.getTotalAllocatedEsop();
      const reserved = await ctx.getTotalReservedEsop();

      if (allocated + reserved + data.units > pool.poolTotalUnits) {
        return {
          severity: 'ERROR',
          code: 'POOL_OVER_ALLOCATION',
          message: `Pool ESOP insuffisant : ${pool.poolTotalUnits - allocated - reserved} disponibles, ${data.units} demandés.`,
        };
      }
      return null;
    },
  },

  {
    code: 'AGA_30_PERCENT_CAP',
    description: '⚠️ DETTE #3 RÉSOLUE — vérifie cap AGA 30% du capital social',
    appliesTo: ['AWARD_PROPOSED'],
    enforcement: 'hard',
    check: async (data, ctx) => {
      if (data.planType !== 'AGA') return null;

      const totalShares = await ctx.getCompanyTotalShares();  // Maintenant disponible
      const totalAgaIssued = await ctx.getTotalAgaIssued();
      const newAga = data.units;

      const agaPercent = (totalAgaIssued + newAga) / totalShares;

      if (agaPercent > 0.30) {
        return {
          severity: 'ERROR',
          code: 'AGA_30_PERCENT_CAP',
          message: `Cap AGA dépassé : ${(agaPercent * 100).toFixed(1)}% > 30%. Réduction nécessaire.`,
        };
      }

      if (agaPercent > 0.27) {
        return {
          severity: 'WARNING',
          code: 'AGA_APPROACHING_CAP',
          message: `Cap AGA bientôt atteint : ${(agaPercent * 100).toFixed(1)}%.`,
        };
      }

      return null;
    },
  },

  {
    code: 'SHARE_CLASS_CODE_UNIQUE',
    description: 'Code de classe d''actions unique par org',
    appliesTo: ['SHARE_CLASS_CREATE'],
    enforcement: 'hard',
    check: async (data, ctx) => {
      const existing = await ctx.findShareClassByCode(data.code);
      if (existing) {
        return {
          severity: 'ERROR',
          code: 'SHARE_CLASS_CODE_DUPLICATE',
          message: `Une classe avec le code "${data.code}" existe déjà.`,
        };
      }
      return null;
    },
  },

  {
    code: 'ROUND_AMOUNT_CONSISTENCY',
    description: 'Sum(investor.amount) = round.amount_raised (tolérance 1%)',
    appliesTo: ['FUNDING_ROUND_CREATE'],
    enforcement: 'hard',
    check: (data, ctx) => {
      const sumInvestors = data.investors.reduce((s: number, i: any) => s + i.amount, 0);
      const tolerance = data.amountRaised * 0.01;

      if (Math.abs(sumInvestors - data.amountRaised) > tolerance) {
        return {
          severity: 'ERROR',
          code: 'ROUND_AMOUNT_INCONSISTENT',
          message: `Somme investisseurs (${sumInvestors}€) ne correspond pas au montant levé (${data.amountRaised}€).`,
        };
      }
      return null;
    },
  },

  {
    code: 'ESOP_PERCENT_BEST_PRACTICE',
    description: 'Pool ESOP recommandé entre 5% et 15% du fully diluted (soft warning)',
    appliesTo: ['SHARE_CLASS_CREATE', 'POOL_TOPUP_SCENARIO'],
    enforcement: 'soft',
    check: async (data, ctx) => {
      const totalShares = await ctx.getCompanyTotalSharesIncludingPool();
      const poolPercent = data.poolTotalUnits / totalShares;

      if (poolPercent < 0.05) {
        return {
          severity: 'WARNING',
          code: 'ESOP_TOO_SMALL',
          message: `Pool ESOP de ${(poolPercent * 100).toFixed(1)}% en dessous du standard marché (5-15%).`,
        };
      }

      if (poolPercent > 0.20) {
        return {
          severity: 'WARNING',
          code: 'ESOP_TOO_LARGE',
          message: `Pool ESOP de ${(poolPercent * 100).toFixed(1)}% au-dessus du standard marché (5-15%). Dilution founders importante.`,
        };
      }

      return null;
    },
  },
];
```

### 5.2 Wiring

- `runCapTableComplianceChecks(input, ctx)` exposé dans `apps/web/src/lib/compliance/runChecks.ts`
- Hooké dans :
  - `createShareClass` (rule SHARE_CLASS_CODE_UNIQUE + ESOP_PERCENT_BEST_PRACTICE)
  - `createFundingRound` (rule ROUND_AMOUNT_CONSISTENCY)
  - `transitionAward` côté Module 3b (rules POOL_OVER_ALLOCATION + AGA_30_PERCENT_CAP existaient mais retournaient null V1, maintenant actives)

### 5.3 Mise à jour Module 3b

Modifier `apps/web/src/lib/compliance/rules/awardRules.ts` :

- La rule `AGA_30_PERCENT_CAP` (V1 retournait null faute de cap table) doit maintenant appeler le ctx loader. Update commit `feat(module-10): activate AGA_30_PERCENT_CAP via cap table`.

---

## 6. TESTS

### 6.1 Tests SQL (sandbox + cloud)

Cible : 25+ tests SQL.

| ID  | Description                                                         |
| --- | ------------------------------------------------------------------- |
| A   | Recon DB : tables existent, colonnes présentes, RLS active          |
| B   | INSERT share_class COMMON happy path                                |
| C   | INSERT share_class ESOP avec pool_total_units                       |
| D   | INSERT share_class ESOP sans pool → reject                          |
| E   | UNIQUE share_class.code per org → reject duplicate                  |
| F   | INSERT funding_round Seed avec 3 investors                          |
| G   | RPC create_funding_round atomique : INSERT + N positions + snapshot |
| H   | Round amount mismatch → REJECT                                      |
| I   | RPC compute_cap_table CONSOLIDATED                                  |
| J   | RPC compute_cap_table DILUTED (avec awards GRANTED)                 |
| K   | RPC compute_cap_table avec scenario_id NEW_ROUND                    |
| L   | RPC compute_cap_table avec scenario_id POOL_TOPUP                   |
| M   | Trigger exercise → cap_table position emitted                       |
| N   | RPC materialize_snapshot                                            |
| O   | Snapshot is_immutable=TRUE → cannot DELETE                          |
| P   | RLS positions : BENEFICIARY voit uniquement ses positions           |
| Q   | RLS positions : ADMIN voit toute l'org                              |
| R   | RLS scenarios : owner voit son scenario même non shared             |
| S   | RLS scenarios : autres admins voient seulement is_shared=TRUE       |
| T   | Hook AGA_30_PERCENT_CAP active : reject si > 30%                    |
| U   | Hook POOL_OVER_ALLOCATION active : reject si pool insuffisant       |
| V   | Bulk import 100 positions → INSERT atomique                         |
| W   | apply_scenario NEW_ROUND : positions diluées correctement           |
| X   | apply_scenario EXIT : waterfall preferred liquidation pref          |
| Y   | Cron nightly snapshot : INSERT snapshot type='NIGHTLY' chaque nuit  |

### 6.2 Tests Vitest (logique pure)

Cible : 30+ tests.

- `applyNewRoundScenario(positions, params)` — dilution correcte
- `applyPoolTopupScenario(positions, params)` — pool agrandi
- `applyBulkExerciseScenario(positions, params)` — emissions
- `applyExitWaterfall(positions, exitValue, classes)` — preferred reçoivent leur pref d'abord
- `computeOwnershipPercent(positions, viewMode)` — % par stakeholder
- `parseImportCsv(csvString)` — papaparse + Zod row par row
- `validateRoundConsistency(round, investors)` — sum(amount) check
- Edge cases : pool_total_units = 0, exit_value < total_pref_pref, conversion split

### 6.3 Tests E2E manuels (Playwright = TODO Module 13)

Scénarios :

1. Admin crée 3 share classes (Common, Pref A, ESOP) → vérifie cap_table_positions vide
2. Admin crée Series A round avec 3 investors → vérifie 3 positions INSERT + snapshot post-round
3. Admin lance scénario NEW_ROUND Series B → vérifie matrice avant/après cohérente
4. Admin lance Monte Carlo exit 100M€ ±20M€, 10K paths → vérifie résultat dans 30s avec p50 cohérent
5. Bénéficiaire exerce 100 BSPCE Module 9 → vérifie position INSERT auto + visible dans /portal/positions
6. Admin crée snapshot manuel "Avant Series B" → vérifie figé immutable
7. Bénéficiaire qui n'a pas exercé → /portal/positions affiche message vide

### 6.4 Ajout endpoint Python `/compute/dilution-monte-carlo`

Le moteur Fly.io existant doit être étendu avant Module 10 B5. Spec endpoint :

**Input** :

```json
{
  "positions": [
    {
      "stakeholder_id": "uuid",
      "stakeholder_name": "string",
      "share_class_code": "string",
      "share_class_type": "COMMON|PREFERRED|ESOP",
      "units": 12345,
      "liquidation_preference_multiple": 1.0,
      "liquidation_preference_type": "NON_PARTICIPATING",
      "conversion_ratio": 1.0,
      "cost_basis_per_unit": 5.0
    }
  ],
  "valuation_distribution": {
    "type": "lognormal",
    "mean": 100000000,
    "stddev": 30000000
  },
  "time_horizon_years": 5.0,
  "num_paths": 10000,
  "seed": 42
}
```

**Output** :

```json
{
  "run_id": "...",
  "exec_time_ms": 1234,
  "engine_version": "2.6.0",
  "input_hash": "abc123",
  "results_per_stakeholder": [
    {
      "stakeholder_id": "uuid",
      "mean_payout": 1234567,
      "p10": 500000,
      "p25": 800000,
      "p50": 1100000,
      "p75": 1500000,
      "p90": 2000000,
      "distribution_paths": [
        /* 100 sample paths */
      ]
    }
  ],
  "global_metrics": {
    "exit_valuation_mean_simulated": 99876543,
    "exit_valuation_p50": 100000000
  }
}
```

À implémenter côté Python (hors scope frontend Capiwise mais à coordonner avec le maintainer du moteur).

---

## 7. INSTRUCTIONS POUR CLAUDE CODE

### Phase 1 — Bootstrap

1. Lire `memory/module_9_complete.md` + `memory/module_8_complete.md`
2. Branche `feat/module-10-cap-table` from master à jour (post Module 9 merge)
3. Pre-checks :
   - Tests workspace 450+/450+ verts (post Module 9)
   - Drift cloud documenté
   - Modules 1-9 mergés sur master
   - Confirmer que les composants design system (cap-table-matrix.tsx, valuation-toggle.tsx, editorial-waterfall.tsx) existent (PR #12 mergée)
4. Recon B1 :
   - État DB : `cap_table_positions` n'existe pas ; `share_classes` peut-être préfiguré Module 1 ; `funding_rounds` n'existe pas
   - État permissions : aucune permission `cap_table.*` seedée
   - État design system : composants squelette PR #12 prêts à être enrichis
   - État Python engine : endpoint `/compute/dilution-monte-carlo` n'existe pas → à coordonner avec maintainer

### Phase 2 — B1 : DB Schema

Suivre §2.1 à §2.10. **9 migrations** : 00080-00089.

Pattern obligatoire :

- Appliquer migration en local d'abord (pnpm supabase:reset)
- Tester en SQL pur (15+ assertions par migration)
- Appliquer en cloud via mcp Supabase
- Régénérer les types : `pnpm supabase gen types typescript --linked > packages/shared/src/types/database.ts`
- Commit : `feat(module-10): db schema cap table (00080-00089)`

⚠️ Migration 00088 (hook exercise) : tester explicitement le scénario où la migration de seed `share_classes COMMON` arrive APRÈS la migration du hook. Le hook doit gérer gracefully le cas `v_common_class_id IS NULL` (warning + skip, pas d'exception).

### Phase 3 — B2 : Server Actions CRUD

Suivre §3.1 + §3.2 sections SHARE_CLASSES et FUNDING_ROUNDS uniquement.

- 5 actions : createShareClass, updateShareClass, deactivateShareClass, createFundingRound, cancelFundingRound
- Tests Vitest 15+
- Sandbox `/dev/cap-table-builder` avec presets

Commit : `feat(module-10): share classes + funding rounds server actions`

### Phase 4 — B3 : RPC compute + UI matrice

- Server Action `getCapTable` avec viewMode toggle
- Page `/dashboard/captable/page.tsx` (tab Tableau seulement)
- Réutilisation `cap-table-matrix.tsx` du design system
- Sidebar nav update

Commit : `feat(module-10): compute cap table + main page`

### Phase 5 — B4 : Scénarios déterministes

- Server Actions createScenario, updateScenario, deleteScenario, runScenario
- Page `/dashboard/captable/scenarios/[id]` avec dilution-comparator
- Tab Camembert + Tab Waterfall ajoutés à la page principale
- 4 scénarios : NEW_ROUND, POOL_TOPUP, BULK_EXERCISE, EXIT (déterministe)

Commit : `feat(module-10): dilution scenarios deterministic`

### Phase 6 — B5 : Python Monte Carlo

⚠️ **Bloqueur potentiel** : le endpoint Python `/compute/dilution-monte-carlo` doit exister avant cette phase. Sinon : skip B5 V1, marquer comme dette V1.5.

Si endpoint OK :

- Edge Function `compute-dilution-monte-carlo`
- Server Action `runMonteCarloExit`
- Page `/dashboard/captable/exit-simulator` avec violin plot
- Test E2E avec 10K paths < 30s

Commit : `feat(module-10): exit simulator monte carlo integration`

### Phase 7 — B6 : Snapshots + portal bénéficiaire + import

- Server Action `createManualSnapshot`
- Page `/dashboard/captable/snapshots` + détail snapshot
- Page `/portal/positions` (bénéficiaire)
- Server Action `bulkImportPositions` + page `/dashboard/captable/import`
- Cron nightly snapshot via pg_cron

Commit : `feat(module-10): snapshots + portal positions + import`

### Phase 8 — B7 : Compliance V1 + closure

- 5 rules dans capTableRules.ts (cf §5.1)
- Wiring runChecks.ts
- Activation rule AGA_30_PERCENT_CAP (était dormante en Module 3b)
- Tests d'activation
- Audit final E2E
- Memory `module_10_complete.md`
- Marquer dette technique #3 résolue dans CLAUDE.md
- Squash-merge PR #X sur master

Commit : `feat(module-10): compliance + closure`

### Workflow Git

- 1 branche `feat/module-10-cap-table` from master
- 7 commits dans l'ordre B1→B7
- PR draft dès B1, ready après B7
- Squash-merge sur master à la fin

### Reporting

Toutes les 2 phases (B1+B2, B3+B4, B5+B6, B7), poster dans le chat :

```
🏗️ MODULE 10 — POINT D'AVANCEMENT
Phases complétées : X/7
Derniers commits :
  - feat(module-10): db schema (a3f4b21)
  - feat(module-10): share classes server actions (b5c8d92)
Prochaine phase : B3 — Compute + UI matrice
ETA : ~4h
Bloqueurs : aucun
```

---

## 8. CONVENTIONS STRICTES (RAPPEL)

Règles autoritaires depuis `CLAUDE.md` racine :

- `'use server'` = uniquement async functions
- Pattern Result `{ ok: true, data } | { ok: false, error }` pour Server Actions
- Validation Zod sur chaque Server Action
- Audit log systématique (insertion `audit_events` sur toute action critique)
- TypeScript strict — aucun `any` non justifié
- Imports absolus via `@/` pour `apps/web` et `@equity/shared` pour le package partagé
- Types DB depuis `@equity/shared` UNIQUEMENT (pas de re-import depuis `apps/web/src/lib/supabase/database.types.ts` qui a été supprimé en PR #9)
- Sandbox `/dev/*` pour mécaniques complexes (cap-table-builder)
- Sidebar nav : ajouter Cap Table dès que la page principale existe (B3), pas avant
- Pas de `localStorage`/`sessionStorage` dans les composants
- Migration séquentielle 00080-00089 (pas de skip)
- Régénérer types après chaque migration

---

## 9. POINTS DE VIGILANCE

- **Cap table = sensible légalement** : toute écriture (INSERT funding_round, INSERT position FOUNDER_GRANT) doit être tracée auditEvents avec metadata complète. Le CAC doit pouvoir reconstituer l'historique à n'importe quelle date.
- **Confidentialité** : les BENEFICIARY ne doivent JAMAIS voir les positions des founders ou autres bénéficiaires. RLS strict + tests RLS isolés.
- **Source COMMON par défaut** : si l'org n'a pas de share_class type COMMON quand un exercise FULLY_PAID arrive, le hook `on_exercise_payment_confirmed` doit logger un warning et skip (pas d'exception). L'admin doit créer une COMMON class avant le premier exercise. Documenter dans le wizard onboarding (V2 = bloquer Module 9 si pas de COMMON).
- **Scénarios = pas de mutation réelle** : un scénario crée des positions virtuelles dans le résultat de `compute_cap_table`, mais ne touche JAMAIS la table `cap_table_positions`. Cas critique : si un dev intègre un scénario dans une migration ou une Server Action de prod, c'est une faute grave qui peut polluer la cap table réelle.
- **Snapshots immutables** : une fois `is_immutable=TRUE` (typiquement via PRE_AUDIT), aucun DELETE n'est autorisé même par OWNER. L'audit ne doit pas pouvoir être modifié rétroactivement.
- **Anti-dilution full ratchet** : V1 = enregistré JSON mais pas exécuté dans `apply_scenario`. Documentation claire dans la spec : "anti_dilution_type=FULL_RATCHET nécessite intervention manuelle V1, automatisation V2 Module 12".
- **Multi-currency** : V1 = EUR uniquement. Si un round est saisi en USD, planter avec message clair côté Server Action. Multi-currency = V2.
- **Round amount tolerance 1%** : la check constraint en DB + la rule compliance ROUND_AMOUNT_CONSISTENCY tolèrent 1% pour les arrondis price_per_share. Si un investor met 999.999€ pour 1000€ attendus, OK. Au-delà : reject.
- **Liquidation preference EXIT scenario** : V1 implémente NON_PARTICIPATING + PARTICIPATING simple. PARTICIPATING_CAPPED implémenté en V1 mais à valider sur 3 cas réels. FULL_RATCHET = V2.
- **Pool ESOP top-up vs pre-money/post-money** : selon le stade de la levée, le top-up se fait en pre-money (dilue founders) ou post-money (dilue tous). V1 = au choix admin avec hint UI. V2 = wizard spécifique.
- **Conversion ratio à la sortie** : V1 = 1:1 par défaut. Si la classe a un conversion_ratio != 1.0, le scénario EXIT doit en tenir compte (1 preferred = N common à la sortie). À tester explicitement en B5.
- **Hook Module 9 → Module 10** : si Module 10 est en cours et Module 9 fonctionne déjà, le hook `on_exercise_payment_confirmed` ne doit pas casser le flux Module 9 même si la table `share_classes` est vide. Pattern : wrap dans try/catch + log warning, jamais d'exception remontée.
- **Performance compute_cap_table** : pour des orgs avec 1000+ positions, le calcul peut être lent. V1 = OK jusqu'à 500 positions. V2 = matérialiser en table dédiée si > 500.
- **Monte Carlo Python coût** : 10K paths × 100 stakeholders = 1M de calculs. Le moteur Fly.io doit être dimensionné. À tester en charge en B5 avec 50K paths × 200 stakeholders avant d'autoriser num_paths > 10K en UI.

---

## 10. MIGRATIONS — RÉSUMÉ

| #     | Nom                              | Effet                                  |
| ----- | -------------------------------- | -------------------------------------- |
| 00080 | `share_classes_table.sql`        | Table + RLS + triggers                 |
| 00081 | `funding_rounds_table.sql`       | Table + RLS + triggers                 |
| 00082 | `cap_table_positions_table.sql`  | Table + RLS + triggers                 |
| 00083 | `cap_table_snapshots_table.sql`  | Table + RLS + triggers                 |
| 00084 | `dilution_scenarios_table.sql`   | Table + RLS + triggers                 |
| 00085 | `compute_cap_table_rpc.sql`      | RPC + helper apply_scenario            |
| 00086 | `create_funding_round_rpc.sql`   | RPC atomique                           |
| 00087 | `materialize_snapshot_rpc.sql`   | RPC snapshot                           |
| 00088 | `exercise_to_cap_table_hook.sql` | Trigger AFTER UPDATE exercise_requests |
| 00089 | `seed_permissions_module_10.sql` | Permissions + role mappings            |

---

## 11. DETTES TECHNIQUES À CRÉER (V2)

À ajouter à `CLAUDE.md` "Dette technique connue" lors de la closure Module 10 :

- **Anti-dilution FULL_RATCHET non automatisé** : enregistré JSON mais pas exécuté dans apply_scenario. À implémenter Module 12 (Compliance V2).
- **Multi-currency cap table** : V1 = EUR only. À ouvrir si un client demande.
- **Stock split / reverse split** : pas implémenté V1. À ouvrir si un client demande (rare en startup FR).
- **Conversion preferred → common automatique à la sortie** : V1 = manuel par scénario (`conversion_strategy`). V2 = trigger automatique sur scénario EXIT.
- **Performance compute_cap_table** : à matérialiser en table dédiée si > 500 positions.
- **Monte Carlo num_paths cap** : V1 limité à 10K en UI. V2 = scaling Fly.io + worker queue.
- **Reporting cap table CAC** : V1 = export JSON. V2 = export PDF formaté avec branding org (Module 13).
- **Watermarking PDF cap table** : pour confidentialité. V2 (Module 13).
- **Cap table contributif** : permettre à un réviseur externe (auditor) d'annoter sans modifier. V2.
- **ROFR / drag-along / tag-along** : terms enregistrés JSON V1, pas exécutables. V2 (Module 12).

---

## 12. RÉSOLUTION DETTES EXISTANTES

À mettre à jour dans `CLAUDE.md` :

- ✅ Dette #3 (`AGA_30_PERCENT_CAP retournait null en V1`) — RÉSOLUE en Module 10 B7. La rule appelle maintenant `ctx.getCompanyTotalShares()` qui agrège positions via compute_cap_table. Tests d'activation explicites en Phase 8.
- ⏳ Dette #1 (`rate_flat / dividend_yield % bruts`) — Pas résolue ici. Module 11 (IFRS 2 finalisation).
- ⏳ Dette #11 (`incremental_fair_value` calcul différé) — Pas résolue ici. Module 11.

---

**FIN DU MODULE 10 — CAP TABLE DYNAMIQUE**

_Quand le Module 10 est implémenté et validé, reviens vers Claude (chat) pour "go module 11" (IFRS 2 finalisation + Visualisation Monte Carlo)._
