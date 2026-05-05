'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { completeOnboarding } from '@/server/actions/onboarding';

/**
 * Module 14 §B2 — CTA final wizard onboarding.
 *
 * Click → `completeOnboarding` Server Action → set
 * `onboarding_completed_at` + `app_metadata.onboarding_completed=true`
 * → refreshSession() pour propager le claim → redirect /dashboard.
 *
 * Le `refreshSession` est nécessaire pour que le proxy gate cesse de
 * re-router vers /onboarding (il lit `app_metadata.onboarding_completed`
 * du JWT).
 */
export function CompleteOnboardingButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onClick() {
    if (pending) return;
    startTransition(async () => {
      const result = await completeOnboarding();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.refreshSession();
      router.replace('/dashboard');
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="w-full gap-2"
      size="lg"
      data-testid="onboarding-complete-button"
    >
      {pending ? 'Finalisation…' : 'Accéder à mon dashboard'}
      <ArrowRight className="size-4" />
    </Button>
  );
}
