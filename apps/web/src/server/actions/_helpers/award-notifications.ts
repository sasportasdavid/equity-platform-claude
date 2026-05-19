import 'server-only';
import { insertNotificationWithRender } from '@/server/actions/notifications';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Module 3b + Module 7 — Hook notification email pour le workflow d'attribution
 * (résout dette #46 V1).
 *
 * Pattern aligné Module 7 B5 (notifyApproversOfPendingApproval) :
 *  - Fire-and-forget côté caller (la Server Action ne bloque pas si fail)
 *  - Pattern Result { ok: true } | { ok: false, error } pour log côté caller
 *  - Channel EMAIL only V1 (IN_APP reporté V2)
 *  - Réutilise insertNotificationWithRender (queue Module 7) + TEMPLATES typé
 *
 * Charge les données via service_role admin client (bypass RLS — context déjà
 * authentifié + autorisé par le Server Action caller).
 */

type NotifyOk<T> = { ok: true } & T;
type NotifyErr = { ok: false; error: string };

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// ---------------------------------------------------------------------------
// notifyBeneficiaryOfAwardGranted
// ---------------------------------------------------------------------------

/**
 * Notifie le bénéficiaire que son attribution est désormais GRANTED.
 *
 * Appelé fire-and-forget depuis `transitionAward` quand toStatus === 'GRANTED'.
 *
 * Envoie un email avec :
 *  - Référence award_number
 *  - Plan type + units + prix d'exercice
 *  - Date d'attribution
 *  - Lien vers /portal/awards/[id]
 *
 * Pas d'envoi si le bénéficiaire n'a pas d'email ou pas de user_id (= invitation
 * non acceptée — il recevra l'info à sa première connexion via le portail).
 */
export async function notifyBeneficiaryOfAwardGranted(input: {
  awardId: string;
}): Promise<NotifyOk<{ notificationId: string | null }> | NotifyErr> {
  const admin = getSupabaseAdminClient();

  // 1. Charge l'award + plan + beneficiary + org (4 queries // OK car indexées)
  const { data: award } = await admin
    .from('awards')
    .select(
      'id, award_number, units_granted, exercise_price, grant_date, org_id, plan_id, beneficiary_id',
    )
    .eq('id', input.awardId)
    .maybeSingle();

  if (!award) return { ok: false, error: `Award ${input.awardId} introuvable` };
  if (!award.beneficiary_id) return { ok: false, error: 'Award sans beneficiary_id' };

  const [{ data: plan }, { data: org }, { data: bene }] = await Promise.all([
    admin.from('plans').select('id, name, plan_type').eq('id', award.plan_id).maybeSingle(),
    admin.from('organizations').select('id, name').eq('id', award.org_id).maybeSingle(),
    admin
      .from('beneficiaries')
      .select('id, first_name, last_name, email, user_id')
      .eq('id', award.beneficiary_id)
      .maybeSingle(),
  ]);

  if (!bene) return { ok: false, error: 'Beneficiary introuvable' };

  // 2. Résolution email (beneficiary.email prioritaire, sinon auth.users)
  let recipientEmail: string | null = bene.email;
  if (!recipientEmail && bene.user_id) {
    const { data: u } = await admin.auth.admin.getUserById(bene.user_id);
    recipientEmail = u?.user?.email ?? null;
  }
  if (!recipientEmail) {
    console.warn('[notifyBeneficiaryOfAwardGranted] no recipient email', {
      awardId: input.awardId,
      beneficiaryId: bene.id,
    });
    return { ok: true, notificationId: null };
  }

  const beneficiaryName =
    [bene.first_name, bene.last_name].filter(Boolean).join(' ').trim() || 'Bénéficiaire';
  const orgName = org?.name ?? 'Capiwise';
  const planType = plan?.plan_type ?? 'Plan';

  // 3. Insert + render via Module 7 queue (EF consumer le picke + envoi Resend)
  const res = await insertNotificationWithRender({
    orgId: award.org_id,
    templateCode: 'award_granted',
    channel: 'EMAIL',
    recipientEmail,
    userId: bene.user_id ?? undefined,
    beneficiaryId: bene.id,
    relatedEntityType: 'AWARD',
    relatedEntityId: award.id,
    variables: {
      beneficiaryName,
      orgName,
      awardNumber: award.award_number ?? award.id.slice(0, 8).toUpperCase(),
      planType,
      units: Number(award.units_granted ?? 0),
      exercisePrice:
        award.exercise_price != null && Number(award.exercise_price) > 0
          ? Number(award.exercise_price)
          : null,
      grantDate: award.grant_date ?? new Date().toISOString().slice(0, 10),
      portalUrl: `${APP_URL}/portal/awards/${award.id}`,
    },
  });

  if (!res.ok) {
    console.error('[notifyBeneficiaryOfAwardGranted] insertNotificationWithRender failed', {
      awardId: input.awardId,
      error: res.error,
    });
    return { ok: false, error: res.error };
  }

  return { ok: true, notificationId: res.notificationId };
}
