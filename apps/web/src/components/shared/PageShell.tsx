import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Breadcrumb, type BreadcrumbItem } from './breadcrumb';
import { TitleRule } from './title-rule';

/**
 * Module Design System V1 — PageShell éditorial.
 *
 * Deux APIs en parallèle, **conservation de la backward compat** pour
 * ne pas casser les ~15 pages existantes qui utilisent l'API simple.
 *
 * **API legacy (props)** — reste fonctionnel :
 * ```tsx
 * <PageShell title="Mes plans" description="Liste des plans" actions={<Button>Nouveau</Button>}>
 *   {content}
 * </PageShell>
 * ```
 *
 * **API compound (Editorial Finance V1)** — pour les écrans refondus :
 * ```tsx
 * <PageShell>
 *   <PageShell.Breadcrumb items={[{ label: 'Paragraphe' }, { label: 'Dashboard' }]} />
 *   <PageShell.Header>
 *     <PageShell.Overline>EQUITY MANAGEMENT · Q2 2026</PageShell.Overline>
 *     <PageShell.Title>
 *       Bonjour Julien,{' '}
 *       <PageShell.TitleAccent>deux points</PageShell.TitleAccent>{' '}
 *       méritent votre attention.
 *     </PageShell.Title>
 *     <PageShell.TitleRule />
 *     <PageShell.Subtitle>142 bénéficiaires · 12 plans</PageShell.Subtitle>
 *     <PageShell.Actions>
 *       <Button variant="outline">Importer</Button>
 *       <Button>Nouveau plan →</Button>
 *     </PageShell.Actions>
 *   </PageShell.Header>
 *   <PageShell.Content>{content}</PageShell.Content>
 * </PageShell>
 * ```
 *
 * Le détail signature : `text-h1` Fraunces serif sur le titre + line
 * cuivre 64px (animée) en dessous + overline brass-500.
 */

type LegacyProps = {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

type CompoundProps = {
  children: ReactNode;
  className?: string;
};

function PageShellRoot(props: LegacyProps | CompoundProps) {
  const { children, className } = props;

  // Detect API : legacy props use `title`
  if ('title' in props && props.title !== undefined) {
    const { title, description, actions } = props;
    return (
      <div className={cn('mx-auto w-full max-w-7xl space-y-6', className)}>
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
        {children}
      </div>
    );
  }

  // Compound API : children handle layout
  return <div className={cn('mx-auto w-full max-w-7xl space-y-6', className)}>{children}</div>;
}

// === Compound subcomponents ===

function PageShellBreadcrumb({ items }: { items: ReadonlyArray<BreadcrumbItem> }) {
  return <Breadcrumb items={items} />;
}

function PageShellHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <header
      className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}
    >
      <div className="space-y-2">{children}</div>
    </header>
  );
}

function PageShellOverline({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-overline text-brass-500', className)}>{children}</p>;
}

function PageShellTitle({ children, className }: { children: ReactNode; className?: string }) {
  // PR #36 — max-width 36ch pour text-wrap balance équilibré.
  return <h1 className={cn('text-h1 text-ink-900 max-w-[36ch]', className)}>{children}</h1>;
}

function PageShellTitleAccent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  // PR #36 — italic Fraunces avec stylistic alternates ss01 (glyph riche).
  // Cf. utility CSS `text-h1-accent` dans globals.css.
  return <em className={cn('text-h1-accent text-brass-500', className)}>{children}</em>;
}

function PageShellTitleRule({ width }: { width?: string }) {
  return <TitleRule width={width} />;
}

function PageShellSubtitle({ children, className }: { children: ReactNode; className?: string }) {
  // PR #36 — ink-500 + max-width 64ch pour la lisibilité éditoriale.
  return <p className={cn('text-ink-500 max-w-[64ch] text-sm', className)}>{children}</p>;
}

function PageShellActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex shrink-0 items-center gap-2 self-end sm:self-end', className)}>
      {children}
    </div>
  );
}

function PageShellContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('space-y-6', className)}>{children}</div>;
}

// Compound API exposition
export const PageShell = Object.assign(PageShellRoot, {
  Breadcrumb: PageShellBreadcrumb,
  Header: PageShellHeader,
  Overline: PageShellOverline,
  Title: PageShellTitle,
  TitleAccent: PageShellTitleAccent,
  TitleRule: PageShellTitleRule,
  Subtitle: PageShellSubtitle,
  Actions: PageShellActions,
  Content: PageShellContent,
});
