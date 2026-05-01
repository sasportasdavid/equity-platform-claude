import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Module 7 B5 — Queries notifications côté admin (read-only).
 *
 * Stats J-7 + liste filtrable. RLS scope automatiquement par org_id (cf.
 * policies notifications). Pas de service_role utilisé ici.
 */

export type NotificationRow = {
  id: string;
  template_code: string | null;
  channel: string;
  status: string;
  recipient_email: string | null;
  user_id: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  subject: string | null;
  body: string | null;
  failure_reason: string | null;
  retry_count: number;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  failed_at: string | null;
  resend_email_id: string | null;
};

export type NotificationStats = {
  totalLast7d: number;
  pending: number;
  sending: number;
  sent: number;
  delivered: number;
  failed: number;
  bounced: number;
  complained: number;
};

const SINCE_DAYS = 7;
const PAGE_LIMIT = 100;

export type ListNotificationsFilters = {
  status?: string;
  channel?: string;
  templateCode?: string;
  recipient?: string;
};

export async function listNotifications(
  filters: ListNotificationsFilters = {},
): Promise<NotificationRow[]> {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from('notifications')
    .select(
      'id, template_code, channel, status, recipient_email, user_id, related_entity_type, related_entity_id, subject, body, failure_reason, retry_count, created_at, sent_at, delivered_at, failed_at, resend_email_id',
    )
    .order('created_at', { ascending: false })
    .limit(PAGE_LIMIT);

  if (filters.status) q = q.eq('status', filters.status);
  if (filters.channel) q = q.eq('channel', filters.channel);
  if (filters.templateCode) q = q.eq('template_code', filters.templateCode);
  if (filters.recipient) q = q.ilike('recipient_email', `%${filters.recipient}%`);

  const { data, error } = await q;
  if (error) {
    console.error('[listNotifications] failed:', error.message);
    return [];
  }
  return (data ?? []) as NotificationRow[];
}

export async function getNotificationStats(): Promise<NotificationStats> {
  const supabase = await createSupabaseServerClient();
  const since = new Date(Date.now() - SINCE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('notifications')
    .select('status')
    .gte('created_at', since);

  if (error) {
    console.error('[getNotificationStats] failed:', error.message);
    return {
      totalLast7d: 0,
      pending: 0,
      sending: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      bounced: 0,
      complained: 0,
    };
  }

  const counts = {
    totalLast7d: data?.length ?? 0,
    pending: 0,
    sending: 0,
    sent: 0,
    delivered: 0,
    failed: 0,
    bounced: 0,
    complained: 0,
  };
  for (const row of data ?? []) {
    switch (row.status) {
      case 'PENDING':
        counts.pending += 1;
        break;
      case 'SENDING':
        counts.sending += 1;
        break;
      case 'SENT':
        counts.sent += 1;
        break;
      case 'DELIVERED':
        counts.delivered += 1;
        break;
      case 'FAILED':
        counts.failed += 1;
        break;
      case 'BOUNCED':
        counts.bounced += 1;
        break;
      case 'COMPLAINED':
        counts.complained += 1;
        break;
    }
  }
  return counts;
}
