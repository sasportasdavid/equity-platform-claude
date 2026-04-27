# MODULE 2 — IDENTITY & ROLES

> **Projet :** Equity Platform
> **Version :** 1.0
> **Date :** Avril 2026
> **Prérequis :** Module 1 — Foundation & Architecture Globale
> **Audience :** Claude Code (développement)

---

## 0. CONTEXTE & OBJECTIFS

### 0.1 Mission du module

Implémenter **toute la couche identité, authentification, et gestion des rôles** de la plateforme. Ce module est le socle sur lequel reposent tous les autres : sans identité claire et permissions correctes, aucune fonction métier ne peut être exposée.

### 0.2 Périmètre exact

**Inclus dans ce module** :

- Authentification utilisateurs (login, logout, magic links, auto-création de compte)
- Gestion des organisations (création, switch, settings)
- Gestion des memberships (rôles par org, multi-rôles, multi-orgs)
- Système d'invitations (admin → user, admin → bénéficiaire)
- RBAC granulaire (permissions, helpers, hooks)
- Chiffrement des données sensibles via Supabase Vault
- Profils utilisateurs (édition, préférences)
- Switch d'organisation pour users multi-org
- Page de gestion des membres (admin)
- Audit des actions identité

**Exclus (modules ultérieurs)** :

- Création de bénéficiaires en tant qu'entité métier (Module 4 — Beneficiaries Management)
- Gestion fine des permissions custom par membership (V2)
- SSO Google/Microsoft (V2)
- 2FA (V2)
- Password classique (V2 si demandé)

### 0.3 Dépendances

- Tables créées en Module 1 :
  - `organizations`, `user_profiles`, `memberships`, `invitations`
  - `permissions_catalog`, `role_permissions`
  - `audit_events`, `notifications`
- Resend configuré (clé API, domaine vérifié)
- Supabase Auth configuré

---

## 1. AUTHENTIFICATION

### 1.1 Méthode unique : Magic Link

**Pas de mot de passe en V1.** Tous les logins se font via magic link envoyé par email.

Avantages :

- Pas de gestion de réinitialisation de mot de passe
- Pas de risque de mots de passe faibles
- UX simple sur mobile
- Cohérent avec l'invitation auto-création

Inconvénients acceptés :

- Dépendance à l'email (si la boîte est compromise, le compte l'est aussi)
- Légère friction sur reconnexion (mais cookies persistants atténuent)

### 1.2 Configuration Supabase Auth

À configurer dans le dashboard Supabase :

```yaml
Site URL: https://app.equityplatform.fr (prod) / http://localhost:3000 (dev)
Redirect URLs:
  - https://app.equityplatform.fr/auth/callback
  - https://app.equityplatform.fr/accept-invite
  - http://localhost:3000/auth/callback
  - http://localhost:3000/accept-invite

Email Auth:
  - Enable email signups: false (création uniquement via invitation)
  - Enable magic links: true
  - Magic link expiry: 900 secondes (15 minutes)
  - Confirm email: false (magic link = confirmation implicite)

Email Templates: désactivés (on utilise Resend custom)
```

**Désactiver les emails par défaut de Supabase** : tous les emails passent par Resend pour cohérence de marque et tracking.

Pour ça, on intercepte l'envoi en utilisant `signInWithOtp` avec `shouldCreateUser: false` (sauf flow d'invitation où on gère manuellement la création).

### 1.3 Flow Login (utilisateur existant)

```
┌──────────────┐         ┌─────────────┐         ┌──────────┐         ┌────────┐
│   Browser    │         │  Next.js    │         │ Supabase │         │ Resend │
└──────┬───────┘         └──────┬──────┘         └─────┬────┘         └────┬───┘
       │                        │                       │                   │
       │ POST /auth/login       │                       │                   │
       │ { email }              │                       │                   │
       │───────────────────────►│                       │                   │
       │                        │ Check user exists     │                   │
       │                        │ in user_profiles      │                   │
       │                        │──────────────────────►│                   │
       │                        │◄──────────────────────│                   │
       │                        │                       │                   │
       │                        │ generateLink(email)   │                   │
       │                        │──────────────────────►│                   │
       │                        │◄── action_link ───────│                   │
       │                        │                       │                   │
       │                        │ sendEmail(action_link, template='login') │
       │                        │──────────────────────────────────────────►│
       │                        │                       │                   │
       │◄─── 200 OK ────────────│                       │                   │
       │     "Email envoyé"     │                       │                   │
       │                        │                       │                   │
       │ Click link in email    │                       │                   │
       │ ──────────────────────────────────────────────►│                   │
       │                        │                       │                   │
       │ Redirect avec token    │                       │                   │
       │ /auth/callback?...     │                       │                   │
       │◄───────────────────────────────────────────────│                   │
       │                        │                       │                   │
       │ GET /auth/callback     │                       │                   │
       │───────────────────────►│                       │                   │
       │                        │ exchangeCodeForSession│                   │
       │                        │──────────────────────►│                   │
       │                        │◄── session + JWT ─────│                   │
       │                        │                       │                   │
       │                        │ Set active_org_id     │                   │
       │                        │ in JWT custom claims  │                   │
       │                        │                       │                   │
       │◄── Redirect /dashboard │                       │                   │
       │    Set-Cookie: session │                       │                   │
       │                        │                       │                   │
```

### 1.4 Flow d'invitation initiale (auto-création)

```
1. Admin invite un user (page /settings/members)
   → Server Action createInvitation(email, roles[])
   → Insert dans `invitations` avec token UUID + expiry +7 jours
   → Insert dans `notifications` (queue)
   → Edge Function envoie email Resend avec lien /accept-invite?token=xxx

2. User reçoit email "Vous êtes invité à rejoindre <Org Name>"

3. User clique → /accept-invite?token=xxx
   → Server Component vérifie token (valide, non expiré, non consommé)
   → Affiche page "Bienvenue sur Equity Platform"
      - Si email pas encore dans auth.users :
        Champ "Confirmez votre email" + bouton "Activer mon compte"
      - Si email déjà dans auth.users :
        Bouton "Lier mon compte existant"

4. Au clic sur "Activer mon compte" :
   → Server Action acceptInvitation(token)
   → Crée auth.users (via service role) avec email confirmé
   → Crée user_profile
   → Crée membership(s) selon roles[] de l'invitation
   → Marque invitation comme ACCEPTED
   → Génère un magic link et le redirige
   → User arrive sur /dashboard authentifié

5. User est connecté, voit son nouveau dashboard
```

### 1.5 Flow d'invitation bénéficiaire (variante)

Spécificité : le bénéficiaire a déjà été créé en tant qu'entité métier (`beneficiaries`) **avant** d'être invité. L'invitation lie son compte auth au record beneficiary.

```
1. Admin a créé le bénéficiaire (Module 4) avec email
   → beneficiaries.user_id = NULL initialement

2. Quand une attribution est faite, ou explicitement par "Inviter au portail" :
   → Server Action sendBeneficiaryInvite(beneficiaryId)
   → Crée invitation avec roles=['BENEFICIARY'] et beneficiary_id=X
   → Email Resend avec template 'beneficiary_first_invite'

3. User clique sur le lien → /accept-invite?token=xxx
   → Même flow que 1.4 mais en plus :
   → Au accept, met à jour beneficiaries.user_id = newUser.id
   → Redirect vers /portal (pas /dashboard)

4. User arrive sur le portail bénéficiaire avec ses awards visibles
```

### 1.6 Logout

```typescript
// Server Action
'use server';
export async function logout() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  cookies().delete('active_org_id'); // si tu en as un
  redirect('/login');
}
```

Aucune complexité particulière. Le cookie de session Supabase est supprimé.

### 1.7 Middleware d'authentification

Fichier : `apps/web/src/middleware.ts`

Logique :

