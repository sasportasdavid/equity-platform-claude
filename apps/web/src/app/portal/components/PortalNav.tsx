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
 * Module 8 — Navigation principale du portail bénéficiaire (3 liens).
 *
 * Variante :
 *   - `desktop` : nav inline horizontale dans le header (md+).
 *   - `mobile`  : bottom-bar fixée (md:hidden).
 */
export function PortalNav({ variant = 'desktop' }: { variant?: 'desktop' | 'mobile' }) {
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  if (variant === 'mobile') {
    return (
      <nav
        className="border-border/40 bg-background/95 fixed bottom-0 left-0 right-0 z-20 flex items-center justify-around border-t px-2 py-2 backdrop-blur-md md:hidden"
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
                'flex flex-1 flex-col items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors',
                active ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground',
              )}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="size-5" />
              <span>{item.label}</span>
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
              'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
              active
                ? 'text-primary bg-primary/10 font-medium'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className="size-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
