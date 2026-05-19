import type { Metadata } from 'next';
import { Building2, CheckCircle2, FileSignature, Lock, ShieldCheck, Workflow } from 'lucide-react';
import { ProductPage } from '@/components/marketing/product-page';
import { ApprovalVisual } from '@/components/marketing/visuals';

export const metadata: Metadata = {
  title: 'Attribution & Workflow d’approbation N-niveaux',
  description:
    'Workflow d’approbation séquentiel ou parallèle, jusqu’à 10 niveaux. Idempotence native, signature électronique eIDAS qualifiée, audit trail immuable.',
  alternates: { canonical: 'https://www.capiwise.fr/produit/attribution' },
};

export default function ProduitAttributionPage() {
  return (
    <ProductPage
      eyebrow="Module — Attribution & Approbation"
      title={
        <>
          Attribuez en toute conformité.{' '}
          <span className="serif-italic text-brass-700">
            Workflow N-niveaux + signature électronique.
          </span>
        </>
      }
      description="De la proposition à la signature électronique : un workflow d’approbation auditable, multi-tenant, avec idempotence native et audit trail immuable."
      features={[
        {
          icon: Workflow,
          title: 'Workflow custom illimité',
          description:
            'Définissez vos chaînes d’approbation : CFO → CEO → Board, ou parallélisez plusieurs niveaux. Jusqu’à 10 étapes par workflow.',
        },
        {
          icon: CheckCircle2,
          title: 'Approbation séquentielle ou parallèle',
          description:
            'Configurez chaque step en mode séquentiel (chaque approbateur après l’autre) ou parallèle (tous en même temps).',
        },
        {
          icon: FileSignature,
          title: 'Signature eIDAS qualifié',
          description:
            'Yousign V3 avec eIDAS qualifié avancé. Conforme RGPD strict, audit trail signature inclus.',
        },
        {
          icon: Lock,
          title: 'Idempotence native',
          description:
            'Impossible de double-approuver. Chaque action a un ID idempotent, les retries n’ont pas d’effet de bord.',
        },
        {
          icon: ShieldCheck,
          title: 'Defense-in-depth multi-tenant',
          description:
            '4 couches de sécurité : RLS Postgres + TENANT_VIOLATION guards + checks Server Actions + filtering UI.',
        },
        {
          icon: Building2,
          title: 'Multi-org natif',
          description:
            'Pour les groupes avec filiales : cross-org isolation strict, audit trail consolidé, role-based access.',
        },
      ]}
      bigFeatures={[
        {
          title: 'Une chaîne d’approbation que vos auditeurs vont adorer.',
          description:
            'Chaque step est tracé, idempotent, et audité automatiquement. La signature électronique est intégrée nativement — pas de DocuSign en plus, pas de PDF à scanner.',
          bullets: [
            'Workflow attaché à un plan ou à un type d’attribution',
            'Approbateurs configurables par rôle (OWNER/CFO/HR_LEAD/...) ou user spécifique',
            'SLA + escalation auto (V2)',
            'Repli automatique si refus à un niveau N → annulation cascade',
            'Audit log structuré par decision (approve / reject / cancel)',
          ],
          visual: <ApprovalVisual />,
        },
      ]}
      useCases={[
        {
          title: 'Attribution massive (50 bénéficiaires d’un coup)',
          description:
            'Import CSV → wizard création → 1 workflow d’approbation pour le batch entier → signature individuelle Yousign pour chaque lettre.',
        },
        {
          title: 'Approbation CFO + CEO + Board',
          description:
            'Workflow 3 niveaux séquentiel : CFO valide les chiffres, CEO valide la liste des bénéficiaires, Board valide la stratégie.',
        },
        {
          title: 'Multi-org pour groupe avec filiales',
          description:
            'Holding + 3 filiales. Workflows distincts par filiale, audit trail consolidé au niveau holding, isolation cross-org stricte.',
        },
      ]}
      faq={[
        {
          question: 'Puis-je modifier un workflow après sa création ?',
          answer:
            'Oui, tant qu’aucune attribution n’est en cours d’approbation sur ce workflow. Les attributions déjà engagées suivent le workflow tel qu’il était au moment de leur démarrage (snapshot).',
        },
        {
          question: 'Que se passe-t-il si un approbateur quitte la société ?',
          answer:
            'Vous pouvez réassigner l’approbateur en cours via la page de détail de la request. Le système tracée l’action de réassignation dans l’audit log. Pour V2, une escalation automatique sera disponible si SLA dépassé.',
        },
        {
          question: 'Puis-je avoir un workflow différent par instrument ?',
          answer:
            'Oui, chaque plan peut avoir son propre workflow. Vous pouvez par exemple imposer un workflow Board obligatoire pour AGA Performance et un workflow simple CFO-only pour BSPCE standards.',
        },
        {
          question: 'La signature électronique a-t-elle valeur juridique en France ?',
          answer:
            'Oui. Yousign est qualifié eIDAS niveau avancé. Les signatures émises ont la même valeur juridique qu’une signature manuscrite, avec preuve d’horodatage qualifié et certificat conforme.',
        },
        {
          question: 'Puis-je intégrer un approbateur externe (avocat, expert-comptable) ?',
          answer:
            'Oui via une invitation guest. Le tiers reçoit un magic link pour valider sa step sans compte permanent. Pour les conseils récurrents, un rôle EXTERNAL_ADVISOR est disponible.',
        },
      ]}
    />
  );
}