1. Récupérer la session depuis les cookies Supabase
2. Pour les routes publiques (`/login`, `/accept-invite`, `/auth/callback`, `/api/webhooks/*`) → laisser passer
3. Pour les autres routes → si pas de session, rediriger vers `/login?redirect=<currentPath>`
4. Si session existe mais pas d'`active_org_id` dans le JWT → rediriger vers `/select-org`
5. Vérifier que la route correspond aux droits (préfixe `/portal` → BENEFICIARY, `/dashboard` → ADMIN_HR/OWNER, `/audit` → AUDITOR)

```typescript
import { NextResponse, type NextRequest } from 'next/server';
import { createMiddlewareClient } from '@/lib/supabase/middleware';

const PUBLIC_PATHS = ['/login', '/accept-invite', '/auth/callback', '/api/webhooks'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Static & Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const { supabase, response } = createMiddlewareClient(req);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Pas de session → redirect login
  if (!session) {
    const url = new URL('/login', req.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // Pas d'org active → select-org
  const activeOrgId = session.user.app_metadata?.active_org_id;
  if (!activeOrgId && pathname !== '/select-org') {
    return NextResponse.redirect(new URL('/select-org', req.url));
  }

  // Validation route vs rôles (basique, on peut affiner)
  // /portal/* → BENEFICIARY
  // /dashboard/* → ADMIN_HR ou OWNER ou APPROVER
  // /audit/* → AUDITOR
  // (à implémenter selon les Server Components avec requirePermission())

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

---

## 2. MULTI-ORGANISATIONS

### 2.1 Modèle conceptuel

- Un `auth.users` est une **identité unique** (un email, un humain).
- Un `auth.users` peut avoir N `memberships`, chacun lié à une `organization`.
- Chaque `membership` a un array de `roles` (peut cumuler ADMIN_HR + BENEFICIARY par exemple).
- Le user a un **`active_org_id`** stocké dans le JWT custom claims.
- Toutes les requêtes RLS filtrent par `current_org_id()` qui lit le JWT.

### 2.2 Sélection de l'org active

#### Au login

```typescript
// Server Action après authentification
async function setActiveOrgAfterLogin(userId: string) {
  const supabase = createAdminSupabase();

  // Charger toutes les memberships actives du user
  const { data: memberships } = await supabase
    .from('memberships')
    .select('org_id, organizations(name)')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE');

  if (!memberships || memberships.length === 0) {
    // User sans org : cas d'erreur, redirect /no-access
    return { redirect: '/no-access' };
  }

  if (memberships.length === 1) {
    // Une seule org → activer auto
    await setActiveOrg(userId, memberships[0].org_id);
    return { redirect: '/dashboard' };
  }

  // Plusieurs orgs → page de sélection
  return { redirect: '/select-org' };
}
```

#### Page `/select-org`

UI simple :

- Liste des organisations du user (cards cliquables)
- Pour chaque org : nom, logo (V2), rôles, nombre de membres
- Au clic → Server Action `setActiveOrg(orgId)` → redirect `/dashboard`

#### Switch en cours d'utilisation

Dropdown dans le header de l'app (visible uniquement si `memberships.length > 1`) :

```typescript
// Server Action
'use server';
export async function setActiveOrg(orgId: string) {
  const supabase = await createServerSupabase();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) throw new Error('Not authenticated');

  // Vérifier que le user a bien un membership ACTIVE pour cette org
  const { data: membership } = await supabase
    .from('memberships')
    .select('id, roles')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .eq('status', 'ACTIVE')
    .single();

  if (!membership) {
    throw new Error('Membership not found or inactive');
  }

  // Mettre à jour le JWT custom claim
  const adminSupabase = createAdminSupabase();
  await adminSupabase.auth.admin.updateUserById(user.id, {
    app_metadata: {
      ...user.app_metadata,
      active_org_id: orgId,
      active_roles: membership.roles,
    },
  });

  // Forcer un refresh du token côté client
  await supabase.auth.refreshSession();

  // Audit
  await logAuditEvent({
    eventType: 'auth.org_switched',
    metadata: { from_org_id: user.app_metadata?.active_org_id, to_org_id: orgId },
  });

  revalidatePath('/');
  return { success: true };
}
```

### 2.3 JWT custom claims

À chaque login ou switch d'org, le JWT contient :

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "role": "authenticated",
  "app_metadata": {
    "active_org_id": "org-uuid",
    "active_roles": ["ADMIN_HR", "APPROVER"]
  }
}
```

Les helpers RLS (`current_org_id()`, `has_permission()`) lisent ces claims via `auth.jwt()`.

### 2.4 Création d'une organisation

Cas d'usage : un nouveau client signe au produit.

```
1. Page /signup (publique) → email
2. Magic link envoyé
3. Au callback :
   - Si l'email n'est dans aucune membership → page /onboarding/create-org
4. Page /onboarding/create-org : formulaire
   - Nom de l'org
   - Forme juridique (SAS, SA, ...)
   - SIREN (optionnel V1)
5. Au submit :
   - Crée organizations
   - Crée user_profile si pas existant
   - Crée membership avec roles=['OWNER']
   - Définit active_org_id du JWT
   - Redirect /dashboard
6. L'org est créée, le user est OWNER
```

> **Note V1** : on peut limiter cette création à des invitations manuelles (closed beta). Par défaut le code l'autorise mais une feature flag `allow_public_signup` peut le restreindre.

---

## 3. RBAC — RÔLES & PERMISSIONS

### 3.1 Catalogue des permissions

À insérer dans `permissions_catalog` (migration `00003_seed_referentials.sql`) :

```sql
INSERT INTO permissions_catalog (code, category, description, is_dangerous) VALUES
-- Organisation
('org.view', 'Organization', 'Voir les détails de l''organisation', false),
('org.update', 'Organization', 'Modifier les paramètres de l''organisation', false),
('org.manage_members', 'Organization', 'Gérer les membres et leurs rôles', true),
('org.manage_billing', 'Organization', 'Gérer la facturation', true),
('org.manage_compliance', 'Organization', 'Configurer les règles de conformité', true),
('org.delete', 'Organization', 'Supprimer l''organisation', true),

-- Companies
('companies.create', 'Companies', 'Créer une société', false),
('companies.read', 'Companies', 'Voir les sociétés', false),
('companies.update', 'Companies', 'Modifier les sociétés', false),
('companies.delete', 'Companies', 'Supprimer une société', true),

-- Plans
('plans.create', 'Plans', 'Créer un plan', false),
('plans.read', 'Plans', 'Voir les plans', false),
('plans.update', 'Plans', 'Modifier un plan', false),
('plans.delete', 'Plans', 'Supprimer un plan', true),
('plans.lock', 'Plans', 'Verrouiller un plan', true),

-- Beneficiaries
('beneficiaries.create', 'Beneficiaries', 'Créer un bénéficiaire', false),
('beneficiaries.read', 'Beneficiaries', 'Voir les bénéficiaires', false),
('beneficiaries.read.sensitive', 'Beneficiaries', 'Voir les données sensibles (NSS, etc.)', true),
('beneficiaries.update', 'Beneficiaries', 'Modifier les bénéficiaires', false),
('beneficiaries.delete', 'Beneficiaries', 'Archiver un bénéficiaire', true),
('beneficiaries.invite', 'Beneficiaries', 'Inviter au portail', false),

-- Awards
('awards.propose', 'Awards', 'Proposer une attribution', false),
('awards.approve', 'Awards', 'Approuver une attribution', true),
('awards.read.all', 'Awards', 'Voir toutes les attributions', false),
('awards.read.own', 'Awards', 'Voir ses propres attributions', false),
('awards.update', 'Awards', 'Modifier une attribution', false),
('awards.cancel', 'Awards', 'Annuler une attribution', true),
('awards.exercise', 'Awards', 'Exercer ses options', false),
('awards.modify', 'Awards', 'Créer une modification (repricing, etc.)', true),
('awards.bulk_import', 'Awards', 'Import massif d''attributions', true),

-- Approvals
('approvals.read', 'Approvals', 'Voir les demandes d''approbation', false),
('approvals.act', 'Approvals', 'Agir sur une demande (approuver/rejeter)', false),
('approvals.configure', 'Approvals', 'Configurer les workflows', true),

-- Documents
('documents.create_template', 'Documents', 'Créer un template de document', false),
('documents.update_template', 'Documents', 'Modifier un template', false),
('documents.read', 'Documents', 'Voir les documents', false),
('documents.read.own', 'Documents', 'Voir ses propres documents', false),
('documents.send_for_signature', 'Documents', 'Envoyer pour signature', false),
('documents.void', 'Documents', 'Annuler un document', true),
('documents.archive', 'Documents', 'Archiver un document', false),

-- Cap Table
('captable.read', 'CapTable', 'Voir la cap table', false),
('captable.export', 'CapTable', 'Exporter la cap table', false),
('captable.simulate', 'CapTable', 'Créer des scénarios de dilution', false),
('captable.edit', 'CapTable', 'Éditer manuellement la cap table', true),

-- Valuations
('valuations.run', 'Valuations', 'Lancer une valorisation', false),
('valuations.read', 'Valuations', 'Voir les valorisations', false),
('valuations.export', 'Valuations', 'Exporter les rapports', false),

-- Compliance
('compliance.read', 'Compliance', 'Voir les alertes de conformité', false),
('compliance.acknowledge', 'Compliance', 'Acquitter une alerte', false),
('compliance.override', 'Compliance', 'Forcer outrepasser un blocage soft', true),
('compliance.configure', 'Compliance', 'Configurer les règles', true),

-- Audit
('audit.read', 'Audit', 'Lire l''audit trail', false),
('audit.export', 'Audit', 'Exporter l''audit trail', false),

-- Reports
('reports.generate', 'Reports', 'Générer des rapports', false),
('reports.read', 'Reports', 'Voir les rapports', false),
('reports.dsn_export', 'Reports', 'Exporter pour DSN', true);
```

