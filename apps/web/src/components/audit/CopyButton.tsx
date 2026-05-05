'use client';

import * as React from 'react';

/**
 * PR #41 B5 — Bouton client minimal pour copier un texte (hash SHA-256
 * complet) dans le presse-papiers. Utilise `navigator.clipboard.writeText()`
 * (browser-only). Affiche un feedback visuel "Copié ✓" pendant 1.6s.
 *
 * Extrait en composant client dédié car le HashVerificationBlock parent est
 * server (re-compute du hash côté server, plus sécure que côté client).
 */

export type CopyButtonProps = {
  /** Texte à copier au click. */
  value: string;
  /** Label visuel par défaut. */
  label?: string;
  /** Aria-label complet (override). */
  ariaLabel?: string;
};

export function CopyButton({
  value,
  label = 'Copier',
  ariaLabel = "Copier l'empreinte cryptographique",
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function handleClick() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard API peut être bloquée (iframe sandbox sans
      // allow-clipboard-write, contexte non-secure). Pas de toast V1.5,
      // l'utilisateur peut sélectionner le hash manuellement (pas
      // user-select: none sur le bloc).
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="cw-audit-hash-copy"
      aria-label={ariaLabel}
      data-testid="audit-drawer-copy"
    >
      {copied ? 'Copié ✓' : label}
    </button>
  );
}
