import type { Metadata } from 'next';
import type { RuleScope } from '@equity/shared';
import { Card, CardContent } from '@/components/ui/card';
import { hasPermission, requireUser } from '@/lib/auth/rbac';
import { listComplianceRulesForUI } from '@/server/actions/complianceRules';
import { ComplianceSettingsClient } from '@/components/compliance/ComplianceSettingsClient';
import { BetaLimitationBanner } from '@/components/beta/BetaLimitationBanner';

export const metadata: Metadata = {
  title: 'Compliance · Paramètres',
};

/**
 * Module 12 B4 — Page configuration compliance par org.
 *
 * Server Component qui :
 *   1. requireUser (any authenticated → lecture seule)
 *   2. hasPermission('compliance_rules.config.write') → passe canEdit au client
 *   3. listComplianceRulesForUI() → 23 rules groupées par scope
 *   4. Render ComplianceSettingsClient (layout + sections + sidebar anchor)
 *
 * Pattern existant : page sous /dashboard/settings/* (layout fournit la
 * SettingsNav globale). Cette page ajoute son propre side-nav d'ancre
 * pour les 6 scopes (anchor links style Stripe/Linear).
 */

const SCOPE_LABELS: Record<RuleScope, string> = {
  approval: 'Approbations',
  award: 'Attributions',
  beneficiary: 'Bénéficiaires',
  cap_table: 'Cap Table',
  document: 'Documents',
  exercise: 'Exercices',
  plan: 'Plans',
  valuation: 'Valorisations',
};

const SCOPE_ORDER: RuleScope[] = [
  'approval',
  'award',
  'beneficiary',
  'cap_table',
  'document',
  'valuation',
  // V1 : `plan` et `exercise` n'ont aucune rule en code (cf inventaire B3a).
  // On les omet du rendering pour éviter une section vide.
];

export default async function ComplianceSettingsPage() {
  await requireUser();

  const [result, canEdit] = await Promise.all([
    listComplianceRulesForUI(),
    hasPermission('compliance_rules.config.write'),
  ]);

  if (!result.ok) {
    return (
      <div className="space-y-4">
        <header>
          <h2 className="text-2xl font-semibold tracking-tight">Compliance</h2>
          <p className="text-muted-foreground text-sm">
            Configuration des règles de validation pour votre organisation.
          </p>
        </header>
        <Card className="border-destructive/40 border-dashed">
          <CardContent className="py-6">
            <p className="text-destructive text-sm">Erreur lecture : {result.error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BetaLimitationBanner
        title="Configuration avancée — sur demande pendant la beta"
        description={
          <p>
            En V1.0, vous pouvez activer/désactiver les règles et ajuster leur sévérité. Les
            paramètres avancés (seuils personnalisés, règles custom, exceptions par plan) arrivent
            en V1.1. Pour un cas d&apos;usage spécifique, contactez-nous.
          </p>
        }
        ctaFeature="Configuration compliance custom"
        ctaContext="page=/dashboard/settings/compliance"
      />
      <ComplianceSettingsClient
        rulesByScope={result.rulesByScope}
        totalCount={result.totalCount}
        canEdit={canEdit}
        scopeLabels={SCOPE_LABELS}
        scopeOrder={SCOPE_ORDER}
      />
    </div>
  );
}
