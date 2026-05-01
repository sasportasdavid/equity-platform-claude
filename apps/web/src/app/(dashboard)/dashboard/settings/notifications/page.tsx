import type { Metadata } from 'next';
import { hasPermission, requirePermission } from '@/lib/auth/rbac';
import { getNotificationStats, listNotifications } from '@/server/queries/notifications';
import { NotificationsAdminClient } from './notifications-admin-client';

export const metadata: Metadata = { title: 'Notifications · Capiwise' };

type SearchParams = {
  status?: string;
  channel?: string;
  template?: string;
  recipient?: string;
};

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requirePermission('notifications.send');
  const sp = await searchParams;

  const [stats, rows, canAct] = await Promise.all([
    getNotificationStats(),
    listNotifications({
      status: sp.status,
      channel: sp.channel,
      templateCode: sp.template,
      recipient: sp.recipient,
    }),
    hasPermission('notifications.send'),
  ]);

  return (
    <NotificationsAdminClient
      stats={stats}
      rows={rows}
      canAct={canAct}
      initialFilters={{
        status: sp.status ?? '',
        channel: sp.channel ?? '',
        templateCode: sp.template ?? '',
        recipient: sp.recipient ?? '',
      }}
    />
  );
}
