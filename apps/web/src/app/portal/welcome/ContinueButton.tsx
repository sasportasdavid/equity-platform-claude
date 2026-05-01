'use client';

import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Module 8 — Bouton "Continuer →" client minimal qui pousse vers
 * /portal/profile/setup (étape 2 onboarding).
 */
export function ContinueOnboardingButton() {
  const router = useRouter();
  return (
    <Button
      type="button"
      onClick={() => router.push('/portal/profile/setup')}
      className="gap-2"
      data-testid="portal-welcome-continue"
    >
      Continuer
      <ArrowRight className="size-4" />
    </Button>
  );
}
