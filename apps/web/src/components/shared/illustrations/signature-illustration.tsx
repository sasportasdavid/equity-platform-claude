import { type SVGProps } from 'react';

/**
 * Paraphe — empty state pour les signatures vides.
 *
 * Trait de paraphe ondulé serif, façon écriture italique notariale.
 * Sous-ligne fine évoque la ligne de signature sur un acte officiel.
 */
export function SignatureIllustration({
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
      {/* Paraphe ondulé principal */}
      <path
        d="M10 32 C 14 26, 18 26, 22 32 C 26 38, 30 38, 32 32 C 34 28, 38 28, 42 34 C 46 40, 52 40, 54 34"
        stroke="var(--brass-500)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      {/* Boucle finale */}
      <path
        d="M 50 28 C 54 30, 56 36, 52 38 C 50 39, 48 38, 48 36"
        stroke="var(--brass-500)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      {/* Trait final qui descend en italique */}
      <path d="M52 38L48 50" stroke="var(--brass-500)" strokeWidth="2" strokeLinecap="round" />
      {/* Ligne de signature en dessous */}
      <path d="M8 52H56" stroke="var(--ink-300)" strokeWidth="1" strokeDasharray="2 2" />
      {/* Petit "X" indiquant la zone signature (subtil) */}
      <path d="M10 48L14 52" stroke="var(--ink-300)" strokeWidth="1" />
      <path d="M14 48L10 52" stroke="var(--ink-300)" strokeWidth="1" />
    </svg>
  );
}
