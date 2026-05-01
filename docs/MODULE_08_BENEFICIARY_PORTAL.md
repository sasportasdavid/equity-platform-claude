# MODULE 8 — BENEFICIARY PORTAL

> **Projet :** Equity Platform (Capiwise)
> **Version :** 1.0
> **Date :** Mai 2026
> **Prérequis :** Modules 1 à 7 terminés et validés
> **Audience :** Claude Code (développement)

---

## 0. CONTEXTE & OBJECTIFS

### 0.1 Mission du module

Construire l'**espace bénéficiaire** : l'interface où les salariés détenteurs d'awards (BSPCE, AGA, Stock Options) consultent leurs attributions, suivent leur vesting, simulent l'impact d'un départ, et complètent leur profil.

C'est le pendant B2C du SaaS B2B livré jusqu'ici. Jusqu'à Module 7, tout était pour les RH/CFO/admins. Module 8 ouvre la plateforme aux **utilisateurs finaux** — les salariés.

### 0.2 Décisions structurantes (déjà tranchées)

| Décision            | Choix retenu                           | Justification                                                    |
| ------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| **Vesting display** | Premium (graphe + simulateur leavers)  | Différenciation vs Carta basic, valeur immédiate pour le salarié |
| **Onboarding**      | 2 étapes (welcome + completion profil) | Éducation sans friction excessive                                |
| **Auth**            | Magic link (même que admin)            | Cohérent avec auth existante, pas de mot de passe à gérer        |
| **Routing**         | `/portal/*` séparé de `/dashboard/*`   | Isolation visuelle + permissions strictes                        |
| **Layout**          | Layout dédié, pas de sidebar admin     | UX différente, focus sur l'expérience employé                    |
| **Mobile-first**    | Oui                                    | Beaucoup de salariés consulteront sur mobile                     |
| **Multi-org**       | Bénéficiaire d'une seule org en V1     | 99% des cas. Multi-org = V2.                                     |

### 0.3 Périmètre exact

**Inclus dans ce module :**

- Onboarding 2 étapes : welcome + completion profil (adresse, tax_residence, phone)
- Page liste des awards `/portal/awards` (cards résumé)
- Page détail award `/portal/awards/[id]` avec :
  - Synthèse (status, units, strike, dates clés)
  - Vesting graph (Recharts line chart)
  - Vesting tranches table (passées + futures)
  - Simulateur leavers ("Si je quitte aujourd'hui" / "Dans 6 mois" / etc.)
  - Conditions de performance (lecture)
  - Documents associés (lien vers PDFs signés)
- Page profil `/portal/profile` : édition champs autorisés (phone, address, tax_residence)
- Page documents `/portal/documents` : tous les PDFs signés du bénéficiaire
- Layout dédié avec header simple + navigation 3 onglets (Awards, Documents, Profil)
- RLS strict : un bénéficiaire ne voit QUE ses propres données
- Compliance V1 : 2 règles (acceptation award, complétion profil avant exercice)
- Audit events sur les actions bénéficiaire

**Exclus (modules ultérieurs) :**

- Exercise workflow (Module 9 dédié)
- Acceptation des awards via signature dans le portail (Module 6 a couvert ça via Yousign)
- Demande de documents complémentaires → V2
- Notifications push web → V2
- Inbox in-app complet → V2 (V1 = juste compteur dans header)
- Multi-org (basculer entre orgs) → V2
- Téléchargement attestations fiscales → V2
- Calendrier vesting export iCal → V2
- Préférences utilisateur (langue, thème, opt-out emails) → V2

### 0.4 Dépendances

- Module 1 : tables `awards`, `vesting_events`, `beneficiaries`, `documents`
- Module 2 : auth flow, magic link, hook `custom_access_token_hook`, RLS policies awards
- Module 3a : `plans`, `vesting_schedules`, `vesting_tranches`, `early_termination_rules`
- Module 3b : awards GRANTED, vesting_events générés, leavers conditions
- Module 4 : table `beneficiaries` avec champs personnels
- Module 6 : `document_instances` SIGNED, signed_pdf_storage_path
- Module 7 : notification `beneficiary_first_invite` + emails

### 0.5 Référence

- MODULE_01_FOUNDATION sections 4.x (tables awards, vesting_events, beneficiaries)
- MODULE_02_IDENTITY_ROLES sections 1.x (auth flow), 2.x (multi-org), 5.x (routes /portal)
- MODULE_03A_PLANS sections sur leavers conditions et vesting tranches
- MODULE_03B_AWARDS_LIFECYCLE sur vesting_events generation
- MODULE_04_BENEFICIARIES_MANAGEMENT sur edit self profile RLS

---

## 1. ARCHITECTURE GÉNÉRALE

### 1.1 Vue d'ensemble du flux

