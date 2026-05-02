import { type SVGProps } from 'react';

/**
 * Lettrine ornée — empty state pour le « premier truc à créer »
 * (onboarding initial de l'utilisateur, première organisation, premier
 * plan).
 *
 * Capitale « C » serif Fraunces dans un cadre cuivre orné, façon
 * manuscrit médiéval / livre comptable du XIXᵉ. Évoque l'ouverture
 * d'un chapitre — la métaphore éditoriale juste pour démarrer son
 * histoire d'equity.
 *
 * @design Cette illustration remplace la « jeune pousse » (seedling)
 * du brief initial, intentionnellement écartée pour deux raisons :
 *
 * 1. Le vert reste réservé sémantiquement à `bond-500` (succès,
 *    vesting acquis). Une feuille ornementale verte aurait dilué
 *    la lecture sémantique.
 * 2. La jeune pousse, même cuivre, garde une connotation
 *    tech-startup que l'identité Editorial Finance évite.
 *
 * @alternatives Si la lettrine sort encore du registre lors d'un
 * prochain ajustement, suggestions documentées :
 * - **Page liminaire pliée** : un manuscrit vierge à demi-replié,
 *   évoquant le contrat à signer.
 * - **Sceau de cire** : un cachet officiel qui n'a pas encore
 *   marqué la page (cuivre étoilé sur fond crème).
 * - **Filigrane** : un motif décoratif type marque d'eau
 *   (filet brass entrelacé), sans figuration.
 */
export function LettrineIllustration({
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
      {/* Coin haut-gauche — volute brass */}
      <path
        d="M 6 12 Q 8 8, 12 6 M 12 6 Q 14 8, 14 12 M 6 12 Q 10 12, 12 10"
        stroke="var(--brass-500)"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Coin haut-droit */}
      <path
        d="M 58 12 Q 56 8, 52 6 M 52 6 Q 50 8, 50 12 M 58 12 Q 54 12, 52 10"
        stroke="var(--brass-500)"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Coin bas-gauche */}
      <path
        d="M 6 52 Q 8 56, 12 58 M 12 58 Q 14 56, 14 52 M 6 52 Q 10 52, 12 54"
        stroke="var(--brass-500)"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Coin bas-droit */}
      <path
        d="M 58 52 Q 56 56, 52 58 M 52 58 Q 50 56, 50 52 M 58 52 Q 54 52, 52 54"
        stroke="var(--brass-500)"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />

      {/* Filets entre les coins (4 lignes décoratives très fines) */}
      <path d="M 16 7 L 48 7" stroke="var(--brass-300)" strokeWidth="1" />
      <path d="M 16 57 L 48 57" stroke="var(--brass-300)" strokeWidth="1" />
      <path d="M 7 16 L 7 48" stroke="var(--brass-300)" strokeWidth="1" />
      <path d="M 57 16 L 57 48" stroke="var(--brass-300)" strokeWidth="1" />

      {/* Petits ornements floraux médians (4 points cuivre) */}
      <circle cx="32" cy="7" r="1" fill="var(--brass-500)" />
      <circle cx="32" cy="57" r="1" fill="var(--brass-500)" />
      <circle cx="7" cy="32" r="1" fill="var(--brass-500)" />
      <circle cx="57" cy="32" r="1" fill="var(--brass-500)" />

      {/* Lettre C — Fraunces serif, ink-900, large et pleine */}
      <text
        x="32"
        y="44"
        fontFamily="var(--font-fraunces), 'Fraunces', Georgia, serif"
        fontSize="38"
        fontWeight="600"
        fill="var(--ink-900)"
        textAnchor="middle"
        style={{ fontFeatureSettings: '"liga" 1, "calt" 1' }}
      >
        C
      </text>

      {/* Volutes décoratives accrochées à la lettre — détail manuscrit */}
      {/* Volute bas-gauche partant du C */}
      <path
        d="M 22 42 Q 16 44, 14 48"
        stroke="var(--brass-500)"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="14" cy="48" r="1.25" fill="var(--brass-500)" />
      {/* Volute haut-droit autour du C */}
      <path
        d="M 42 22 Q 48 20, 50 16"
        stroke="var(--brass-500)"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx="50" cy="16" r="1.25" fill="var(--brass-500)" />
    </svg>
  );
}
