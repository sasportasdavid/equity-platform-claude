# MODULE 1 — FOUNDATION & ARCHITECTURE GLOBALE

> **Projet :** Equity Platform — SaaS de gestion administrative de plans d'actionnariat salarié
> **Version :** 1.0
> **Date :** Avril 2026
> **Statut :** Spec d'architecture initiale
> **Audience :** Claude Code (développement)

---

## 0. CONTEXTE & OBJECTIFS

### 0.1 Mission produit

Construire une plateforme SaaS B2B française de gestion **administrative et financière** de plans d'actionnariat salarié (BSPCE, AGA, Stock Options, BSA, RSU, etc.), conforme à la réglementation française et aux normes IFRS 2.

La plateforme couvre **tout le lifecycle** d'un plan, de sa création à la sortie du bénéficiaire :

1. **Création de plan** (déjà partiellement existant — wizard 7 étapes)
2. **Attribution aux bénéficiaires** avec workflow d'approbation configurable
3. **Signature électronique** des documents (Yousign)
4. **Suivi du vesting** dans le temps
5. **Exercice** (pour options) et règlement (settlement)
6. **Cap table dynamique** avec scénarios de dilution
7. **Valorisation IFRS 2** via moteur Python Monte Carlo existant
8. **Conformité réglementaire FR** automatisée
9. **Audit trail** complet pour Commissaires aux Comptes

### 0.2 Existant à préserver

Le **moteur de valorisation Python** est déjà en production sur Fly.io :

- URL : `https://equity-gem-quant.fly.dev`
- Endpoint principal : `POST /compute/multi-tranche`
- Fait du Monte Carlo 100K paths, conditions de performance (TSR, Share Price, Non-Market), IFRS 2

**Cette plateforme appellera ce moteur** pour toutes les valorisations. Le moteur reste tel quel ; on ne le ré-implémente pas.

### 0.3 Concurrents et positionnement

Concurrents principaux : **Carta**, **Pulley**, **Easop**, **Capdesk**, **Ledgy**, **Equify**.
Différenciation visée :

- Conformité française native (BSPCE, AGA avec contraintes légales intégrées)
- Valorisation IFRS 2 sophistiquée (Monte Carlo, conditions de performance complexes)
- Workflow multi-acteurs configurable (board, RH, CFO, conseil)
- UX premium pour bénéficiaires (espace web complet, mobile-friendly)

### 0.4 Profils utilisateurs cibles

| Profil          | Description                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| **OWNER**       | Super-admin de l'organisation. Crée l'org, gère facturation, gère les autres rôles. Typiquement le CEO ou fondateur. |
| **ADMIN_HR**    | Crée plans, propose attributions, gère bénéficiaires et docs. Typiquement RH, People Ops, ou Office Manager.         |
| **APPROVER**    | Valide les propositions d'attribution. Peut être CFO, board member, président. Multi-niveaux possibles.              |
| **AUDITOR**     | Lecture seule + accès complet à l'audit trail. Typiquement Commissaire aux Comptes, conseil juridique externe.       |
| **BENEFICIARY** | Voit ses propres awards, exerce ses options, signe ses documents. Typiquement salarié, dirigeant, consultant.        |

Un même utilisateur peut cumuler plusieurs rôles via des `memberships` multiples.

---

## 1. STACK TECHNIQUE

### 1.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────────┐
│                       FRONTEND (Next.js 15)                          │
│   App Router · React 19 · TypeScript · Tailwind · shadcn/ui          │
│   TanStack Query · React Hook Form · Zod · Server Actions            │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND (Next.js Server)                          │
│   • Server Actions (mutations)                                       │
│   • Route Handlers (REST endpoints, webhooks)                        │
│   • tRPC (queries typées si on en a besoin)                          │
└─────────────────────────────────────────────────────────────────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            ▼                     ▼                     ▼
┌──────────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│   SUPABASE           │ │   YOUSIGN API    │ │   RESEND API     │
│   PostgreSQL + RLS   │ │   E-signature    │ │   Emails         │
│   Auth · Storage     │ │   Webhooks       │ │                  │
│   Edge Functions     │ │                  │ │                  │
└──────────┬───────────┘ └──────────────────┘ └──────────────────┘
           │
           ▼