### 3.2 Mapping rôles → permissions

À insérer dans `role_permissions` :

```sql
-- OWNER : super admin, tout
INSERT INTO role_permissions (role, permission_code)
SELECT 'OWNER', code FROM permissions_catalog;

-- ADMIN_HR : gestion opérationnelle des plans/awards/bénéficiaires/docs
INSERT INTO role_permissions (role, permission_code) VALUES
('ADMIN_HR', 'org.view'),
('ADMIN_HR', 'companies.create'),
('ADMIN_HR', 'companies.read'),
('ADMIN_HR', 'companies.update'),
('ADMIN_HR', 'plans.create'),
('ADMIN_HR', 'plans.read'),
('ADMIN_HR', 'plans.update'),
('ADMIN_HR', 'beneficiaries.create'),
('ADMIN_HR', 'beneficiaries.read'),
('ADMIN_HR', 'beneficiaries.read.sensitive'),
('ADMIN_HR', 'beneficiaries.update'),
('ADMIN_HR', 'beneficiaries.invite'),
('ADMIN_HR', 'awards.propose'),
('ADMIN_HR', 'awards.read.all'),
('ADMIN_HR', 'awards.update'),
('ADMIN_HR', 'awards.bulk_import'),
('ADMIN_HR', 'approvals.read'),
('ADMIN_HR', 'documents.create_template'),
('ADMIN_HR', 'documents.update_template'),
('ADMIN_HR', 'documents.read'),
('ADMIN_HR', 'documents.send_for_signature'),
('ADMIN_HR', 'captable.read'),
('ADMIN_HR', 'captable.export'),
('ADMIN_HR', 'captable.simulate'),
('ADMIN_HR', 'valuations.run'),
('ADMIN_HR', 'valuations.read'),
('ADMIN_HR', 'valuations.export'),
('ADMIN_HR', 'compliance.read'),
('ADMIN_HR', 'compliance.acknowledge'),
('ADMIN_HR', 'reports.generate'),
('ADMIN_HR', 'reports.read');

-- APPROVER : valider, voir le contexte
INSERT INTO role_permissions (role, permission_code) VALUES
('APPROVER', 'org.view'),
('APPROVER', 'plans.read'),
('APPROVER', 'beneficiaries.read'),
('APPROVER', 'awards.read.all'),
('APPROVER', 'awards.approve'),
('APPROVER', 'approvals.read'),
('APPROVER', 'approvals.act'),
('APPROVER', 'documents.read'),
('APPROVER', 'captable.read'),
('APPROVER', 'valuations.read'),
('APPROVER', 'compliance.read'),
('APPROVER', 'audit.read');

-- AUDITOR : lecture seule complète
INSERT INTO role_permissions (role, permission_code) VALUES
('AUDITOR', 'org.view'),
('AUDITOR', 'plans.read'),
('AUDITOR', 'beneficiaries.read'),
('AUDITOR', 'awards.read.all'),
('AUDITOR', 'approvals.read'),
('AUDITOR', 'documents.read'),
('AUDITOR', 'captable.read'),
('AUDITOR', 'captable.export'),
('AUDITOR', 'valuations.read'),
('AUDITOR', 'valuations.export'),
('AUDITOR', 'compliance.read'),
('AUDITOR', 'audit.read'),
('AUDITOR', 'audit.export'),
('AUDITOR', 'reports.read');

-- BENEFICIARY : son propre périmètre
INSERT INTO role_permissions (role, permission_code) VALUES
('BENEFICIARY', 'awards.read.own'),
('BENEFICIARY', 'awards.exercise'),
('BENEFICIARY', 'documents.read.own');
```

### 3.3 Helpers RBAC côté Next.js

Fichier : `apps/web/src/lib/auth/rbac.ts`

```typescript
import { createServerSupabase } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Permission } from '@equity/shared/types';

/**
 * Récupère l'utilisateur courant et son contexte org.
 * Throws si non authentifié.
 */
export async function getCurrentUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('Not authenticated');
  }

  const activeOrgId = user.app_metadata?.active_org_id;
  const activeRoles = (user.app_metadata?.active_roles ?? []) as string[];

  return {
    id: user.id,
    email: user.email!,
    activeOrgId,
    activeRoles,
  };
}

/**
 * Vérifie si l'utilisateur courant a une permission.
 * Source de vérité : la table role_permissions (interrogée).
 */
export async function hasPermission(perm: Permission): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user.activeOrgId) return false;

  const supabase = await createServerSupabase();

  // Charger les permissions du membership courant
  const { data } = await supabase.rpc('user_has_permission', {
    p_perm: perm,
  });

  return data === true;
}

/**
 * Garde une Server Action / Page : redirect ou throw si pas la permission.
 */
export async function requirePermission(perm: Permission) {
  const user = await getCurrentUser();
  const ok = await hasPermission(perm);
  if (!ok) {
    throw new Error(`Permission denied: ${perm}`);
  }
  return user;
}

/**
 * Helper React Server Component : si pas de permission, redirect vers /unauthorized.
 */
export async function requirePermissionOrRedirect(perm: Permission) {
  try {
    return await requirePermission(perm);
  } catch {
    redirect('/unauthorized');
  }
}
```

#### Fonction RPC SQL `user_has_permission`

```sql
CREATE OR REPLACE FUNCTION user_has_permission(p_perm TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID := current_org_id();
  v_roles TEXT[];
  v_grants TEXT[];
  v_revokes TEXT[];
BEGIN
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT roles, permissions_grant, permissions_revoke
  INTO v_roles, v_grants, v_revokes
  FROM memberships
  WHERE user_id = v_user_id
    AND org_id = v_org_id
    AND status = 'ACTIVE';

  IF v_roles IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Custom revoke (override)
  IF p_perm = ANY(v_revokes) THEN
    RETURN FALSE;
  END IF;

  -- Custom grant (override)
  IF p_perm = ANY(v_grants) THEN
    RETURN TRUE;
  END IF;

  -- Vérification standard
  RETURN EXISTS (
    SELECT 1 FROM role_permissions
    WHERE role = ANY(v_roles)
      AND permission_code = p_perm
  );
END $$;
```

