import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogOut, Settings } from 'lucide-react';
import { DashboardSidebar } from '@/components/shared/dashboard-sidebar';
import { OrgSwitcherCard } from '@/components/shared/org-switcher-card';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { Button, buttonVariants } from '@/components/ui/button';
import { hasPermission, requireUser } from '@/lib/auth/rbac';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getMyPendingApprovalsCount } from '@/server/queries/approvals';
import { getSidebarCounts, type SidebarCounts } from '@/server/queries/sidebar-counts';
import { logout } from '@/server/actions/auth';
import { cn } from '@/lib/utils';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  // Charge le nom de l'org active pour l'afficher dans le switcher (server-side
  // pour éviter un flash "Organisation" → "Capiwise" côté client).
  let activeOrgName: string | null = null;
  if (user.activeOrgId) {
    const admin = getSupabaseAdminClient();
    const { data: org } = await admin
      .from('organizations')
      .select('name')
      .eq('id', user.activeOrgId)
      .single();
    activeOrgName = org?.name ?? null;
  }

  // Module 5 B4 — badge "Approbations (N)" sur la sidebar.
  // Ne charge le count que si user a la perm approvals.act (sinon le lien
  // n'est pas critique pour ce rôle).
  let pendingApprovalsCount = 0;
  if (user.id && (await hasPermission('approvals.act'))) {
    pendingApprovalsCount = await getMyPendingApprovalsCount(user.id);
  }

  // PR #35 B2 — counters dynamiques sidebar (Plans / Bénéficiaires / Attributions).
  // Cache 60s par org via unstable_cache. Skip si pre-onboarding (pas d'orgId).
  let sidebarCounts: SidebarCounts | null = null;
  if (user.activeOrgId) {
    sidebarCounts = await getSidebarCounts(user.activeOrgId);
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-border/40 bg-background/80 sticky top-0 z-10 flex items-center justify-between border-b px-6 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="bg-primary text-primary-foreground inline-flex size-7 items-center justify-center rounded-md font-mono text-sm font-bold">
              C
            </span>
            <span className="font-semibold tracking-tight">Capiwise</span>
          </Link>
          {activeOrgName ? (
            <>
              <span className="text-muted-foreground/40 hidden sm:inline">/</span>
              <span
                className="text-muted-foreground hidden text-sm sm:inline"
                data-testid="org-name-static"
              >
                {activeOrgName}
              </span>
            </>
          ) : null}
        </div>
        <nav className="flex items-center gap-3">
          <span className="text-muted-foreground hidden text-sm sm:inline" data-testid="user-email">
            {user.email}
          </span>
          <Link
            href="/dashboard/settings"
            className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
            aria-label="Paramètres"
          >
            <Settings className="size-4" />
          </Link>
          <ThemeToggle />
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm" data-testid="sign-out">
              <LogOut className="size-4" />
              <span className="ml-2 hidden sm:inline">Déconnexion</span>
            </Button>
          </form>
        </nav>
      </header>
      <div className="flex flex-1">
        <DashboardSidebar
          pendingApprovalsCount={pendingApprovalsCount}
          counts={sidebarCounts}
          footerSlot={
            <OrgSwitcherCard
              activeOrgId={user.activeOrgId}
              activeOrgName={activeOrgName}
              beneficiariesCount={sidebarCounts?.beneficiaries ?? null}
            />
          }
        />
        <main className="min-w-0 flex-1 px-6 py-10 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
