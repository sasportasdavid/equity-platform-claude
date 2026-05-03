import { type SVGProps } from 'react';

/**
 * Coffre-fort — empty state pour les documents vides.
 *
 * Porte de coffre-fort vue de face, mécanisme cuivre, charnières
 * discrètes. Évoque la sécurité documentaire, l'archivage notarié.
 */
export function VaultIllustration({
  size = 64,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      {/* Cadre extérieur du coffre */}
      <rect
        x="10"
        y="10"
        width="44"
        height="44"
        rx="2"
        stroke="var(--ink-500)"
        strokeWidth="1.5"
        fill="var(--paper-200)"
      />
      {/* Porte intérieure */}
      <rect
        x="14"
        y="14"
        width="36"
        height="36"
        rx="1"
        stroke="var(--ink-700)"
        strokeWidth="1.5"
        fill="var(--paper-50)"
      />
      {/* Charnières (3 points discrets) */}
      <circle cx="11.5" cy="18" r="1" fill="var(--ink-500)" />
      <circle cx="11.5" cy="32" r="1" fill="var(--ink-500)" />
      <circle cx="11.5" cy="46" r="1" fill="var(--ink-500)" />
      {/* Mécanisme circulaire central — cuivre */}
      <circle
        cx="32"
        cy="32"
        r="9"
        stroke="var(--brass-500)"
        strokeWidth="1.5"
        fill="var(--brass-50)"
      />
      <circle cx="32" cy="32" r="5" stroke="var(--brass-700)" strokeWidth="1.5" fill="none" />
      <circle cx="32" cy="32" r="1" fill="var(--brass-700)" />
      {/* Branches du volant — 4 directions */}
      <path d="M32 19V23" stroke="var(--brass-500)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M32 41V45" stroke="var(--brass-500)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M19 32H23" stroke="var(--brass-500)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M41 32H45" stroke="var(--brass-500)" strokeWidth="1.5" strokeLinecap="round" />
      {/* Poignée latérale */}
      <rect x="46" y="30" width="3" height="4" rx="0.5" fill="var(--brass-500)" />
    </svg>
  );
}