```
┌─────────────────────────────────────────────────────────────────────┐
│  PREMIÈRE VISITE BÉNÉFICIAIRE                                        │
│                                                                       │
│  1. Email beneficiary_first_invite (Module 7) → click magic link    │
│  2. /auth/callback → si user n'a pas user_profile rempli :          │
│     redirect /portal/welcome (étape 1 onboarding)                    │
│  3. /portal/welcome : intro Capiwise + récap award à venir           │
│  4. Click "Continuer" → /portal/profile/setup (étape 2)             │
│  5. Form : prénom, nom, phone, adresse, tax_residence                │
│  6. Submit → user_profile + beneficiary updated → /portal/awards    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  USAGE NORMAL                                                        │
│                                                                       │
│  /portal/awards            → liste awards (cards summary)            │
│  /portal/awards/[id]       → détail award avec vesting + leavers     │
│  /portal/documents         → tous PDFs signés                        │
│  /portal/profile           → edit profil (champs limités)            │
│                                                                       │
│  Header : logo Capiwise + nav (Awards / Documents / Profil) +       │
│           compteur notifs IN_APP + avatar + logout                   │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 Routes Next.js

```
# Portal bénéficiaire (nouveau)
/portal                              # Landing page (redirect /portal/awards)
/portal/welcome                      # Étape 1 onboarding (intro)
/portal/profile/setup                # Étape 2 onboarding (completion)
/portal/awards                       # Liste awards
/portal/awards/[id]                  # Détail award (4 sections)
/portal/documents                    # Liste documents signés
/portal/profile                      # Édition profil

# Auth (déjà existant, étendre logique)
/auth/callback                       # Magic link callback (étendre pour
                                       redirect intelligent vers /portal
                                       si role=BENEFICIARY)
```

### 1.3 Layout dédié

`apps/web/src/app/portal/layout.tsx` :

- Header :
  - Logo "Capiwise" cliquable (vers /portal/awards)
  - Nav 3 liens : Awards / Documents / Profil
  - Compteur notifs IN_APP (badge si non lues)
  - Avatar avec initial + dropdown : "Mon profil" / "Déconnexion"
- Body : container max-w-5xl mx-auto, padding mobile
- Footer minimal : "Capiwise · Aide : support@capiwise.com"

Pas de sidebar (différent de /dashboard). Mobile-first, breakpoint md à 768px.

### 1.4 Permissions et RLS

Les permissions BENEFICIARY existent déjà depuis Module 2/4 :

- `awards.read.own` (Module 2)
- `awards.exercise` (Module 2, sera utilisé Module 9)
- `documents.read.own` (Module 6)
- `notifications.read.own` (Module 7)
- `beneficiaries.update` ❌ (admin seulement) — il faut ajouter `beneficiaries.update.own`

À seeder dans `permissions_catalog` :

| Permission                 | Description                                              | Rôle BENEFICIARY |
| -------------------------- | -------------------------------------------------------- | ---------------- |
| `beneficiaries.update.own` | Modifier ses propres infos personnelles (champs limités) | ✅               |
| `vesting_events.read.own`  | Voir ses vesting events                                  | ✅               |
| `portal.simulate_leaver`   | Utiliser le simulateur leavers                           | ✅               |

RLS policies :

- `awards.read.own` déjà géré par policy `awards_select_beneficiary` (Module 1)
- `vesting_events` : à ajouter policy similaire
- `beneficiaries.update.own` : déjà géré par trigger `enforce_beneficiary_self_update` (Module 4)

### 1.5 Décisions UX clés

**1. Onboarding minimal mais éducatif.**
Le bénéficiaire arrive perdu. La welcome page explique en 3 paragraphes :

- Ce qu'est un BSPCE/AGA/SO
- Pourquoi il en a reçu
- Comment lire la suite

**2. Pas de jargon.**
Au lieu de "vested units", on dit "unités acquises". "Strike price" → "Prix d'exercice". "FMV" → "Valeur de marché estimée".

**3. Chiffres réels, pas valorisations spéculatives.**
Au lieu d'afficher "Votre award vaut 150K€", on affiche "Vous avez acquis 850 unités sur 1500. Prix d'exercice : 5€. Valeur de marché de la dernière levée : 50€."
Ne JAMAIS faire un calcul du genre `units * (FMV - strike) = profit potentiel` car ça crée des attentes injustifiées qui peuvent générer du contentieux.

**4. Simulateur leavers = différenciation.**
Permettre au bénéficiaire de voir l'impact concret d'un départ aujourd'hui ou plus tard. C'est ce qu'aucun concurrent ne fait bien.

**5. Mobile-first.**
Beaucoup de salariés consulteront sur mobile en pause café. Tester chaque page sur viewport mobile.

---

## 2. SCHÉMA DB — FINALISATION

### 2.1 État actuel

Tables `awards`, `vesting_events`, `beneficiaries`, `document_instances` existent déjà (Modules 1-6). **Recon obligatoire** avant toute modification.

### 2.2 Recon attendue

```sql
-- État schema
\d awards
\d vesting_events
\d beneficiaries
\d user_profiles

-- RLS sur awards (vérifier policy beneficiary)
SELECT policyname, cmd, qual
  FROM pg_policies
 WHERE tablename = 'awards'
   AND policyname LIKE '%beneficiary%';

-- RLS sur vesting_events
SELECT * FROM pg_policies WHERE tablename = 'vesting_events';

