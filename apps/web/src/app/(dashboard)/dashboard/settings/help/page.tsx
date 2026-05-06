import type { Metadata } from 'next';
import { CheckCircle2, Clock, Mail, MessageCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SupportContactCTA } from '@/components/beta/SupportContactCTA';
import { requireUser } from '@/lib/auth/rbac';

export const metadata: Metadata = {
  title: 'Aide & support · Paramètres',
};

const V1_FEATURES: { label: string; description: string }[] = [
  {
    label: 'Plans BSPCE / AGA / SO',
    description: 'Création, wizard 7 étapes, valorisation IFRS 2.',
  },
  {
    label: 'Attributions & state machine',
    description: '16 statuts, transitions audit-loggées, modifications IFRS 2.27-28.',
  },
  {
    label: 'Bénéficiaires & portail',
    description: 'Onboarding, vesting timeline, simulateur de départ.',
  },
  {
    label: 'Workflows d’approbation',
    description: 'Multi-step, escalation manuelle, inbox approbateur.',
  },
  {
    label: 'Documents & signatures',
    description: '3 templates V1 (BSPCE/AGA/SO), Yousign V3 intégré.',
  },
  { label: 'Notifications email', description: 'Resend, 9 templates V1, queue + webhook.' },
  {
    label: 'Cap table dynamique',
    description: 'Snapshots, scénarios déterministes, dilution comparator.',
  },
  { label: 'Valorisations Monte Carlo', description: 'IFRS 2 multi-tranche, viz, cron mensuel.' },
  {
    label: 'Compliance Engine V1',
    description: '23 rules wired, configurables par org (Module 12).',
  },
];

const V1_1_FEATURES: { label: string; description: string }[] = [
  {
    label: 'UI configuration des règles compliance',
    description:
      'Édition fine via /settings/compliance (déjà disponible mais limitée à toggle/severity en V1).',
  },
  {
    label: 'Templates additionnels',
    description:
      'Avenants, lettre exercise, attestation de sortie. V1 = 3 templates BSPCE/AGA/SO + 2 PDF exercise.',
  },
  {
    label: 'BSPCE M&A workflow complet',
    description: 'Cession globale, traitement liquidatif, événements de sortie collectifs.',
  },
  {
    label: 'Stock options FR (SO) compliance complète',
    description: 'Plafonds réglementaires, traitement fiscal, plus-value d’acquisition.',
  },
  {
    label: 'Audit log viewer UI',
    description:
      'Page interactive, filtres, export CSV / PDF. V1 = audit log existe en DB, exports sur demande.',
  },
];

export default async function HelpPage() {
  const user = await requireUser();
  const supportContext = `user=${user.email ?? user.id}`;
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'david@capiwise.fr';

  return (
    <div className="space-y-6" data-testid="help-page">
      <header>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">Aide &amp; support</h2>
          <Badge variant="secondary">V1.0 — Beta privée</Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Capiwise est en beta privée jusqu&apos;à mi-juin 2026. Cette page récapitule ce qui est
          disponible aujourd&apos;hui, ce qui arrive en V1.1, et comment nous joindre.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-600" />
            Disponible en V1.0
          </CardTitle>
          <CardDescription>
            Les modules ci-dessous sont en production et utilisables sans restriction.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2">
            {V1_FEATURES.map((feature) => (
              <li key={feature.label} className="flex gap-2 text-sm">
                <CheckCircle2 className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <div>
                  <span className="font-medium">{feature.label}</span> —{' '}
                  <span className="text-muted-foreground">{feature.description}</span>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-5 text-amber-600" />
            En cours pour V1.1 (juin 2026)
          </CardTitle>
          <CardDescription>
            Si vous avez besoin d&apos;une de ces fonctionnalités dès maintenant, contactez-nous —
            on peut souvent débloquer un cas d&apos;usage manuellement.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-2">
            {V1_1_FEATURES.map((feature) => (
              <li key={feature.label} className="flex gap-2 text-sm">
                <Clock className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                <div>
                  <span className="font-medium">{feature.label}</span> —{' '}
                  <span className="text-muted-foreground">{feature.description}</span>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="size-5 text-indigo-600" />
            Support beta
          </CardTitle>
          <CardDescription>
            Réponse sous 24h ouvrées. Pour un blocage urgent (compliance, signature, valorisation),
            précisez-le dans l&apos;objet — réponse plus rapide.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">
            <div className="flex items-center gap-2">
              <Mail className="text-muted-foreground size-4" />
              <a
                href={`mailto:${supportEmail}`}
                className="underline-offset-3 font-mono hover:underline"
              >
                {supportEmail}
              </a>
            </div>
          </div>
          <SupportContactCTA
            feature="Aide générale beta V1.0"
            context={supportContext}
            label="Écrire à David"
            variant="default"
          />
        </CardContent>
      </Card>
    </div>
  );
}
