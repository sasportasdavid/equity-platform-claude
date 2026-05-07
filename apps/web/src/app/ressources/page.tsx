import type { Metadata } from 'next';
import { BookOpen, FileQuestion, Library, Sparkles } from 'lucide-react';
import { MarketingLayout } from '@/components/marketing/layout';
import {
  CTABanner,
  FeatureGrid,
  HeroSmall,
  MarketingSection,
  SectionHeader,
} from '@/components/marketing/sections';
import { BlogCard } from '@/components/marketing/faq';
import { NewsletterForm } from './newsletter-form';

export const metadata: Metadata = {
  title: 'Ressources — Tout comprendre sur l’actionnariat salarié français',
  description:
    'Guides complets BSPCE, IFRS 2, comparaison instruments. FAQ, glossaire, articles techniques pour CFO, RH, fondateurs et avocats.',
  alternates: { canonical: 'https://www.capiwise.fr/ressources' },
};

const ARTICLES = [
  {
    title: 'Le guide complet du BSPCE 2026',
    excerpt:
      'Tout ce qu’il faut savoir sur les BSPCE en France : éligibilité société, fiscalité salarié, vesting, levée d’options. ~3 000 mots.',
    category: 'Guide pillar · BSPCE',
    readTime: '15 min',
    href: '/ressources/guide-bspce',
    placeholder: false,
  },
  {
    title: 'IFRS 2 démystifié',
    excerpt:
      'Pourquoi IFRS 2 est obligatoire en France, comment fonctionnent Black-Scholes / Monte Carlo, comment Capiwise automatise le tout.',
    category: 'Guide · IFRS 2',
    readTime: '12 min',
    href: '/ressources/ifrs2-explique',
    placeholder: false,
  },
  {
    title: 'AGA vs BSPCE vs Stock Options',
    excerpt:
      'Tableau comparatif des 5 instruments d’actionnariat salarié en France. Quel instrument pour quelle situation ?',
    category: 'Guide · Comparaison',
    readTime: '8 min',
    href: '/ressources/aga-bspce-stock-options',
    placeholder: false,
  },
  {
    title: 'Comment fixer le prix d’exercice (FMV)',
    excerpt:
      'Méthodes acceptées par l’administration fiscale : DCF, multiples, transactions comparables.',
    category: 'À paraître · Pricing',
    readTime: '7 min',
    href: '/ressources/fmv',
    placeholder: true,
  },
  {
    title: 'Préparer son cap table pour la due diligence',
    excerpt: 'Les vérifications attendues par les avocats acquéreurs. Checklist 30 points.',
    category: 'À paraître · M&A',
    readTime: '10 min',
    href: '/ressources/cap-table-due-diligence',
    placeholder: true,
  },
  {
    title: 'Vesting : calendaire, conditionnel, cliff — bonnes pratiques',
    excerpt: 'Quel calendrier choisir pour BSPCE, AGA et SO selon le profil bénéficiaire.',
    category: 'À paraître · Vesting',
    readTime: '9 min',
    href: '/ressources/vesting-best-practices',
    placeholder: true,
  },
];

export default function RessourcesPage() {
  return (
    <MarketingLayout>
      <HeroSmall
        eyebrow="Ressources"
        title={
          <>
            Tout comprendre sur l’actionnariat salarié{' '}
            <span className="serif-italic text-brass-700">français</span>.
          </>
        }
        description="Guides longs (3 000+ mots), FAQ, comparaisons. Pour les CFO, RH, fondateurs et avocats qui veulent comprendre avant d’acheter."
      />

      <MarketingSection paper>
        <SectionHeader eyebrow="Catégories" title="Trois axes de contenu" />
        <div className="mt-12">
          <FeatureGrid
            cols={3}
            features={[
              {
                icon: BookOpen,
                title: 'Guides pillar',
                description:
                  'BSPCE, IFRS 2, comparaison instruments. Articles longs pour comprendre en profondeur.',
              },
              {
                icon: FileQuestion,
                title: 'FAQ',
                description: '30+ questions par catégorie : plateforme, BSPCE, AGA, IFRS 2, RGPD.',
              },
              {
                icon: Library,
                title: 'Glossaire (V1.X)',
                description:
                  'Définitions précises des termes techniques. Vesting, FMV, AGA, AGE, IFRS 2, etc.',
              },
            ]}
          />
        </div>
      </MarketingSection>

      <MarketingSection>
        <SectionHeader eyebrow="Articles" title="Tous les articles" />
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {ARTICLES.map((article) => (
            <BlogCard key={article.title} {...article} />
          ))}
        </div>
      </MarketingSection>

      <MarketingSection paper>
        <div className="border-paper-300 bg-paper-50 mx-auto max-w-3xl rounded-xl border p-8 text-center">
          <Sparkles className="text-brass-500 mx-auto size-8" />
          <h2 className="text-h2 text-ink-900 mt-4">Newsletter mensuelle</h2>
          <p className="text-ink-700 mt-3 text-base leading-relaxed">
            Un email par mois avec les nouveautés produit, les évolutions réglementaires (loi de
            finances, doctrines URSSAF) et les guides à paraître.
          </p>
          <NewsletterForm />
          <p className="text-ink-500 mt-3 text-xs">Désinscription en 1 clic. RGPD conforme.</p>
        </div>
      </MarketingSection>

      <CTABanner
        title="Une question pas couverte ?"
        description="Notre équipe répond à vos questions techniques sous 24 h ouvrées."
        primaryCta={{ label: 'Nous contacter', href: '/contact' }}
        secondaryCta={{ label: 'Lire la FAQ', href: '/ressources/faq' }}
      />
    </MarketingLayout>
  );
}