-- RLS sur documents (déjà fait Module 6 mais re-check beneficiary access)
SELECT policyname, cmd, qual
  FROM pg_policies
 WHERE tablename = 'document_instances'
   AND policyname LIKE '%beneficiary%';

-- Permissions BENEFICIARY actuelles
SELECT rp.permission_code
  FROM role_permissions rp
 WHERE rp.role = 'BENEFICIARY';

-- Triggers beneficiaries.update
SELECT pg_get_functiondef('enforce_beneficiary_self_update'::regproc);

-- Bénéficiaires sans user_id (legacy import) — à inviter
SELECT COUNT(*),
       SUM(CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END) as with_user
  FROM beneficiaries
 WHERE deleted_at IS NULL;

-- Vesting events existants
SELECT status, COUNT(*)
  FROM vesting_events
 GROUP BY status;
```

### 2.3 Migration 00051 — Permissions portal

```sql
INSERT INTO permissions_catalog (code, description) VALUES
  ('beneficiaries.update.own', 'Modifier ses propres infos personnelles'),
  ('vesting_events.read.own', 'Voir ses propres vesting events'),
  ('portal.simulate_leaver', 'Utiliser le simulateur leavers')
ON CONFLICT (code) DO NOTHING;

-- Mapping
INSERT INTO role_permissions (role, permission_code) VALUES
  ('BENEFICIARY', 'beneficiaries.update.own'),
  ('BENEFICIARY', 'vesting_events.read.own'),
  ('BENEFICIARY', 'portal.simulate_leaver')
ON CONFLICT DO NOTHING;
```

### 2.4 Migration 00052 — RLS vesting_events

```sql
-- Si pas déjà fait Module 3b, ajouter policy beneficiary self
ALTER TABLE vesting_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vesting_events_select_admin ON vesting_events;
DROP POLICY IF EXISTS vesting_events_select_beneficiary ON vesting_events;

CREATE POLICY vesting_events_select_admin ON vesting_events FOR SELECT
  USING (
    org_id = current_org_id()
    AND user_has_permission('awards.read.all')
  );

CREATE POLICY vesting_events_select_beneficiary ON vesting_events FOR SELECT
  USING (
    award_id IN (
      SELECT a.id FROM awards a
        JOIN beneficiaries b ON b.id = a.beneficiary_id
       WHERE b.user_id = auth.uid()
         AND a.deleted_at IS NULL
    )
  );