┌──────────────────────┐
│   PYTHON QUANT       │
│   ENGINE (FLY.IO)    │
│   Existing service   │
│   Monte Carlo        │
└──────────────────────┘
```

### 1.2 Stack frontend

- **Framework** : Next.js 15 (App Router, Server Components par défaut)
- **Langage** : TypeScript strict
- **UI** : Tailwind CSS + shadcn/ui (composants à copier dans `/components/ui`)
- **State serveur** : TanStack Query v5 + Server Actions
- **State client** : Zustand pour les stores complexes (wizard, filtres), useState pour le local
- **Formulaires** : React Hook Form + Zod (résolveur `@hookform/resolvers/zod`)
- **Tables** : TanStack Table v8
- **Charts** : Recharts (cohérent avec moteur existant)
- **Date** : date-fns (locale fr)
- **Icônes** : lucide-react
- **Markdown** : react-markdown + remark-gfm pour le rendu, **TipTap** pour l'éditeur WYSIWYG (templates de documents)
- **PDF generation** : react-pdf côté serveur (Server Action ou route handler), avec fallback puppeteer pour rendus complexes
- **i18n** : next-intl (FR par défaut, EN en V2)

### 1.3 Stack backend

- **Runtime** : Node.js 20+ (Vercel ou self-hosted)
- **Auth** : Supabase Auth (email + magic link, optionnel SSO Google/Microsoft en V2)
- **DB** : PostgreSQL via Supabase (avec extensions : `uuid-ossp`, `pgcrypto`, `pg_cron` pour les jobs)
- **RLS** : Row Level Security activée sur **TOUTES** les tables (isolation par `org_id`)
- **Storage** : Supabase Storage (buckets : `documents`, `templates`, `signatures`, `exports`)
- **Edge Functions** : Deno runtime Supabase (uniquement pour appels externes lourds : Yousign webhooks, fetch Python engine, génération PDF)
- **Background jobs** : pg_cron + Edge Functions (vesting recalc nocturne, expirations awards, alertes conformité)

### 1.4 Intégrations externes

| Service                   | Usage                                                    | Mode                                                           |
| ------------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| **Resend**                | Tous les emails transactionnels                          | API REST + webhooks pour delivery status                       |
| **Yousign**               | Signature électronique des documents                     | Mode **Hybrid** : email Resend → page Yousign hosted → webhook |
| **Python Quant Engine**   | Valorisation Monte Carlo IFRS 2                          | API REST existante (pas de modification)                       |
| **EODHD / Yahoo Finance** | Données de marché (déjà intégré dans le moteur existant) | API REST via Edge Functions                                    |

### 1.5 Hébergement

- **Frontend Next.js** : Vercel (recommandé) ou self-hosted Docker
- **Supabase** : Cloud Supabase (instance dédiée à l'org, pas le free tier)
- **Python Quant** : Fly.io (existant, ne pas toucher)

### 1.6 Versions et conventions

- Node 20 LTS minimum
- pnpm comme package manager (lockfile committed)
- Format : Prettier + ESLint (config Next.js)
- Commits : Conventional Commits (`feat:`, `fix:`, `chore:`, etc.)
- Branches : `main` (prod), `staging`, `feature/xxx`

---

## 2. STRUCTURE DU REPO

```
equity-platform/
├── .github/
│   └── workflows/                     # CI/CD GitHub Actions
├── apps/
│   └── web/                            # Application Next.js
│       ├── src/
│       │   ├── app/                    # App Router
│       │   │   ├── (auth)/             # Routes publiques (login, signup)
│       │   │   ├── (dashboard)/        # Routes admin/RH/approver
│       │   │   ├── (beneficiary)/      # Routes bénéficiaire
│       │   │   ├── (auditor)/          # Routes auditeur (lecture seule)
│       │   │   ├── api/                # Route handlers (webhooks, exports)
│       │   │   └── layout.tsx          # Root layout
│       │   ├── components/
│       │   │   ├── ui/                 # shadcn/ui primitives
│       │   │   ├── shared/             # Composants partagés (PageShell, etc.)
│       │   │   ├── plans/              # Composants spécifiques aux plans
│       │   │   ├── awards/             # Composants spécifiques aux awards
│       │   │   ├── beneficiaries/
│       │   │   ├── captable/
│       │   │   ├── documents/
│       │   │   ├── approvals/
│       │   │   └── valuations/
│       │   ├── lib/
│       │   │   ├── supabase/           # Clients Supabase (server, client, admin)
│       │   │   ├── auth/               # Helpers auth, RBAC
│       │   │   ├── validators/         # Schémas Zod
│       │   │   ├── formatters/         # Format dates, montants, etc.
│       │   │   ├── compliance/         # Règles conformité FR
│       │   │   ├── pricing/            # Client Python engine
│       │   │   ├── yousign/            # Client Yousign
│       │   │   ├── resend/             # Client Resend + templates email
│       │   │   ├── pdf/                # Génération PDF
│       │   │   └── utils.ts
│       │   ├── server/
│       │   │   ├── actions/            # Server Actions par domaine
│       │   │   │   ├── plans.ts
│       │   │   │   ├── awards.ts
│       │   │   │   ├── beneficiaries.ts
│       │   │   │   ├── approvals.ts
│       │   │   │   ├── signatures.ts
│       │   │   │   ├── exercise.ts
│       │   │   │   └── captable.ts
│       │   │   ├── queries/            # Queries DB (Server Components)
│       │   │   └── webhooks/           # Handlers webhooks (Yousign, Resend)
│       │   ├── hooks/                  # React hooks
│       │   ├── stores/                 # Zustand stores
│       │   ├── types/                  # Types TypeScript globaux
│       │   └── middleware.ts           # Next.js middleware (auth)
│       ├── public/
│       ├── package.json
│       ├── next.config.js
│       ├── tailwind.config.ts
│       └── tsconfig.json
├── supabase/
│   ├── migrations/                     # Migrations SQL versionnées
│   │   ├── 00001_init_schema.sql
│   │   ├── 00002_rls_policies.sql
│   │   ├── 00003_seed_compliance_rules.sql
│   │   └── ...
│   ├── functions/                      # Edge Functions
│   │   ├── yousign-webhook/
│   │   ├── resend-webhook/
│   │   ├── compute-valuation/          # Proxy vers Python engine
│   │   ├── generate-pdf/
│   │   ├── recalc-vesting/             # Cron nocturne
│   │   ├── compliance-check/           # Cron alertes conformité
│   │   └── _shared/
│   ├── seed.sql                        # Données de test
│   └── config.toml
├── packages/
│   ├── shared/                         # Code partagé (types, schémas Zod)
│   │   ├── src/
│   │   │   ├── types/
│   │   │   ├── schemas/
│   │   │   └── constants/
│   │   └── package.json
│   └── ui/                             # (optionnel) composants UI réutilisables
├── docs/
│   ├── MODULE_01_FOUNDATION.md         # Ce document
│   ├── MODULE_02_IDENTITY_ROLES.md
│   ├── MODULE_03_PLANS_AWARDS.md
│   ├── ...
│   └── architecture/
│       ├── DATABASE_SCHEMA.md
│       ├── RLS_POLICIES.md
│       └── DEPLOYMENT.md
├── .env.example
├── .gitignore
├── pnpm-workspace.yaml
├── README.md
└── package.json
```

---

## 3. PRINCIPES D'ARCHITECTURE

### 3.1 Server-first

Privilégier les **React Server Components** par défaut. Les Client Components (`"use client"`) uniquement quand nécessaire (interactivité, hooks browser, state local).

Les **Server Actions** sont la voie principale pour les mutations. Pas d'API REST à créer pour la communication client→serveur, sauf pour :

- Webhooks externes (Yousign, Resend)
- Exports lourds (PDFs, CSV)
- Endpoints API consommés par des intégrations tierces (clés API, comme dans le moteur existant)

### 3.2 Multi-tenancy strict via RLS

**Toutes** les tables ont une colonne `org_id UUID NOT NULL` (sauf les tables référentielles globales : `plan_types`, `compliance_rules_catalog`, etc.).

**Toutes** les policies RLS filtrent par `org_id` via une fonction helper :

```sql
CREATE OR REPLACE FUNCTION current_org_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT (auth.jwt() ->> 'org_id')::UUID
$$;
```

L'`org_id` actif est injecté dans le JWT au moment de la connexion ou du switch d'organisation (un user multi-org sélectionne son org active).

### 3.3 RBAC granulaire

Au-delà des 5 rôles principaux, chaque action est gardée par une **permission** granulaire. Les rôles sont des **bundles de permissions** (plus flexible qu'un check `if (role === 'ADMIN')`).

```typescript
// Permissions définies en clair
type Permission =
  | 'plans.create'
  | 'plans.read'
  | 'plans.update'
  | 'plans.delete'
  | 'awards.propose'
  | 'awards.approve'
  | 'awards.read.own'
  | 'awards.read.all'
  | 'awards.exercise'
  | 'awards.cancel'
  | 'beneficiaries.create'
  | 'beneficiaries.read'
  | 'beneficiaries.update'
  | 'captable.read'
  | 'captable.export'
  | 'captable.simulate'
  | 'documents.create_template'
  | 'documents.send_for_signature'
  | 'org.manage_members'
  | 'org.manage_billing'
  | 'org.manage_compliance'
  | 'audit.read'
  | 'audit.export';
// ... etc
```

Les rôles mappent vers des permissions dans une table `role_permissions` (seedée).

### 3.4 Audit trail immuable

**Toute action métier** produit un événement dans `audit_events`. Les événements sont :

- **Immutables** (pas d'UPDATE ni DELETE en RLS, sauf super-admin)
- **Horodatés** au timestamptz précis
- **Attribués** à un user et une org
- **Riches** : payload JSONB avant/après, contexte (IP, user agent, request_id)

Cas d'usage : reporting CAC, contestations bénéficiaires, conformité RGPD/SOX-like.

### 3.5 Soft deletes

Pas de DELETE physique sur les tables métier. Toutes les tables principales ont `deleted_at TIMESTAMPTZ NULL` et les RLS filtrent `deleted_at IS NULL` par défaut.

Exception : les tables de jointure et les caches (market_data_cache, etc.) peuvent être hard-delete.

### 3.6 Idempotence des opérations sensibles

Toutes les opérations qui touchent l'argent, le statut légal, ou la cap table doivent être idempotentes :

- Chaque mutation a un `idempotency_key` UUID
- Une table `operation_log` enregistre les `idempotency_key` consommés
- Si rejouée, l'opération renvoie le résultat précédent sans dupliquer

### 3.7 Versioning des entités critiques

Plans, templates de documents, et règles de conformité sont **versionnés** :

- Chaque modification crée une nouvelle version (table `entity_versions`)
- Les awards déjà émis pointent vers la version utilisée à l'attribution
- Possible de "freezer" une version (immuable) ou laisser en `DRAFT`

---

## 4. SCHÉMA DE BASE DE DONNÉES COMPLET

> Voir aussi : [DATABASE_SCHEMA.md](architecture/DATABASE_SCHEMA.md) pour les détails column-by-column.

Le schéma couvre **tous les modules** (1 à 13). Certaines tables ne seront utilisées qu'à partir des modules suivants, mais sont créées dès le début pour éviter les migrations cassantes.

### 4.1 Vue d'ensemble — Diagramme relationnel

```
                            ┌──────────────────┐
                            │   ORGANIZATIONS  │
                            └────────┬─────────┘
                                     │
       ┌─────────────┬───────────────┼───────────────┬──────────────┐
       ▼             ▼               ▼               ▼              ▼
   ┌────────┐  ┌─────────────┐ ┌──────────┐  ┌──────────────┐ ┌────────────┐
   │  USERS │  │ MEMBERSHIPS │ │COMPANIES │  │ BENEFICIARIES│ │ API_KEYS   │
   └────────┘  └─────────────┘ └────┬─────┘  └──────┬───────┘ └────────────┘
                                    │               │
                                    ▼               │
                              ┌──────────┐          │
                              │  PLANS   │          │
                              │(versions)│          │
                              └────┬─────┘          │
                                   │                │
                ┌──────────────────┼────────────────┘
                ▼                  ▼
          ┌──────────┐       ┌────────────────────┐
          │ AWARDS   │◄──────┤ APPROVAL_REQUESTS  │
          └────┬─────┘       └────────────────────┘
               │
        ┌──────┴────────┬────────────┬──────────────┬──────────────┐
        ▼               ▼            ▼              ▼              ▼
  ┌──────────┐  ┌─────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐
  │ VESTING_ │  │ EXERCISE_   │ │ AWARD_     │ │ DOCUMENT_  │ │VALUATION_│
  │ EVENTS   │  │ REQUESTS    │ │ MODIFICATIONS│ │INSTANCES   │ │RESULTS   │
  └──────────┘  └─────────────┘ └────────────┘ └────────────┘ └──────────┘
                                                       │
                                                       ▼
                                              ┌──────────────────┐
                                              │SIGNATURE_REQUESTS│
                                              └──────────────────┘
