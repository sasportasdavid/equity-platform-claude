import type { Metadata } from 'next';
import { Briefcase, Building2, ScaleIcon, Users } from 'lucide-react';
import { MarketingLayout } from '@/components/marketing/layout';
import {
  CTABanner,
  FeatureGrid,
  HeroSmall,
  MarketingSection,
  SectionHeader,
} from '@/components/marketing/sections';

export const metadata: Metadata = {
  title: 'À propos — Pourquoi Capiwise existe',
  description:
    'Capiwise, plateforme française de gestion d’actionnariat salarié. Notre mission : éliminer la friction equity en France.',
  alternates: { canonical: 'https://www.capiwise.fr/a-propos' },
};

export default function AboutPage() {
  return (
    <MarketingLayout>
      <HeroSmall
        eyebrow="À propos"
        title={
          <>
            Pourquoi Capiwise <span className="serif-italic text-brass-700">existe</span>.
          </>
        }
        description="Notre conviction : l’equity ne devrait pas être un goulot d’étranglement administratif. Capiwise rend la gestion d’actionnariat salarié aussi simple qu’un SaaS moderne, sans sacrifier la rigueur d’un cabinet M&A."
      />

      <MarketingSection paper>
        <SectionHeader
          eyebrow="Notre mission"
          title={
            <>
              Éliminer la friction equity{' '}
              <span className="serif-italic text-brass-700">en France</span>.
            </>
          }
        />
        <div className="prose prose-slate dark:prose-invert mx-auto mt-10 max-w-3xl">
          <p>
            En France, gérer un plan BSPCE, AGA ou Stock Options demande de jongler entre plusieurs
            acteurs : avocat pour les actes, cabinet d’expertise pour la valorisation IFRS 2, RH
            pour le suivi bénéficiaire, DAF pour la consolidation, expert-comptable pour l’audit.
            Chacun a son outil, son format, son délai. Le résultat ?
          </p>
          <ul>
            <li>Des Excel qui circulent par email avec un risque de version</li>
            <li>Des cabinets qui facturent 10–15k€ par valorisation IFRS 2</li>
            <li>Des bénéficiaires qui ne comprennent pas leur equity</li>
            <li>Un audit trail incomplet qui complique la due diligence Série B</li>
          </ul>
          <p>
            Capiwise unifie tout ça. Une plateforme conçue dès le premier jour pour la
            réglementation française (art. 163 bis G CGI, contraintes AGA, AGE), avec un moteur IFRS
            2 inclus, un portail bénéficiaire dédié, et un audit trail immuable.
          </p>
          <p>
            On a fait le choix d’héberger en France, de signer via Yousign (et pas DocuSign), et de
            publier nos prix. Parce qu’on pense que la confiance se construit avec de la
            transparence, pas du sales-led obscur.
          </p>
        </div>
      </MarketingSection>

      <MarketingSection>
        <SectionHeader eyebrow="Pour qui" title="Quatre personas, une plateforme" />
        <div className="mt-12">
          <FeatureGrid
            cols={4}
            features={[
              {
                icon: ScaleIcon,
                title: 'CFO / DAF',
                description:
                  'Valorisation IFRS 2 incluse, conformité audit-ready, exports CAC, idempotence stricte.',
              },
              {
                icon: Users,
                title: 'CHRO / DRH',
                description:
                  'Portail bénéficiaire intuitif, attribution simple, motivation salariés mesurable.',
              },
              {
                icon: Building2,
                title: 'Fondateurs / CEO',
                description:
                  'Cap table dynamique, dilution simulée, prêt pour due diligence Série A/B/C.',
              },
              {
                icon: Briefcase,
                title: 'Avocats / Experts-comptables',
                description:
                  'Workflow d’approbation auditable, audit trail immuable, partage data room.',
              },
            ]}
          />
        </div>
      </MarketingSection>

      <MarketingSection paper>
        <SectionHeader eyebrow="Histoire" title="Capiwise en quelques dates" />
        <ol className="mx-auto mt-12 max-w-3xl">
          {[
            {
              date: 'Été 2025',
              title: 'Genèse',
              description:
                'Premier brouillon de spec après plusieurs mois passés à gérer des plans BSPCE en Excel pour des startups de 50–80 personnes.',
            },
            {
              date: 'Q4 2025',
              title: 'Développement V0',
              description:
                'Architecture multi-tenant, defense-in-depth 4 couches, design system Editorial Finance V1.',
            },
            {
              date: 'Mai 2026',
              title: 'V1.0 — 14 modules livrés',
              description:
                'Foundation, Identity, Plans, Awards, Beneficiaries, Approvals, Documents, Notifications, Portal, Exercise, Cap Table, IFRS 2, Compliance, Audit. 1083 tests, 14 modules en prod.',
            },
            {
              date: '18 mai 2026',
              title: 'Beta privée',
              description:
                'Ouverture aux 5 premiers clients alignés avec la roadmap. Recrutement actif via le formulaire contact.',
            },
            {
              date: 'Q3 2026',
              title: 'Lancement public',
              description:
                'Site public V1, communication, premier objectif : 25 clients payants à fin 2026.',
            },
          ].map((event) => (
            <li
              key={event.title}
              className="border-paper-300 relative flex gap-6 border-l py-6 pl-8 first:pt-0 last:border-l-transparent last:pb-0"
            >
              <span className="bg-brass-500 absolute left-0 top-7 size-3 -translate-x-1/2 rounded-full" />
              <div className="flex flex-col gap-1">
                <span className="text-overline text-brass-700">{event.date}</span>
                <h3 className="text-ink-900 text-h3">{event.title}</h3>
                <p className="text-ink-700 text-sm leading-relaxed">{event.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </MarketingSection>

      <MarketingSection>
        <SectionHeader
          eyebrow="L’équipe"
          title="Une équipe pluri-disciplinaire"
          description="Tech + finance + droit. Pas de marketing seul, pas de tech seul."
        />
        <div className="border-paper-300 bg-paper-50 mx-auto mt-10 max-w-2xl rounded-xl border p-8 text-center">
          <p className="text-ink-700 text-base leading-relaxed">
            Capiwise est aujourd’hui une équipe restreinte concentrée sur la qualité produit.
            L’équipe sera étendue post-beta privée pour couvrir CSM, support client et sales.
          </p>
          <p className="text-ink-500 mt-3 text-xs italic">
            Page équipe enrichie post-recrutement V1.X.
          </p>
        </div>
      </MarketingSection>

      <CTABanner
        title="Envie d’en savoir plus ?"
        description="Discutons de votre projet et de ce que Capiwise peut apporter à votre société."
        primaryCta={{ label: 'Nous contacter', href: '/contact' }}
        secondaryCta={{ label: 'Voir le produit', href: '/produit' }}
      />
    </MarketingLayout>
  );
}
