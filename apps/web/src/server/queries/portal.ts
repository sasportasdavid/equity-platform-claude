import 'server-only';
import type { AwardPortalDetail, PortalDashboardData } from '@equity/shared';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Module 8 B3 — Queries serveur du portail bénéficiaire.
 *
 * Wrappers fins autour des RPCs SECURITY DEFINER livrés en B1 :
 *   - get_beneficiary_portal_dashboard()  → PortalDashboardData
 *   - get_award_portal_detail(p_award_id) → AwardPortalDetail
 *
 * Les RPCs vérifient `auth.uid()` + ownership côté DB (filter sur
 * `beneficiaries.user_id = auth.uid()`). Le client cookie-based propage
 * la session JWT requise par SECURITY DEFINER.
 *
 * Pattern : on lève une erreur typed si le RPC échoue. Les pages Server
 * Component catch via try/catch ou propagent à `error.tsx`.
 */

export class PortalDashboardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PortalDashboardError';
  }
}

export class AwardPortalDetailError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'NOT_AUTHENTICATED' | 'UNKNOWN' = 'UNKNOWN',
  ) {
    super(message);
    this.name = 'AwardPortalDetailError';
  }
}

/**
 * Charge le dashboard initial du bénéficiaire courant : org + awards
 * GRANTED + résumé profil.
 *
 * @throws PortalDashboardError si pas de session, pas de beneficiary
 *   record, ou erreur RPC.
 */
export async function getPortalDashboard(): Promise<PortalDashboardData> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_beneficiary_portal_dashboard');
  if (error) {
    throw new PortalDashboardError(error.message);
  }
  if (!data) {
    throw new PortalDashboardError('Empty dashboard payload');
  }
  return data as unknown as PortalDashboardData;
}

/**
 * Charge le détail complet d'un award (avec ownership check côté DB).
 *
 * @throws AwardPortalDetailError code='NOT_FOUND' si l'award n'existe
 *   pas ou n'appartient pas au bénéficiaire courant.
 */
export async function getAwardPortalDetail(awardId: string): Promise<AwardPortalDetail> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('get_award_portal_detail', {
    p_award_id: awardId,
  });
  if (error) {
    // Le RPC raise 'Award not found or access denied' ou 'Not authenticated'
    if (/access denied|not found/i.test(error.message)) {
      throw new AwardPortalDetailError(error.message, 'NOT_FOUND');
    }
    if (/not authenticated/i.test(error.message)) {
      throw new AwardPortalDetailError(error.message, 'NOT_AUTHENTICATED');
    }
    throw new AwardPortalDetailError(error.message);
  }
  if (!data) {
    throw new AwardPortalDetailError('Empty award detail payload', 'NOT_FOUND');
  }
  return data as unknown as AwardPortalDetail;
}

// ---------------------------------------------------------------------------
// getBeneficiaryDocuments — Module 8 B5
// ---------------------------------------------------------------------------

/**
 * Document SIGNED associé à un award du bénéficiaire courant. Inclut les
 * infos de l'award/plan pour le filtre + display dans la liste portail.
 */
export type BeneficiaryDocumentSummary = {
  id: string;
  document_number: string | null;
  category: string | null;
  status: string;
  signed_at: string | null;
  has_signed_pdf: boolean;
  award_id: string;
  award_number: string;
  plan_id: string;
  plan_name: string;
  plan_type: string;
};

/**
 * Charge tous les `document_instances` SIGNED des awards du bénéficiaire
 * courant (tous awards confondus).
 *
 * Pattern :
 *   1. requireUser auth check (côté caller)
 *   2. Find own beneficiary record (user_id = auth.uid())
 *   3. Récupère les award_ids du bénéficiaire (defense in depth filter)
 *   4. Récupère les document_instances SIGNED + signed_pdf_storage_path
 *      non null + related_entity_type='AWARD' + related_entity_id IN
 *      (award_ids du bénéficiaire)
 *   5. Joint awards + plans pour le display + filter
 *
 * Sécurité : on filtre strictement sur les awards du bénéficiaire (pas
 * juste sur l'org_id). Cohérent avec `getPortalDocumentSignedUrl` (B3).
 *
 * Retourne `[]` si l'utilisateur n'a pas de beneficiary record actif.
 */
export async function getBeneficiaryDocuments(): Promise<BeneficiaryDocumentSummary[]> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = getSupabaseAdminClient();

  // 1. Find own beneficiary
  const { data: bene } = await admin
    .from('beneficiaries')
    .select('id')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!bene) return [];

  // 2. Récupère les award_ids du bénéficiaire (peut être vide)
  const { data: awards } = await admin
    .from('awards')
    .select('id, award_number, plan_id, plans:plan_id (name, plan_type)')
    .eq('beneficiary_id', bene.id)
    .is('deleted_at', null);
  if (!awards || awards.length === 0) return [];

  const awardIds = awards.map((a) => a.id);
  const awardById = new Map(awards.map((a) => [a.id, a]));

  // 3. Récupère les documents SIGNED de ces awards
  const { data: docs, error } = await admin
    .from('document_instances')
    .select(
      'id, document_number, category, status, signed_at, signed_pdf_storage_path, related_entity_id',
    )
    .eq('related_entity_type', 'AWARD')
    .eq('status', 'SIGNED')
    .in('related_entity_id', awardIds)
    .not('signed_pdf_storage_path', 'is', null)
    .order('signed_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to load beneficiary documents: ${error.message}`);
  }

  return (docs ?? []).flatMap((d): BeneficiaryDocumentSummary[] => {
    if (!d.related_entity_id) return [];
    const award = awardById.get(d.related_entity_id);
    if (!award) return [];
    const plan = (award.plans ?? null) as { name: string; plan_type: string } | null;
    return [
      {
        id: d.id,
        document_number: d.document_number,
        category: d.category,
        status: d.status,
        signed_at: d.signed_at,
        has_signed_pdf: !!d.signed_pdf_storage_path,
        award_id: award.id,
        award_number: award.award_number ?? '—',
        plan_id: award.plan_id,
        plan_name: plan?.name ?? '—',
        plan_type: plan?.plan_type ?? '—',
      },
    ];
  });
}
