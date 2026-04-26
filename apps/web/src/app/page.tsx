import Link from 'next/link';
import { ArrowRight, ChartLine, FileText, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/shared/theme-toggle';
import { cn } from '@/lib/utils';

export default function HomePage() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-border/40 bg-background/80 sticky top-0 z-10 flex items-center justify-between border-b px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="bg-primary text-primary-foreground inline-flex size-8 items-center justify-center rounded-md font-mono text-sm font-bold">
            C
          </span>
          <span className="text-lg font-semibold tracking-tight">Capiwise</span>
          <Badge variant="secondary" className="ml-2 font-mono text-[10px]">
            BOOTSTRAP
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className={cn(buttonVariants({ size: 'default' }), 'gap-2')}>
            Se connecter
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-24 text-center md:py-32">
          <Badge variant="outline" className="mx-auto w-fit font-mono text-[10px]">
            Module 1 · Foundation
          </Badge>
          <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-6xl">
            Pilotez vos plans d’<span className="text-primary">actionnariat salarié</span> de bout
            en bout.
          </h1>
          <p className="text-muted-foreground mx-auto max-w-2xl text-pretty text-lg md:text-xl">
            BSPCE, AGA, Stock Options, BSA, RSU. Conformité française native, valorisation IFRS 2,
            workflow d’approbation configurable et signature électronique intégrée.
          </p>
          <div className="mx-auto flex flex-col gap-3 sm:flex-row">
            <Link href="/login" className={cn(buttonVariants({ size: 'lg' }), 'gap-2')}>
              Accéder à la plateforme
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/dashboard"
              className={cn(buttonVariants({ size: 'lg', variant: 'outline' }))}
            >
              Voir une démo
            </Link>
          </div>
        </section>

        <section className="border-border/40 bg-muted/30 border-t">
          <div className="mx-auto grid w-full max-w-5xl gap-6 px-6 py-16 md:grid-cols-3">
            <Card>
              <CardHeader>
                <ShieldCheck className="text-primary mb-2 size-6" />
                <CardTitle>Conformité FR native</CardTitle>
                <CardDescription>
                  BSPCE éligibilité, AGA contraintes légales, validations AGE — automatisé.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <ChartLine className="text-primary mb-2 size-6" />
                <CardTitle>Valorisation IFRS 2</CardTitle>
                <CardDescription>
                  Monte Carlo 100K paths, conditions de performance, juste valeur par tranche.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <FileText className="text-primary mb-2 size-6" />
                <CardTitle>Audit-ready</CardTitle>
                <CardDescription>
                  Audit trail immuable, exports CAC, idempotence sur toute opération critique.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-border/40 text-muted-foreground border-t px-6 py-6 text-center text-sm">
        © {new Date().getFullYear()} Capiwise · Plateforme SaaS française de gestion d’actionnariat
        salarié
      </footer>
    </div>
  );
}
