import Link from 'next/link';
import { PortalNav } from './PortalNav';
import { PortalUserMenu } from './PortalUserMenu';

/**
 * Module 8 — Header du portail bénéficiaire.
 *
 * Layout :
 *   - Logo Capiwise cliquable → /portal/awards
 *   - Nav 3 liens (md+ inline)
 *   - Compteur notifs IN_APP non lues (badge si >0)
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
  return (
    <header className="border-border/40 bg-background/80 sticky top-0 z-10 flex items-center justify-between gap-4 border-b px-4 py-3 backdrop-blur-md sm:px-6">
      <div className="flex items-center gap-3">
        <Link
          href="/portal/awards"
          className="flex items-center gap-2"
          aria-label="Retour à mes attributions"
        >
          <span className="bg-primary text-primary-foreground inline-flex size-7 items-center justify-center rounded-md font-mono text-sm font-bold">
            C
          </span>
          <span className="font-semibold tracking-tight">Capiwise</span>
        </Link>
      </div>

      <PortalNav variant="desktop" />

      <div className="flex items-center gap-2">
        {unreadNotificationCount > 0 ? (
          <span
            className="bg-destructive text-destructive-foreground inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
            aria-label={`${unreadNotificationCount} notification(s) non lue(s)`}
            data-testid="portal-unread-badge"
          >
            {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
          </span>
        ) : null}
        <PortalUserMenu fullName={fullName} email={email} />
      </div>
    </header>
  );
}