```

### 4.2 Tables — Identité & Organisation

#### `organizations`

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL, -- pour URLs
  legal_name TEXT,
  siren TEXT,
  legal_form TEXT, -- SAS, SA, SARL, SCA
  registered_address JSONB,
  default_currency TEXT DEFAULT 'EUR',
  default_locale TEXT DEFAULT 'fr-FR',
  timezone TEXT DEFAULT 'Europe/Paris',
  fiscal_year_end_month SMALLINT DEFAULT 12, -- 12 = décembre
  -- Settings
  settings JSONB DEFAULT '{}'::jsonb,
  -- Billing (V2)
  plan_tier TEXT DEFAULT 'STANDARD',
  stripe_customer_id TEXT,
  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
```

#### `users` (extension de `auth.users`)

```sql
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  default_org_id UUID REFERENCES organizations(id),
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
```

#### `memberships`

```sql
CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  roles TEXT[] NOT NULL DEFAULT '{}', -- ['OWNER', 'ADMIN_HR', 'APPROVER', 'AUDITOR', 'BENEFICIARY']
  status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, INVITED, SUSPENDED
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  -- Custom permissions (override)
  permissions_grant TEXT[] DEFAULT '{}',
  permissions_revoke TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX idx_memberships_user ON memberships(user_id);
CREATE INDEX idx_memberships_org ON memberships(org_id);
```

#### `invitations`

```sql
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  roles TEXT[] NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'PENDING', -- PENDING, ACCEPTED, EXPIRED, REVOKED
  invited_by UUID REFERENCES auth.users(id),
  beneficiary_id UUID, -- si invitation pour un bénéficiaire existant
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ
);
```

#### `permissions_catalog` (référentiel global)

```sql
CREATE TABLE permissions_catalog (
  code TEXT PRIMARY KEY, -- 'plans.create', etc.
  category TEXT NOT NULL,
  description TEXT,
  is_dangerous BOOLEAN DEFAULT false
);
```

#### `role_permissions` (mapping rôles ↔ permissions)

```sql
CREATE TABLE role_permissions (
  role TEXT NOT NULL,
  permission_code TEXT NOT NULL REFERENCES permissions_catalog(code),
  PRIMARY KEY(role, permission_code)
);
```

#### `api_keys` (accès programmatique — repris du moteur existant)

```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  scopes TEXT[] DEFAULT '{}', -- permissions accordées
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 4.3 Tables — Sociétés & Bénéficiaires

#### `companies`

```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  legal_name TEXT,
  siren TEXT,
  legal_form TEXT,
  ticker TEXT, -- pour sociétés cotées (auto-fetch market data)
  isin TEXT,
  country_code TEXT DEFAULT 'FR',
  share_capital NUMERIC, -- capital social en €
  share_par_value NUMERIC, -- valeur nominale unitaire
  total_shares_issued BIGINT, -- pour cap table
  -- Eligibilité fiscale
  is_bspce_eligible BOOLEAN DEFAULT false,
  bspce_eligibility_assessed_at DATE,
  bspce_eligibility_data JSONB, -- CA, ancienneté, capital, etc.
  -- Métadonnées
  founded_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
```

#### `beneficiaries`

```sql
CREATE TABLE beneficiaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id),
  user_id UUID REFERENCES auth.users(id), -- NULL si pas encore inscrit
  -- Identité
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  date_of_birth DATE,
  nationality TEXT DEFAULT 'FR',
  tax_residence_country TEXT DEFAULT 'FR',
  social_security_number TEXT, -- chiffré, pour DSN
  -- RH
  beneficiary_type TEXT NOT NULL, -- EMPLOYEE, OFFICER (mandataire), CONSULTANT, ADVISOR, OTHER
  job_title TEXT,
  department TEXT,
  hire_date DATE,
  termination_date DATE, -- NULL si toujours en poste
  termination_reason TEXT, -- resignation, dismissal, etc. (mappe sur leaver_rules)
  -- Contact
  address JSONB,
  -- Documents
  identity_document_url TEXT,
  -- Custom fields
  custom_fields JSONB DEFAULT '{}'::jsonb,
  -- Statut
  status TEXT DEFAULT 'ACTIVE', -- ACTIVE, FORMER, ARCHIVED
  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(org_id, email)
);

