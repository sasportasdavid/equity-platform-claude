import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-muted-foreground font-mono text-sm">404</p>
      <div className="space-y-2">
        <h1 className="text-foreground text-xl font-semibold">Page introuvable</h1>
        <p className="text-muted-foreground max-w-md text-sm">
          La page que vous cherchez n&apos;existe pas ou a été déplacée.
        </p>
      </div>
      <Link href="/" className={cn(buttonVariants({ variant: 'default' }))}>
        Retour à l&apos;accueil
      </Link>
    </div>
  );
}
