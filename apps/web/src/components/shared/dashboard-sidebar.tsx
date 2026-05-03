'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Calculator,
  FileText,
  LayoutDashboard,
  PieChart,
  Settings as SettingsIcon,
  ShieldCheck,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Module Design System V1 — Sidebar éditoriale Capiwise.
 *
 * Refonte visuelle Editorial Finance V1 selon mockup 1 :
 * - Largeur 240px, fond paper-50, pas de bordure droite
 * - Logo : bullet 4px brass-500 + "Capiwise" serif 600 18px ink-900
 * - Sections groupées avec text-overline brass-500
 *   (OPÉRATIONS / ANALYSE / ADMINISTRATION)
 * - Item icône Lucide stroke 1.5 16px + label sans 14
 * - Item actif :
 *   * fond paper-200
 *   * barre verticale 2px brass-500 à gauche
 *   * label ink-900 medium
 *   * **point cuivre 4px à droite du label** (signet de livre,
 *     détail signature)
 * - Hover : bg paper-200/50, transition 100ms
 * - Compteur badge SSR conditionnel **PRÉSERVÉ** (Module 5 B4)
 *
 * **API publique inchangée** — `pendingApprovalsCount` toujours
 * accepté pour ne pas casser le layout dashboard.
 */

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  comingSoon?: boolean;
};

type NavSection = {
  title: string;
  items: ReadonlyArray<NavItem>;
};

const NAV_SECTIONS: ReadonlyArray<NavSection> = [
  {
    title: 'Opérations',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
      { href: '/dashboard/plans', label: 'Plans', icon: FileText },
      { href: '/dashboard/awards', label: 'Attributions', icon: Users },
      { href: '/dashboard/beneficiaries', label: 'Bénéficiaires', icon: Users },
      { href: '/dashboard/captable', label: 'Cap Table', icon: PieChart, comingSoon: true },
    ],
  },
  {
    title: 'Analyse',
    items: [
      { href: '/dashboard/valuations', label: 'Valorisations', icon: Calculator, comingSoon: true },
      { href: '/dashboard/approvals', label: 'Approbations', icon: ShieldCheck },
      { href: '/dashboard/exercises', label: 'Exercices', icon: TrendingUp },
    ],
  },
  {
    title: 'Administration',
    items: [{ href: '/dashboard/settings', label: 'Paramètres', icon: SettingsIcon }],
  },
];

export function DashboardSidebar({
  pendingApprovalsCount = 0,
}: {
  /** Module 5 B4 — badge "Approbations (N)" si > 0. */
  pendingApprovalsCount?: number;
}) {
  const pathname = usePathname();

  return (
    <nav
      className="bg-paper-50 hidden w-60 shrink-0 lg:block"
      aria-label="Navigation principale"
      data-testid="dashboard-sidebar"
    >
      <div className="flex h-full flex-col p-4">
        {/* Logo Editorial Finance — bullet brass + serif Capiwise */}
        <Link href="/dashboard" className="mb-6 flex items-center gap-2 px-2" aria-label="Capiwise">
          <span className="bg-brass-500 inline-block size-1 rounded-full" aria-hidden="true" />
          <span className="text-ink-900 font-serif text-lg font-semibold tracking-tight">
            Capiwise
          </span>
        </Link>

        {/* Sections groupées */}
        <div className="flex-1 space-y-6 overflow-y-auto">
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="text-overline text-brass-500 mb-1 px-3">{section.title}</p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = item.exact
                    ? pathname === item.href
                    : pathname === item.href || pathname.startsWith(item.href + '/');
                  const Icon = item.icon;
                  const showApprovalsBadge =
                    item.href === '/dashboard/approvals' && pendingApprovalsCount > 0;

                  return (
                    <li key={item.href} className="relative">
                      {/* Barre verticale active 2px brass-500 */}
                      {isActive ? (
                        <span
                          className="bg-brass-500 absolute bottom-1 left-0 top-1 w-[2px] rounded-r"
                          aria-hidden="true"
                        />
                      ) : null}
                      <Link
                        href={item.href}
                        className={cn(
                          'group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-100',
                          isActive
                            ? 'bg-paper-200 text-ink-900 font-medium'
                            : 'text-ink-500 hover:bg-paper-200/50 hover:text-ink-900',
                        )}
                        aria-current={isActive ? 'page' : undefined}
                        data-testid={`sidebar-link-${item.href.replace(/[^a-z0-9]+/gi, '-')}`}
                      >
                        <Icon
                          className={cn(
                            'size-4 shrink-0',
                            isActive ? 'text-brass-700' : 'text-ink-400 group-hover:text-ink-700',
                          )}
                          strokeWidth={1.5}
                        />
                        <span className="flex-1 truncate">{item.label}</span>

                        {/* Badge compteur approvals (préservé Module 5 B4) */}
                        {showApprovalsBadge ? (
                          <span
                            className="bg-title-500 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[10px] font-semibold tabular-nums text-white"
                            data-testid="sidebar-approvals-badge"
                          >
                            {pendingApprovalsCount}
                          </span>
                        ) : null}

                        {/* Tag "Bientôt" pour placeholders */}
                        {item.comingSoon ? (
                          <span className="bg-paper-300 text-ink-500 rounded-sm px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider">
                            Bientôt
                          </span>
                        ) : null}

                        {/* Point cuivre signet — détail signature (item actif uniquement) */}
                        {isActive && !showApprovalsBadge && !item.comingSoon ? (
                          <span
                            className="bg-brass-500 inline-block size-1 shrink-0 rounded-full"
                            aria-hidden="true"
                            data-testid="sidebar-active-bookmark"
                          />
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}
