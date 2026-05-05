import { TitleRule } from '@/components/shared/title-rule';

/**
 * Helpers UI partagés par les pages /legal/*. Vivent dans `_components`
 * (préfixe underscore = exclu du routing Next.js App Router) pour ne
 * pas être confondus avec le `layout.tsx` server component.
 */

/** Header éditorial (DS V1) standard pour chaque page legal. */
export function LegalHeader({ title, intro }: { title: string; intro?: string }) {
  return (
    <header className="not-prose mb-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        <span className="serif-italic text-brass-500">{title}</span>
      </h1>
      <TitleRule width="80px" />
      {intro ? <p className="text-muted-foreground mt-3 text-sm">{intro}</p> : null}
    </header>
  );
}

/** Bandeau placeholder V1 affiché tant que le contenu n'est pas validé
 * juridiquement. À retirer au Module 14.5 ou avant prod (cf. brief
 * §B4 condition « V1 acceptable basique, juriste validera »). */
export function LegalDraftBanner() {
  return (
    <div
      className="not-prose mb-6 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-900 dark:text-amber-100"
      role="note"
      data-testid="legal-draft-banner"
    >
      <strong>Version provisoire (Module 14 V1)</strong>. Ce document contient un placeholder
      standard pour les besoins de la beta privée. Une version finale validée par un conseil
      juridique sera publiée avant la mise en production. Pour toute question, écrivez à{' '}
      <a className="underline" href="mailto:legal@capiwise.com">
        legal@capiwise.com
      </a>
      .
    </div>
  );
}