CREATE INDEX idx_beneficiaries_org ON beneficiaries(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_beneficiaries_user ON beneficiaries(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_beneficiaries_status ON beneficiaries(status);
```

### 4.4 Tables — Plans (extension de l'existant)

> **Note** : ces tables existent déjà partiellement dans le moteur. On les étend ; on ne les casse pas.

#### `plans`

```sql
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  company_id UUID NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  plan_type TEXT NOT NULL, -- BSPCE, AGA, STOCK_OPTION, BSA, RSU, PERFORMANCE_SHARE, PHANTOM, ESOP, SAR
  settlement_type TEXT DEFAULT 'EQUITY', -- EQUITY, CASH
  -- Dates clés
  board_date DATE,                -- Date conseil/board
  shareholder_meeting_date DATE,  -- Date AGE (pour AGA, autorisation BSPCE, etc.)
  shareholder_authorization_expires_at DATE, -- Validité autorisation AGE (38 mois max AGA)
  grant_date DATE NOT NULL,
  -- Pool
  pool_size BIGINT NOT NULL,        -- Nombre total d'instruments du pool
  pool_allocated BIGINT DEFAULT 0,  -- Nombre déjà attribué
  pool_vested BIGINT DEFAULT 0,     -- Nombre déjà vesté
  pool_exercised BIGINT DEFAULT 0,  -- Nombre déjà exercé
  pool_cancelled BIGINT DEFAULT 0,  -- Annulé/forfait
  -- Pricing
  exercise_price NUMERIC,           -- Strike (NULL pour AGA/RSU)
  reference_share_price NUMERIC,    -- FMV à grant date (pour comparaison strike)
  -- Performance
  performance_combination_type TEXT DEFAULT 'WEIGHTED',
  performance_evaluation_moment TEXT DEFAULT 'END',
  performance_failure_action TEXT DEFAULT 'FORFEIT',
  -- Statut
  status TEXT DEFAULT 'DRAFT', -- DRAFT, ACTIVE, CLOSED, CANCELLED
  -- Versioning
  version INTEGER DEFAULT 1,
  parent_plan_id UUID REFERENCES plans(id), -- si version d'un autre plan
  is_locked BOOLEAN DEFAULT false, -- empêche modification si awards émis
  -- Documents
  plan_rules_template_id UUID, -- template du règlement de plan
  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_plans_org ON plans(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_plans_status ON plans(status);
CREATE INDEX idx_plans_type ON plans(plan_type);
```

#### `vesting_schedules` & `vesting_tranches`

Conservés à l'identique du moteur existant. Ajout d'une colonne `is_template` pour permettre la réutilisation.

#### `performance_conditions`

Conservée à l'identique.

#### `early_termination_rules`

```sql
CREATE TABLE early_termination_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  org_id UUID NOT NULL,
  leaver_type TEXT NOT NULL, -- resignation, termination_cause, termination_no_cause, death, retirement, company_sale, mutual_agreement, end_of_contract
  treatment TEXT NOT NULL,    -- forfeit_all, keep_vested, pro_rata, accelerate, full_accelerate
  acceleration_months INTEGER, -- si treatment = accelerate
  exercise_window_days INTEGER, -- délai d'exercice après départ
  custom_logic JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(plan_id, leaver_type)
);
```

### 4.5 Tables — Awards (Attributions individuelles) ⭐ CŒUR DU SYSTÈME

#### `awards`

```sql
CREATE TABLE awards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  plan_id UUID NOT NULL REFERENCES plans(id),
  beneficiary_id UUID NOT NULL REFERENCES beneficiaries(id),
  award_number TEXT, -- numérotation lisible (ex: "AWD-2025-0001"), auto-généré
  -- Quantités
  units_granted BIGINT NOT NULL CHECK (units_granted > 0), -- Nombre attribué
  units_vested BIGINT DEFAULT 0,
  units_exercised BIGINT DEFAULT 0,
  units_settled BIGINT DEFAULT 0, -- réglés (cash ou actions)
  units_cancelled BIGINT DEFAULT 0,
  units_outstanding BIGINT GENERATED ALWAYS AS
    (units_granted - units_exercised - units_cancelled) STORED,
  -- Pricing à grant
  exercise_price NUMERIC, -- snapshot du strike au moment de l'attribution
  fair_value_per_unit NUMERIC, -- valorisation IFRS 2 à grant
  total_fair_value NUMERIC GENERATED ALWAYS AS
    (units_granted * fair_value_per_unit) STORED,
  -- Dates clés
  grant_date DATE NOT NULL,
  vesting_start_date DATE,
  expiry_date DATE, -- date limite d'exercice (BSPCE = grant + 10 ans max)
  acceptance_deadline DATE, -- date avant laquelle bénéficiaire doit accepter
  accepted_at TIMESTAMPTZ,
  -- État (state machine)
  status TEXT NOT NULL DEFAULT 'DRAFT',
  -- Statuts possibles : DRAFT, PROPOSED, PENDING_APPROVAL, APPROVED,
  -- PENDING_BOARD, BOARD_APPROVED, PENDING_SIGNATURE, GRANTED,
  -- VESTING, FULLY_VESTED, PARTIALLY_EXERCISED, FULLY_EXERCISED,
  -- EXPIRED, FORFEITED, CANCELLED
  -- Versioning du plan
  plan_version INTEGER, -- version du plan utilisée
  plan_rules_document_id UUID, -- document signé par le bénéficiaire
  -- Snapshot vesting (copié du plan, peut être modifié)
  vesting_schedule_snapshot JSONB,
  performance_conditions_snapshot JSONB,
  leaver_rules_snapshot JSONB,
  -- Compliance
  is_compliant BOOLEAN DEFAULT true,
  compliance_warnings JSONB DEFAULT '[]'::jsonb, -- soft warnings
  -- Modifications
  has_modifications BOOLEAN DEFAULT false,
  -- Workflow
  approval_request_id UUID, -- FK vers approval_requests
  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  granted_at TIMESTAMPTZ, -- effectivement émis (post-signature)
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_awards_org ON awards(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_awards_plan ON awards(plan_id);
CREATE INDEX idx_awards_beneficiary ON awards(beneficiary_id);
CREATE INDEX idx_awards_status ON awards(status);
CREATE UNIQUE INDEX idx_awards_number ON awards(org_id, award_number) WHERE award_number IS NOT NULL;
```

#### `vesting_events`

Trace **chaque** événement de vesting individuel (par tranche, par award).

```sql
CREATE TABLE vesting_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  award_id UUID NOT NULL REFERENCES awards(id),
  tranche_id UUID, -- FK vers la tranche du schedule
  scheduled_date DATE NOT NULL,
  effective_date DATE, -- date réelle où le vesting s'est effectué
  units_to_vest BIGINT NOT NULL,
  units_vested BIGINT NOT NULL DEFAULT 0,
  performance_multiplier NUMERIC DEFAULT 1.0, -- de 0 à 2.0 selon payout curve
  status TEXT DEFAULT 'PENDING', -- PENDING, VESTED, FORFEITED, ACCELERATED, DEFERRED
  -- Performance assessment (si applicable)
  performance_assessed_at TIMESTAMPTZ,
  performance_assessment_data JSONB,
  -- Notifications
  notification_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_vesting_events_award ON vesting_events(award_id);
CREATE INDEX idx_vesting_events_date ON vesting_events(scheduled_date);
CREATE INDEX idx_vesting_events_status ON vesting_events(status);
```

#### `award_modifications` (IFRS 2.27-28)

```sql
CREATE TABLE award_modifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  award_id UUID NOT NULL REFERENCES awards(id),
  modification_type TEXT NOT NULL, -- REPRICING, EXTENSION, ACCELERATION, ADDITIONAL_GRANT, CANCELLATION
  effective_date DATE NOT NULL,
  -- Snapshots
  before_snapshot JSONB NOT NULL,
  after_snapshot JSONB NOT NULL,
  -- IFRS 2 incremental
  incremental_fair_value NUMERIC, -- FV après - FV avant (si positif)
  -- Approval
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  approval_request_id UUID,
  -- Justification
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

#### `exercise_requests`

```sql
CREATE TABLE exercise_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  award_id UUID NOT NULL REFERENCES awards(id),
  beneficiary_id UUID NOT NULL REFERENCES beneficiaries(id),
  request_number TEXT, -- "EXR-2025-0001"
  units_to_exercise BIGINT NOT NULL CHECK (units_to_exercise > 0),
  exercise_price_per_unit NUMERIC NOT NULL,
  total_exercise_amount NUMERIC GENERATED ALWAYS AS
    (units_to_exercise * exercise_price_per_unit) STORED,
  fmv_per_unit_at_request NUMERIC, -- juste valeur au jour de la demande
  -- Workflow
  status TEXT DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, COMPLETED, CANCELLED
  requested_at TIMESTAMPTZ DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  rejected_reason TEXT,
  payment_received_at TIMESTAMPTZ, -- tracking manuel (pas de paiement intégré)
  payment_reference TEXT, -- réf bancaire
  certificate_issued_at TIMESTAMPTZ,
  certificate_document_id UUID,
  completed_at TIMESTAMPTZ,
  -- Compliance
  is_within_exercise_window BOOLEAN DEFAULT true,
  compliance_checks JSONB DEFAULT '{}'::jsonb,
  -- Notes
  beneficiary_notes TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 4.6 Tables — Workflow d'Approbation

#### `approval_workflows` (templates de circuits)

```sql
CREATE TABLE approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  -- Scope d'application
  applies_to TEXT NOT NULL, -- AWARD_GRANT, AWARD_MODIFICATION, EXERCISE_REQUEST, PLAN_CREATION
  plan_type_filter TEXT[], -- ['BSPCE', 'AGA'] ou NULL = tous
  -- Configuration
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false, -- workflow par défaut pour ce scope
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### `approval_workflow_steps`

```sql
CREATE TABLE approval_workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES approval_workflows(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  -- Approbateur
  approver_type TEXT NOT NULL, -- ROLE, USER, ANY_OF_ROLE, ALL_OF_ROLE
  approver_role TEXT, -- si type ROLE
  approver_user_id UUID REFERENCES auth.users(id), -- si type USER
  -- Mode
  mode TEXT DEFAULT 'SEQUENTIAL', -- SEQUENTIAL, PARALLEL
  required_approvals INTEGER DEFAULT 1, -- combien d'approbations nécessaires si parallèle
  -- Délai
  sla_hours INTEGER, -- temps de réponse attendu
  auto_escalate_after_hours INTEGER,
  escalate_to_user_id UUID REFERENCES auth.users(id),
  -- Conditions (V2)
  trigger_conditions JSONB DEFAULT '{}'::jsonb,
  UNIQUE(workflow_id, step_order)
);
```

#### `approval_requests`

```sql
CREATE TABLE approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  workflow_id UUID REFERENCES approval_workflows(id),
  -- Quoi approuver
  subject_type TEXT NOT NULL, -- AWARD, AWARD_MODIFICATION, EXERCISE_REQUEST, etc.
  subject_id UUID NOT NULL,
  -- État
  status TEXT DEFAULT 'PENDING', -- PENDING, IN_PROGRESS, APPROVED, REJECTED, CANCELLED
  current_step_id UUID REFERENCES approval_workflow_steps(id),
  -- Auteur
  requested_by UUID REFERENCES auth.users(id),
  request_message TEXT,
  -- Résolution
  resolved_at TIMESTAMPTZ,
  resolution TEXT, -- APPROVED, REJECTED
  resolution_message TEXT,
  -- Snapshot du subject au moment de la demande
  subject_snapshot JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_approval_requests_subject ON approval_requests(subject_type, subject_id);
CREATE INDEX idx_approval_requests_status ON approval_requests(status);
```

#### `approval_actions`

```sql
CREATE TABLE approval_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  request_id UUID NOT NULL REFERENCES approval_requests(id),
  step_id UUID REFERENCES approval_workflow_steps(id),
  -- Acteur
  user_id UUID NOT NULL REFERENCES auth.users(id),
  -- Action
  action TEXT NOT NULL, -- APPROVE, REJECT, REQUEST_CHANGES, DELEGATE, COMMENT
  comment TEXT,
  delegated_to UUID REFERENCES auth.users(id),
  -- Métadonnées
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 4.7 Tables — Documents & Signatures

#### `document_templates`

```sql
CREATE TABLE document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL, -- AWARD_LETTER, PLAN_RULES, BOARD_RESOLUTION, EXERCISE_NOTICE, CERTIFICATE, ACCEPTANCE_LETTER
  applies_to_plan_types TEXT[], -- ['BSPCE'] ou NULL = tous
  -- Contenu
  content_format TEXT DEFAULT 'TIPTAP_JSON', -- TIPTAP_JSON, MARKDOWN, HTML
  content JSONB NOT NULL, -- structure TipTap (ou string Markdown)
  -- Variables disponibles
  available_variables JSONB, -- liste des {{variables}} accessibles dans ce template
  -- Versioning
  version INTEGER NOT NULL DEFAULT 1,
  parent_template_id UUID REFERENCES document_templates(id),
  is_active BOOLEAN DEFAULT true,
  is_locked BOOLEAN DEFAULT false, -- une fois utilisé, on lock
  -- Signatures requises
  signature_workflow JSONB, -- ordre, signataires (rôles)
  -- Style
  pdf_style JSONB, -- header, footer, font, logo
  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
```

#### `document_instances`

```sql
CREATE TABLE document_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  template_id UUID REFERENCES document_templates(id),
  template_version INTEGER, -- version utilisée
  -- Quoi
  document_number TEXT, -- "DOC-2025-0001"
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  -- Lien à l'entité
  related_entity_type TEXT, -- AWARD, EXERCISE_REQUEST, PLAN
  related_entity_id UUID,
  -- Contenu rendu
  rendered_html TEXT, -- HTML après injection des variables
  rendered_pdf_url TEXT, -- URL Supabase Storage
  rendered_pdf_hash TEXT, -- SHA-256 pour intégrité
  -- Variables injectées (snapshot)
  variables_used JSONB,
  -- Statut
  status TEXT DEFAULT 'DRAFT', -- DRAFT, GENERATED, SENT_FOR_SIGNATURE, PARTIALLY_SIGNED, SIGNED, ARCHIVED, VOIDED
  -- Audit
  generated_at TIMESTAMPTZ,
  generated_by UUID REFERENCES auth.users(id),
  signed_at TIMESTAMPTZ, -- toutes signatures complètes
  archived_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  voided_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### `signature_requests`

```sql
CREATE TABLE signature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  document_id UUID NOT NULL REFERENCES document_instances(id),
  -- Yousign
  yousign_procedure_id TEXT, -- UUID procédure Yousign
  yousign_signature_request_id TEXT,
  -- Statut
  status TEXT DEFAULT 'CREATED', -- CREATED, SENT, IN_PROGRESS, COMPLETED, EXPIRED, DECLINED, CANCELLED
  -- Configuration
  expiry_date TIMESTAMPTZ,
  reminder_settings JSONB, -- ex: rappels J+3, J+7
  -- Audit Yousign
  webhook_payload_history JSONB DEFAULT '[]'::jsonb, -- historique des webhooks reçus
  proof_certificate_url TEXT, -- certificat de preuve Yousign
  -- Audit interne
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
```

#### `signers`

```sql
CREATE TABLE signers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  signature_request_id UUID NOT NULL REFERENCES signature_requests(id),
  -- Signataire
  user_id UUID REFERENCES auth.users(id),
  beneficiary_id UUID REFERENCES beneficiaries(id),
  -- Identité (snapshot)
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role_in_signature TEXT, -- BENEFICIARY, COMPANY_REPRESENTATIVE, BOARD_MEMBER, WITNESS
  signing_order INTEGER, -- ordre dans le flux séquentiel
  -- Statut
  status TEXT DEFAULT 'PENDING', -- PENDING, SENT, VIEWED, SIGNED, DECLINED
  -- Yousign
  yousign_signer_id TEXT,
  yousign_sign_url TEXT, -- URL hosted Yousign à envoyer
  -- Audit
  invited_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  decline_reason TEXT,
  -- Preuve
  ip_address INET,
  signature_method TEXT, -- SIMPLE_ELECTRONIC, ADVANCED_ELECTRONIC, QUALIFIED
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 4.8 Tables — Cap Table

#### `securities` (toutes les valeurs mobilières émises)

```sql
CREATE TABLE securities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id),
  security_type TEXT NOT NULL,
  -- COMMON_SHARE, PREFERRED_SHARE_A, PREFERRED_SHARE_B, ...
  -- BSPCE, AGA, STOCK_OPTION, BSA, RSU, PHANTOM
  -- CONVERTIBLE_NOTE, SAFE
  series_name TEXT, -- 'Series A', 'Series Seed', etc.
  -- Issuance
  issuance_date DATE,
  total_units BIGINT NOT NULL,
  par_value NUMERIC,
  issue_price NUMERIC,
  -- Holder
  holder_type TEXT NOT NULL, -- INDIVIDUAL, COMPANY, FUND, BENEFICIARY_VIA_AWARD
  holder_beneficiary_id UUID REFERENCES beneficiaries(id),
  holder_name TEXT, -- pour les non-bénéficiaires
  holder_legal_id TEXT, -- SIREN, etc.
  -- Source
  source_award_id UUID REFERENCES awards(id), -- si issu d'un award (post-exercice ou AGA)
  source_round_id UUID, -- si issu d'un round d'investissement (V2)
  -- Preferences (pour preferred shares — V2)
  liquidation_preference_multiple NUMERIC, -- 1x, 2x...
  liquidation_preference_type TEXT, -- NON_PARTICIPATING, PARTICIPATING, CAPPED
  conversion_ratio NUMERIC DEFAULT 1.0,
  anti_dilution_type TEXT, -- NONE, FULL_RATCHET, BROAD_BASED, NARROW_BASED
  -- Statut
  status TEXT DEFAULT 'ISSUED', -- ISSUED, CONVERTED, CANCELLED, REPURCHASED
  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX idx_securities_org ON securities(org_id);
CREATE INDEX idx_securities_company ON securities(company_id);
CREATE INDEX idx_securities_holder ON securities(holder_beneficiary_id);
CREATE INDEX idx_securities_source_award ON securities(source_award_id);
```

#### `cap_table_snapshots`

```sql
CREATE TABLE cap_table_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id),
  snapshot_date DATE NOT NULL,
  snapshot_type TEXT NOT NULL, -- AUTO_DAILY, MANUAL, EVENT, SCENARIO
  trigger_event TEXT, -- ex: 'award_granted', 'exercise_completed', 'round_closed'
  -- Données
  data JSONB NOT NULL, -- structure complète : holders, securities, totals, dilution
  total_shares_outstanding BIGINT,
  total_shares_fully_diluted BIGINT,
  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_captable_snapshots_company_date ON cap_table_snapshots(company_id, snapshot_date DESC);
```

#### `cap_table_scenarios` (V1 niveau 2)

```sql
CREATE TABLE cap_table_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  description TEXT,
  base_snapshot_id UUID REFERENCES cap_table_snapshots(id),
  -- Hypothèses
  assumptions JSONB NOT NULL,
  -- Ex: { new_round: { amount, pre_money_valuation, new_shares, type: 'PREFERRED_B' },
  --       new_pool: { units, target_pct } }
  -- Résultat
  computed_data JSONB,
  computed_at TIMESTAMPTZ,
  -- Audit
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  is_archived BOOLEAN DEFAULT false
);
```

### 4.9 Tables — Valorisation & IFRS 2

> **Note** : ces tables existent déjà dans le moteur Python. On les conserve, on les étend si nécessaire.

#### `hypothesis_sets`, `volatility_schemes`, `simulation_configs`

Conservées à l'identique.

#### `valuation_runs`, `valuation_results`

Conservées à l'identique.

#### `valuation_award_results` (NOUVEAU)

```sql
CREATE TABLE valuation_award_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  valuation_run_id UUID NOT NULL REFERENCES valuation_runs(id),
  award_id UUID NOT NULL REFERENCES awards(id),
  fair_value_per_unit NUMERIC NOT NULL,
  total_fair_value NUMERIC NOT NULL,
  vesting_probability NUMERIC,
  audit_data JSONB,
  computed_at TIMESTAMPTZ DEFAULT now()
);
```

#### `ifrs2_expense_schedules`, `ifrs2_expense_periods`

Conservées à l'identique. Ajout de `award_id` pour reporting individuel.

```sql
ALTER TABLE ifrs2_expense_schedules
  ADD COLUMN IF NOT EXISTS award_id UUID REFERENCES awards(id);
