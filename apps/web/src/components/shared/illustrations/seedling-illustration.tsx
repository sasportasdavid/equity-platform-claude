import { type SVGProps } from 'react';

/**
 * Pousse délicate — empty state pour le « premier truc à créer ».
 *
 * ⚠️ Note design : le brief listait « jeune pousse » comme suggestion.
 * J'ai gardé le concept mais en l'éloignant du cliché tech-startup
 * green-thumb : pas de vert (le vert reste réservé à `bond` succès),
 * tout en cuivre + ink, lignes fines, plus proche d'un ornement de
 * manuscrit que d'un emoji 🌱. Si malgré tout l'illustration sort du
 * registre, alternatives suggérées : page liminaire pliée, sceau de
 * cire, ou caractère lettrine.
 */
export function SeedlingIllustration({
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
      {/* Sol — ligne discontinue */}
      <path d="M14 50H50" stroke="var(--ink-300)" strokeWidth="1" strokeDasharray="3 2" />
      {/* Tige principale — courbe élégante en S */}
      <path
        d="M32 50 C 32 40, 30 36, 32 28 C 34 22, 32 16, 32 14"
        stroke="var(--brass-500)"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Feuille gauche — forme géométrique épurée */}
      <path
        d="M32 32 Q 22 28, 18 32 Q 22 36, 32 32"
        stroke="var(--brass-500)"
        strokeWidth="1.5"
        fill="var(--brass-50)"
        strokeLinejoin="round"
      />
      {/* Nervure feuille gauche */}
      <path d="M19 32H30" stroke="var(--brass-700)" strokeWidth="0.75" strokeLinecap="round" />
      {/* Feuille droite — symétrique, plus haute */}
      <path
        d="M32 22 Q 42 18, 46 22 Q 42 26, 32 22"
        stroke="var(--brass-500)"
        strokeWidth="1.5"
        fill="var(--brass-50)"
        strokeLinejoin="round"
      />
      {/* Nervure feuille droite */}
      <path d="M34 22H45" stroke="var(--brass-700)" strokeWidth="0.75" strokeLinecap="round" />
      {/* Pointe sommitale — petit cercle ink */}
      <circle cx="32" cy="14" r="1.5" fill="var(--ink-700)" />
    </svg>
  );
}
