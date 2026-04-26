import Link from 'next/link';
import type { ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { Button } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/rbac';
import { signOutAction } from '@/app/(auth)/login/actions';

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-border/40 bg-background/80 sticky top-0 z-10 flex items-center justify-between border-b px-6 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="bg-primary text-primary-foreground inline-flex size-7 items-center justify-center rounded-md font-mono text-sm font-bold">
              C
            </span>
            <span className="font-semibold tracking-tight">Capiwise</span>
          </Link>
        </div>
        <nav className="flex items-center gap-3">
          <span className="text-muted-foreground hidden text-sm sm:inline" data-testid="user-email">
            {user.email}
          </span>
          <ThemeToggle />
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm" data-testid="sign-out">
              <LogOut className="size-4" />
              <span className="ml-2 hidden sm:inline">Déconnexion</span>
            </Button>
          </form>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
