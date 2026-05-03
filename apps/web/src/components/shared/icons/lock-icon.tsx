import { type SVGProps } from 'react';

/**
 * Cadenas custom Editorial Finance V1 — pas Lucide, notre maison.
 *
 * Stroke 1.5 par défaut (cohérent avec toutes les icônes du DS V1).
 * Utilisé par StatusBadge variant `lock` (composant 5.5).
 *
 * Forme : pas un cadenas générique. Légèrement plus haut, anse plus
 * fine, corps avec un trou de serrure subtil. Évoque un sceau notarié
 * plus qu'un padlock SaaS.
 */
export function LockIcon({
  size = 16,
  strokeWidth = 1.5,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      {/* Anse */}
      <path
        d="M5.5 7V4.5C5.5 3.11929 6.61929 2 8 2C9.38071 2 10.5 3.11929 10.5 4.5V7"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      {/* Corps */}
      <rect
        x="3.5"
        y="7"
        width="9"
        height="7"
        rx="1.25"
        stroke="currentColor"
        strokeWidth={strokeWidth}
      />
      {/* Trou de serrure (point + tige) */}
      <circle cx="8" cy="10" r="0.75" fill="currentColor" />
      <path d="M8 10.75V12" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}
