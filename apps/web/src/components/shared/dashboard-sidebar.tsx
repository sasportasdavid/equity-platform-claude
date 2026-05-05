'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Calculator,
  FileBarChart2,
  FileText,
  LayoutDashboard,
  PieChart,
  ScrollText,
  Settings as SettingsIcon,
  ShieldCheck,
  TrendingUp,
  UserSquare2,
  Users,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Module Design System V1c — Sidebar éditoriale Capiwise (PR #35).
 *
 * Refonte visuelle Editorial Finance V1c selon mockup Capiwise (page 1) :
 * - Largeur 240px, fond paper-50, pas de bordure droite
 * - Overline contextuel global "Plateforme admin · CFO & équipe Equity"
 *   (mono uppercase 11 brass-500 tracking-wide) au-dessus du logo
 * - Logo : bullet 4px brass-500 + "Capiwise" serif 600 18px ink-900
 * - Sections groupées avec text-overline brass-500
 *   (OPÉRATIONS / ANALYSE / ADMINISTRATION)
 * - Item icône Lucide stroke 1.5 16px + label sans 14
 * - Item actif : barre 2px brass-500 gauche + bg paper-200 + signet
 *   point cuivre 4px droite du label
 * - Item disabled : opacity-50 cursor-not-allowed + tag "Bientôt" + tooltip
 *   natif "Bientôt disponible" + aria-disabled="true" — pas de navigation
 * - Counter dynamique mono tabular ink-500 12px à droite des Plans /
 *   Bénéficiaires / Attributions (Module 12.5+ — passé en prop counts)
 * - Hover : bg paper-200/50, transition 100ms
 * - Compteur badge SSR conditionnel **PRÉSERVÉ** (Module 5 B4 — approvals)
 */

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /**
   * Si défini : item disabled (page non livrée). Rend un `<span>` opacity-50
   * + `aria-disabled` + tooltip natif "Bientôt disponible". Pas de navigation.
   */
  disabled?: boolean;
  /** Clé pour récupérer le counter dynamique dans `counts`. */
  countKey?: 'plans' | 'beneficiaries' | 'awards';
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
      { href: '/dashboard/plans', label: 'Plans', icon: FileText, countKey: 'plans' },
      {
        href: '/dashboard/beneficiaries',
        label: 'Bénéficiaires',
        icon: UserSquare2,
        countKey: 'beneficiaries',
      },
      { href: '/dashboard/captable', label: 'Cap Table', icon: PieChart },
      { href: '/dashboard/awards', label: 'Attributions', icon: Users, countKey: 'awards' },
    ],
  },
  {
    title: 'Analyse',
    items: [
      { href: '/dashboard/valuations', label: 'Valorisation IFRS 2', icon: Calculator },
      { href: '/dashboard/approvals', label: 'Approbations', icon: ShieldCheck },
      { href: '/dashboard/exercises', label: 'Exercices', icon: TrendingUp },
      // Module 13 — pas livré V1 (cf docs/MODULE_13_AUDIT_TRAIL.md untracked)
      { href: '/dashboard/audit-trail', label: 'Audit trail', icon: ScrollText, disabled: true },
      { href: '/dashboard/reports', label: 'Rapports', icon: FileBarChart2, disabled: true },
    ],
  },
  {
    title: 'Administration',
    items: [
      // Workflows page non livrée — la conf workflows existe sous /settings/approvals
      // mais le mockup demande un item top-level dédié.
      { href: '/dashboard/workflows', label: 'Workflows', icon: Workflow, disabled: true },
      { href: '/dashboard/settings', label: 'Paramètres', icon: SettingsIcon },
    ],
  },
];

export type SidebarCounts = {
  plans: number;
  beneficiaries: number;
  awards: number;
};

export function DashboardSidebar({
  pendingApprovalsCount = 0,
  counts = null,
  footerSlot = null,
}: {
  /** Module 5 B4 — badge "Approbations (N)" si > 0. */
  pendingApprovalsCount?: number;
  /** Module 12.5+ PR #35 B2 — counters dynamiques Plans/Bénéficiaires/Attributions. */
  counts?: SidebarCounts | null;
  /** Module 12.5+ PR #35 B3 — slot footer (OrgSwitcherCard injecté depuis le RSC layout). */
  footerSlot?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <nav
      className="bg-paper-50 hidden w-60 shrink-0 lg:block"
      aria-label="Navigation principale"
      data-testid="dashboard-sidebar"
    >
      <div className="flex h-full flex-col p-4">
        {/* Overline contextuel global */}
        <p
          className="text-overline text-brass-500 mb-2 px-2 font-mono"
          data-testid="sidebar-context-overline"
        >
          Plateforme admin · CFO &amp; équipe Equity
        </p>

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
              <p className="text-overline text-brass-500 mb-1 px-3 font-mono">{section.title}</p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive =
                    !item.disabled &&
                    (item.exact
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(item.href + '/'));
                  const Icon = item.icon;
                  const showApprovalsBadge =
                    item.href === '/dashboard/approvals' && pendingApprovalsCount > 0;
                  const counter = item.countKey && counts ? counts[item.countKey] : null;
                  const showCounter =
                    counter !== null && counter !== undefined && !showApprovalsBadge;

                  // Item disabled — rend un <span> au lieu d'un <Link>, pas de navigation.
                  if (item.disabled) {
                    return (
                      <li key={item.href} className="relative">
                        <span
                          className="text-ink-400 group flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-2 text-sm opacity-60"
                          aria-disabled="true"
                          title="Bientôt disponible"
                          data-testid={`sidebar-link-${item.href.replace(/[^a-z0-9]+/gi, '-')}`}
                        >
                          <Icon className="size-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                          <span className="flex-1 truncate">{item.label}</span>
                          <span className="bg-paper-300 text-ink-500 rounded-sm px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider">
                            Bientôt
                          </span>
                        </span>
                      </li>
                    );
                  }

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

                        {/* Counter dynamique Plans / Bénéficiaires / Attributions */}
                        {showCounter ? (
                          <span
                            className="text-ink-500 font-mono text-xs tabular-nums"
                            data-testid={`sidebar-count-${item.countKey}`}
                            aria-label={`${counter} ${item.label.toLowerCase()} actifs`}
                          >
                            {counter}
                          </span>
                        ) : null}

                        {/* Badge compteur approvals (préservé Module 5 B4) */}
                        {showApprovalsBadge ? (
                          <span
                            className="bg-title-500 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[10px] font-semibold tabular-nums text-white"
                            data-testid="sidebar-approvals-badge"
                            aria-label={`${pendingApprovalsCount} approbations en attente`}
                          >
                            {pendingApprovalsCount}
                          </span>
                        ) : null}

                        {/* Point cuivre signet — détail signature (item actif uniquement) */}
                        {isActive && !showApprovalsBadge && !showCounter ? (
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

        {/* Slot footer (OrgSwitcherCard injecté en B3) */}
        {footerSlot ? (
          <div className="border-paper-200 mt-4 border-t pt-3">{footerSlot}</div>
        ) : null}
      </div>
    </nav>
  );
}
