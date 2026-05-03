/**
 * Module 8 + Étape 14 Design System V1 — Footer minimal du portail.
 *
 * Layout editorial : copyright mono ink-500 + lien support brass +
 * mentions légales/confidentialité ink-400. Ligne de séparation
 * paper-300.
 *
 * V1 simple : pas de menu étendu. Mentions légales = placeholder V2
 * (à brancher quand les pages CGU/privacy seront créées).
 */
export function PortalFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-paper-300 mt-16 border-t px-4 py-6 text-xs sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <p className="text-ink-500 font-mono">
          © {year} Capiwise · Aide :{' '}
          <a
            className="text-brass-700 hover:text-brass-900 underline-offset-2 hover:underline"
            href="mailto:support@capiwise.com"
          >
            support@capiwise.com
          </a>
        </p>
        <p className="text-ink-400 font-mono">
          <span className="text-overline">MENTIONS LÉGALES</span>
          <span className="text-paper-300 mx-2">·</span>
          <span className="text-overline">CONFIDENTIALITÉ</span>
        </p>
      </div>
    </footer>
  );
}
