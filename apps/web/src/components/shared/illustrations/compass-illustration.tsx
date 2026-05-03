import { type SVGProps } from 'react';

/**
 * Boussole — empty state pour les listes filtrées sans résultat.
 *
 * Boussole vue de dessus, aiguille cuivre pointant N. Évoque la
 * recherche, l'orientation. Lettres N/S/E/O en mono small.
 */
export function CompassIllustration({
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
      {/* Cadran extérieur */}
      <circle cx="32" cy="32" r="22" stroke="var(--ink-500)" strokeWidth="1.5" />
      {/* Cadran intérieur (subtle) */}
      <circle cx="32" cy="32" r="18" stroke="var(--ink-300)" strokeWidth="1" />
      {/* Tics cardinaux */}
      <path d="M32 12V14" stroke="var(--ink-700)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M32 50V52" stroke="var(--ink-700)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 32H14" stroke="var(--ink-700)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M50 32H52" stroke="var(--ink-700)" strokeWidth="1.5" strokeLinecap="round" />
      {/* Aiguille cuivre — losange pointant N */}
      <path
        d="M32 18L36 32L32 30L28 32L32 18Z"
        fill="var(--brass-500)"
        stroke="var(--brass-700)"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <path
        d="M32 46L36 32L32 34L28 32L32 46Z"
        fill="var(--paper-200)"
        stroke="var(--ink-500)"
        strokeWidth="1"
        strokeLinejoin="round"
      />
      {/* Centre */}
      <circle cx="32" cy="32" r="2" fill="var(--ink-900)" />
      {/* Lettre N en mono */}
      <text
        x="32"
        y="11"
        fontFamily="var(--font-mono), monospace"
        fontSize="7"
        fontWeight="600"
        fill="var(--brass-700)"
        textAnchor="middle"
      >
        N
      </text>
    </svg>
  );
}