### 3.4 Hook React pour Client Components

Fichier : `apps/web/src/hooks/usePermission.ts`

```typescript
'use client';
import { useQuery } from '@tanstack/react-query';
import { createBrowserSupabase } from '@/lib/supabase/client';
import type { Permission } from '@equity/shared/types';

export function usePermissions() {
  return useQuery({
    queryKey: ['permissions', 'current-user'],
    queryFn: async () => {
      const supabase = createBrowserSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return new Set<Permission>();

      const orgId = user.app_metadata?.active_org_id;
      if (!orgId) return new Set<Permission>();

      // Charger toutes les permissions du user pour l'org active
      const { data } = await supabase.rpc('user_all_permissions');
      return new Set<Permission>((data ?? []) as Permission[]);
    },
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

export function usePermission(perm: Permission): boolean {
  const { data: perms } = usePermissions();
  return perms?.has(perm) ?? false;
}
```

#### Fonction RPC SQL `user_all_permissions`

```sql
CREATE OR REPLACE FUNCTION user_all_permissions()
RETURNS TEXT[]
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_org_id UUID := current_org_id();
  v_perms TEXT[];
BEGIN
  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RETURN ARRAY[]::TEXT[];
  END IF;

  SELECT ARRAY_AGG(DISTINCT rp.permission_code)
  INTO v_perms
  FROM memberships m
  JOIN role_permissions rp ON rp.role = ANY(m.roles)
  WHERE m.user_id = v_user_id
    AND m.org_id = v_org_id
    AND m.status = 'ACTIVE'
    AND NOT (rp.permission_code = ANY(COALESCE(m.permissions_revoke, ARRAY[]::TEXT[])));

  -- Ajouter les grants explicites
  SELECT v_perms || COALESCE(permissions_grant, ARRAY[]::TEXT[])
  INTO v_perms
  FROM memberships
  WHERE user_id = v_user_id AND org_id = v_org_id AND status = 'ACTIVE';

  RETURN COALESCE(v_perms, ARRAY[]::TEXT[]);
END $$;
```

### 3.5 Composant `<RequirePermission>` (UI)

Fichier : `apps/web/src/components/auth/RequirePermission.tsx`

```tsx
'use client';
import { usePermission } from '@/hooks/usePermission';
import type { Permission } from '@equity/shared/types';

export function RequirePermission({
  permission,
  fallback = null,
  children,
}: {
  permission: Permission;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const has = usePermission(permission);
  if (!has) return <>{fallback}</>;
  return <>{children}</>;
}
```

Usage :

```tsx
<RequirePermission permission="awards.approve">
  <ApproveButton />
</RequirePermission>
```

---

## 4. CHIFFREMENT VIA SUPABASE VAULT

### 4.1 Activation

Dans Supabase Studio, activer l'extension `vault` :

```sql
CREATE EXTENSION IF NOT EXISTS vault WITH SCHEMA vault;
```

### 4.2 Création de la clé de chiffrement

Au bootstrap (migration `00004_encryption_setup.sql`) :

```sql
-- Crée une clé Vault dédiée au chiffrement des données bénéficiaires
SELECT vault.create_secret(
  encode(gen_random_bytes(32), 'hex'), -- valeur aléatoire 256 bits
  'beneficiary_encryption_key',          -- nom logique
  'Encryption key for beneficiaries sensitive data (NSS, DOB, address, etc.)'
);
```

> **Important** : la clé est stockée chiffrée dans Vault. Supabase la déchiffre uniquement au moment de l'utilisation via `vault.decrypted_secrets`.

### 4.3 Fonctions helpers de chiffrement

```sql
CREATE OR REPLACE FUNCTION encrypt_sensitive(plaintext TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_key TEXT;
BEGIN
  IF plaintext IS NULL OR plaintext = '' THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'beneficiary_encryption_key';

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Encryption key not found in Vault';
  END IF;

  RETURN encode(
    pgp_sym_encrypt(plaintext, v_key, 'cipher-algo=aes256'),
    'base64'
  );
END $$;

CREATE OR REPLACE FUNCTION decrypt_sensitive(ciphertext TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_key TEXT;
BEGIN
  IF ciphertext IS NULL OR ciphertext = '' THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM vault.decrypted_secrets
  WHERE name = 'beneficiary_encryption_key';

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Encryption key not found in Vault';
  END IF;

  RETURN pgp_sym_decrypt(
    decode(ciphertext, 'base64'),
    v_key
  );
EXCEPTION WHEN OTHERS THEN
  -- En cas d'erreur de déchiffrement (clé changée, données corrompues), retourner NULL
  RETURN NULL;
END $$;
```

### 4.4 Application sur la table `beneficiaries`

Les colonnes restent en `TEXT` (le chiffré est stocké en base64). Le chiffrement/déchiffrement se fait via les helpers ci-dessus, **côté serveur** (Server Actions / Edge Functions).

#### Pattern d'écriture

```typescript
// Server Action createBeneficiary
const { data, error } = await supabase.rpc('insert_beneficiary_encrypted', {
  p_org_id: orgId,
  p_first_name: input.firstName,
  p_last_name: input.lastName,
  p_email: input.email,
  p_nss: input.nss, // sera chiffré
  p_dob: input.dateOfBirth, // sera chiffré
  p_phone: input.phone,
  p_address: input.address,
});
```

```sql
CREATE OR REPLACE FUNCTION insert_beneficiary_encrypted(
  p_org_id UUID,
  p_first_name TEXT,
  p_last_name TEXT,
  p_email TEXT,
  p_nss TEXT DEFAULT NULL,
  p_dob DATE DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_address JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Vérification permissions
  IF NOT user_has_permission('beneficiaries.create') THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  INSERT INTO beneficiaries (
    org_id, first_name, last_name, email,
    social_security_number,
    date_of_birth_encrypted,
    phone_encrypted,
    address_encrypted
  ) VALUES (
    p_org_id, p_first_name, p_last_name, p_email,
    encrypt_sensitive(p_nss),
    encrypt_sensitive(p_dob::TEXT),
    encrypt_sensitive(p_phone),
    encrypt_sensitive(p_address::TEXT)
  ) RETURNING id INTO v_id;

  RETURN v_id;
END $$;
```

> **Migration nécessaire** : on renomme certaines colonnes pour clarifier qu'elles contiennent du chiffré.

```sql
-- Migration 00005_encrypt_beneficiary_columns.sql
ALTER TABLE beneficiaries
  RENAME COLUMN date_of_birth TO date_of_birth_encrypted;
ALTER TABLE beneficiaries
  RENAME COLUMN phone TO phone_encrypted;
ALTER TABLE beneficiaries
  RENAME COLUMN address TO address_encrypted;
ALTER TABLE beneficiaries
  ALTER COLUMN date_of_birth_encrypted TYPE TEXT,
  ALTER COLUMN phone_encrypted TYPE TEXT,
  ALTER COLUMN address_encrypted TYPE TEXT;

-- social_security_number reste TEXT, on note simplement qu'elle est chiffrée
COMMENT ON COLUMN beneficiaries.social_security_number IS 'Encrypted via encrypt_sensitive()';
COMMENT ON COLUMN beneficiaries.date_of_birth_encrypted IS 'Encrypted ISO date string';
COMMENT ON COLUMN beneficiaries.phone_encrypted IS 'Encrypted phone';
COMMENT ON COLUMN beneficiaries.address_encrypted IS 'Encrypted JSON address';
```

