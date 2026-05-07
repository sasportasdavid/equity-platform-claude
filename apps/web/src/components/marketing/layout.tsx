import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { CapiwiseMark } from '@/components/marketing/brand';
import { cn } from '@/lib/utils';

const PRODUCT_LINKS = [
  {
    href: '/produit/plans',
    title: 'Création de plans',
    description: 'Wizard guidé, 5 instruments natifs, validation AGE.',
  },
  {
    href: '/produit/attribution',
    title: 'Attribution & Approbation',
    description: 'Workflow N-niveaux, signature électronique, audit trail.',
  },
  {
    href: '/produit/valorisation-ifrs2',
    title: 'Valorisation IFRS 2',
    description: 'Monte Carlo 100K paths, Black-Scholes & Heston.',
  },
  {
    href: '/produit/portail-beneficiaire',
    title: 'Portail bénéficiaire',
    description: 'Vesting visualisé, simulateur, documents en ligne.',
  },
  {
    href: '/produit/levee-options',
    title: 'Levée d’options',
    description: 'De l’intention à la souscription effective.',
  },
  {
    href: '/produit/cap-table',
    title: 'Cap Table',
    description: 'Vue catégorielle, dilution, waterfall sortie.',
  },
  {
    href: '/produit/conformite-fr',
    title: 'Conformité FR',
    description: 'Art. 163 bis G CGI, contraintes AGA, audit-ready.',
  },
  {
    href: '/produit/signature-electronique',
    title: 'Signature eIDAS',
    description: 'Yousign qualifié avancé, conforme RGPD strict.',
  },
];

const NAV_LINKS = [
  { href: '/tarifs', label: 'Tarifs' },
  { href: '/securite', label: 'Sécurité' },
  { href: '/comparatif', label: 'Comparatif' },
  { href: '/ressources', label: 'Ressources' },
];

export function PublicHeader() {
  return (
    <header className="border-border/60 bg-background/85 sticky top-0 z-30 border-b backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="text-ink-900 flex items-center gap-2">
          <CapiwiseMark className="size-8" />
          <span className="text-lg font-semibold tracking-tight">Capiwise</span>
        </Link>

        <nav aria-label="Navigation principale" className="hidden lg:flex">
          <ul className="flex items-center gap-1">
            <li className="group relative">
              <button
                type="button"
                className="text-ink-700 hover:text-ink-900 inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors"
                aria-haspopup="true"
              >
                Produit
                <ChevronDown className="size-3.5" />
              </button>
              <div
                className="border-paper-300 bg-paper-50 invisible absolute left-1/2 top-full z-40 mt-2 w-[640px] -translate-x-1/2 translate-y-1 rounded-xl border p-4 opacity-0 shadow-lg transition-all duration-200 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100"
                role="menu"
              >
                <ul className="grid grid-cols-2 gap-1">
                  {PRODUCT_LINKS.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="hover:bg-paper-200 block rounded-md px-3 py-2.5 transition-colors"
                      >
                        <span className="text-ink-900 block text-sm font-medium">{item.title}</span>
                        <span className="text-ink-500 mt-0.5 block text-xs leading-snug">
                          {item.description}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="border-paper-300 mt-3 border-t pt-3">
                  <Link
                    href="/produit"
                    className="text-brass-700 hover:text-brass-900 inline-flex items-center gap-1.5 text-xs font-medium"
                  >
                    Voir toutes les fonctionnalités
                    <ArrowRight className="size-3" />
                  </Link>
                </div>
              </div>
            </li>
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-ink-700 hover:text-ink-900 inline-block rounded-md px-3 py-2 text-sm font-medium transition-colors"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'sm' }),
              'hidden sm:inline-flex',
            )}
          >
            Se connecter
          </Link>
          <Link href="/contact" className={cn(buttonVariants({ size: 'sm' }), 'gap-1.5')}>
            Demander une démo
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}

