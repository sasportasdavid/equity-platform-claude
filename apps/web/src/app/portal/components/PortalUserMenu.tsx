'use client';

import { useRouter } from 'next/navigation';
import { LogOut, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { logout } from '@/server/actions/auth';

/**
 * Module 8 — Avatar + dropdown du portail bénéficiaire.
 *
 * Affiche les initiales (fallback si pas de full_name → "U"), avec un
 * dropdown :
 *   - Display name + email (header non cliquable)
 *   - "Mon profil" → /portal/profile
 *   - "Déconnexion" (Server Action logout existant)
 *
 * **Bug "déconnexion ne fait rien" (fix 2026-05-19)** : on ne peut PAS
 * appeler la Server Action `logout()` directement via `void logout()`
 * dans un `onSelect` callback — le `redirect('/login')` interne throw
 * un `NEXT_REDIRECT` qui est swallowed par le `void` et ne déclenche
 * pas la navigation côté browser. Pattern correct = soumettre via
 * `<form action={logout}>` (comme le dashboard layout). Le bouton
 * "Déconnexion" est donc rendu comme un form-submit déguisé en
 * DropdownMenuItem visuel.
 */
export function PortalUserMenu({ fullName, email }: { fullName: string; email: string }) {
  const router = useRouter();
  const initials =
    fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || 'U';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-8 rounded-full"
            aria-label="Menu utilisateur"
            data-testid="portal-user-menu-trigger"
          >
            <span className="bg-primary/10 text-primary inline-flex size-8 items-center justify-center rounded-full text-xs font-medium">
              {initials}
            </span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-[220px]">
        <div className="px-3 py-2">
          <p className="truncate text-sm font-medium">{fullName}</p>
          <p className="text-muted-foreground truncate text-xs">{email}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/portal/profile')} className="gap-2">
          <User className="size-4" />
          Mon profil
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/*
          ⚠️ Le DropdownMenuItem reçoit un `render` prop qui le rend en form
          submit. Le form englobe le bouton et appelle directement la
          Server Action `logout` — pattern identique au dashboard layout.
          Sans ça, `void logout()` swallow le NEXT_REDIRECT throw.
        */}
        <form action={logout} className="contents">
          <DropdownMenuItem
            render={
              <button type="submit" className="gap-2" data-testid="portal-sign-out">
                <LogOut className="size-4" />
                Déconnexion
              </button>
            }
          />
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
