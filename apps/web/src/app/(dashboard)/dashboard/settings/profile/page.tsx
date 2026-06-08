import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/rbac';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { ChangePasswordForm } from './change-password-form';
import { ProfileForm } from './profile-form';

export const metadata: Metadata = {
  title: 'Mon profil',
};

export default async function ProfilePage() {
  const user = await requireUser();
  const admin = getSupabaseAdminClient();
  const { data: profile } = await admin
    .from('user_profiles')
    .select('full_name, phone, preferences')
    .eq('id', user.id)
    .single();

  return (
    <div className="space-y-6" data-testid="profile-page">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Mon profil</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Vos informations personnelles. Visibles uniquement par vous et les administrateurs de vos
          organisations.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Identité</CardTitle>
          <CardDescription>
            Email <span className="text-foreground font-mono">{user.email}</span> — non modifiable
            (lié à votre compte d’authentification).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            initialFullName={profile?.full_name ?? user.fullName ?? ''}
            initialPhone={profile?.phone ?? ''}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mot de passe</CardTitle>
          <CardDescription>
            Changez votre mot de passe Capiwise. Vous devrez saisir votre mot de passe actuel pour
            confirmer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
