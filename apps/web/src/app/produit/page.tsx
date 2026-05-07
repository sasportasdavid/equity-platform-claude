import type { Metadata } from 'next';
import {
  CheckCircle2,
  FileSignature,
  Layers,
  ScrollText,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { MarketingLayout } from '@/components/marketing/layout';
import {
  CTABanner,
  FeatureGrid,
  HeroSmall,
  MarketingSection,
  SectionHeader,
} from '@/components/marketing/sections';

export const metadata: Metadata = {
  title: 'Produit — 8 modules pour gérer votre actionnariat salarié',
  description:
    'Découvrez les 8 modules Capiwise : plans, attribution, portail bénéficiaire, levée d’options, cap table, valorisation IFRS 2, conformité FR, signature eIDAS.',
  alternates: { canonical: 'https://www.capiwise.fr/produit' },
};

const PRODUCT_FEATURES = [
  {
    icon: Layers,
    title: 'Création de plans',
    description: 'Wizard 7 étapes, 5 instruments natifs (BSPCE/SO/AGA/RSU/BSA), validation AGE.',
  },
  {
    icon: CheckCircle2,
    title: 'Attribution & Approbation',
    description: 'Workflow N-niveaux (jusqu’à 10), idempotence, signature eIDAS qualifiée.',
  },
  {
    icon: Users,
    title: 'Portail bénéficiaire',
    description: 'Vesting visualisé, simulateur de départ, documents signés en ligne.',
  },
  {
    icon: ScrollText,
    title: 'Levée d’options',
    description:
      'De l’intention à la souscription effective : workflow rigoureux + cap table sync.',
  },
  {
    icon: TrendingUp,
    title: 'Cap Table dynamique',
    description: 'Vue catégorielle, dilution, waterfall sortie, exports investisseurs.',
  },
  {
    icon: Sparkles,
    title: 'Valorisation IFRS 2',
    description: 'Monte Carlo 100K paths, Black-Scholes & Heston, juste valeur par tranche.',
  },
  {
    icon: ShieldCheck,
    title: 'Conformité FR',
    description: 'Art. 163 bis G CGI, contraintes AGA, audit trail immuable, defense-in-depth.',
  },
  {
    icon: FileSignature,
    title: 'Signature électronique',
    description: 'Yousign eIDAS qualifié avancé, conforme RGPD strict.',
  },
];

export default function ProduitPage() {
  return (
    <MarketingLayout>
      <HeroSmall
        eyebrow="Produit"
        title={
          <>
            8 modules, <span className="serif-italic text-brass-700">une seule plateforme</span>.
          </>
        }
        description="De la création du plan à l’audit annuel, chaque étape de la vie de vos instruments d’actionnariat salarié est couverte."
        primaryCta={{ label: 'Demander une démo', href: '/contact' }}
        secondaryCta={{ label: 'Voir les tarifs', href: '/tarifs' }}
      />

      <MarketingSection paper>
        <SectionHeader
          eyebrow="Catalogue"
          title="Le périmètre couvert"
          description="Cliquez sur un module pour explorer ses fonctionnalités en détail."
        />
        <div className="mt-12">
          <FeatureGrid features={PRODUCT_FEATURES} cols={4} />
        </div>
        <div className="mt-10 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {[
            { href: '/produit/plans', label: 'Création de plans' },
            { href: '/produit/attribution', label: 'Attribution' },
            { href: '/produit/portail-beneficiaire', label: 'Portail bénéficiaire' },
            { href: '/produit/levee-options', label: 'Levée d’options' },
            { href: '/produit/cap-table', label: 'Cap Table' },
            { href: '/produit/valorisation-ifrs2', label: 'Valorisation IFRS 2' },
            { href: '/produit/conformite-fr', label: 'Conformité FR' },
            { href: '/produit/signature-electronique', label: 'Signature eIDAS' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="border-paper-300 hover:border-brass-500 hover:text-brass-700 text-ink-900 bg-paper-50 inline-flex items-center justify-between rounded-lg border px-4 py-3 text-sm font-medium transition-colors"
            >
              <span>{item.label}</span>
              <span aria-hidden>→</span>
            </a>
          ))}
        </div>
      </MarketingSection>

      <CTABanner
        title="Une démo en 30 minutes."
        description="Notre équipe vous montre les modules adaptés à votre stade et vos instruments."
        primaryCta={{ label: 'Demander une démo', href: '/contact' }}
      />
    </MarketingLayout>
  );
}
