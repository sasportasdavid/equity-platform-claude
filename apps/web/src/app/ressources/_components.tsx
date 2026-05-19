import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { TitleRule } from '@/components/shared/title-rule';

/**
 * Layout commun pour les articles de ressources (longs, type guide pillar).
 * Wrapper éditorial avec prose typography, breadcrumb et CTA fin d'article.
 */
export function ArticleLayout({
  category,
  title,
  intro,
  readTime,
  children,
}: {
  category: string;
  title: string;
  intro?: string;
  readTime: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="mb-8">
        <Link
          href="/ressources"
          className="text-ink-500 hover:text-brass-700 inline-flex items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" />
          Toutes les ressources
        </Link>
      </div>
      <header className="mb-10">
        <span className="text-overline text-brass-700 mb-3 inline-block">{category}</span>
        <h1 className="text-ink-900 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          {title}
        </h1>
        <TitleRule width="64px" />
        {intro ? <p className="text-ink-700 mt-4 text-lg leading-relaxed">{intro}</p> : null}
        <p className="text-ink-500 mt-3 text-xs">{readTime} de lecture</p>
      </header>
      <div className="prose prose-slate dark:prose-invert prose-headings:font-serif prose-headings:tracking-tight prose-h2:text-2xl prose-h2:font-semibold prose-h3:text-xl prose-h3:font-medium max-w-none">
        {children}
      </div>
      <aside className="border-paper-300 bg-paper-50 not-prose mt-12 rounded-xl border p-6">
        <h2 className="text-ink-900 text-h3">Capiwise vous accompagne</h2>
        <p className="text-ink-700 mt-3 text-sm leading-relaxed">
          Vous voulez digitaliser votre plan d’actionnariat salarié ? Notre équipe vous montre
          comment Capiwise s’adapte à votre stade et vos instruments.
        </p>
        <Link
          href="/contact"
          className="bg-brass-500 hover:bg-brass-700 text-paper-50 mt-4 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium transition-colors"
        >
          Demander une démo →
        </Link>
      </aside>
    </article>
  );
}
