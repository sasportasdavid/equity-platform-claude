import { type SVGProps } from 'react';

/**
 * Phare — empty state pour les erreurs / accès refusés.
 *
 * Phare stylisé minimaliste, faisceau lumineux subtil. Évoque le
 * repère, l'orientation après une erreur (« vous êtes désorienté,
 * voici où retrouver le chemin »).
 */
export function LighthouseIllustration({
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
      {/* Faisceaux lumineux — 3 rayons cuivre opacités décroissantes */}
      <path
        d="M28 22L8 16"
        stroke="var(--brass-500)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M28 22L8 22"
        stroke="var(--brass-500)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.3"
      />
      <path
        d="M28 22L8 28"
        stroke="var(--brass-500)"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.5"
      />
      {/* Toit triangulaire */}
      <path
        d="M26 14L32 8L38 14"
        stroke="var(--ink-700)"
        strokeWidth="1.5"
        fill="var(--paper-200)"
        strokeLinejoin="round"
      />
      {/* Lanterne — partie supérieure cuivre */}
      <rect
        x="26"
        y="14"
        width="12"
        height="8"
        rx="0.5"
        stroke="var(--brass-700)"
        strokeWidth="1.5"
        fill="var(--brass-100)"
      />
      {/* Source lumineuse centrale */}
      <circle cx="32" cy="18" r="2" fill="var(--brass-500)" />
      {/* Garde-corps */}
      <path d="M24 22H40" stroke="var(--ink-700)" strokeWidth="1.5" strokeLinecap="round" />
      {/* Tour — corps trapézoïdal */}
      <path
        d="M26 22 L 24 50 L 40 50 L 38 22"
        stroke="var(--ink-500)"
        strokeWidth="1.5"
        fill="var(--paper-50)"
        strokeLinejoin="round"
      />
      {/* Bandes horizontales */}
      <path d="M25 30H39" stroke="var(--brass-500)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M24.5 38H39.5" stroke="var(--brass-500)" strokeWidth="1.5" strokeLinecap="round" />
      {/* Porte d'entrée */}
      <path d="M30 50V44H34V50" stroke="var(--ink-700)" strokeWidth="1.5" fill="var(--ink-300)" />
      {/* Sol / mer stylisée */}
      <path d="M14 52 Q 24 50, 32 52 T 50 52" stroke="var(--ink-300)" strokeWidth="1" fill="none" />
      <path d="M10 56 Q 22 54, 32 56 T 54 56" stroke="var(--ink-300)" strokeWidth="1" fill="none" />
    </svg>
  );
}