const FOOTER_COLUMNS = [
  {
    heading: 'Produit',
    links: [
      { href: '/produit/plans', label: 'Création de plans' },
      { href: '/produit/attribution', label: 'Attribution' },
      { href: '/produit/valorisation-ifrs2', label: 'Valorisation IFRS 2' },
      { href: '/produit/portail-beneficiaire', label: 'Portail bénéficiaire' },
      { href: '/produit/cap-table', label: 'Cap Table' },
      { href: '/produit/conformite-fr', label: 'Conformité FR' },
    ],
  },
  {
    heading: 'Solutions',
    links: [
      { href: '/tarifs', label: 'Tarifs' },
      { href: '/comparatif', label: 'Comparatif' },
      { href: '/clients', label: 'Études de cas' },
      { href: '/securite', label: 'Sécurité & conformité' },
      { href: '/produit/signature-electronique', label: 'Signature eIDAS' },
    ],
  },
  {
    heading: 'Ressources',
    links: [
      { href: '/ressources', label: 'Centre de ressources' },
      { href: '/ressources/guide-bspce', label: 'Guide BSPCE 2026' },
      { href: '/ressources/ifrs2-explique', label: 'IFRS 2 expliqué' },
      { href: '/ressources/aga-bspce-stock-options', label: 'AGA vs BSPCE vs SO' },
      { href: '/ressources/faq', label: 'FAQ' },
    ],
  },
  {
    heading: 'Entreprise',
    links: [
      { href: '/a-propos', label: 'À propos' },
      { href: '/contact', label: 'Contact' },
      { href: 'mailto:contact@capiwise.fr', label: 'contact@capiwise.fr' },
    ],
  },
];

const TRUST_BADGES_FOOTER = [
  { label: 'Hébergement FR' },
  { label: 'RGPD strict' },
  { label: 'eIDAS qualifié' },
  { label: 'ISO 27001 (en cours)' },
];

export function PublicFooter() {
  return (
    <footer className="border-border bg-card mt-20 border-t">
      <div className="mx-auto w-full max-w-7xl px-6 pb-10 pt-16">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <Link href="/" className="text-ink-900 inline-flex items-center gap-2">
              <CapiwiseMark className="size-8" />
              <span className="text-lg font-semibold tracking-tight">Capiwise</span>
            </Link>
            <p className="text-ink-500 mt-4 max-w-xs text-sm leading-relaxed">
              Plateforme française de gestion d’actionnariat salarié. Conformité native, IFRS 2
              inclus, hébergement FR.
            </p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {TRUST_BADGES_FOOTER.map((badge) => (
                <li
                  key={badge.label}
                  className="border-paper-300 text-ink-500 inline-flex rounded-full border px-2.5 py-1 text-[11px]"
                >
                  {badge.label}
                </li>
              ))}
            </ul>
          </div>
          {FOOTER_COLUMNS.map((column) => (
            <div key={column.heading}>
              <h3 className="text-overline text-ink-900">{column.heading}</h3>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-ink-700 hover:text-brass-700 text-sm transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-paper-300 text-ink-500 mt-12 flex flex-col items-start justify-between gap-4 border-t pt-6 text-xs sm:flex-row sm:items-center">
          <span>
            © {new Date().getFullYear()} Capiwise SAS · Tous droits réservés · Hébergé en France
          </span>
          <nav aria-label="Navigation pied de page" className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/legal/mentions-legales" className="hover:text-ink-900">
              Mentions légales
            </Link>
            <Link href="/legal/cgv" className="hover:text-ink-900">
              CGV
            </Link>
            <Link href="/legal/terms" className="hover:text-ink-900">
              CGU
            </Link>
            <Link href="/legal/privacy" className="hover:text-ink-900">
              Confidentialité
            </Link>
            <Link href="/legal/dpa" className="hover:text-ink-900">
              DPA
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}

export function MarketingLayout({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="bg-background text-foreground flex min-h-full flex-1 flex-col">
      <a
        href="#main-content"
        className="bg-ink-900 text-paper-50 sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:px-4 focus:py-2 focus:text-sm"
      >
        Aller au contenu principal
      </a>
      <PublicHeader />
      <main id="main-content" className={cn('flex flex-1 flex-col', className)}>
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
