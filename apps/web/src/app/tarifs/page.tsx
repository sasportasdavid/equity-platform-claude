import type { Metadata } from 'next';
import { MarketingLayout } from '@/components/marketing/layout';
import {
  CTABanner,
  HeroSplit,
  MarketingSection,
  SectionHeader,
} from '@/components/marketing/sections';
import { PricingTable, type PricingTier } from '@/components/marketing/pricing';
import { FAQAccordion } from '@/components/marketing/faq';

export const metadata: Metadata = {
  title: 'Tarifs — Pricing transparent, IFRS 2 inclus',
  description:
    '3 plans visibles + Enterprise sur devis. Tier gratuit pour les startups pré-amorçage. IFRS 2 inclus dans tous les plans payants. Pas de frais cachés.',
  alternates: { canonical: 'https://www.capiwise.fr/tarifs' },
};

const PRICING_TIERS: PricingTier[] = [
  {
    id: 'starter',
    tier: 'Starter',
    description: 'Pour les startups pré-amorçage qui posent les bases.',
    price: '0 €',
    priceSuffix: '/an · gratuit',
    features: [
      '1 plan actif',
      '10 bénéficiaires max',
      '1 valorisation par an',
      'Templates GLOBAL prêts à l’emploi',
      'Audit trail immuable',
      'Support email',
    ],
    ctaLabel: 'Démarrer gratuitement',
    ctaHref: '/contact',
  },
  {
    id: 'growth',
    tier: 'Growth',
    description: 'Pour les startups Série A-B qui structurent.',
    price: '1 490 €',
    priceSuffix: '/an',
    badge: 'Le plus choisi',
    highlighted: true,
    features: [
      'Plans illimités',
      'Jusqu’à 50 bénéficiaires',
      '4 valorisations par an',
      'IFRS 2 Monte Carlo inclus',
      'Templates custom',
      'Signature eIDAS Yousign',
      'Workflow d’approbation',
      'Support prioritaire',
    ],
    ctaLabel: 'Demander une démo',
    ctaHref: '/contact',
  },
  {
    id: 'scale',
    tier: 'Scale',
    description: 'Pour les scale-ups Série B-C qui industrialisent.',
    price: '3 990 €',
    priceSuffix: '/an',
    features: [
      'Jusqu’à 200 bénéficiaires',
      'Valorisations illimitées',
      'Multi-org (groupes)',
      'API + Webhooks',
      'Audit trail consolidé',
      'CSM dédié',
      'Onboarding accompagné',
      'SLA 99.9 %',
    ],
    ctaLabel: 'Demander une démo',
    ctaHref: '/contact',
  },
  {
    id: 'enterprise',
    tier: 'Enterprise',
    description: 'Pour les ETI et groupes internationaux.',
    price: 'Sur devis',
    features: [
      '> 200 bénéficiaires',
      'Multi-juridiction (V1.X)',
      'SSO SAML / OIDC',
      'SLA garanti contractuel',
      'DPO dédié + DPA custom',
      'Onboarding sur-mesure',
      'Support 24/5',
    ],
    ctaLabel: 'Contacter les sales',
    ctaHref: '/contact',
  },
];

