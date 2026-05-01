'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Building2, ShieldCheck, User, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Item = {
  href: string;
  label: string;
  icon: ReactNode;
};

const ITEMS: Item[] = [
  { href: '/dashboard/settings/profile', label: 'Profil', icon: <User className="size-4" /> },
  {
    href: '/dashboard/settings/members',
    label: 'Membres',
    icon: <Users className="size-4" />,
  },
  {
    href: '/dashboard/settings/organization',
    label: 'Organisation',
    icon: <Building2 className="size-4" />,
  },
  {
    href: '/dashboard/settings/approvals',
    label: 'Approbations',
    icon: <ShieldCheck className="size-4" />,
  },
  {
    href: '/dashboard/settings/notifications',
    label: 'Notifications',
    icon: <Bell className="size-4" />,
  },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'hover:bg-muted/60 flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
              active && 'bg-muted text-foreground font-medium',
              !active && 'text-muted-foreground',
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
