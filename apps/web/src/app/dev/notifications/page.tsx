import { requirePermission } from '@/lib/auth/rbac';
import { renderEmailTemplate } from '@/lib/resend/render';
import { MODULE_7_TEMPLATE_CODES } from '@/lib/resend/templates';
import { Sandbox } from './sandbox';
import { SAMPLE_VARS } from './sample-vars';

export const metadata = { title: 'Dev — Notifications' };

/**
 * Sandbox /dev/notifications — Module 7 B2 + B3.
 *
 * B2 : pré-render des 6 templates V1 + preview iframe / plain text.
 * B3 : Test send (insertManualNotification PENDING) + Trigger consumer
 *      (bypass cron 1-min).
 */
export default async function Page() {
  const user = await requirePermission('notifications.send');
  if (!user.activeOrgId) return null;

  const renders = await Promise.all(
    MODULE_7_TEMPLATE_CODES.map(async (code) => {
      try {
        const r = await renderEmailTemplate(code, SAMPLE_VARS[code] as never);
        return { code, ok: true as const, ...r };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown';
        return { code, ok: false as const, error: msg };
      }
    }),
  );

  return (
    <Sandbox
      renders={renders}
      orgId={user.activeOrgId}
      currentUserId={user.id}
      currentUserEmail={user.email ?? ''}
    />
  );
}
