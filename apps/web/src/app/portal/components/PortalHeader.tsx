import Link from 'next/link';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { PortalNav } from './PortalNav';
import { PortalUserMenu } from './PortalUserMenu';

/**
 * Module 8 + Étape 14 Design System V1 — Header du portail bénéficiaire.
 *
 * Layout editorial :
 *   - Logo Capiwise cliquable → /portal/awards
 *   - Nav 3 liens (md+ inline)
 *   - Compteur notifs IN_APP non lues (badge brass si >0, title si >5)
 *   - Avatar dropdown (initiales + menu)
 *
 * Le bottom-bar mobile est dans `PortalNav variant="mobile"` (rendu
 * directement par le layout, sous le main).
 */
export function PortalHeader({
  fullName,
  email,
  unreadNotificationCount,
}: {
  fullName: string;
  email: string;
  unreadNotificationCount: number;
}) {
  const isHighCount = unreadNotificationCount > 5;
  return (
    <header className="border-paper-300 bg-paper-50/90 sticky top-0 z-10 flex items-center justify-between gap-4 border-b px-4 py-3 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-3">
        <Link
          href="/portal/awards"
          className="flex items-center gap-2"
          aria-label="Retour à mes attributions"
        >
          <span className="bg-brass-500 text-paper-50 inline-flex size-7 items-center justify-center rounded-md font-mono text-sm font-bold">
            C
          </span>
          <span className="text-ink-900 font-semibold tracking-tight">Capiwise</span>
          <span className="text-overline text-ink-500 ml-2 hidden sm:inline">PORTAIL</span>
        </Link>
      </div>

      <PortalNav variant="desktop" />

      <div className="flex items-center gap-3">
        {unreadNotificationCount > 0 ? (
          <span
            className={
              isHighCount
                ? 'bg-title-500 text-paper-50 inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums'
                : 'bg-brass-500 text-paper-50 inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums'
            }
            aria-label={`${unreadNotificationCount} notification(s) non lue(s)`}
            data-testid="portal-unread-badge"
          >
            {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
          </span>
        ) : null}
        <ThemeToggle />
        <PortalUserMenu fullName={fullName} email={email} />
      </div>
    </header>
  );
}
