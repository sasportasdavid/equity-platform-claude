'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Calculator,
  FileText,
  LayoutDashboard,
  PieChart,
  Settings as SettingsIcon,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Sidebar de navigation globale du dashboard.
 *
 * Items :
 *  - Tableau de bord (/dashboard)
 *  - Plans (/dashboard/plans) — actif (Module 3a B4)
 *  - Attributions (/dashboard/awards) — actif (Module 3b B3)
 *  - Bénéficiaires (/dashboard/beneficiaries) — actif (Module 4 B3)
 *  - Valorisations (placeholder /dashboard/valuations)
 *  - Cap table (placeholder /dashboard/captable)
 *  - Paramètres (/dashboard/settings)
 *
 * Placeholders restants : pages 404 friendly avec message « Disponible
 * dans un module à venir ».
 *
 * Active state : matché par préfixe (ex : /dashboard/plans/[id] active aussi
 * « Plans »). Exception pour /dashboard exact (sinon tout est actif tout
 * le temps).
 */

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Si fourni, override la logique « match par préfixe ». */
  exact?: boolean;
  /** Tag « Bientôt » pour les placeholders. */
  comingSoon?: boolean;
};

const NAV_ITEMS: ReadonlyArray<NavItem> = [
  {
    href: '/dashboard',
    label: 'Tableau de bord',
    icon: <LayoutDashboard className="size-4" />,
    exact: true,
  },
  { href: '/dashboard/plans', label: 'Plans', icon: <FileText className="size-4" /> },
  { href: '/dashboard/awards', label: 'Attributions', icon: <Users className="size-4" /> },
  { href: '/dashboard/beneficiaries', label: 'Bénéficiaires', icon: <Users className="size-4" /> },
  {
    href: '/dashboard/valuations',
    label: 'Valorisations',
    icon: <Calculator className="size-4" />,
    comingSoon: true,
  },
  {
    href: '/dashboard/captable',
    label: 'Cap table',
    icon: <PieChart className="size-4" />,
    comingSoon: true,
  },
  { href: '/dashboard/settings', label: 'Paramètres', icon: <SettingsIcon className="size-4" /> },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  return (
    <nav
      className="border-border/40 bg-background/40 hidden w-56 shrink-0 border-r lg:block"
      aria-label="Navigation principale"
      data-testid="dashboard-sidebar"
    >
      <ul className="space-y-0.5 p-3">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
                aria-current={isActive ? 'page' : undefined}
                data-testid={`sidebar-link-${item.href.replace(/[^a-z0-9]+/gi, '-')}`}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {item.comingSoon ? (
                  <span className="bg-muted text-muted-foreground rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                    Bientôt
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