#### Pattern de lecture

```sql
CREATE OR REPLACE FUNCTION get_beneficiary_decrypted(p_id UUID)
RETURNS TABLE (
  id UUID,
  org_id UUID,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  social_security_number TEXT,
  date_of_birth DATE,
  phone TEXT,
  address JSONB
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Permission stricte : il faut "beneficiaries.read.sensitive"
  IF NOT user_has_permission('beneficiaries.read.sensitive') THEN
    RAISE EXCEPTION 'Permission denied: beneficiaries.read.sensitive required';
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    b.org_id,
    b.first_name,
    b.last_name,
    b.email,
    decrypt_sensitive(b.social_security_number) AS social_security_number,
    decrypt_sensitive(b.date_of_birth_encrypted)::DATE AS date_of_birth,
    decrypt_sensitive(b.phone_encrypted) AS phone,
    decrypt_sensitive(b.address_encrypted)::JSONB AS address
  FROM beneficiaries b
  WHERE b.id = p_id
    AND b.org_id = current_org_id()
    AND b.deleted_at IS NULL;
END $$;
```

### 4.5 Affichage côté UI

Les données sensibles ne sont chargées que pour les écrans qui en ont besoin (édition, fiche détaillée). Sur les listes, on utilise les colonnes en clair (nom, email).

Pattern recommandé : double Server Action.

- `getBeneficiariesList(orgId)` → liste légère, pas de données sensibles
- `getBeneficiaryDetails(id)` → fiche complète avec déchiffrement (vérifie `beneficiaries.read.sensitive`)

### 4.6 Audit de l'accès aux données chiffrées

Chaque appel à `get_beneficiary_decrypted` doit produire un événement audit :

```sql
CREATE OR REPLACE FUNCTION get_beneficiary_decrypted(p_id UUID)
RETURNS TABLE (...)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- ... vérification permission

  -- Audit immédiat
  INSERT INTO audit_events (
    org_id, user_id, event_type, resource_type, resource_id, metadata
  ) VALUES (
    current_org_id(), auth.uid(), 'beneficiary.sensitive_data_accessed',
    'BENEFICIARY', p_id,
    jsonb_build_object('reason', 'manual_view')
  );

  -- ... return data
END $$;
```

Ça permet à l'auditeur de voir **qui a regardé quoi** et **quand**.

### 4.7 Gestion de la rotation de clé (V2)

Pas implémenté en V1 mais à prévoir : la table `encryption_keys` (avec versioning) et un job batch qui re-chiffre progressivement avec une nouvelle clé.

---

## 5. PAGES & UI

### 5.1 Routes du module Identity

```
/login                          # Page de login (publique)
/select-org                     # Choix org si multi-org
/onboarding/create-org          # Création d'une org (public, mais req auth)
/accept-invite?token=xxx        # Accept invitation (public)
/auth/callback                  # OAuth callback (interne)
/unauthorized                   # Page erreur permission
/no-access                      # User sans aucune org

# Authenticated, dashboard layout
/dashboard/settings             # Paramètres org (OWNER/ADMIN_HR)
/dashboard/settings/members     # Gestion membres (OWNER + org.manage_members)
/dashboard/settings/profile     # Profil user
/dashboard/settings/api-keys    # Clés API (OWNER)
/dashboard/settings/compliance  # Config règles compliance (OWNER + org.manage_compliance)
```

### 5.2 Page `/login`

Composant Server : si déjà authentifié, redirect `/dashboard`. Sinon, affiche le formulaire.

```tsx
// apps/web/src/app/(auth)/login/page.tsx
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage({ searchParams }: { searchParams: { redirect?: string } }) {
  return (
    <div className="bg-muted flex min-h-screen items-center justify-center">
      <div className="bg-background w-full max-w-md rounded-lg p-8 shadow">
        <h1 className="mb-4 text-2xl font-bold">Connexion</h1>
        <LoginForm redirectTo={searchParams.redirect} />
      </div>
    </div>
  );
}
```

```tsx
// apps/web/src/components/auth/LoginForm.tsx
'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { sendMagicLink } from '@/server/actions/auth';

const Schema = z.object({ email: z.string().email() });

export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const [sent, setSent] = useState(false);
  const form = useForm({ resolver: zodResolver(Schema) });

  const onSubmit = async (data: z.infer<typeof Schema>) => {
    const result = await sendMagicLink(data.email, redirectTo);
    if (result.success) setSent(true);
  };

  if (sent) {
    return (
      <div className="text-center">
        <h2 className="mb-2 font-semibold">Email envoyé !</h2>
        <p className="text-muted-foreground text-sm">
          Cliquez sur le lien reçu pour vous connecter.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <input
        type="email"
        placeholder="vous@exemple.com"
        {...form.register('email')}
        className="w-full rounded border px-3 py-2"
      />
      <button
        type="submit"
        disabled={form.formState.isSubmitting}
        className="bg-primary text-primary-foreground w-full rounded py-2"
      >
        {form.formState.isSubmitting ? 'Envoi...' : 'Recevoir un lien magique'}
      </button>
    </form>
  );
}
```

### 5.3 Page `/select-org`

Liste les orgs avec rôles. Au clic, switch et redirect.

```tsx
// apps/web/src/app/(auth)/select-org/page.tsx
import { listMyOrganizations } from '@/server/queries/organizations';
import { OrgCard } from '@/components/auth/OrgCard';

export default async function SelectOrgPage() {
  const orgs = await listMyOrganizations();

  if (orgs.length === 0) {
    return (
      <div>
        Vous n'êtes membre d'aucune organisation.{' '}
        <a href="/onboarding/create-org">Créer une organisation</a>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-2xl">
        <h1 className="mb-6 text-2xl font-bold">Choisissez une organisation</h1>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {orgs.map((org) => (
            <OrgCard key={org.id} org={org} />
          ))}
        </div>
      </div>
    </div>
  );
}
```

### 5.4 Page `/dashboard/settings/members`

Tableau avec :

- Email, nom, rôles, statut, date d'invitation/acceptation
- Bouton "Inviter un membre"
- Pour chaque ligne : éditer rôles, suspendre, supprimer (avec confirmation)

```tsx
// Pseudo-code, à étoffer
export default async function MembersPage() {
  await requirePermissionOrRedirect('org.manage_members');

  const members = await listOrgMembers();
  const pendingInvites = await listPendingInvitations();

  return (
    <div>
      <PageHeader title="Membres" action={<InviteMemberDialog />} />
      <Tabs>
        <TabsList>
          <TabsTrigger value="active">Actifs ({members.length})</TabsTrigger>
          <TabsTrigger value="pending">En attente ({pendingInvites.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          <MembersTable members={members} />
        </TabsContent>
        <TabsContent value="pending">
          <InvitationsTable invitations={pendingInvites} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

### 5.5 Composant header — Switch d'org

```tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import { listMyOrgs, switchOrg } from '@/server/actions/auth';

