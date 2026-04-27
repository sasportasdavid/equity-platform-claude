import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { hasPermission, requireUser } from '@/lib/auth/rbac';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { OrganizationForm } from './organization-form';

export const metadata: Metadata = {
  title: 'Organisation',
};

export default async function OrganizationPage() {
  const user = await requireUser();
  if (!user.activeOrgId) redirect('/onboarding/create-org');

  // Lecture autorisée à tous les membres ; édition ensuite gardée par perm.
  const canEdit = await hasPermission('org.update');

  const admin = getSupabaseAdminClient();
  const { data: org } = await admin
    .from('organizations')
    .select(
      'name, legal_name, legal_form, siren, default_currency, timezone, fiscal_year_end_month, slug',
    )
    .eq('id', user.activeOrgId)
    .single();

  if (!org) redirect('/dashboard');

  return (
    <div className="space-y-6" data-testid="organization-page">
      <header>
        <h2 className="text-2xl font-semibold tracking-tight">Organisation</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Informations administratives et préférences de votre organisation.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{org.name}</CardTitle>
          <CardDescription>
            Slug <span className="text-foreground font-mono">{org.slug}</span> · ID interne, partagé
            dans les URLs et exports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrganizationForm
            initial={{
              name: org.name ?? '',
              legalName: org.legal_name ?? '',
              legalForm: (org.legal_form ?? '') as string,
              siren: org.siren ?? '',
              defaultCurrency: org.default_currency ?? 'EUR',
              timezone: org.timezone ?? 'Europe/Paris',
              fiscalYearEndMonth: org.fiscal_year_end_month ?? 12,
            }}
            canEdit={canEdit}
          />
        </CardContent>
      </Card>
    </div>
  );
}
