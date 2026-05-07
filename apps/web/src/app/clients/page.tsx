import type { Metadata } from 'next';
import { MarketingLayout } from '@/components/marketing/layout';
import {
  CTABanner,
  HeroSmall,
  MarketingSection,
  SectionHeader,
} from '@/components/marketing/sections';
import { LogoCloud, TestimonialGrid } from '@/components/marketing/testimonials';
import { BlogCard } from '@/components/marketing/faq';

export const metadata: Metadata = {
  title: 'Clients & études de cas',
  description:
    'Comment nos clients structurent leur actionnariat salarié avec Capiwise. Études de cas startup, scale-up, groupes ETI.',
  alternates: { canonical: 'https://www.capiwise.fr/clients' },
};

export default function ClientsPage() {
  return (
    <MarketingLayout>
      <HeroSmall
        eyebrow="Clients"
        title="Ils ont choisi Capiwise pour structurer leur actionnariat salarié."
        description="Étude de cas et témoignages des sociétés qui structurent leur equity avec nous. Versions anonymisées en attendant la beta privée du 18 mai 2026."
      />

      <LogoCloud title="Clients beta privée — logos publiés post-launch" count={12} />

      <MarketingSection paper>
        <SectionHeader
          eyebrow="Études de cas"
          title="Comment nos clients utilisent Capiwise"
          description="Trois scénarios concrets de mise en place, du choix de l’instrument à la première valorisation IFRS 2."
        />
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {[
            {
              title: 'Comment Startup A a structuré son premier plan BSPCE en 2 semaines',
              excerpt:
                'Société de 8 personnes, premier plan BSPCE pour 5 key hires. De la création du plan à la signature des lettres d’attribution Yousign : 14 jours.',
              category: 'BSPCE · Amorçage',
              readTime: '6 min',
              href: '/clients/startup-a',
            },
            {
              title: 'Comment Scale-up B gère 80 bénéficiaires multi-instruments',
              excerpt:
                'Holding + 2 filiales, 80 bénéficiaires, mix BSPCE/AGA/SO. Cap table consolidé, IFRS 2 trimestriel, audit annuel CAC.',
              category: 'Multi-org · Série B',
              readTime: '8 min',
              href: '/clients/scaleup-b',
            },
            {
              title: 'Comment Groupe C valorise IFRS 2 sans cabinet externe',
              excerpt:
                'ETI 350 salariés, plan AGA Performance avec conditions TSR. Monte Carlo 100K paths, validation Big Four, économie 12k€/an vs cabinet.',
              category: 'IFRS 2 · ETI',
              readTime: '10 min',
              href: '/clients/groupe-c',
            },
          ].map((card) => (
            <BlogCard key={card.title} {...card} placeholder />
          ))}
        </div>
        <p className="text-ink-500 mt-6 text-center text-xs italic">
          Études de cas à publier après la beta privée du 18 mai 2026.
        </p>
      </MarketingSection>

      <MarketingSection>
        <SectionHeader eyebrow="Témoignages" title="Ce que disent nos clients beta" />
        <div className="mt-12">
          <TestimonialGrid
            placeholder
            testimonials={[
              {
                quote:
                  'Le passage à Capiwise nous a fait gagner trois jours sur chaque attribution et a sécurisé notre passage en Série A.',
                author: 'CFO Startup A',
                role: 'CFO',
                company: 'SaaS B2B · Série A',
                initials: 'CF',
              },
              {
                quote:
                  'Le module IFRS 2 a remplacé notre cabinet d’expertise. Le rapport est plus détaillé et nos commissaires aux comptes le valident sans question.',
                author: 'DAF Scale-up B',
                role: 'DAF',
                company: 'FinTech · Série B',
                initials: 'DB',
              },
              {
                quote:
                  'Le portail bénéficiaire a transformé l’equity de zone d’ombre à levier de rétention.',
                author: 'CHRO Groupe C',
                role: 'CHRO',
                company: 'Groupe industriel · ETI',
                initials: 'GC',
              },
            ]}
          />
        </div>
      </MarketingSection>

      <CTABanner
        title="Vous voulez être le prochain ?"
        description="Beta privée ouverte le 18 mai 2026. 5 places disponibles pour les sociétés alignées avec notre roadmap."
        primaryCta={{ label: 'Postuler à la beta', href: '/contact' }}
        secondaryCta={{ label: 'Voir les tarifs', href: '/tarifs' }}
      />
    </MarketingLayout>
  );
}
