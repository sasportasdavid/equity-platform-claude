'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Theme toggle Editorial Finance V1 — 3 options.
 *
 * - Light : palette Paper (crème papier #FAF8F3)
 * - Dark : palette Midnight (#0E1525, ink crème inversé)
 * - System : suit le `prefers-color-scheme` de l'OS
 *
 * Persistance via `next-themes` (cookie + localStorage).
 *
 * SSR-safe : ne render rien tant que `mounted` n'est pas vrai (évite
 * un mismatch hydration entre server-rendered light et client).
 */
export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Thème" disabled>
        <Sun className="size-4" strokeWidth={1.5} />
      </Button>
    );
  }

  const Icon = theme === 'system' ? Monitor : resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Choisir le thème"
            data-testid="theme-toggle-trigger"
          >
            <Icon className="size-4" strokeWidth={1.5} />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-[140px]">
        <DropdownMenuItem
          onSelect={() => setTheme('light')}
          className="gap-2"
          data-active={theme === 'light' ? 'true' : undefined}
        >
          <Sun className="size-4" strokeWidth={1.5} />
          Clair
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => setTheme('dark')}
          className="gap-2"
          data-active={theme === 'dark' ? 'true' : undefined}
        >
          <Moon className="size-4" strokeWidth={1.5} />
          Sombre
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => setTheme('system')}
          className="gap-2"
          data-active={theme === 'system' ? 'true' : undefined}
        >
          <Monitor className="size-4" strokeWidth={1.5} />
          Système
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
