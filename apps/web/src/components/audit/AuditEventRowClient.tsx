'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * PR #41 B6 — Wrapper client autour d'une row d'audit pour ouvrir le drawer
 * détail au click. Le rendering du contenu (verbalize + hash) reste server :
 * `<AuditEventRowClient>` enveloppe juste `<article>` avec onClick.
 *
 * URL state : ajoute `?event=<id>` aux searchParams existants (préserve
 * `type` + `page`) et `router.replace` (pas push — pas de spam historique
 * quand l'user clique plusieurs events).
 *
 * a11y : `role="button" tabIndex={0}` + Enter/Space déclenchent l'ouverture.
 * Note : on garde `<article role="listitem">` sémantique (la liste audit est
 * une `<ol>`), donc on duplique le rôle button via `aria-label` au lieu de
 * `role="button"` (interdirait listitem) — c'est `data-clickable=true` qui
 * porte le cursor:pointer + focus-visible CSS.
 */

export type AuditEventRowClientProps = {
  eventId: string;
  ariaLabel: string;
  children: React.ReactNode;
};

export function AuditEventRowClient({ eventId, ariaLabel, children }: AuditEventRowClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const open = React.useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('event', eventId);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [eventId, pathname, router, searchParams]);

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    },
    [open],
  );

  return (
    <div
      onClick={open}
      onKeyDown={onKeyDown}
      tabIndex={0}
      role="button"
      aria-label={ariaLabel}
      data-testid="audit-event-row-clickable"
      className="cw-audit-event-clickable"
    >
      {children}
    </div>
  );
}