```

### 4.10 Tables — Conformité

#### `compliance_rules_catalog` (référentiel global)

```sql
CREATE TABLE compliance_rules_catalog (
  code TEXT PRIMARY KEY,
  -- Ex: 'BSPCE_18M_DELAY', 'AGA_MIN_VESTING_1Y', 'AGA_10PCT_CAPITAL', etc.
  name TEXT NOT NULL,
  description TEXT,
  jurisdiction TEXT DEFAULT 'FR',
  applies_to_plan_types TEXT[],
  category TEXT NOT NULL, -- ELIGIBILITY, TIMING, QUANTITY, PROCEDURE
  default_enforcement TEXT DEFAULT 'soft', -- soft, hard
  legal_reference TEXT, -- Article CGI, etc.
  is_active BOOLEAN DEFAULT true
);
```

#### `compliance_rules_config` (par org)

```sql
CREATE TABLE compliance_rules_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  rule_code TEXT NOT NULL REFERENCES compliance_rules_catalog(code),
  enforcement TEXT NOT NULL, -- soft, hard, disabled
  custom_params JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(org_id, rule_code)
);
```

#### `compliance_alerts`

```sql
CREATE TABLE compliance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  rule_code TEXT NOT NULL,
  severity TEXT NOT NULL, -- INFO, WARNING, ERROR
  -- Sujet
  subject_type TEXT NOT NULL,
  subject_id UUID NOT NULL,
  -- Détails
  message TEXT NOT NULL,
  details JSONB,
  -- Statut
  status TEXT DEFAULT 'OPEN', -- OPEN, ACKNOWLEDGED, RESOLVED, DISMISSED
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT,
  -- Audit
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_compliance_alerts_status ON compliance_alerts(status) WHERE status = 'OPEN';
CREATE INDEX idx_compliance_alerts_subject ON compliance_alerts(subject_type, subject_id);
```

### 4.11 Tables — Notifications & Audit

#### `notification_templates`

```sql
CREATE TABLE notification_templates (
  code TEXT PRIMARY KEY,
  -- Ex: 'AWARD_PROPOSED', 'AWARD_GRANTED', 'VESTING_OCCURRED', 'EXERCISE_APPROVED', etc.
  channel TEXT NOT NULL, -- EMAIL, IN_APP, SMS
  locale TEXT DEFAULT 'fr-FR',
  subject TEXT,
  body_template TEXT NOT NULL, -- avec {{variables}}
  available_variables JSONB,
  is_active BOOLEAN DEFAULT true
);
```

#### `notifications` (queue + history)

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID,
  user_id UUID REFERENCES auth.users(id),
  beneficiary_id UUID REFERENCES beneficiaries(id),
  -- Contenu
  template_code TEXT REFERENCES notification_templates(code),
  channel TEXT NOT NULL,
  recipient_email TEXT,
  recipient_phone TEXT,
  subject TEXT,
  body TEXT,
  variables_used JSONB,
  -- Statut
  status TEXT DEFAULT 'PENDING', -- PENDING, SENT, DELIVERED, FAILED, BOUNCED
  -- Provider
  provider TEXT, -- RESEND, TWILIO
  provider_message_id TEXT,
  provider_response JSONB,
  -- Audit
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  failure_reason TEXT,
  read_at TIMESTAMPTZ, -- pour in-app
  -- Sujet
  related_entity_type TEXT,
  related_entity_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, read_at) WHERE channel = 'IN_APP';
CREATE INDEX idx_notifications_status ON notifications(status);
```

