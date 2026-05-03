/**
 * Module 8 — Footer minimal du portail bénéficiaire.
 *
 * V1 simple : copyright + lien support. Mentions légales = placeholder V2.
 */
export function PortalFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-border/40 text-muted-foreground mt-12 border-t px-4 py-6 text-xs sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <p>
          © {year} Capiwise · Aide :{' '}
          <a className="underline-offset-2 hover:underline" href="mailto:support@capiwise.com">
            support@capiwise.com
          </a>
        </p>
        <p className="text-muted-foreground/70">Mentions légales · Confidentialité</p>
      </div>
    </footer>
  );
}
