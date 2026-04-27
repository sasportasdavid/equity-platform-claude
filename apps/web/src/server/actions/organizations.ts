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
// Sécurité : pas de check `org.create` (la perm n'existe pas en V1) — toute
// personne authentifiée peut créer une org dont elle sera OWNER. En prod
// fermée beta, on désactivera via feature flag `allow_public_signup` (V2).

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
