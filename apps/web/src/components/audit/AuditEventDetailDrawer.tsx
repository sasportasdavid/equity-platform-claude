'use client';

import * as React from 'react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AuditDrawerErrorBoundary } from './AuditDrawerErrorBoundary';

/**
 * PR #41 B5 — Drawer slide-in droite 480px pour le détail d'un audit_event.
 *
 * Wrapper Client autour de `DialogPrimitive.Root` (Base UI) pour bénéficier
 * gratuitement de :
 * - focus trap (au mount, 1er focusable)
 * - ESC ferme
 * - aria-modal + role="dialog" sur la popup
 * - portal vers le document body
 * - click backdrop ferme
 *
 * Contrôle l'open state via URL searchParams (`?event=<id>`). Close → on
 * appelle `router.replace` qui retire `event` mais préserve `type` et `page`
 * (filters + pagination de la liste). Pattern identique à beneficiaries-list-
 * client (PR #5/PR Module 4 B3).
 *
 * Le contenu (children) est server-rendered par `page.tsx` (RSC) en passant
 * `<AuditEventDetailContent eventId={...} />` qui fetch + formate le DTO.
 *
 * `prefers-reduced-motion` : respecté via media query CSS dans `globals.css`
 * (`.cw-audit-drawer { animation: none; }` pour les users qui le demandent).
 */

export type AuditEventDetailDrawerProps = {
  /** id de l'event à afficher, ou `null` si fermé. */
  eventId: string | null;
  /** Children = contenu pré-rendu côté server (pas de fetch côté client). */
  children: React.ReactNode;
};

export function AuditEventDetailDrawer({ eventId, children }: AuditEventDetailDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const open = eventId !== null;

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (next) return; // Open géré côté serveur via la présence de `?event=`
      const params = new URLSearchParams(searchParams.toString());
      params.delete('event');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange} modal>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="cw-audit-drawer-backdrop" />
        <DialogPrimitive.Popup
          className="cw-audit-drawer"
          aria-labelledby="audit-drawer-title"
          data-testid="audit-event-detail-drawer"
        >
          <DialogPrimitive.Close
            className="cw-audit-drawer-close"
            aria-label="Fermer le détail"
            data-testid="audit-drawer-close"
          >
            ×
          </DialogPrimitive.Close>
          <AuditDrawerErrorBoundary>{children}</AuditDrawerErrorBoundary>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
