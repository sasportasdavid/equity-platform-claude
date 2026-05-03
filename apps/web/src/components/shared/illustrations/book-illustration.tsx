import { type SVGProps } from 'react';

/**
 * Livre ouvert — empty state pour les plans vides.
 *
 * Livre ouvert vu de face, marque-page cuivre dépassant. Évoque le
 * registre, le grand-livre comptable.
 */
export function BookIllustration({
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
      {/* Reliure centrale */}
      <path d="M32 16V52" stroke="var(--ink-500)" strokeWidth="1.5" strokeLinecap="round" />
      {/* Page gauche */}
      <path
        d="M8 18C8 17 9 16 10 16H32V52H10C9 52 8 51 8 50V18Z"
        stroke="var(--ink-500)"
        strokeWidth="1.5"
        fill="var(--paper-50)"
        strokeLinejoin="round"
      />
      {/* Page droite */}
      <path
        d="M32 16H54C55 16 56 17 56 18V50C56 51 55 52 54 52H32V16Z"
        stroke="var(--ink-500)"
        strokeWidth="1.5"
        fill="var(--paper-50)"
        strokeLinejoin="round"
      />
      {/* Lignes de texte fines */}
      <path d="M14 24H28" stroke="var(--ink-300)" strokeWidth="1" strokeLinecap="round" />
      <path d="M14 28H26" stroke="var(--ink-300)" strokeWidth="1" strokeLinecap="round" />
      <path d="M14 32H28" stroke="var(--ink-300)" strokeWidth="1" strokeLinecap="round" />
      <path d="M14 36H24" stroke="var(--ink-300)" strokeWidth="1" strokeLinecap="round" />
      <path d="M36 24H50" stroke="var(--ink-300)" strokeWidth="1" strokeLinecap="round" />
      <path d="M36 28H48" stroke="var(--ink-300)" strokeWidth="1" strokeLinecap="round" />
      <path d="M36 32H50" stroke="var(--ink-300)" strokeWidth="1" strokeLinecap="round" />
      <path d="M36 36H46" stroke="var(--ink-300)" strokeWidth="1" strokeLinecap="round" />
      {/* Marque-page cuivre dépassant */}
      <path
        d="M44 16V60L48 56L52 60V16"
        stroke="var(--brass-500)"
        strokeWidth="1.5"
        fill="var(--brass-100)"
        strokeLinejoin="round"
      />
    </svg>
  );
}
