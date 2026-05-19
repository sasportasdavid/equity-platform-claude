import 'server-only';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Resolution cascade des paramètres de signature au moment d'un envoi
 * Yousign. Pattern :
 *
 *   1. signature_workflow matching le plan_type ou template_code → override
 *      (Layer C)
 *   2. signature_settings de l'org (Layer A) → fallback defaults
 *   3. Override modale envoi (Layer 3) → priorité absolue (côté caller)
 *
 * Retourne une config résolue avec :
 *   - expiryDays, signingOrder, reminderDays
 *   - defaultSigners[] : préfilled signers du workflow trouvé (si Layer C)
 *     ou liste vide (si Layer A only)
 *   - source : 'workflow' | 'defaults' (debug + UI)
 *   - workflowId / workflowName : optionnel, pour preview UI
 */

export type ResolvedSigner = {
  signerOrder: number;
  signerType: 'BENEFICIARY' | 'ROLE' | 'USER';
  signerRole: string | null;
  signerUserId: string | null;
  isRequired: boolean;
};

export type ResolvedSignatureConfig = {
  expiryDays: number;
  signingOrder: 'SEQUENTIAL' | 'PARALLEL';
  reminderDays: number;
  requireOwnerCosigner: boolean;
  defaultSigners: ResolvedSigner[];
  source: 'workflow' | 'defaults';
  workflowId: string | null;
  workflowName: string | null;
};

/**
 * Résout la config de signature à appliquer pour un document donné.
 *
 * @param orgId  Organisation active (filtrage RLS contourné via admin client)
 * @param planType  plan_type du plan associé à l'award (BSPCE, AGA, etc.)
 * @param templateCode  code du template (BSPCE_GRANT_LETTER, etc.)
 */
export async function resolveSignatureConfig(input: {
  orgId: string;
  planType: string | null;
  templateCode: string | null;
}): Promise<ResolvedSignatureConfig> {
  const admin = getSupabaseAdminClient();

  // 1. Cherche un workflow Layer C matching plan_type ou template_code, ou
  //    sinon le workflow default org. Order priority :
  //    - matching template_code (le plus spécifique)
  //    - matching plan_type
  //    - is_default
  const { data: workflows } = await (
    admin as never as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (
            k: string,
            v: string,
          ) => {
            eq: (
              k: string,
              v: unknown,
            ) => {
              is: (k: string, v: null) => Promise<{ data: Record<string, unknown>[] | null }>;
            };
          };
        };
      };
    }
  )
    .from('signature_workflows')
    .select('*')
    .eq('org_id', input.orgId)
    .eq('is_active', true)
    .is('deleted_at', null);

  const activeWorkflows = (workflows ?? []) as Array<{
    id: string;
    name: string;
    applies_to_plan_types: string[] | null;
    applies_to_template_codes: string[] | null;
    expiry_days: number;
    signing_order: 'SEQUENTIAL' | 'PARALLEL';
    reminder_days: number;
    is_default: boolean;
  }>;

  // Scoring : template_code > plan_type > is_default
  const scored = activeWorkflows
    .map((wf) => {
      let score = 0;
      if (input.templateCode && (wf.applies_to_template_codes ?? []).includes(input.templateCode))
        score += 100;
      if (input.planType && (wf.applies_to_plan_types ?? []).includes(input.planType)) score += 10;
      if (wf.is_default) score += 1;
      return { wf, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const matchedWorkflow = scored[0]?.wf ?? null;

  // 2. Si workflow trouvé, charger ses signers
  let defaultSigners: ResolvedSigner[] = [];
  if (matchedWorkflow) {
    const { data: signers } = await (
      admin as never as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (
              k: string,
              v: string,
            ) => {
              order: (
                k: string,
                opts: { ascending: boolean },
              ) => Promise<{ data: Record<string, unknown>[] | null }>;
            };
          };
        };
      }
    )
      .from('signature_workflow_signers')
      .select('*')
      .eq('workflow_id', matchedWorkflow.id)
      .order('signer_order', { ascending: true });

    defaultSigners = ((signers ?? []) as Array<Record<string, unknown>>).map((s) => ({
      signerOrder: s.signer_order as number,
      signerType: s.signer_type as 'BENEFICIARY' | 'ROLE' | 'USER',
      signerRole: (s.signer_role as string | null) ?? null,
      signerUserId: (s.signer_user_id as string | null) ?? null,
      isRequired: s.is_required as boolean,
    }));
  }

  // 3. Charge les defaults A (toujours nécessaire pour fallback requireOwnerCosigner)
  const { data: settings } = await (
    admin as never as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (
            k: string,
            v: string,
          ) => {
            maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
          };
        };
      };
    }
  )
    .from('signature_settings')
    .select('*')
    .eq('org_id', input.orgId)
    .maybeSingle();

  const orgDefaults = (settings ?? null) as {
    default_expiry_days?: number;
    default_signing_order?: 'SEQUENTIAL' | 'PARALLEL';
    reminder_days?: number;
    require_owner_cosigner?: boolean;
  } | null;

  // Construction de la config finale
  if (matchedWorkflow) {
    return {
      expiryDays: matchedWorkflow.expiry_days,
      signingOrder: matchedWorkflow.signing_order,
      reminderDays: matchedWorkflow.reminder_days,
      requireOwnerCosigner: orgDefaults?.require_owner_cosigner ?? false,
      defaultSigners,
      source: 'workflow',
      workflowId: matchedWorkflow.id,
      workflowName: matchedWorkflow.name,
    };
  }

  // Fallback Layer A defaults
  return {
    expiryDays: orgDefaults?.default_expiry_days ?? 14,
    signingOrder: orgDefaults?.default_signing_order ?? 'SEQUENTIAL',
    reminderDays: orgDefaults?.reminder_days ?? 3,
    requireOwnerCosigner: orgDefaults?.require_owner_cosigner ?? false,
    defaultSigners: [],
    source: 'defaults',
    workflowId: null,
    workflowName: null,
  };
}