```

### 2.5 RPC `get_beneficiary_portal_dashboard`

`apps/web/supabase/migrations/00053_module_8_portal_rpcs.sql` :

```sql
-- Charge le dashboard initial du bénéficiaire (awards + résumé)
CREATE OR REPLACE FUNCTION get_beneficiary_portal_dashboard()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_beneficiary_id UUID;
  v_org_id UUID;
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Find the beneficiary record for this user
  SELECT id, org_id INTO v_beneficiary_id, v_org_id
    FROM beneficiaries
   WHERE user_id = v_user_id
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_beneficiary_id IS NULL THEN
    RAISE EXCEPTION 'No beneficiary record found for this user';
  END IF;

  -- Build response
  SELECT jsonb_build_object(
    'beneficiary', (
      SELECT jsonb_build_object(
        'id', b.id,
        'full_name', b.full_name,
        'email', b.email,
        'phone', b.phone,
        'tax_residence', b.tax_residence,
        'has_complete_profile', (
          b.full_name IS NOT NULL
          AND b.tax_residence IS NOT NULL
          AND (b.address_line_1 IS NOT NULL OR b.country IS NOT NULL)
        )
      )
      FROM beneficiaries b WHERE b.id = v_beneficiary_id
    ),
    'org', (
      SELECT jsonb_build_object(
        'id', o.id,
        'name', o.name,
        'legal_name', o.legal_name
      )
      FROM organizations o WHERE o.id = v_org_id
    ),
    'awards_count', (
      SELECT COUNT(*) FROM awards
       WHERE beneficiary_id = v_beneficiary_id
         AND status = 'GRANTED'
         AND deleted_at IS NULL
    ),
    'awards_summary', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'award_number', a.award_number,
        'plan_name', p.name,
        'plan_type', p.plan_type,
        'units_granted', a.units_granted,
        'units_vested', COALESCE((
          SELECT SUM(units_vested) FROM vesting_events
           WHERE award_id = a.id AND status = 'VESTED'
        ), 0),
        'grant_date', a.grant_date,
        'status', a.status
      ))
      FROM awards a
        JOIN plans p ON p.id = a.plan_id
       WHERE a.beneficiary_id = v_beneficiary_id
         AND a.status = 'GRANTED'
         AND a.deleted_at IS NULL
       ORDER BY a.grant_date DESC
    )
  ) INTO v_result;

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION get_beneficiary_portal_dashboard() TO authenticated;
```

### 2.6 RPC `get_award_portal_detail`

```sql
CREATE OR REPLACE FUNCTION get_award_portal_detail(p_award_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_beneficiary_id UUID;
  v_award RECORD;
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_beneficiary_id
    FROM beneficiaries
   WHERE user_id = v_user_id AND deleted_at IS NULL;

  IF v_beneficiary_id IS NULL THEN
    RAISE EXCEPTION 'No beneficiary record found';
  END IF;

  -- Charge l'award et vérifie ownership
  SELECT * INTO v_award
    FROM awards
   WHERE id = p_award_id
     AND beneficiary_id = v_beneficiary_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award not found or access denied';
  END IF;

  -- Build full detail
  SELECT jsonb_build_object(
    'award', to_jsonb(v_award),
    'plan', (
      SELECT jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'plan_type', p.plan_type,
        'description', p.description
      )
      FROM plans p WHERE p.id = v_award.plan_id
    ),
    'vesting_events', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', ve.id,
          'scheduled_date', ve.scheduled_date,
          'effective_date', ve.effective_date,
          'units_to_vest', ve.units_to_vest,
          'units_vested', ve.units_vested,
          'performance_multiplier', ve.performance_multiplier,
          'status', ve.status
        ) ORDER BY ve.scheduled_date
      )
      FROM vesting_events ve WHERE ve.award_id = v_award.id
    ),
    'leaver_rules', v_award.leaver_rules_snapshot,
    'performance_conditions', v_award.performance_conditions_snapshot,
    'documents', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', di.id,
          'document_number', di.document_number,
          'category', di.category,
          'status', di.status,
          'signed_at', di.signed_at,
          'has_signed_pdf', (di.signed_pdf_storage_path IS NOT NULL)
        )
      )
      FROM document_instances di
       WHERE di.related_entity_type = 'AWARD'
         AND di.related_entity_id = v_award.id
         AND di.status = 'SIGNED'
    )
  ) INTO v_result;

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION get_award_portal_detail(UUID) TO authenticated;
```

### 2.7 RPC `simulate_leaver_scenario`

C'est le cœur du simulateur. Donné une date hypothétique de départ + un type de leaver, calculer combien d'unités seront acquises/perdues.

```sql
CREATE OR REPLACE FUNCTION simulate_leaver_scenario(
  p_award_id UUID,
  p_leaver_type TEXT,        -- ex: 'GOOD_LEAVER', 'BAD_LEAVER', 'NEUTRAL'
  p_termination_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_beneficiary_id UUID;
  v_award RECORD;
  v_leaver_rule JSONB;
  v_units_already_vested BIGINT := 0;
  v_units_accelerated BIGINT := 0;
  v_units_forfeited BIGINT := 0;
  v_exercise_window_days INTEGER := 0;
  v_exercise_deadline DATE;
  v_treatment TEXT;
  v_acceleration_months INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Auth check
  SELECT id INTO v_beneficiary_id
    FROM beneficiaries
   WHERE user_id = v_user_id AND deleted_at IS NULL;

  IF v_beneficiary_id IS NULL THEN
    RAISE EXCEPTION 'No beneficiary record';
  END IF;

  -- Load award
  SELECT * INTO v_award
    FROM awards
   WHERE id = p_award_id
     AND beneficiary_id = v_beneficiary_id
     AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Award not found';
  END IF;

  -- Find matching leaver rule from snapshot
  SELECT rule INTO v_leaver_rule
    FROM jsonb_array_elements(v_award.leaver_rules_snapshot) rule
   WHERE rule->>'leaver_type' = p_leaver_type
   LIMIT 1;

  IF v_leaver_rule IS NULL THEN
    -- Default : tout perdu si pas de règle
    v_treatment := 'FORFEIT_ALL';
  ELSE
    v_treatment := v_leaver_rule->>'treatment';
    v_acceleration_months := COALESCE((v_leaver_rule->>'acceleration_months')::INTEGER, 0);
    v_exercise_window_days := COALESCE((v_leaver_rule->>'exercise_window_days')::INTEGER, 0);
  END IF;

  -- Compute already vested by termination date
  SELECT COALESCE(SUM(units_vested), 0) INTO v_units_already_vested
    FROM vesting_events
   WHERE award_id = p_award_id
     AND status = 'VESTED'
     AND scheduled_date <= p_termination_date;

  -- Apply treatment logic
  IF v_treatment = 'FORFEIT_ALL' THEN
    -- Tout perdu, même les déjà vested
    v_units_forfeited := v_award.units_granted;
    v_units_already_vested := 0;
  ELSIF v_treatment = 'KEEP_VESTED' THEN
    -- Garde le vested, perd le rest
    v_units_forfeited := v_award.units_granted - v_units_already_vested;
  ELSIF v_treatment = 'ACCELERATE' THEN
    -- Accélère acceleration_months supplémentaires
    SELECT COALESCE(SUM(units_to_vest), 0) INTO v_units_accelerated
      FROM vesting_events
     WHERE award_id = p_award_id
       AND status = 'PENDING'
       AND scheduled_date > p_termination_date
       AND scheduled_date <= p_termination_date + (v_acceleration_months || ' months')::INTERVAL;
    v_units_forfeited := v_award.units_granted - v_units_already_vested - v_units_accelerated;
  ELSIF v_treatment = 'KEEP_ALL' THEN
    -- Garde tout (cas Good Leaver généreux)
    -- Mais le futur vesting reste sujet aux conditions de performance...
    -- V1 simplification : tout vested au moment du départ
    v_units_accelerated := v_award.units_granted - v_units_already_vested;
  END IF;

  -- Compute exercise deadline (pour options)
  IF v_award.plan_id IN (SELECT id FROM plans WHERE plan_type IN ('BSPCE','STOCK_OPTION','BSA')) THEN
    v_exercise_deadline := p_termination_date + (v_exercise_window_days || ' days')::INTERVAL;
  ELSE
    v_exercise_deadline := NULL;
  END IF;

  RETURN jsonb_build_object(
    'leaver_type', p_leaver_type,
    'termination_date', p_termination_date,
    'treatment', v_treatment,
    'units_already_vested', v_units_already_vested,
    'units_accelerated', v_units_accelerated,
    'units_forfeited', v_units_forfeited,
    'units_total_after_leave', v_units_already_vested + v_units_accelerated,
    'exercise_window_days', v_exercise_window_days,
    'exercise_deadline', v_exercise_deadline,
    'acceleration_months', v_acceleration_months
  );
END $$;

GRANT EXECUTE ON FUNCTION simulate_leaver_scenario(UUID, TEXT, DATE) TO authenticated;
```

> **Note V1** : la logique `simulate_leaver_scenario` est simplifiée par rapport à Module 3b qui a la state machine awards complète. V1 ne gère pas :
>
> - Les conditions de performance partielles (multiplier < 1 sur le pro-rata)
> - Les acquérirs spéciaux (M&A, change of control)
> - Le double-trigger acceleration
>
> Ces cas sont rares et seront ajoutés en V2. V1 couvre 80% des cas usuels (BSPCE/AGA standard).

---

## 3. ONBOARDING — 2 ÉTAPES

### 3.1 Logique de routage

`apps/web/src/middleware.ts` (étendre Module 2) :

```typescript
// Si user authenticated :
// - SI rôle BENEFICIARY uniquement (pas OWNER/ADMIN_HR)
//   - SI user_profile incomplet OU beneficiary record incomplet
//     - SI déjà sur /portal/welcome ou /portal/profile/setup : OK
//     - SINON : redirect /portal/welcome
//   - SINON : OK
// - SINON : flow admin existant
```

À implémenter dans `middleware.ts` ou via Server Component check dans `/portal/layout.tsx`.

### 3.2 Page `/portal/welcome` — Étape 1

`apps/web/src/app/portal/welcome/page.tsx` :

Server Component qui charge :

- `get_beneficiary_portal_dashboard()` RPC pour avoir org_name + awards_count
- Affiche un layout welcome :

```
┌──────────────────────────────────────────────────────────┐
│  Logo Capiwise                              Logout       │
├──────────────────────────────────────────────────────────┤
│                                                            │
│   👋 Bienvenue sur Capiwise                               │
│                                                            │
│   {{org_name}} vous a attribué {{awards_count}} plan(s)   │
│   d'actionnariat salarié.                                  │
│                                                            │
│   Avant de découvrir vos attributions, nous avons besoin  │
│   de quelques informations personnelles pour finaliser    │
│   votre profil.                                            │
│                                                            │
│   ────                                                     │
│                                                            │
│   📚 Qu'est-ce qu'un plan d'actionnariat salarié ?        │
│                                                            │
│   Un plan vous permet d'acquérir progressivement (vesting)│
│   des actions de votre société, soit gratuitement (AGA),  │
│   soit en exerçant un droit d'achat à un prix préférentiel│
│   (BSPCE, Stock Options).                                  │
│                                                            │
│   En pratique :                                           │
│   • Vous recevez un nombre d'unités initialement          │
│   • Elles deviennent acquises au fil du temps (vesting)   │
│   • Si applicable, vous pouvez les exercer pour devenir   │
│     actionnaire de la société                             │
│                                                            │
│   ────                                                     │
│                                                            │
│   [ Continuer → ]                                          │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

Bouton "Continuer" → router.push('/portal/profile/setup')

### 3.3 Page `/portal/profile/setup` — Étape 2

`apps/web/src/app/portal/profile/setup/page.tsx` :

Form (RHF + Zod) :

- Prénom (text required)
- Nom (text required)
- Téléphone (text optional, pattern)
- Adresse ligne 1 (text required)
- Code postal (text required)
- Ville (text required)
- Pays (combobox required, default FR)
- Résidence fiscale (combobox required, default FR)

Submit appelle Server Action `completeBeneficiaryProfile()` :

- Update `user_profiles` avec full_name + phone
- Update `beneficiaries` avec address_line_1, postal_code, city, country, tax_residence
- Audit event 'beneficiary.profile_completed'
- Redirect /portal/awards

Si déjà rempli : skip onboarding et redirect direct /portal/awards.

---

## 4. PAGES PORTAL — DÉTAIL

### 4.1 Layout `/portal/*`

`apps/web/src/app/portal/layout.tsx` :

```tsx
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // Auth + check beneficiary
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Get beneficiary record
  const { data: beneficiary } = await supabase
    .from('beneficiaries')
    .select('id, full_name, has_complete_profile') // virtual computed
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single();

  if (!beneficiary) {
    // User has no beneficiary record → not authorized for portal
    redirect('/dashboard'); // ou page d'erreur
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <PortalHeader userName={beneficiary.full_name} userEmail={user.email} />
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{children}</main>
      <PortalFooter />
    </div>
  );
}
```

### 4.2 Page `/portal/awards`

Server Component charge `get_beneficiary_portal_dashboard()` RPC.

UI :

```
┌──────────────────────────────────────────────────────────┐
│  Mes attributions                                          │
│  Bonjour {{full_name}}, voici les plans qui vous ont été   │
│  attribués par {{org_name}}.                              │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ AWD-2026-0007 · BSPCE · Plan BSPCE 2026             │  │
│  │                                                        │  │
│  │ 1 200 unités attribuées · 600 acquises (50%)         │  │
│  │ Prix d'exercice : 5,00 €                             │  │
│  │ Date d'attribution : 30 avril 2026                    │  │
│  │                                                        │  │
│  │                         [ Voir le détail → ]          │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ AWD-2026-0010 · AGA · Plan AGA 2026                 │  │
│  │ ...                                                    │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

Empty state : "Aucune attribution active. Si vous attendez une attribution, contactez votre RH."

### 4.3 Page `/portal/awards/[id]`

Layout 4 sections (tabs ou stacked sur mobile) :

**Section 1 — Synthèse**

- 4 cards stats : Acquises / Total / Prix d'exercice / Date attribution
- Status badge

**Section 2 — Calendrier de vesting (Recharts)**

- Line chart : axe X = dates, axe Y = cumul unités acquises
- 2 lignes : Vesting prévu (passé + futur), Vesting réalisé
- Marker vertical "Aujourd'hui"
- En dessous : table des tranches passées + futures

**Section 3 — Simulateur de départ**

- Form simple :
  - Date de départ hypothétique (date input, default = today)
  - Type de départ (combobox : Good Leaver / Bad Leaver / Neutre)
- Bouton "Simuler"
- Affichage résultat :
  - Unités déjà acquises au moment du départ
  - Unités accélérées (si Good Leaver)
  - Unités perdues
  - Date limite d'exercice (si options)
- Disclaimer : "Cette simulation est indicative. Les conditions réelles dépendent du contrat et de l'avis de la société."

**Section 4 — Documents**

- Liste des documents signés liés à cet award (lettre d'attribution, etc.)
- Bouton "Télécharger" pour chaque

**Section 5 (V2)** — Conditions de performance
Pour les awards avec performance, afficher :

- Liste des conditions
- Statut atteint/non atteint
- V1 : juste afficher la liste read-only sans status (Module 11 fera le tracking)

### 4.4 Page `/portal/documents`

Liste tous les `document_instances` SIGNED du bénéficiaire :

- Tableau : Date, Type (lettre attribution, certificat preuve, etc.), Award lié, Bouton télécharger
- Pagination simple
- Filtre par award

### 4.5 Page `/portal/profile`

Form édition champs autorisés :

- Phone
- Adresse complète
- Tax residence

Read-only :

- Email (changement via support)
- Type de bénéficiaire (employee/consultant)
- Date d'embauche

Submit appelle Server Action `updateBeneficiaryProfile()` :

- Validate Zod
- UPDATE beneficiaries (RLS + trigger restreint déjà aux champs autorisés)
- Audit event

---

## 5. COMPOSANTS NEUFS

```
apps/web/src/app/portal/
├── layout.tsx
├── welcome/page.tsx
├── profile/
│   ├── setup/page.tsx
│   └── page.tsx
├── awards/
│   ├── page.tsx
│   └── [id]/page.tsx
├── documents/page.tsx
└── components/
    ├── PortalHeader.tsx
    ├── PortalFooter.tsx
    ├── PortalNav.tsx
    ├── AwardSummaryCard.tsx
    ├── VestingChart.tsx              ← Recharts
    ├── VestingTranchesTable.tsx
    ├── LeaverSimulator.tsx           ← cœur du module
    ├── PortalProfileForm.tsx
    └── DocumentsList.tsx
```

### 5.1 `VestingChart`

Recharts LineChart :

- Données : array `{ date: string, cumulative_units: number, status: 'past'|'future' }`
- 2 séries : "Vesting prévu" (line stroke complète) + "Vesting réalisé" (line stroke + dot)
- ReferenceLine vertical sur today
- Tooltip avec détails (units_to_vest, units_vested, status, multiplier si performance)
- Responsive : mobile = full-width

### 5.2 `LeaverSimulator`

Client Component avec form :

- 2 inputs : date + leaver_type
- Button "Simuler"
- État : `useState` du résultat
- Submit → Server Action `simulateLeaverScenario(awardId, type, date)` qui appelle le RPC
- Affichage résultat : 4 stats (already_vested, accelerated, forfeited, total_after) + exercise_deadline si applicable

Garde-fou UX : si l'utilisateur tape une date passée, ajouter un disclaimer "Cette date est dans le passé. La simulation est purement hypothétique."

---

## 6. SERVER ACTIONS

`apps/web/src/server/actions/portal.ts` :

```typescript
'use server';

// Onboarding
export async function completeBeneficiaryProfile(input: {
  firstName: string;
  lastName: string;
  phone?: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  country: string;
  taxResidence: string;
}): Promise<Result>;

// Profile edit
export async function updateBeneficiaryProfile(input: {
  phone?: string;
  addressLine1?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  taxResidence?: string;
}): Promise<Result>;

// Simulator
export async function simulateLeaverScenario(input: {
  awardId: string;
  leaverType: 'GOOD_LEAVER' | 'BAD_LEAVER' | 'NEUTRAL' | 'TERMINATED_FOR_CAUSE';
  terminationDate: string;
}): Promise<Result<LeaverScenarioResult>>;
```

Server queries :

`apps/web/src/server/queries/portal.ts` :

```typescript
export async function getPortalDashboard(): Promise<PortalDashboardData>;
export async function getAwardPortalDetail(awardId: string): Promise<AwardPortalDetail>;
export async function getBeneficiaryDocuments(): Promise<DocumentSummary[]>;
```

Toutes ces queries appellent les RPCs SECURITY DEFINER qui font le check ownership en DB.

---

## 7. COMPLIANCE V1

2 règles dans `apps/web/src/lib/compliance/rules/portalRules.ts` :

```typescript
export const PORTAL_COMPLIANCE_RULES = [
  {
    code: 'PROFILE_COMPLETE_BEFORE_EXERCISE',
    description: 'Bénéficiaire doit compléter son profil avant exercise (Module 9)',
    appliesTo: ['EXERCISE_REQUEST'],
    enforcement: 'hard',
    check: async (data, ctx) => {
      const benef = ctx.beneficiary;
      if (!benef.full_name || !benef.tax_residence || !benef.address_line_1 || !benef.country) {
        return {
          severity: 'ERROR',
          code: 'PROFILE_COMPLETE_BEFORE_EXERCISE',
          message:
            'Profil incomplet. Complétez votre adresse et résidence fiscale dans /portal/profile.',
        };
      }
      return null;
    },
  },
  {
    code: 'AWARD_STATUS_GRANTED',
    description: 'Award doit être en statut GRANTED pour être visible dans portal',
    appliesTo: ['PORTAL_VIEW'],
    enforcement: 'soft', // info-level
    check: async (data, ctx) => {
      if (ctx.award?.status !== 'GRANTED') {
        return {
          severity: 'INFO',
          code: 'AWARD_STATUS_GRANTED',
          message: `Award en cours de processus (statut : ${ctx.award?.status}).`,
        };
      }
      return null;
    },
  },
];
```

PROFILE_COMPLETE sera utilisé en Module 9 (Exercise) pour bloquer une demande d'exercice si le profil est incomplet.

---

## 8. AUDIT EVENTS

| Event                           | Quand                                               | Metadata                                |
| ------------------------------- | --------------------------------------------------- | --------------------------------------- |
| `beneficiary.first_login`       | Première fois user_profile.last_sign_in_at non null | —                                       |
| `beneficiary.profile_completed` | completeBeneficiaryProfile success                  | fields filled                           |
| `beneficiary.profile_updated`   | updateBeneficiaryProfile success                    | fields changed                          |
| `portal.award_viewed`           | `/portal/awards/[id]` visited                       | award_id                                |
| `portal.leaver_simulated`       | simulateLeaverScenario                              | award_id, leaver_type, termination_date |
| `portal.document_downloaded`    | Click "Télécharger" sur document                    | document_id                             |

---

## 9. PLAN DE LIVRAISON — 5 SOUS-MODULES

### B1 — DB & RPCs (1 jour)

- Recon Module 1-7 + 4 RPCs
- 3 migrations : permissions (00051), RLS vesting (00052), RPCs portal (00053)
- 8 tests SQL purs (auth, ownership, simulator scenarios)
- **Livrable** : DB ready pour portal queries

### B2 — Onboarding 2 étapes (1 jour)

- Layout `/portal/*` avec header + nav
- Page `/portal/welcome` (intro + intro plans)
- Page `/portal/profile/setup` (form complétion)
- Server Action completeBeneficiaryProfile
- Logique de routage middleware (welcome si profil incomplet)
- **Livrable** : onboarding complet, accessible via magic link

### B3 — Liste awards + détail synthèse + vesting chart (1.5 jour)

- Page `/portal/awards` (cards summary)
- Page `/portal/awards/[id]` sections 1+2 (synthèse + vesting chart)
- Composants AwardSummaryCard + VestingChart + VestingTranchesTable
- Server queries getPortalDashboard + getAwardPortalDetail
- Tests Vitest (au moins sur les helpers de calcul cumul vesting)
- **Livrable** : bénéficiaire voit ses awards et vesting passé/futur

### B4 — Simulateur leavers (1 jour)

- Composant LeaverSimulator
- Server Action simulateLeaverScenario
- RPC simulate_leaver_scenario (B1 a fait la base, B4 finalise edge cases)
- Affichage résultat avec disclaimer
- Tests SQL : 5 scénarios leavers (good, bad, neutral, accelerate, forfeit)
- **Livrable** : simulateur fonctionnel pour tous les types d'awards

### B5 — Documents + profil + closure + merge (0.5 jour)

- Page `/portal/documents` (liste signed)
- Page `/portal/profile` (édition)
- Server Action updateBeneficiaryProfile
- Tests E2E manuels complets (login bénéficiaire → onboarding → vue award → simulator → profil)
- Closure + merge PR #11

**Total : 4-5 jours**

---

## 10. INSTRUCTIONS POUR CLAUDE CODE

### Phase 1 — Bootstrap

1. Lire `memory/module_7_complete.md` pour le contexte des notifications
2. Branche `feat/module-8-portal` from master à jour
3. Pre-checks :
   - Tests workspace 320/320 verts
   - Drift cloud 50/49 documenté (volontaire)
   - Au moins 1 award GRANTED en DB (utiliser AWD-2026-0007 du E2E Module 6)
   - Au moins 1 bénéficiaire avec user_id non null (sasportasdavid+attri ou similaire)

### Phase 2 — Recon (B1)

- État RLS awards et vesting_events
- Permissions BENEFICIARY actuelles
- Bénéficiaires sans user_id (legacy → à inviter en V2)
- vesting_events generated par Module 3b ?
  - Si non, vérifier que le RPC simulate fonctionne sur des awards sans vesting_events
    (calcul depuis vesting_schedule snapshot directement)

### Phase 3 — DB & RPCs B1

- Suivre §2.3 à §2.7
- Tester chaque RPC avec un user APPROVER (qui a aussi un beneficiary record si tu en as)
  ou créer un nouveau user de test
- Test critique : RPCs doivent rejeter quand user n'a pas de beneficiary record

### Phase 4 — Onboarding B2

- Middleware ou Server Component check pour redirect /portal/welcome
- Form RHF + Zod (pattern Module 4 BeneficiaryFormModal)
- Validation : tax_residence dans liste pays valides

### Phase 5 — Awards + Vesting B3

- Recharts déjà installé Module 3a — réutiliser
- Computation côté SQL (cumul SUM) ou côté TS (côté Server Component)
- Vesting chart : 2 séries (planned vs realized)
- Important : la x-axis doit gérer correctement les dates passées + futures

### Phase 6 — Simulator B4

- Le RPC simulate_leaver_scenario fait l'essentiel
- Côté UI : juste form + display résultat
- Disclaimer obligatoire : "simulation indicative"
- Tester plusieurs scénarios (today, future, far future avec acceleration)

### Phase 7 — Closure B5

- Page documents : reuse pattern Module 6 B4 (DocumentPreviewDialog)
- Page profil : form simple
- E2E manuels : login bénéficiaire (via magic link admin), parcours complet
- Memory + merge

### Conventions strictes

- 'use server' = uniquement async
- Pattern Result {ok:true,...} | {ok:false, error}
- Validation Zod sur chaque input
- RLS strict : un bénéficiaire ne voit QUE ses awards (testé en SQL)
- Mobile-first : tester chaque page en viewport mobile (375px width)
- Pas de jargon dans le copy : "unités acquises" pas "vested units"

### Points de vigilance

- **Sécurité du simulator** : ne JAMAIS retourner les `leaver_rules_snapshot` complets dans le portal — filtrer côté RPC pour ne retourner que ce qui correspond au scénario demandé (sinon le bénéficiaire peut comparer les types et identifier des incohérences contractuelles).
- **Pas de calcul valuation** : V1 ne calcule PAS la valeur des awards (units \* (FMV - strike)). Risque légal. Module 11 fera ça pour les ADMIN, pas pour les bénéficiaires.
- **vesting_events peut être vide** : si Module 3b n'a pas généré les events à la création de l'award, le RPC doit fallback sur le `vesting_schedule_snapshot` directement.
- **Multi-org future** : V1 = bénéficiaire d'une seule org. Si user a 2 beneficiary records (rare), prendre le premier ou error explicite.
- **Profil non strictement requis pour portal** : V1 permet de visualiser sans avoir complété le profil (mais on push fortement à le compléter). L'exercise (Module 9) le rendra obligatoire.
- **Auth flow** : la redirection depuis l'email magic_link doit déjà passer par /auth/callback existant. Vérifier que le redirect après auth fonctionne pour les BENEFICIARY (pas juste les admins).
- **Notifications IN_APP compteur** : Module 7 a inséré des notifs. Le compteur header lit `notifications` WHERE user_id = auth.uid() AND read_at IS NULL AND channel = 'IN_APP'. Pas d'inbox UI, juste le badge.

---

**FIN DU MODULE 8 — BENEFICIARY PORTAL**

_Quand le Module 8 est mergé sur master, reviens vers Claude (chat) pour "go module 9" (Exercise Workflow)._
