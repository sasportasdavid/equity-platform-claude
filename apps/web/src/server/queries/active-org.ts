import 'server-only';
import { unstable_cache } from 'next/cache';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * PR #36 B3 — Info de l'organisation active (cached).
 *
 * Le nom de l'org sert au breadcrumb du Dashboard CFO et potentiellement à
 * d'autres écrans (Plan detail, Cap Table). Pour éviter de re-fetcher l'org
 * 5× par page, on cache `unstable_cache` 5 minutes par orgId.
 *
 * Schema `organizations` : a `name` (court, ex "Paragraphe") et `legal_name`
 * (ex "Paragraphe SAS"). **Pas de colonne `short_name`** (le brief était
 * inexact). Le breadcrumb utilise `name` (court, déjà éditorial) avec
 * fallback `legal_name`.
 *
 * Tag `org:${orgId}:info` pour invalidation V2 (admin update org).
 */

const REVALIDATE_SECONDS = 300;

export type ActiveOrgInfo = {
  id: string;
  name: string;
  legalName: string | null;
  /** Best-effort short label : `name` si non vide sinon `legalName` sinon "Organisation". */
  displayName: string;
};

async function fetchActiveOrgInfo(orgId: string): Promise<ActiveOrgInfo | null> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from('organizations')
    .select('id, name, legal_name')
    .eq('id', orgId)
    .maybeSingle();
  if (error || !data) return null;
  const name = (data.name ?? '').trim();
  const legalName = data.legal_name ? data.legal_name.trim() : null;
  const displayName = name || legalName || 'Organisation';
  return {
    id: data.id,
    name,
    legalName,
    displayName,
  };
}

export async function getActiveOrgInfo(orgId: string): Promise<ActiveOrgInfo | null> {
  const cached = unstable_cache(() => fetchActiveOrgInfo(orgId), ['active-org', orgId], {
    tags: [`org:${orgId}:info`],
    revalidate: REVALIDATE_SECONDS,
  });
  return cached();
}
