import { type SVGProps } from 'react';

/**
 * Plume éditoriale — empty state pour les attributions vides.
 *
 * Une plume d'oie posée en biais, encrier discret en dessous. Évoque
 * l'acte d'attribution comme un geste manuscrit délibéré.
 */
export function PlumeIllustration({
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
      {/* Encrier */}
      <path d="M22 52H42C42 53 41.5 54 40 54H24C22.5 54 22 53 22 52Z" fill="var(--ink-300)" />
      <ellipse cx="32" cy="48" rx="8" ry="2" stroke="var(--ink-500)" strokeWidth="1.5" />
      <path d="M24 48V44" stroke="var(--ink-500)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M40 48V44" stroke="var(--ink-500)" strokeWidth="1.5" strokeLinecap="round" />
      {/* Plume — barbe principale en arc */}
      <path
        d="M48 12C48 12 38 22 30 32C24 39 21 44 22 46"
        stroke="var(--brass-500)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Barbes latérales (lignes courtes) */}
      <path d="M44 16L40 14" stroke="var(--brass-500)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M40 22L34 19" stroke="var(--brass-500)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M36 28L29 25" stroke="var(--brass-500)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M30 34L23 31" stroke="var(--brass-500)" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M26 40L19 38" stroke="var(--brass-500)" strokeWidth="1.5" strokeLinecap="round" />
      {/* Pointe */}
      <circle cx="22" cy="46" r="1.5" fill="var(--brass-500)" />
    </svg>
  );
}
