'use server';

import { revalidatePath } from 'next/cache';
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  type CreateOrganizationInput,
  type UpdateOrganizationInput,
  type TablesUpdate,
} from '@equity/shared';
import { logAuditEvent } from '@/lib/audit';
import { requirePermission, requireUser } from '@/lib/auth/rbac';
import { getServerEnv } from '@/lib/env';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

// ===========================================================================
// createOrganization — Module 2 §2.4 (onboarding closed beta)
// ===========================================================================
//
// Bootstrap multi-tenant complet : INSERT org → user_profile (si nouveau) →
// membership OWNER → set active_org_id sur auth.users (effet immédiat au
// prochain refresh) → audit org.created.
//
// Idempotence : si une org avec le même slug normalisé existe déjà côté
// utilisateur, on renvoie une erreur explicite (pas d'auto-incrémentation
// silencieuse — l'utilisateur doit choisir un nouveau nom).
//
// **Sécurité (R3 audit RBAC 2026-05-19)** : Gate via feature flag
// `ALLOW_PUBLIC_SIGNUP` (default false en prod). Si l'user a déjà une
// membership ACTIVE (multi-org → admin existant qui crée une org pour un
// nouveau client), on l'autorise quoi qu'il arrive (cas légitime onboarding
// admin existant). Sinon (user totalement nouveau → veut créer son org),
// on exige le flag activé. En beta fermée V1.0, le flag est à false →
// les comptes new doivent être créés via invitation admin.

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

export type CreateOrganizationResult =
  | { success: true; orgId: string; slug: string; membershipId: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<CreateOrganizationResult> {
  const parsed = createOrganizationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'Veuillez corriger les erreurs ci-dessous.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;
  const user = await requireUser();
  const admin = getSupabaseAdminClient();

  // R3 audit — feature gate. Si l'user n'a AUCUNE membership ACTIVE, c'est
  // un signup public (potentiellement self-service). Refuser si le flag est
  // OFF. Si l'user a déjà des memberships, c'est un admin existant qui crée
  // une org pour un nouveau client (toujours autorisé).
  const env = getServerEnv();
  if (!env.ALLOW_PUBLIC_SIGNUP) {
    const { count: existingMemberships } = await admin
      .from('memberships')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'ACTIVE');
    if ((existingMemberships ?? 0) === 0) {
      console.warn('[organizations.create] blocked public signup', {
        userId: user.id,
        email: user.email,
      });
      return {
        success: false,
        error:
          'La création d’organisations en self-service est désactivée. Contactez votre administrateur Capiwise pour recevoir une invitation.',
      };
    }
  }

  // Slug avec suffixe court pour éviter les collisions (Capiwise → capiwise-a3f)
  const slug = `${slugify(data.name) || 'org'}-${Math.random().toString(36).slice(2, 5)}`;

  // 1. INSERT organizations
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({
      name: data.name,
      slug,
      legal_name: data.legalName ?? null,
      legal_form: data.legalForm ?? null,
      siren: data.siren ?? null,
      created_by: user.id,
    })
    .select('id, slug')
    .single();

  if (orgError || !org) {
    return { success: false, error: orgError?.message ?? 'Création de l’organisation impossible' };
  }

  // 2. user_profile (upsert : il peut déjà exister)
  await admin.from('user_profiles').upsert(
    {
      id: user.id,
      email: user.email,
      full_name: user.fullName,
      default_org_id: org.id,
    },
    { onConflict: 'id' },
  );

  // 3. membership OWNER
  const { data: membership, error: membershipError } = await admin
    .from('memberships')
    .insert({
      org_id: org.id,
      user_id: user.id,
      roles: ['OWNER'],
      status: 'ACTIVE',
      accepted_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (membershipError || !membership) {
    // Rollback best-effort : supprimer l'org que personne ne pourra atteindre
    await admin.from('organizations').delete().eq('id', org.id);
    return {
      success: false,
      error: membershipError?.message ?? 'Création du membership impossible',
    };
  }

  // 4. set active_org_id côté auth.users (effet immédiat au refresh)
  const { data: authUser } = await admin.auth.admin.getUserById(user.id);
  const currentAppMeta = (authUser?.user?.app_metadata ?? {}) as Record<string, unknown>;
  await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...currentAppMeta, active_org_id: org.id, active_roles: ['OWNER'] },
  });

  // 4bis. V1.X (UX 2026-05-19) — seed du workflow d'approbation par défaut.
  // La RPC `seed_default_approval_workflow_for_org` (migration 00039) crée
  // un workflow AWARD_GRANT minimal (1 étape, role APPROVER, mode ANY) si
  // aucun n'existe — idempotent. Sans cet appel, le premier award PROPOSED
  // restait bloqué en PROPOSED sans déclenchement de workflow (ux KO :
  // "rien ne se passe" perçu par l'admin).
  // Fire-and-forget : si le seed foire, l'org est quand même créée et
  // l'admin peut créer un workflow manuellement via /dashboard/settings/approvals.
  const { error: seedError } = await admin.rpc('seed_default_approval_workflow_for_org', {
    p_org_id: org.id,
  });
  if (seedError) {
    console.warn('[createOrganization] seed default approval workflow failed (non-blocking)', {
      orgId: org.id,
      error: seedError.message,
    });
  }

  // 5. Audit
  await logAuditEvent({
    eventType: 'org.created',
    orgId: org.id,
    userId: user.id,
    userEmail: user.email,
    resourceType: 'ORGANIZATION',
    resourceId: org.id,
    afterState: {
      name: data.name,
      slug: org.slug,
      legal_form: data.legalForm,
      siren: data.siren,
    },
  });

  revalidatePath('/');

  return { success: true, orgId: org.id, slug: org.slug, membershipId: membership.id };
}

// ===========================================================================
// updateOrganization — patch des settings (perm `org.update`)
// ===========================================================================

export type UpdateOrganizationResult =
  | { success: true }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

export async function updateOrganization(
  input: UpdateOrganizationInput,
): Promise<UpdateOrganizationResult> {
  const parsed = updateOrganizationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: 'Veuillez corriger les erreurs ci-dessous.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const data = parsed.data;
  const user = await requirePermission('org.update');
  if (!user.activeOrgId) {
    return { success: false, error: 'Aucune organisation active' };
  }
  const admin = getSupabaseAdminClient();

  const { data: before } = await admin
    .from('organizations')
    .select(
      'name, legal_name, legal_form, siren, default_currency, timezone, fiscal_year_end_month',
    )
    .eq('id', user.activeOrgId)
    .single();

  const patch: TablesUpdate<'organizations'> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.legalName !== undefined) patch.legal_name = data.legalName;
  if (data.legalForm !== undefined) patch.legal_form = data.legalForm;
  if (data.siren !== undefined) patch.siren = data.siren;
  if (data.defaultCurrency !== undefined) patch.default_currency = data.defaultCurrency;
  if (data.timezone !== undefined) patch.timezone = data.timezone;
  if (data.fiscalYearEndMonth !== undefined) patch.fiscal_year_end_month = data.fiscalYearEndMonth;

  const { error } = await admin.from('organizations').update(patch).eq('id', user.activeOrgId);
  if (error) {
    return { success: false, error: error.message };
  }

  await logAuditEvent({
    eventType: 'org.updated',
    orgId: user.activeOrgId,
    userId: user.id,
    userEmail: user.email,
    resourceType: 'ORGANIZATION',
    resourceId: user.activeOrgId,
    beforeState: before as Record<string, unknown> | null,
    afterState: patch,
  });

  revalidatePath('/dashboard/settings');
  return { success: true };
}