#### `audit_events`

```sql
CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID,
  -- Acteur
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT, -- snapshot en cas de delete user
  -- Action
  event_type TEXT NOT NULL,
  -- Ex: 'plan.created', 'award.proposed', 'award.approved', 'document.signed',
  --     'exercise.requested', 'exercise.completed', 'compliance.alert_raised'
  resource_type TEXT, -- AWARD, PLAN, etc.
  resource_id UUID,
  -- Données
  before_state JSONB,
  after_state JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  -- Contexte
  ip_address INET,
  user_agent TEXT,
  request_id TEXT,
  api_key_id UUID REFERENCES api_keys(id),
  -- Timestamp
  occurred_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_events_org_time ON audit_events(org_id, occurred_at DESC);
CREATE INDEX idx_audit_events_resource ON audit_events(resource_type, resource_id);
CREATE INDEX idx_audit_events_user ON audit_events(user_id, occurred_at DESC);
```

#### `operation_log` (idempotency)

```sql
CREATE TABLE operation_log (
  idempotency_key UUID PRIMARY KEY,
  org_id UUID,
  user_id UUID REFERENCES auth.users(id),
  operation TEXT NOT NULL,
  request_payload JSONB,
  response_payload JSONB,
  response_status INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 4.12 Tables — Reporting & Exports

#### `reports`

```sql
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  report_type TEXT NOT NULL, -- IFRS2_QUARTERLY, IFRS2_ANNUAL, DSN_EXPORT, AUDITOR_PACKAGE, CAP_TABLE, EXERCISE_HISTORY
  period_start DATE,
  period_end DATE,
  parameters JSONB,
  -- Output
  output_format TEXT, -- PDF, XLSX, CSV, JSON
  output_url TEXT, -- Supabase Storage
  output_hash TEXT,
  -- Statut
  status TEXT DEFAULT 'PENDING', -- PENDING, GENERATING, COMPLETED, FAILED
  error_message TEXT,
  -- Audit
  generated_by UUID REFERENCES auth.users(id),
  generated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ, -- expiration du lien d'export
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 5. POLICIES RLS (PRINCIPES)

### 5.1 Helper functions

```sql
-- Récupère l'org_id actif depuis le JWT
CREATE OR REPLACE FUNCTION current_org_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT (auth.jwt() ->> 'active_org_id')::UUID
$$;

-- Vérifie si l'utilisateur courant a une permission donnée
CREATE OR REPLACE FUNCTION has_permission(perm TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  user_roles TEXT[];
  user_grants TEXT[];
  user_revokes TEXT[];
BEGIN
  SELECT roles, permissions_grant, permissions_revoke
  INTO user_roles, user_grants, user_revokes
  FROM memberships
  WHERE org_id = current_org_id()
    AND user_id = auth.uid()
    AND status = 'ACTIVE';

  IF user_roles IS NULL THEN
    RETURN FALSE;
  END IF;

  IF perm = ANY(user_revokes) THEN
    RETURN FALSE;
  END IF;

  IF perm = ANY(user_grants) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM role_permissions
    WHERE role = ANY(user_roles)
      AND permission_code = perm
  );
END $$;

-- Vérifie si l'utilisateur courant est le bénéficiaire d'un award
CREATE OR REPLACE FUNCTION is_award_beneficiary(award_id UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM awards a
    JOIN beneficiaries b ON b.id = a.beneficiary_id
    WHERE a.id = award_id
      AND b.user_id = auth.uid()
  )
$$;
```

