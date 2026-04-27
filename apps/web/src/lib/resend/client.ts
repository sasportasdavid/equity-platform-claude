import 'server-only';
import { render } from '@react-email/render';
import { createElement } from 'react';
import { Resend } from 'resend';
import { getServerEnv } from '@/lib/env';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { TEMPLATES, type TemplateCode, type TemplateMap } from './templates';

/**
 * Client Resend lazy-init (évite de planter au boot si la clé n'est pas
 * encore chargée). `Resend` est un client HTTP léger, on garde une seule
 * instance par process.
 */
let cachedResend: Resend | undefined;
function getResend(): Resend {
  if (cachedResend) return cachedResend;
  const env = getServerEnv();
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is required to send emails. Set it in apps/web/.env.local.');
  }
  cachedResend = new Resend(env.RESEND_API_KEY);
  return cachedResend;
}

export type SendEmailInput<K extends TemplateCode> = {
  to: string | string[];
  template: K;
  variables: TemplateMap[K];
  /** Optional reply-to */
  replyTo?: string;
  /** Lie l'email à un user / bénéficiaire / org pour traçabilité notifications */
  audit?: {
    orgId?: string | null;
    userId?: string | null;
    beneficiaryId?: string | null;
    relatedEntityType?: string | null;
    relatedEntityId?: string | null;
  };
};

export type SendEmailResult =
  | { ok: true; providerMessageId: string; notificationId: string | null }
  | { ok: false; error: string };

/**
 * Envoie un email transactionnel via Resend, en :
 *   1. rendering le template react-email (HTML + plain text)
 *   2. ajoutant un tag `template` (utilisé par le webhook pour relier l'event au row)
 *   3. enregistrant une row dans `notifications` (status='SENT' au minimum)
 *      via le service_role client. Le webhook Resend mettra ensuite à jour
 *      DELIVERED / BOUNCED / FAILED.
 */
export async function sendEmail<K extends TemplateCode>(
  input: SendEmailInput<K>,
): Promise<SendEmailResult> {
  const env = getServerEnv();
  if (!env.RESEND_FROM_EMAIL) {
    return { ok: false, error: 'RESEND_FROM_EMAIL is not configured' };
  }

  const tpl = TEMPLATES[input.template];
  // We type-assert cast through unknown because TS struggles to narrow
  // the discriminated TemplateMap when looping over all keys; the `K` generic
  // guarantees runtime safety.
  const node = createElement(
    tpl.Component as (p: TemplateMap[K]) => React.ReactElement,
    input.variables,
  );

  const [html, text] = await Promise.all([
    render(node, { pretty: false }),
    render(node, { plainText: true }),
  ]);

  const subject = tpl.subject(input.variables);
  const recipients = Array.isArray(input.to) ? input.to : [input.to];

  // 1. Send via Resend
  let providerMessageId = '';
  let providerError: string | null = null;
  try {
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: recipients,
      subject,
      html,
      text,
      replyTo: input.replyTo,
      tags: [
        { name: 'template', value: input.template },
        ...(input.audit?.orgId ? [{ name: 'org', value: input.audit.orgId }] : []),
      ],
    });
    if (error) {
      providerError = error.message;
    } else {
      providerMessageId = data?.id ?? '';
    }
  } catch (err) {
    providerError = err instanceof Error ? err.message : 'Unknown Resend error';
  }

  // 2. Audit row in `notifications`
  let notificationId: string | null = null;
  try {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('notifications')
      .insert({
        org_id: input.audit?.orgId ?? null,
        user_id: input.audit?.userId ?? null,
        beneficiary_id: input.audit?.beneficiaryId ?? null,
        template_code: input.template,
        channel: 'EMAIL',
        recipient_email: recipients.join(','),
        subject,
        body: text,
        variables_used: input.variables as never,
        status: providerError ? 'FAILED' : 'SENT',
        provider: 'RESEND',
        provider_message_id: providerMessageId || null,
        provider_response: (providerError
          ? { error: providerError }
          : { id: providerMessageId }) as never,
        sent_at: providerError ? null : new Date().toISOString(),
        failed_at: providerError ? new Date().toISOString() : null,
        failure_reason: providerError,
        related_entity_type: input.audit?.relatedEntityType ?? null,
        related_entity_id: input.audit?.relatedEntityId ?? null,
      })
      .select('id')
      .single();
    if (!error) notificationId = data?.id ?? null;
  } catch (err) {
    // Audit row failure must not mask the email send result
    console.error('[resend] failed to insert notification row', err);
  }

  if (providerError) return { ok: false, error: providerError };
  return { ok: true, providerMessageId, notificationId };
}
