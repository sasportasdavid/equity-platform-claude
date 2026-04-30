import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/rbac';
import { getMyDecisionHistory, getMyPendingApprovalsForInbox } from '@/server/queries/approvals';
import { ApprovalsInboxClient } from './inbox-client';

export const metadata: Metadata = { title: 'Mes approbations · Capiwise' };

/**
 * /dashboard/approvals — Module 5 B4.
 *
 * Inbox approbateur : decisions PENDING qui m'attendent + historique des
 * décisions passées. Permission : approvals.act (les viewers
 * approvals.read voient le détail via la page request mais pas l'inbox).
 */
export default async function Page() {
  const user = await requirePermission('approvals.act');

  const [pending, history] = await Promise.all([
    getMyPendingApprovalsForInbox(user.id),
    getMyDecisionHistory(user.id),
  ]);

  return <ApprovalsInboxClient pending={pending} history={history} />;
}