### 5.2 Patterns de policies

**Pattern 1 — Tables admin uniquement (plans, document_templates, approval_workflows)**

```sql
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY plans_select ON plans FOR SELECT
  USING (org_id = current_org_id() AND deleted_at IS NULL);

CREATE POLICY plans_insert ON plans FOR INSERT
  WITH CHECK (org_id = current_org_id() AND has_permission('plans.create'));

CREATE POLICY plans_update ON plans FOR UPDATE
  USING (org_id = current_org_id() AND has_permission('plans.update'));

CREATE POLICY plans_delete ON plans FOR UPDATE
  USING (org_id = current_org_id() AND has_permission('plans.delete'));
-- Soft delete only via update of deleted_at
```

**Pattern 2 — Tables avec accès bénéficiaire (awards, vesting_events, exercise_requests)**

```sql
ALTER TABLE awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY awards_select_admin ON awards FOR SELECT
  USING (
    org_id = current_org_id()
    AND deleted_at IS NULL
    AND has_permission('awards.read.all')
  );

CREATE POLICY awards_select_beneficiary ON awards FOR SELECT
  USING (
    deleted_at IS NULL
    AND beneficiary_id IN (
      SELECT id FROM beneficiaries WHERE user_id = auth.uid()
    )
  );

CREATE POLICY awards_insert ON awards FOR INSERT
  WITH CHECK (org_id = current_org_id() AND has_permission('awards.propose'));

-- Bénéficiaire peut UPDATE seulement pour accepter
CREATE POLICY awards_update_beneficiary_accept ON awards FOR UPDATE
  USING (
    beneficiary_id IN (SELECT id FROM beneficiaries WHERE user_id = auth.uid())
    AND status IN ('PENDING_SIGNATURE', 'GRANTED')
  )
  WITH CHECK (
    -- Seul le champ accepted_at peut être modifié
    -- (à enforcer via trigger BEFORE UPDATE)
    TRUE
  );
```

**Pattern 3 — Tables audit immuables**

```sql
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_events_select ON audit_events FOR SELECT
  USING (org_id = current_org_id() AND has_permission('audit.read'));

-- Pas de policy INSERT publique : seul le service role peut insérer
-- Pas de policy UPDATE/DELETE : immuable
```

### 5.3 Triggers BEFORE UPDATE pour champs verrouillés

```sql
CREATE OR REPLACE FUNCTION enforce_award_beneficiary_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Si le user est un bénéficiaire (et pas admin)
  IF NOT has_permission('awards.update') THEN
    -- Vérifier que SEUL accepted_at change
    IF NEW.units_granted != OLD.units_granted
       OR NEW.exercise_price != OLD.exercise_price
       OR NEW.status != OLD.status
       -- ... etc
    THEN
      RAISE EXCEPTION 'Beneficiary can only update accepted_at';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER award_beneficiary_update_check
  BEFORE UPDATE ON awards
  FOR EACH ROW EXECUTE FUNCTION enforce_award_beneficiary_update();
```

---

## 6. STATE MACHINE — AWARDS

### 6.1 États et transitions

```
                                      ┌───────────────┐
                                      │     DRAFT     │
                                      │ (admin draft) │
                                      └───────┬───────┘
                                              │ propose
                                              ▼
                                      ┌───────────────┐
                                      │   PROPOSED    │
                                      └───────┬───────┘
                                              │ submit_for_approval
                                              ▼
                                      ┌───────────────────┐
                                      │ PENDING_APPROVAL  │
                                      └───────┬───────────┘
                                              │ all_steps_approved
                                              ▼
                                      ┌───────────────┐
                                      │   APPROVED    │
                                      └───────┬───────┘
                                              │ board_review_required ?
                                              ▼
                              ┌───────────────────────┐
                              │   PENDING_BOARD       │
                              └───────┬───────────────┘
                                      │ board_approved
                                      ▼
                              ┌───────────────┐
                              │BOARD_APPROVED │
                              └───────┬───────┘
                                      │ generate_documents & send_for_signature
                                      ▼
                              ┌───────────────────────┐
                              │  PENDING_SIGNATURE    │
                              └───────┬───────────────┘
                                      │ all_signatures_done
                                      ▼
                              ┌───────────────┐
                              │    GRANTED    │
                              │ (effective)   │
                              └───────┬───────┘
                                      │ vesting_started
                                      ▼
                              ┌───────────────┐
                              │    VESTING    │
                              └───┬───────────┘
                                  │
                ┌─────────────────┼──────────────────┐
                │                 │                  │
                ▼ partial         ▼ all vested       ▼ leaver event
       ┌────────────────┐ ┌──────────────┐  ┌──────────────┐
       │PARTIALLY_VESTED│ │FULLY_VESTED  │  │  FORFEITED   │
       └────────────────┘ └──────┬───────┘  │ (by leaver)  │
                                 │           └──────────────┘
                                 │ exercise (options)
                                 ▼
                       ┌────────────────────────┐
                       │ PARTIALLY_EXERCISED    │
                       └─────────┬──────────────┘
                                 │ all exercised
                                 ▼
                       ┌──────────────────┐
                       │ FULLY_EXERCISED  │
                       └──────────────────┘

      Transverses :
      • CANCELLED (depuis n'importe quel état avant GRANTED)
      • EXPIRED (depuis VESTING/VESTED si exercise window passée)
```

### 6.2 Implémentation

Centraliser dans `apps/web/src/lib/stateMachines/awardStateMachine.ts` :

```typescript
type AwardStatus =
  | 'DRAFT'
  | 'PROPOSED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PENDING_BOARD'
  | 'BOARD_APPROVED'
  | 'PENDING_SIGNATURE'
  | 'GRANTED'
  | 'VESTING'
  | 'PARTIALLY_VESTED'
  | 'FULLY_VESTED'
  | 'PARTIALLY_EXERCISED'
  | 'FULLY_EXERCISED'
  | 'EXPIRED'
  | 'FORFEITED'
  | 'CANCELLED';

const ALLOWED_TRANSITIONS: Record<AwardStatus, AwardStatus[]> = {
  DRAFT: ['PROPOSED', 'CANCELLED'],
  PROPOSED: ['PENDING_APPROVAL', 'DRAFT', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'PROPOSED', 'CANCELLED'],
  APPROVED: ['PENDING_BOARD', 'PENDING_SIGNATURE', 'CANCELLED'],
  // ... etc
};

export function canTransition(from: AwardStatus, to: AwardStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
```

À chaque transition :

1. Vérifier la transition autorisée
2. Vérifier les permissions de l'acteur
3. Vérifier les pré-conditions (compliance, complétude des données)
4. Émettre un `audit_event`
5. Déclencher les notifications

---

## 7. CONVENTIONS DE CODE

### 7.1 Nomenclature

- **Fichiers** : `kebab-case.ts` (ex: `award-state-machine.ts`)
- **Composants React** : `PascalCase.tsx` (ex: `AwardCard.tsx`)
- **Variables/fonctions** : `camelCase`
- **Constantes** : `SCREAMING_SNAKE_CASE`
- **Types/Interfaces** : `PascalCase`, préférer `type` aux `interface` sauf besoin d'extends
- **Tables DB** : `snake_case`, pluriel (`awards`, `vesting_events`)
- **Colonnes DB** : `snake_case`
- **Server Actions** : verbe descriptif (`createAward`, `approveAward`, `requestExercise`)

### 7.2 Structure d'une Server Action