const PRICING_FAQ = [
  {
    question: 'Le tier Starter est-il vraiment gratuit ?',
    answer:
      'Oui, 100 % gratuit, pour toujours, dans la limite des quotas (1 plan, 10 bénéficiaires, 1 valorisation/an). Idéal pour valider l’outil avant Série A.',
  },
  {
    question: 'IFRS 2 est-il vraiment inclus dans Growth ?',
    answer:
      '4 valorisations Monte Carlo par an incluses dans Growth (ce qui couvre un refresh trimestriel standard). Carta facture 2-5k$ par valorisation en sus de leur abonnement. Notre Growth à 1 490 €/an se positionne ~50 % sub-Carta.',
  },
  {
    question: 'Comment se passe la facturation ?',
    answer:
      'Annuel par défaut, en début d’abonnement. Mensuel disponible sur demande (Growth/Scale, +10 % vs annuel). Paiement par virement SEPA, carte bancaire (Stripe), ou prélèvement.',
  },
  {
    question: 'Puis-je changer de plan en cours d’année ?',
    answer:
      'Upgrade Starter → Growth → Scale possible à tout moment, prorata calculé automatiquement. Downgrade en fin de période d’engagement uniquement.',
  },
  {
    question: 'Que se passe-t-il si je dépasse mes quotas ?',
    answer:
      'Soft warning à 80 % du quota. À 100 % : impossible de créer une nouvelle attribution sans upgrade. Pas de facturation surprise.',
  },
  {
    question: 'Y a-t-il des frais de mise en place ?',
    answer:
      'Pas pour Starter, Growth et Scale. Pour Enterprise, l’onboarding sur-mesure peut être facturé selon la complexité (multi-juridiction, intégrations spécifiques). Devis transparent en amont.',
  },
  {
    question: 'Acceptez-vous les bons de commande ?',
    answer:
      'Oui pour Scale et Enterprise. Délai de paiement standard 30 j fin de mois. SEPA prélèvement disponible.',
  },
  {
    question: 'Puis-je migrer depuis Carta / Uplaw / Equify ?',
    answer:
      'Oui, l’import CSV bénéficiaires couvre les exports standard. Pour les cap tables complexes, notre équipe accompagne la migration (inclus pour Scale et Enterprise).',
  },
  {
    question: 'Quels modes de support ?',
    answer:
      'Starter : email (réponse sous 48h ouvrées). Growth : email prioritaire (sous 24h). Scale : Slack Connect dédié + CSM. Enterprise : 24/5 + ligne directe.',
  },
  {
    question: 'Y a-t-il un engagement de durée ?',
    answer:
      'Tarifs annuels = engagement 12 mois renouvelables tacitement. Résiliation 30 jours avant échéance par email. Pas de pénalité, pas de gotcha.',
  },
];

export default function TarifsPage() {
  return (
    <MarketingLayout>
      <HeroSplit
        eyebrow="Tarifs"
        title={
          <>
            Pricing transparent. <span className="serif-italic text-brass-700">IFRS 2 inclus</span>.
          </>
        }
        description="Trois plans visibles, un Enterprise sur devis. Pas de frais cachés. IFRS 2 Monte Carlo inclus dans tous les plans payants — pas facturé en sus comme chez certains."
        rightSlot={
          <div className="border-paper-300 bg-paper-50 flex flex-col gap-3 rounded-xl border p-6 shadow-sm">
            <span className="text-overline text-brass-700">vs Carta</span>
            <p className="text-ink-900 text-h3">~50 % moins cher</p>
            <p className="text-ink-700 text-sm">
              Carta Build = 2 988 $/an minimum + 2-5k$ par valorisation.
              <br />
              Capiwise Growth = 1 490 €/an avec 4 valorisations incluses.
            </p>
          </div>
        }
      />

      <PricingTable tiers={PRICING_TIERS} />

      <MarketingSection paper>
        <SectionHeader eyebrow="Quels que soient vos enjeux" title="Un plan pour chaque stade" />
        <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              persona: 'Startup amorçage',
              recommended: 'Starter',
              detail: '< 10 bénéficiaires · 1 plan · valoriser une fois par an',
            },
            {
              persona: 'Startup A-B',
              recommended: 'Growth',
              detail: '10-50 bénéficiaires · refresh trimestriel · IFRS 2 inclus',
            },
            {
              persona: 'Scale-up B-C',
              recommended: 'Scale',
              detail: '50-200 bénéficiaires · API · multi-org · CSM dédié',
            },
            {
              persona: 'ETI / Groupe',
              recommended: 'Enterprise',
              detail: '> 200 bénéficiaires · SSO · multi-juridiction · DPO',
            },
          ].map((card) => (
            <article
              key={card.persona}
              className="border-paper-300 bg-paper-50 flex flex-col gap-2 rounded-xl border p-5"
            >
              <span className="text-overline text-brass-700">{card.persona}</span>
              <p className="text-ink-900 text-h3">{card.recommended}</p>
              <p className="text-ink-500 text-xs">{card.detail}</p>
            </article>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection>
        <SectionHeader eyebrow="FAQ" title="Vos questions sur les tarifs" />
        <div className="mt-10">
          <FAQAccordion items={PRICING_FAQ} />
        </div>
      </MarketingSection>

      <CTABanner
        eyebrow="Devis personnalisé"
        title="Plus de 50 bénéficiaires ? Multi-juridiction ? Besoin d’un SLA contractuel ?"
        description="Notre équipe sales prépare un devis sur-mesure adapté à votre contexte."
        primaryCta={{ label: 'Demander un devis', href: '/contact' }}
        secondaryCta={{ label: 'Voir le comparatif', href: '/comparatif' }}
      />
    </MarketingLayout>
  );
}