export function OrgSwitcher() {
  const { data: orgs } = useQuery({
    queryKey: ['my-orgs'],
    queryFn: listMyOrgs,
  });

  if (!orgs || orgs.length <= 1) return null; // Hide si une seule org

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="ghost">
          <span>{orgs.find((o) => o.isActive)?.name}</span>
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {orgs.map((org) => (
          <DropdownMenuItem key={org.id} onClick={() => switchOrg(org.id)}>
            {org.name}
            {org.isActive && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

---

## 6. SERVER ACTIONS

### 6.1 `auth.ts` — Authentification

```typescript
// apps/web/src/server/actions/auth.ts
'use server';

import { createServerSupabase, createAdminSupabase } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/resend/client';
import { logAuditEvent } from '@/lib/audit';
import { redirect } from 'next/navigation';

export async function sendMagicLink(email: string, redirectTo?: string) {
  const supabase = createAdminSupabase();

  // Vérifier que le user existe (pas de signup public en V1)
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (!profile) {
    // Pour ne pas leaker l'existence des comptes, on fait semblant que ça a marché
    return { success: true };
  }

  // Générer le lien magique
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: email.toLowerCase(),
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${redirectTo ?? '/dashboard'}`,
    },
  });

  if (error) return { success: false, error: error.message };

  // Envoyer via Resend
  await sendEmail({
    to: email,
    template: 'magic_link_login',
    variables: {
      action_link: data.properties?.action_link,
      expires_in_minutes: 15,
    },
  });

  await logAuditEvent({
    eventType: 'auth.magic_link_sent',
    metadata: { email },
  });

  return { success: true };
}

export async function logout() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function setActiveOrg(orgId: string) {
  // ... voir section 2.2
}
```

### 6.2 `invitations.ts`

```typescript
// apps/web/src/server/actions/invitations.ts
'use server';

import crypto from 'crypto';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/rbac';
import { createServerSupabase, createAdminSupabase } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/resend/client';
import { logAuditEvent } from '@/lib/audit';

const InviteSchema = z.object({
  email: z.string().email(),
  roles: z.array(z.enum(['OWNER', 'ADMIN_HR', 'APPROVER', 'AUDITOR', 'BENEFICIARY'])).min(1),
  message: z.string().max(500).optional(),
  beneficiaryId: z.string().uuid().optional(),
});

export async function createInvitation(input: z.infer<typeof InviteSchema>) {
  const data = InviteSchema.parse(input);
  const user = await requirePermission('org.manage_members');
  const supabase = await createServerSupabase();

  // Vérifier qu'aucune invitation PENDING n'existe déjà pour cet email/org
  const { data: existing } = await supabase
    .from('invitations')
    .select('id')
    .eq('org_id', user.activeOrgId)
    .eq('email', data.email.toLowerCase())
    .eq('status', 'PENDING')
    .maybeSingle();

  if (existing) {
    return { error: 'Une invitation est déjà en cours pour cet email' };
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 jours

  const { data: invite, error } = await supabase
    .from('invitations')
    .insert({
      org_id: user.activeOrgId,
      email: data.email.toLowerCase(),
      roles: data.roles,
      token,
      expires_at: expiresAt.toISOString(),
      message: data.message,
      beneficiary_id: data.beneficiaryId,
      invited_by: user.id,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  // Récupérer le nom de l'org pour l'email
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', user.activeOrgId)
    .single();

  const acceptUrl = `${process.env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${token}`;

  const isBeneficiary = data.roles.includes('BENEFICIARY');
  await sendEmail({
    to: data.email,
    template: isBeneficiary ? 'beneficiary_first_invite' : 'team_member_invite',
    variables: {
      org_name: org?.name,
      inviter_email: user.email,
      accept_url: acceptUrl,
      message: data.message,
      expires_at_human: expiresAt.toLocaleDateString('fr-FR'),
    },
  });

  await logAuditEvent({
    eventType: 'invitation.created',
    resourceType: 'INVITATION',
    resourceId: invite.id,
    metadata: { email: data.email, roles: data.roles },
  });

  return { data: invite };
}

export async function acceptInvitation(token: string) {
  const supabase = createAdminSupabase();

  // Vérifier le token
  const { data: invite, error: fetchError } = await supabase
    .from('invitations')
    .select('*, organizations(name)')
    .eq('token', token)
    .eq('status', 'PENDING')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (fetchError || !invite) {
    return { error: 'Invitation invalide ou expirée' };
  }

  // Trouver ou créer le user
  let userId: string;
  const { data: existingProfile } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('email', invite.email)
    .maybeSingle();

  if (existingProfile) {
    userId = existingProfile.id;
  } else {
    // Auto-création du compte
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: invite.email,
      email_confirm: true, // pas de validation email, l'invitation = validation
      user_metadata: {},
    });

    if (createError || !newUser.user) {
      return { error: 'Erreur création compte: ' + createError?.message };
    }

    userId = newUser.user.id;

    // Créer user_profile
    await supabase.from('user_profiles').insert({
      id: userId,
      email: invite.email,
    });
  }

  // Créer le membership (ON CONFLICT pour idempotence)
  await supabase.from('memberships').upsert(
    {
      org_id: invite.org_id,
      user_id: userId,
      roles: invite.roles,
      status: 'ACTIVE',
      invited_by: invite.invited_by,
      invited_at: invite.created_at,
      accepted_at: new Date().toISOString(),
    },
    { onConflict: 'org_id,user_id' },
  );

  // Si invite bénéficiaire, lier user_id au record beneficiary
  if (invite.beneficiary_id) {
    await supabase
      .from('beneficiaries')
      .update({ user_id: userId })
      .eq('id', invite.beneficiary_id);
  }

  // Marquer invitation acceptée
  await supabase
    .from('invitations')
    .update({ status: 'ACCEPTED', accepted_at: new Date().toISOString() })
    .eq('id', invite.id);

  // Définir l'org active
  await supabase.auth.admin.updateUserById(userId, {
    app_metadata: {
      active_org_id: invite.org_id,
      active_roles: invite.roles,
    },
  });

  // Générer un magic link auto-login
  const { data: linkData } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: invite.email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=${
        invite.roles.includes('BENEFICIARY') ? '/portal' : '/dashboard'
      }`,
    },
  });

  await logAuditEvent({
    eventType: 'invitation.accepted',
    orgId: invite.org_id,
    userId,
    resourceType: 'INVITATION',
    resourceId: invite.id,
  });

  return {
    success: true,
    redirectUrl: linkData.properties?.action_link,
  };
}

export async function revokeInvitation(invitationId: string) {
  await requirePermission('org.manage_members');
  const supabase = await createServerSupabase();

  const { error } = await supabase
    .from('invitations')
    .update({ status: 'REVOKED' })
    .eq('id', invitationId)
    .eq('status', 'PENDING');

  if (error) return { error: error.message };

  await logAuditEvent({
    eventType: 'invitation.revoked',
    resourceType: 'INVITATION',
    resourceId: invitationId,
  });

  return { success: true };
}
```

### 6.3 `members.ts`

```typescript
// apps/web/src/server/actions/members.ts
'use server';

import { z } from 'zod';
import { requirePermission } from '@/lib/auth/rbac';
import { createServerSupabase } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit';

const UpdateRolesSchema = z.object({
  membershipId: z.string().uuid(),
  roles: z.array(z.string()).min(1),
});

export async function updateMemberRoles(input: z.infer<typeof UpdateRolesSchema>) {
  const data = UpdateRolesSchema.parse(input);
  const user = await requirePermission('org.manage_members');
  const supabase = await createServerSupabase();

  // Garde-fou : on ne peut pas se retirer le rôle OWNER si on est le seul OWNER
  const { data: target } = await supabase
    .from('memberships')
    .select('user_id, roles, org_id')
    .eq('id', data.membershipId)
    .single();

  if (!target) return { error: 'Member not found' };

  if (
    target.user_id === user.id &&
    target.roles.includes('OWNER') &&
    !data.roles.includes('OWNER')
  ) {
    // Vérifier qu'il y a un autre owner
    const { count } = await supabase
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', target.org_id)
      .contains('roles', ['OWNER'])
      .eq('status', 'ACTIVE');

    if ((count ?? 0) <= 1) {
      return { error: "Au moins un OWNER doit rester dans l'organisation" };
    }
  }

  const { error } = await supabase
    .from('memberships')
    .update({ roles: data.roles, updated_at: new Date().toISOString() })
    .eq('id', data.membershipId);

  if (error) return { error: error.message };

  await logAuditEvent({
    eventType: 'membership.roles_updated',
    resourceType: 'MEMBERSHIP',
    resourceId: data.membershipId,
    beforeState: { roles: target.roles },
    afterState: { roles: data.roles },
  });

  return { success: true };
}

export async function suspendMember(membershipId: string) {
  await requirePermission('org.manage_members');
  // ... idem, mettre status='SUSPENDED'
}

export async function reactivateMember(membershipId: string) {
  await requirePermission('org.manage_members');
  // ... idem, mettre status='ACTIVE'
}

export async function removeMember(membershipId: string) {
  await requirePermission('org.manage_members');
  // ... soft delete via status='REMOVED' (on garde le record pour audit)
}
```

### 6.4 `profile.ts`

```typescript
'use server';

import { z } from 'zod';
import { requireAuth } from '@/lib/auth/rbac';
import { createServerSupabase } from '@/lib/supabase/server';

const UpdateProfileSchema = z.object({
  fullName: z.string().min(1).max(100),
  phone: z.string().max(20).optional(),
  preferences: z.record(z.unknown()).optional(),
});

export async function updateMyProfile(input: z.infer<typeof UpdateProfileSchema>) {
  const data = UpdateProfileSchema.parse(input);
  const user = await getCurrentUser();
  const supabase = await createServerSupabase();

  const { error } = await supabase
    .from('user_profiles')
    .update({
      full_name: data.fullName,
      phone: data.phone,
      preferences: data.preferences,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) return { error: error.message };
  return { success: true };
}
```

---

## 7. EMAILS RESEND

### 7.1 Configuration client

Fichier : `apps/web/src/lib/resend/client.ts`

```typescript
import { Resend } from 'resend';
import { renderEmailTemplate } from './templates';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(opts: {
  to: string;
  template: string;
  variables: Record<string, unknown>;
  replyTo?: string;
}) {
  const { subject, html, text } = await renderEmailTemplate(opts.template, opts.variables);

  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL!,
    to: opts.to,
    subject,
    html,
    text,
    replyTo: opts.replyTo,
    tags: [{ name: 'template', value: opts.template }],
  });

  return result;
}
```

### 7.2 Templates email — V1

À créer dans `apps/web/src/lib/resend/templates/`. Utiliser **react-email** pour la composition (composants typés, preview en dev).

Templates V1 nécessaires pour ce module :

| Code                       | Sujet                                                  | Destinataire | Variables                                                                |
| -------------------------- | ------------------------------------------------------ | ------------ | ------------------------------------------------------------------------ |
| `magic_link_login`         | Votre lien de connexion                                | User         | `action_link`, `expires_in_minutes`                                      |
| `team_member_invite`       | Vous êtes invité sur {{org_name}}                      | Futur user   | `org_name`, `inviter_email`, `accept_url`, `message`, `expires_at_human` |
| `beneficiary_first_invite` | {{org_name}} vous invite à consulter votre attribution | Bénéficiaire | `org_name`, `accept_url`, `expires_at_human`                             |
| `invitation_revoked`       | Invitation annulée                                     | Futur user   | `org_name`, `inviter_email`                                              |
| `org_role_changed`         | Vos accès ont été mis à jour                           | User         | `org_name`, `new_roles[]`                                                |

### 7.3 Webhook Resend

Edge Function : `supabase/functions/resend-webhook/index.ts`

Capte les événements `email.delivered`, `email.bounced`, `email.complained` et met à jour la table `notifications` (status, delivered_at, etc.).

```typescript
// Pseudo-code Edge Function
import { createClient } from '@supabase/supabase-js';

Deno.serve(async (req) => {
  // Vérifier signature webhook (HMAC SHA256 avec RESEND_WEBHOOK_SECRET)
  const signature = req.headers.get('svix-signature');
  // ... validation

  const event = await req.json();
  const supabase = createClient(/* service role */);

  if (event.type === 'email.delivered') {
    await supabase
      .from('notifications')
      .update({
        status: 'DELIVERED',
        delivered_at: new Date().toISOString(),
      })
      .eq('provider_message_id', event.data.email_id);
  } else if (event.type === 'email.bounced') {
    await supabase
      .from('notifications')
      .update({
        status: 'BOUNCED',
        failure_reason: event.data.reason,
      })
      .eq('provider_message_id', event.data.email_id);
  }
  // ... etc

  return new Response('OK');
});
```

---

## 8. AUDIT TRAIL

### 8.1 Fonction helper

Fichier : `apps/web/src/lib/audit.ts`

```typescript
'use server';
import { createAdminSupabase } from '@/lib/supabase/server';
import { headers } from 'next/headers';

export async function logAuditEvent(opts: {
  eventType: string;
  orgId?: string;
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  beforeState?: unknown;
  afterState?: unknown;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createAdminSupabase();
  const h = await headers();

  let orgId = opts.orgId;
  let userId = opts.userId;

  if (!orgId || !userId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = userId ?? user?.id;
    orgId = orgId ?? user?.app_metadata?.active_org_id;
  }

  await supabase.from('audit_events').insert({
    org_id: orgId,
    user_id: userId,
    event_type: opts.eventType,
    resource_type: opts.resourceType,
    resource_id: opts.resourceId,
    before_state: opts.beforeState ?? null,
    after_state: opts.afterState ?? null,
    metadata: opts.metadata ?? {},
    ip_address: h.get('x-forwarded-for') ?? h.get('x-real-ip'),
    user_agent: h.get('user-agent'),
    request_id: h.get('x-request-id'),
  });
}
```

### 8.2 Événements audit du module Identity

| Event Type                            | Trigger                        |
| ------------------------------------- | ------------------------------ |
| `auth.magic_link_sent`                | Demande de magic link          |
| `auth.login_success`                  | Login réussi                   |
| `auth.login_failed`                   | Tentative de login échouée     |
| `auth.logout`                         | Logout                         |
| `auth.org_switched`                   | Switch d'org                   |
| `org.created`                         | Création d'organisation        |
| `org.updated`                         | Modification de paramètres org |
| `invitation.created`                  | Invitation envoyée             |
| `invitation.accepted`                 | Invitation acceptée            |
| `invitation.revoked`                  | Invitation annulée             |
| `invitation.expired`                  | Invitation expirée (cron)      |
| `membership.roles_updated`            | Rôles modifiés                 |
| `membership.suspended`                | Membre suspendu                |
| `membership.reactivated`              | Membre réactivé                |
| `membership.removed`                  | Membre retiré                  |
| `profile.updated`                     | Profil utilisateur modifié     |
| `beneficiary.sensitive_data_accessed` | Lecture des données chiffrées  |

---

## 9. JOBS CRON

### 9.1 Job — Expiration des invitations

À configurer via `pg_cron` :

```sql
-- Tous les jours à 02:00 UTC
SELECT cron.schedule(
  'expire-invitations',
  '0 2 * * *',
  $$
    UPDATE invitations
    SET status = 'EXPIRED'
    WHERE status = 'PENDING'
      AND expires_at < now();

    -- Audit chaque expiration
    INSERT INTO audit_events (org_id, event_type, resource_type, resource_id, metadata)
    SELECT org_id, 'invitation.expired', 'INVITATION', id, jsonb_build_object('email', email)
    FROM invitations
    WHERE status = 'EXPIRED'
      AND updated_at > now() - interval '1 minute';
  $$
);
```

### 9.2 Job — Nettoyage des notifications anciennes

```sql
-- Toutes les semaines, supprime notifications > 90 jours
SELECT cron.schedule(
  'cleanup-old-notifications',
  '0 3 * * 0',
  $$
    DELETE FROM notifications
    WHERE created_at < now() - interval '90 days'
      AND status IN ('DELIVERED', 'FAILED', 'BOUNCED');
  $$
);
```

---

## 10. TESTS

### 10.1 Tests unitaires

Couvrir :

- `hasPermission()` avec tous les cas (rôle owner, multi-rôles, grant, revoke, no membership)
- Validation Zod des Server Actions
- Helpers d'encryption (chiffrer/déchiffrer round-trip)

### 10.2 Tests d'intégration

Avec Supabase test instance :

- Création d'invitation → acceptance → membership créé
- Login flow magic link
- Switch d'org → JWT mis à jour → permissions changent
- Suspension d'un membre → ses requêtes RLS retournent 0
- Tentative d'accès sans permission → 403/erreur

### 10.3 Tests E2E (Playwright)

Scénarios critiques :

1. Signup → création org → invitation user → acceptation → 2 users dans l'org
2. User multi-org → login → page select-org → switch → contexte change
3. OWNER essaie de se retirer son rôle alors qu'il est seul → bloqué
4. Bénéficiaire reçoit invitation → accepte → arrive sur /portal

---

## 11. SÉCURITÉ — CHECKLIST

- [ ] Tous les magic links expirent en 15 min
- [ ] Toutes les invitations expirent en 7 jours et sont à usage unique
- [ ] Rate limiting sur `sendMagicLink` (max 5/heure par email)
- [ ] Rate limiting sur `acceptInvitation` (max 10/heure par IP)
- [ ] Pas de leak d'existence de comptes (réponse identique si email connu ou non)
- [ ] Tokens d'invitation : 32 bytes random, hashed côté DB (V2 — V1 stocke en clair pour simplicité)
- [ ] Vault key rotée annuellement (procédure documentée, V2 implementation)
- [ ] CSP headers configurés (Next.js config)
- [ ] CORS strict (uniquement domaines autorisés)
- [ ] Cookies session : `Secure`, `HttpOnly`, `SameSite=Lax`
- [ ] Validation stricte des emails (format + domaine MX check optionnel V2)
- [ ] Logout côté server (révocation du token Supabase, pas juste suppression cookie)
- [ ] Tous les accès aux données chiffrées sont audités

---

## 12. INSTRUCTIONS POUR CLAUDE CODE

### Prérequis

- Module 1 doit être terminé (bootstrap, schéma DB initial)
- Variables d'env : `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_WEBHOOK_SECRET` configurées
- Domaine Resend vérifié
- Compte Supabase prod/staging avec extension Vault disponible

### Phase 1 — DB & Helpers (priorité 1)

1. Créer migration `00006_seed_permissions.sql` avec section 3.1 (catalogue)
2. Créer migration `00007_seed_role_permissions.sql` avec section 3.2 (mapping)
3. Créer migration `00008_rbac_helpers.sql` avec :
   - `current_org_id()` (déjà partiel en module 1, vérifier)
   - `user_has_permission(perm)`
   - `user_all_permissions()`
4. Créer migration `00009_vault_setup.sql` :
   - Activation extension Vault
   - Création de la clé `beneficiary_encryption_key`
   - Fonctions `encrypt_sensitive`, `decrypt_sensitive`
5. Créer migration `00010_encrypt_beneficiary_columns.sql` (renommage colonnes)
6. Créer migration `00011_rls_identity.sql` :
   - Policies sur `memberships`, `invitations`, `user_profiles`, `audit_events`
7. Créer fonctions RPC `insert_beneficiary_encrypted`, `get_beneficiary_decrypted`
8. Créer cron `expire-invitations` et `cleanup-old-notifications`

### Phase 2 — Backend (priorité 2)

1. Créer `apps/web/src/lib/auth/rbac.ts` avec `getCurrentUser`, `hasPermission`, `requirePermission`
2. Créer `apps/web/src/lib/audit.ts` avec `logAuditEvent`
3. Créer `apps/web/src/lib/resend/client.ts` + setup react-email
4. Créer les templates email (5 templates V1)
5. Créer les Server Actions :
   - `auth.ts` : `sendMagicLink`, `logout`, `setActiveOrg`
   - `invitations.ts` : `createInvitation`, `acceptInvitation`, `revokeInvitation`
   - `members.ts` : `updateMemberRoles`, `suspendMember`, `reactivateMember`, `removeMember`
   - `profile.ts` : `updateMyProfile`
   - `organizations.ts` : `createOrganization`, `updateOrganization`
6. Créer Edge Function `resend-webhook` pour traiter les événements de delivery

### Phase 3 — Middleware & Auth Flow (priorité 3)

1. Créer `apps/web/src/middleware.ts` (section 1.7)
2. Créer `apps/web/src/lib/supabase/middleware.ts`
3. Créer route `/auth/callback` qui exchange code ↔ session
4. Créer route `/login` avec `LoginForm` (section 5.2)
5. Créer route `/select-org` (section 5.3)
6. Créer route `/onboarding/create-org`
7. Créer route `/accept-invite?token=xxx` avec UI flow d'acceptation
8. Créer route `/unauthorized` et `/no-access` (pages d'erreur)

### Phase 4 — UI Settings (priorité 4)

1. Créer layout `/dashboard/settings`
2. Créer page `/dashboard/settings/profile`
3. Créer page `/dashboard/settings/members` (section 5.4) avec :
   - Tableau des membres actifs
   - Tableau des invitations en attente
   - Modal `InviteMemberDialog`
   - Modal `EditMemberRolesDialog`
   - Confirmations destructives
4. Créer composant `OrgSwitcher` (section 5.5) et l'intégrer au header
5. Créer composant `<RequirePermission>` (section 3.5)
6. Créer hook `usePermission`, `usePermissions` (section 3.4)

### Phase 5 — Tests (priorité 5)

1. Tests unitaires sur `hasPermission()`
2. Tests d'intégration sur le flow d'invitation complet
3. Tests E2E Playwright sur les 4 scénarios critiques (section 10.3)

### Validations avant de passer au Module 3

- [ ] Je peux créer une organisation via `/onboarding/create-org`
- [ ] Je peux inviter un user par email, il reçoit un email Resend
- [ ] Le user accepte → compte créé → il arrive sur `/dashboard`
- [ ] Le user voit la liste des membres (s'il est OWNER ou ADMIN_HR)
- [ ] Le user peut switcher d'org si > 1 org
- [ ] Un user sans permission `awards.approve` ne voit pas le bouton "Approuver"
- [ ] Tous les événements clés sont dans `audit_events`
- [ ] La fonction `encrypt_sensitive('test')` puis `decrypt_sensitive(...)` round-trip fonctionne
- [ ] Le cron `expire-invitations` est actif et passe les invites > 7j en `EXPIRED`
- [ ] Tests unitaires + E2E passent

### Conventions strictes

- **Toujours** logger dans `audit_events` les actions identité critiques
- **Jamais** de `RESEND_API_KEY` côté client
- **Toujours** valider les inputs Server Actions avec Zod
- **Toujours** vérifier les permissions au début de chaque Server Action sensible
- **Jamais** de SELECT sans RLS sauf via service role explicite (Edge Functions, jobs cron)
- **Toujours** utiliser `getCurrentUser()` plutôt que `supabase.auth.getUser()` directement
- Le `active_org_id` est la **seule source de vérité** pour le scoping RLS

### Points de vigilance

- **Race condition** sur `acceptInvitation` : deux clics rapides → utiliser `idempotency_key` ou un `SELECT ... FOR UPDATE` sur l'invitation
- **Email enumeration** : la réponse de `sendMagicLink` doit être identique pour email connu ou inconnu
- **Token d'invitation** : 32 bytes hex, jamais loggé en clair dans audit_events
- **Vault key** : si la clé est perdue, **toutes** les données chiffrées sont irrécupérables. Procédure de backup à documenter (export chiffré de la clé hors Supabase, conservation par OWNER)
- **JWT refresh** : après `setActiveOrg`, forcer le client à rafraîchir le token sinon les RLS continuent de filtrer sur l'ancienne org

---

**FIN DU MODULE 2 — IDENTITY & ROLES**

_Quand le Module 2 est implémenté et validé, reviens vers Claude (chat) pour "go module 3 — Plans & Awards Lifecycle"._
