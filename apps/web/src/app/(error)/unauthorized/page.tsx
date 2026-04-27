import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Accès refusé' };

export default function UnauthorizedPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="text-destructive size-5" /> Accès refusé
        </CardTitle>
        <CardDescription>
          Vous n’avez pas les permissions nécessaires pour accéder à cette page. Si vous pensez
          qu’il s’agit d’une erreur, contactez l’administrateur de votre organisation.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Link href="/dashboard" className={cn(buttonVariants({ variant: 'default' }))}>
          Retour au tableau de bord
        </Link>
        <Link href="/login" className={cn(buttonVariants({ variant: 'outline' }))}>
          Changer de compte
        </Link>
      </CardContent>
    </Card>
  );
}
