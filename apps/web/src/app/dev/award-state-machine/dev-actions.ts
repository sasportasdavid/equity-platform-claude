'use server';

import { z } from 'zod';
import { requirePermission } from '@/lib/auth/rbac';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Helper Server Action /dev — upsert un beneficiary par email pour test
 * sandbox. Le vrai upsert vivra dans Module 4 (`upsert_beneficiary` RPC).
 *
 * Garde-fou : nécessite `beneficiaries.create`. Reste protégé par le layout
 * /dev/* qui notFound() en prod.
 */
export async function devUpsertBeneficiary(input: {
  email: string;
  fullName: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = z
    .object({
      email: z.string().email(),
      fullName: z.string().min(1).max(200),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Email ou nom invalide' };

  const user = await requirePermission('beneficiaries.create');
  if (!user.activeOrgId) return { ok: false, error: 'Org active manquante' };
  const supabase = await createSupabaseServerClient();

  // Look up existing
  const { data: existing } = await supabase
    .from('beneficiaries')
    .select('id')
    .eq('org_id', user.activeOrgId)
    .eq('email', parsed.data.email)
    .maybeSingle();
  if (existing?.id) return { ok: true, id: existing.id };

  // Split fullName en first/last (heuristique simple)
  const parts = parsed.data.fullName.trim().split(/\s+/);
  const firstName = parts[0] ?? parsed.data.fullName;
  const lastName = parts.slice(1).join(' ') || '—';

  const { data: ins, error } = await supabase
    .from('beneficiaries')
    .insert({
      org_id: user.activeOrgId,
      email: parsed.data.email,
      first_name: firstName,
      last_name: lastName,
      beneficiary_type: 'EMPLOYEE',
      status: 'ACTIVE',
      tax_residence_country: 'FR',
    })
    .select('id')
    .single();
  if (error || !ins) return { ok: false, error: error?.message ?? 'Insert KO' };
  return { ok: true, id: ins.id };
}
