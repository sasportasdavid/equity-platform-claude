import type { ReactNode } from 'react';
import { MarketingLayout } from '@/components/marketing/layout';
import {
  BigFeature,
  CTABanner,
  type Feature,
  FeatureGrid,
  HeroSmall,
  MarketingSection,
  SectionHeader,
} from '@/components/marketing/sections';
import { FAQAccordion, type FAQItem } from '@/components/marketing/faq';

export type UseCase = {
  title: string;
  description: string;
};

export type ProductPageProps = {
  eyebrow: string;
  title: ReactNode;
  description: string;
  features: Feature[];
  bigFeatures?: Array<{
    title: ReactNode;
    description: ReactNode;
    bullets?: string[];
    visual?: ReactNode;
    reverse?: boolean;
  }>;
  useCases: UseCase[];
  faq: FAQItem[];
  /** Section optionnelle additionnelle (ex pour IFRS 2 « Pourquoi Capiwise »). */
  customSection?: ReactNode;
};

export function ProductPage({
  eyebrow,
  title,
  description,
  features,
  bigFeatures,
  useCases,
  faq,
  customSection,
}: ProductPageProps) {
  return (
    <MarketingLayout>
      <HeroSmall
        eyebrow={eyebrow}
        title={title}
        description={description}
        primaryCta={{ label: 'Demander une démo', href: '/contact' }}
        secondaryCta={{ label: 'Voir les tarifs', href: '/tarifs' }}
      />

      <MarketingSection paper>
        <SectionHeader eyebrow="Comment ça marche" title="Les fonctionnalités clés" />
        <div className="mt-12">
          <FeatureGrid features={features} cols={3} />
        </div>
      </MarketingSection>

      {bigFeatures
        ? bigFeatures.map((bf, idx) => (
            <BigFeature
              key={typeof bf.title === 'string' ? bf.title : idx}
              title={bf.title}
              description={bf.description}
              bullets={bf.bullets}
              visual={bf.visual}
              reverse={bf.reverse}
            />
          ))
        : null}

      {customSection}

      <MarketingSection>
        <SectionHeader eyebrow="Cas d’usage" title="Pour quels scénarios ?" />
        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          {useCases.map((useCase) => (
            <article
              key={useCase.title}
              className="border-paper-300 bg-paper-50 flex flex-col gap-3 rounded-xl border p-6"
            >
              <h3 className="text-ink-900 text-h3">{useCase.title}</h3>
              <p className="text-ink-700 text-sm leading-relaxed">{useCase.description}</p>
            </article>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection paper>
        <SectionHeader eyebrow="FAQ" title="Questions fréquentes" />
        <div className="mt-10">
          <FAQAccordion items={faq} />
        </div>
      </MarketingSection>

      <CTABanner
        title="Discutons de votre cas concret"
        description="30 minutes de démo personnalisée pour évaluer la pertinence de Capiwise pour votre stade et vos instruments."
        primaryCta={{ label: 'Demander une démo', href: '/contact' }}
        secondaryCta={{ label: 'Voir les tarifs', href: '/tarifs' }}
      />
    </MarketingLayout>
  );
}