```typescript
// apps/web/src/server/actions/awards.ts
'use server';

import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { requirePermission } from '@/lib/auth/rbac';
import { logAuditEvent } from '@/lib/audit';
import { runComplianceChecks } from '@/lib/compliance';

const ProposeAwardSchema = z.object({
  planId: z.string().uuid(),
  beneficiaryId: z.string().uuid(),
  unitsGranted: z.number().int().positive(),
  // ...
});

export async function proposeAward(input: z.infer<typeof ProposeAwardSchema>) {
  const data = ProposeAwardSchema.parse(input);
  const supabase = await createServerSupabase();
  const user = await requirePermission('awards.propose');

  // 1. Compliance checks
  const complianceResult = await runComplianceChecks('AWARD_PROPOSAL', data);
  if (complianceResult.hasHardBlocks) {
    return { error: 'compliance_blocked', details: complianceResult.errors };
  }

  // 2. Insert
  const { data: award, error } = await supabase
    .from('awards')
    .insert({ ...data, status: 'PROPOSED' })
    .select()
    .single();

  if (error) return { error: error.message };

  // 3. Audit
  await logAuditEvent({
    eventType: 'award.proposed',
    resourceType: 'AWARD',
    resourceId: award.id,
    afterState: award,
  });

  // 4. Trigger workflow (next step)
  // ...

  return { data: award };
}
```

### 7.3 Validation Zod centralisée

Tous les schémas Zod réutilisables dans `packages/shared/src/schemas/`. Importés à la fois dans le frontend (formulaires) et le backend (Server Actions).

### 7.4 Gestion d'erreurs

Pas d'exception throws non-gérées en Server Actions. Toujours retourner `{ data, error }` (pattern Supabase). Côté UI, TanStack Query + toast (sonner).

### 7.5 Tests

- **Unit** : Vitest pour les fonctions pures (compliance, state machine, formatters)
- **Integration** : Vitest + Supabase test instance pour les Server Actions
- **E2E** : Playwright pour les flows critiques (création award → signature → exercice)

Couverture cible : 70% sur le code métier (rules de compliance, state machine), 50% global.

---

## 8. CONFIGURATION & SECRETS

### 8.1 `.env.example`

```bash
# Next.js
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Python Quant Engine (existing)
QUANT_ENGINE_URL=https://equity-gem-quant.fly.dev
QUANT_ENGINE_API_KEY=

# Yousign
YOUSIGN_API_KEY=
YOUSIGN_API_BASE_URL=https://api.yousign.app/v3
YOUSIGN_WEBHOOK_SECRET=

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=no-reply@yourdomain.com
RESEND_WEBHOOK_SECRET=

# EODHD (market data, optionnel - peut être déjà géré côté Python)
EODHD_API_KEY=

# Sentry (V2)
SENTRY_DSN=
```

### 8.2 Feature flags

Table `feature_flags` (org-scoped) :

```sql
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  flag_code TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT false,
  config JSONB,
  UNIQUE(org_id, flag_code)
);
```

Flags V1 :

- `cap_table_scenarios` (par défaut: true)
- `compliance_strict_mode` (false)
- `dsn_export` (false jusqu'à validation)
- `bulk_award_import` (V2)

---

## 9. DÉPLOIEMENT (V1)

### 9.1 Environnements

- **Local** : Supabase local (Docker) + Next.js dev
- **Staging** : Supabase cloud (projet staging) + Vercel preview
- **Production** : Supabase cloud (projet prod) + Vercel prod

### 9.2 Checklist de déploiement initial

- [ ] Créer projet Supabase
- [ ] Exécuter migrations SQL (`00001_init_schema.sql` ... `0000N_seed.sql`)
- [ ] Activer les extensions PostgreSQL (`uuid-ossp`, `pgcrypto`, `pg_cron`)
- [ ] Activer RLS sur toutes les tables métier
- [ ] Créer les buckets Storage : `documents`, `templates`, `signatures`, `exports`
- [ ] Configurer les policies Storage (lecture restreinte au bucket owner via JWT)
- [ ] Déployer les Edge Functions (`yousign-webhook`, `resend-webhook`, `compute-valuation`, `generate-pdf`, `recalc-vesting`, `compliance-check`)
- [ ] Configurer les cron jobs (vesting recalc nocturne 02:00 UTC, compliance check 03:00 UTC)
- [ ] Configurer les domaines Resend (DKIM, SPF, DMARC)
- [ ] Configurer Yousign (sandbox d'abord, prod ensuite)
- [ ] Déployer Next.js sur Vercel avec les env vars
- [ ] Configurer un domaine personnalisé
- [ ] Smoke tests E2E sur staging avant prod

---

## 10. PROCHAINS MODULES (ORDRE DE LIVRAISON)

| #   | Nom                            | Statut         |
| --- | ------------------------------ | -------------- |
| 1   | **Foundation & Architecture**  | ✅ Ce document |
| 2   | Identity & Roles               | À écrire       |
| 3   | Plans & Awards Lifecycle       | À écrire       |
| 4   | Beneficiaries Management       | À écrire       |
| 5   | Approval Engine                | À écrire       |
| 6   | Document Engine & Signatures   | À écrire       |
| 7   | Notifications                  | À écrire       |
| 8   | Beneficiary Portal             | À écrire       |
| 9   | Exercise Workflow              | À écrire       |
| 10  | Cap Table                      | À écrire       |
| 11  | IFRS 2 & Valuation Integration | À écrire       |
| 12  | Compliance Engine              | À écrire       |
| 13  | Audit Trail & Reporting        | À écrire       |

---

## 11. INSTRUCTIONS POUR CLAUDE CODE

### Phase 1 — Bootstrap (à faire dès le "go")

1. Créer le repo monorepo avec `pnpm-workspace.yaml`
2. Initialiser `apps/web` (Next.js 15 + TypeScript + Tailwind + shadcn/ui)
3. Initialiser `packages/shared`
4. Configurer ESLint, Prettier, husky pre-commit
5. Initialiser Supabase local (`supabase init`)
6. Créer la migration `00001_init_schema.sql` avec **TOUTES** les tables de la section 4 de ce document
7. Créer la migration `00002_rls_policies.sql` avec les policies de la section 5
8. Créer la migration `00003_seed_referentials.sql` avec :
   - `permissions_catalog` (toutes les permissions)
   - `role_permissions` (mapping standard)
   - `compliance_rules_catalog` (règles BSPCE, AGA, pool, etc.)
   - `notification_templates` (templates email standard)
9. Configurer les clients Supabase (server, client, admin) dans `apps/web/src/lib/supabase/`
10. Créer le middleware Next.js pour auth + injection `org_id` dans le JWT
11. Créer le layout root + structure des routes (`(auth)`, `(dashboard)`, `(beneficiary)`, `(auditor)`)
12. Créer une page `/login` minimaliste fonctionnelle
13. Créer une page `/dashboard` minimaliste accessible après login
14. Test E2E : signup → login → accès dashboard

### Phase 2 — Validation

Avant de passer au Module 2, fournir :

- Lien Vercel preview fonctionnel
- Capture d'écran du schéma DB depuis Supabase Studio
- Output `pnpm test` sans erreur
- Lien vers le repo GitHub

### Conventions à respecter strictement

- **Pas de `any` TypeScript** sauf justification explicite en commentaire
- **Pas de mutation directe d'objet** (immutabilité)
- **Toujours valider les inputs** des Server Actions avec Zod
- **Toujours logger les actions critiques** dans `audit_events`
- **Jamais de SELECT sans RLS** (pas de service role key côté frontend)
- **Toujours utiliser les helpers** de `@/lib/auth` plutôt que de check manuellement les permissions
- **Pas de placeholder/mock data** committés (sauf dans `seed.sql`)

### Points d'attention spécifiques

- Le schéma DB de la section 4 est **exhaustif et figé**. Les modules suivants peuvent ajouter des colonnes via migrations supplémentaires, mais pas casser l'existant.
- Les types `plan_type`, `condition_type`, etc. sont des **TEXT avec CHECK constraints** plutôt que des ENUMs PostgreSQL (plus flexible pour les migrations).
- L'`org_id` doit être présent dans **toute** insertion. Créer un helper `getServerOrgId()` et l'utiliser systématiquement.
- Pour les soft deletes, créer un helper Supabase `softDelete(table, id)`.

---

**FIN DU MODULE 1 — FOUNDATION & ARCHITECTURE GLOBALE**

_Quand tu es prêt à attaquer le développement, dis "go module 1" à Claude Code avec ce document._
_Pour la spec du Module 2 (Identity & Roles), reviens vers Claude (chat) avec "go module 2"._
