import 'server-only';
import { headers } from 'next/headers';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export type AuditEventInput = {
  /** Snake_case event type, e.g. 'plan.created', 'award.proposed', 'exercise.completed' */
  eventType: string;
  resourceType?: string;
  resourceId?: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  /** Override the auto-detected actor (e.g. for system events) */
  userId?: string | null;
  userEmail?: string | null;
  orgId?: string | null;
  /** API key id when the action originates from a programmatic call */
  apiKeyId?: string | null;
};

/**
 * Insère une ligne dans `audit_events` via le service_role client.
 *
 * Pourquoi service_role : `audit_events` n'a pas de policy INSERT publique
 * (table immuable côté API), donc on doit bypasser les RLS pour écrire.
 * Mais on capture systématiquement user/org/IP/UA pour traçabilité.
 *
 * Cette fonction NE THROW PAS en cas d'erreur d'insertion (best-effort) :
 * un audit raté ne doit pas casser l'action métier. L'erreur est loggée.
 */
export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    const admin = getSupabaseAdminClient();
    const hdrs = await headers();
    const ipAddress =
      hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ?? hdrs.get('x-real-ip') ?? null;
    const userAgent = hdrs.get('user-agent') ?? null;
    const requestId = hdrs.get('x-request-id') ?? null;

    const { error } = await admin.from('audit_events').insert({
      org_id: input.orgId ?? null,
      user_id: input.userId ?? null,
      user_email: input.userEmail ?? null,
      event_type: input.eventType,
      resource_type: input.resourceType ?? null,
      resource_id: input.resourceId ?? null,
      before_state: (input.beforeState as never) ?? null,
      after_state: (input.afterState as never) ?? null,
      metadata: (input.metadata ?? {}) as never,
      ip_address: ipAddress,
      user_agent: userAgent,
      request_id: requestId,
      api_key_id: input.apiKeyId ?? null,
    });

    if (error) {
      console.error('[audit] failed to insert event', input.eventType, error);
    }
  } catch (err) {
    console.error('[audit] unexpected error', input.eventType, err);
  }
}
