import { type SVGProps } from 'react';

/**
 * Balance — empty state pour les contrôles de conformité vides.
 *
 * Balance romaine vue de face, deux plateaux équilibrés. Évoque la
 * justice, la conformité réglementaire (article 163 bis G, etc.).
 */
export function ScalesIllustration({
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
      {/* Mât central */}
      <path d="M32 14V52" stroke="var(--ink-700)" strokeWidth="1.5" strokeLinecap="round" />
      {/* Pommeau central — cuivre */}
      <circle cx="32" cy="14" r="2" fill="var(--brass-500)" />
      {/* Fléau horizontal */}
      <path d="M14 22H50" stroke="var(--ink-700)" strokeWidth="1.5" strokeLinecap="round" />
      {/* Suspentes plateaux gauche */}
      <path d="M14 22L12 30" stroke="var(--ink-500)" strokeWidth="1" strokeLinecap="round" />
      <path d="M14 22L20 30" stroke="var(--ink-500)" strokeWidth="1" strokeLinecap="round" />
      {/* Suspentes plateaux droit */}
      <path d="M50 22L44 30" stroke="var(--ink-500)" strokeWidth="1" strokeLinecap="round" />
      <path d="M50 22L52 30" stroke="var(--ink-500)" strokeWidth="1" strokeLinecap="round" />
      {/* Plateau gauche */}
      <path
        d="M8 30 Q 16 36, 24 30"
        stroke="var(--brass-500)"
        strokeWidth="1.5"
        fill="var(--brass-100)"
        strokeLinejoin="round"
      />
      <path d="M8 30H24" stroke="var(--brass-500)" strokeWidth="1.5" />
      {/* Plateau droit */}
      <path
        d="M40 30 Q 48 36, 56 30"
        stroke="var(--brass-500)"
        strokeWidth="1.5"
        fill="var(--brass-100)"
        strokeLinejoin="round"
      />
      <path d="M40 30H56" stroke="var(--brass-500)" strokeWidth="1.5" />
      {/* Socle */}
      <rect x="22" y="50" width="20" height="4" rx="0.5" fill="var(--ink-500)" />
      <rect x="20" y="54" width="24" height="2" rx="0.5" fill="var(--ink-700)" />
    </svg>
  );
}
