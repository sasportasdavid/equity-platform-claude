'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, FileText, User } from 'lucide-react';
import { cn } from '@/lib/utils';

const PORTAL_NAV_ITEMS = [
  { href: '/portal/awards', label: 'Mes attributions', icon: Briefcase },
  { href: '/portal/documents', label: 'Documents', icon: FileText },
  { href: '/portal/profile', label: 'Profil', icon: User },
] as const;

/**
 * Module 8 + Étape 14 Design System V1 — Navigation du portail (3 liens).
 *
 * Variantes :
 *   - `desktop` : nav inline horizontale dans le header (md+).
 *     L'item actif a un fond brass-100 + barre verticale brass-500
 *     côté gauche (signature DS V1, cohérent avec la sidebar dashboard).
 *   - `mobile`  : bottom-bar fixée (md:hidden).
 *     L'item actif a un dot brass-500 sous l'icône (espace réduit).
 */
export function PortalNav({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  if (variant === 'mobile') {
    return (
      <nav
        className="border-paper-300 bg-paper-50/95 fixed bottom-0 left-0 right-0 z-20 flex items-center justify-around border-t px-2 py-2 backdrop-blur-md md:hidden"
        aria-label="Navigation portail (mobile)"
      >
        {PORTAL_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex flex-1 flex-col items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors',
                active ? 'text-brass-700 font-medium' : 'text-ink-500 hover:text-ink-900',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="size-5" strokeWidth={active ? 1.75 : 1.5} />
              <span>{item.label}</span>
              {active ? (
                <span
                  aria-hidden="true"
                  className="bg-brass-500 absolute -top-0.5 size-1 rounded-full"
                />
              ) : null}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="hidden items-center gap-1 md:flex" aria-label="Navigation portail (desktop)">
      {PORTAL_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'relative flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
              active
                ? 'bg-brass-100 text-brass-700 font-medium'
                : 'text-ink-500 hover:bg-paper-200 hover:text-ink-900',
            )}
            aria-current={active ? 'page' : undefined}
          >
            {active ? (
              <span
                aria-hidden="true"
                className="bg-brass-500 absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r"
              />
            ) : null}
            <Icon className="size-4" strokeWidth={1.5} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
