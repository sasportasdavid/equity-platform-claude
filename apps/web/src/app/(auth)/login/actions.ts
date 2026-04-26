'use server';

import { redirect } from 'next/navigation';
import { signInSchema, signUpSchema } from '@equity/shared';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logAuditEvent } from '@/lib/audit';

export type AuthActionResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function signInAction(formData: FormData): Promise<AuthActionResult> {
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Identifiants invalides.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? 'Connexion impossible.' };
  }

  await logAuditEvent({
    eventType: 'auth.signed_in',
    resourceType: 'USER',
    resourceId: data.user.id,
    userId: data.user.id,
    userEmail: data.user.email ?? null,
  });

  const redirectTo = (formData.get('redirectTo') as string | null) || '/dashboard';
  redirect(redirectTo);
}

export async function signUpAction(formData: FormData): Promise<AuthActionResult> {
  const parsed = signUpSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    fullName: formData.get('fullName'),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: 'Veuillez corriger les erreurs ci-dessous.',
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.fullName } },
  });
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? 'Inscription impossible.' };
  }

  await logAuditEvent({
    eventType: 'auth.signed_up',
    resourceType: 'USER',
    resourceId: data.user.id,
    userId: data.user.id,
    userEmail: data.user.email ?? null,
    metadata: { full_name: parsed.data.fullName },
  });

  redirect('/login?signup=success');
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.auth.signOut();
  if (user) {
    await logAuditEvent({
      eventType: 'auth.signed_out',
      resourceType: 'USER',
      resourceId: user.id,
      userId: user.id,
      userEmail: user.email ?? null,
    });
  }
  redirect('/login');
}
