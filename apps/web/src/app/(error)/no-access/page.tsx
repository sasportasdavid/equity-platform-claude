import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Aucune organisation' };

export default function NoAccessPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-5" /> Aucune organisation
        </CardTitle>
        <CardDescription>
          Votre compte n’est rattaché à aucune organisation active. Vous pouvez créer la vôtre, ou
          attendre une invitation d’un administrateur existant.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Link href="/onboarding/company" className={cn(buttonVariants({ variant: 'default' }))}>
          Créer une organisation
        </Link>
        <Link href="/login" className={cn(buttonVariants({ variant: 'outline' }))}>
          Changer de compte
        </Link>
      </CardContent>
    </Card>
  );
}
