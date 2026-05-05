import Link from 'next/link';
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Module 14 PR §B4 — layout des pages légales (/legal/*).
 *
 * Pages publiques accessibles sans authentification (cf. proxy.ts
 * `/legal/` dans PUBLIC_PREFIXES). Layout statique éditorial DS V1,
 * lien retour brand cliquable.
 *
 * **Disclaimer V1** : ces pages contiennent un placeholder
 * juridique standard à valider par un conseil avant production. Voir
 * brief PR #43 §B4 condition « V1 acceptable basique, juriste
 * validera plus tard ».
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-muted/30 flex min-h-full flex-1 flex-col items-center px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <span className="bg-primary text-primary-foreground inline-flex size-9 items-center justify-center rounded-md font-mono font-bold">
          C
        </span>
        <span className="text-xl font-semibold tracking-tight">Capiwise</span>
      </Link>
      <main className="w-full max-w-3xl">
        <Card>
          <CardContent className="prose prose-slate dark:prose-invert max-w-none px-6 py-8 text-sm leading-7">
            {children}
          </CardContent>
        </Card>
        <nav className="text-muted-foreground mt-6 flex flex-wrap justify-center gap-4 text-xs">
          <Link
            href="/legal/terms"
            className="hover:text-foreground underline-offset-2 hover:underline"
          >
            Conditions d’utilisation
          </Link>
          <span>·</span>
          <Link
            href="/legal/privacy"
            className="hover:text-foreground underline-offset-2 hover:underline"
          >
            Politique de confidentialité
          </Link>
          <span>·</span>
          <Link
            href="/legal/dpa"
            className="hover:text-foreground underline-offset-2 hover:underline"
          >
            Accord de traitement (DPA)
          </Link>
        </nav>
        <p className="text-muted-foreground mt-8 text-center text-xs">
          © {new Date().getFullYear()} Capiwise · plateforme française d’actionnariat salarié
        </p>
      </main>
    </div>
  );
}
