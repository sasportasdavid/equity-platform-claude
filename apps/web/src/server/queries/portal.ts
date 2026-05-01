import 'server-only';
import type { AwardPortalDetail, PortalDashboardData } from '@equity/shared';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
