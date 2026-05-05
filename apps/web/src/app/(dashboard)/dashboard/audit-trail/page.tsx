import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuditEventDetailContent } from '@/components/audit/AuditEventDetailContent';
import { AuditEventDetailDrawer } from '@/components/audit/AuditEventDetailDrawer';
import { AuditTrailFilters } from '@/components/audit/AuditTrailFilters';
import { AuditTrailList } from '@/components/audit/AuditTrailList';
import { PageShell } from '@/components/shared/PageShell';
import { hasPermission, requireUser } from '@/lib/auth/rbac';
import { buildAuditHeroPhrase, buildAuditSubtitle } from '@/lib/audit/hero-phrase';
import { getAdaptiveDashboardGreeting } from '@/lib/utils/adaptive-greeting';
import { getActiveOrgInfo } from '@/server/queries/active-org';
import { getAuditEvents, getAuditStats } from '@/server/queries/audit';

export const metadata: Metadata = {
  title: "Journal d'audit",
};

const PAGE_SIZE = 50;

/**
 * PR #39 B4 — Module 13 V1 — Page Audit Trail editorial.
 *
 * RSC pattern aligné PR #36-37 dashboard/page.tsx :
 * - `requireUser()` puis `hasPermission('audit.read')` (sinon empty state).
 * - `Promise.all` pour charger en parallèle stats + events + orgInfo.
 * - PageShell compound API : Breadcrumb / Overline / Title (italic
 *   mid-sentence pattern PR #36) / TitleRule / Subtitle.
 * - Filtres URL searchParams (?type=plan&page=2).
 *
 * RLS : `audit_events_select` filtre automatiquement par `org_id =
 * current_org_id() AND has_permission('audit.read')`. Si l'user n'a pas
 * la permission, la query renvoie 0 rows (pas un throw) — la page rend
 * un empty state propre.
 */
export default async function AuditTrailPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string; event?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const canRead = await hasPermission('audit.read');

  const eventTypePrefix = sp.type;
  const pageNumber = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const detailEventId = canRead ? (sp.event ?? null) : null;

  const [stats, eventsResult, orgInfo] = await Promise.all([
    canRead
      ? getAuditStats()
      : Promise.resolve({
          totalEvents: 0,
          daysCovered: 0,
          distinctTypes: 0,
          distinctActors: 0,
        }),
    canRead
      ? getAuditEvents({ eventTypePrefix, page: pageNumber, pageSize: PAGE_SIZE })
      : Promise.resolve({ items: [], page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 0 }),
    user.activeOrgId ? getActiveOrgInfo(user.activeOrgId) : Promise.resolve(null),
  ]);

  const greeting = getAdaptiveDashboardGreeting({ name: user.fullName });
  const heroPhrase = buildAuditHeroPhrase({
    greetingPrefix: greeting,
    totalEvents: stats.totalEvents,
  });
  const subtitle = buildAuditSubtitle({
    daysCovered: stats.daysCovered,
    distinctTypes: stats.distinctTypes,
    distinctActors: stats.distinctActors,
  });

  const quarter = quarterLabel(new Date());
  const overline = `Audit trail · Conformité · ${quarter}`;

  return (
    <PageShell>
      <PageShell.Breadcrumb
        items={[
          { label: orgInfo?.displayName ?? 'Capiwise', href: '/dashboard' },
          { label: 'Audit trail' },
        ]}
      />

      <PageShell.Header>
        <PageShell.Overline>{overline.toUpperCase()}</PageShell.Overline>
        <PageShell.Title>
          {heroPhrase.prefix}
          <PageShell.TitleAccent>{heroPhrase.accent}</PageShell.TitleAccent>
          {heroPhrase.suffix}
        </PageShell.Title>
        <PageShell.TitleRule />
        {subtitle ? <PageShell.Subtitle>{subtitle}</PageShell.Subtitle> : null}
      </PageShell.Header>

      <main role="main" aria-label="Journal d'audit" className="space-y-6">
        {!canRead ? (
          <p className="serif-italic text-ink-500 text-sm" role="status">
            Vous n&apos;avez pas la permission de consulter le journal d&apos;audit. Demandez à un
            OWNER ou AUDITOR de votre organisation.
          </p>
        ) : (
          <>
            <AuditTrailFilters currentType={eventTypePrefix} />

            <AuditTrailList events={eventsResult.items} />

            {eventsResult.total > 0 ? (
              <footer className="cw-audit-pagination" aria-label="Pagination des événements">
                <span className="font-mono">
                  Page {eventsResult.page} sur {eventsResult.totalPages} · {eventsResult.total}{' '}
                  événement{eventsResult.total > 1 ? 's' : ''}
                </span>
                <PaginationLinks
                  currentPage={eventsResult.page}
                  totalPages={eventsResult.totalPages}
                  eventTypePrefix={eventTypePrefix}
                />
              </footer>
            ) : null}
          </>
        )}
      </main>

      {/* PR #41 V1.5 — Drawer détail event (open via ?event=<id>) */}
      <AuditEventDetailDrawer eventId={detailEventId}>
        {detailEventId ? (
          <Suspense fallback={<DrawerSkeleton />}>
            <AuditEventDetailContent eventId={detailEventId} />
          </Suspense>
        ) : null}
      </AuditEventDetailDrawer>
    </PageShell>
  );
}

function DrawerSkeleton() {
  return (
    <div className="cw-audit-drawer-body" data-testid="audit-drawer-skeleton">
      <p className="cw-audit-empty-detail">Chargement…</p>
    </div>
  );
}

function PaginationLinks({
  currentPage,
  totalPages,
  eventTypePrefix,
}: {
  currentPage: number;
  totalPages: number;
  eventTypePrefix?: string | undefined;
}) {
  const buildHref = (p: number): string => {
    const params = new URLSearchParams();
    if (eventTypePrefix && eventTypePrefix !== 'all') params.set('type', eventTypePrefix);
    if (p > 1) params.set('page', String(p));
    const qs = params.toString();
    return `/dashboard/audit-trail${qs ? `?${qs}` : ''}`;
  };

  return (
    <span className="flex gap-3">
      {currentPage > 1 ? (
        <a className="text-brass-700 hover:text-brass-900" href={buildHref(currentPage - 1)}>
          ← Précédent
        </a>
      ) : (
        <span className="text-ink-400">← Précédent</span>
      )}
      {currentPage < totalPages ? (
        <a className="text-brass-700 hover:text-brass-900" href={buildHref(currentPage + 1)}>
          Suivant →
        </a>
      ) : (
        <span className="text-ink-400">Suivant →</span>
      )}
    </span>
  );
}

function quarterLabel(now: Date): string {
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `Q${q} ${now.getFullYear()}`;
}
