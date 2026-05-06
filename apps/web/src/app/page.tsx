import type { Metadata } from 'next';
import { MarketingLayout } from '@/components/marketing/layout';
import {
  BigFeature,
  CTABanner,
  HeroLarge,
  MarketingSection,
  SectionHeader,
  StatsBlock,
  TrustBadges,
} from '@/components/marketing/sections';
import { ComparisonTable } from '@/components/marketing/pricing';
import { LogoCloud, TestimonialGrid } from '@/components/marketing/testimonials';
import {
  ApprovalVisual,
  AuditVisual,
  HomepageDashboardMockup,
  MonteCarloVisual,
  PortalVisual,
} from '@/components/marketing/visuals';

export const metadata: Metadata = {
  title: 'Capiwise — Plateforme française de gestion d’actionnariat salarié',
  description:
    'BSPCE, AGA, Stock Options, BSA, RSU. Conformité FR native (art. 163 bis G CGI), valorisation IFRS 2 par Monte Carlo, workflow d’approbation auditable. Hébergé en France.',
  alternates: { canonical: 'https://www.capiwise.fr/' },
  openGraph: {
    title: 'Capiwise — Plateforme française d’actionnariat salarié',
    description:
      'Pilotez vos plans BSPCE, AGA et Stock Options avec la rigueur d’un cabinet M&A et la simplicité d’un SaaS moderne.',
    url: 'https://www.capiwise.fr/',
    siteName: 'Capiwise',
    locale: 'fr_FR',
    type: 'website',
  },
};

export default function HomePage() {
  return (
    <MarketingLayout>
      <HeroLarge
        eyebrow="Plateforme française · Beta privée 18 mai 2026"
        title={
          <>
            Pilotez vos plans BSPCE, AGA et Stock Options sans bricolage{' '}
            <span className="serif-italic text-brass-700">juridique</span>.
          </>
        }
        description="La seule plateforme française qui combine conformité native (art. 163 bis G CGI), valorisation IFRS 2 par Monte Carlo et workflow d’approbation auditable. Conçue pour les CFO exigeants et les fondateurs ambitieux."
        primaryCta={{ label: 'Demander une démo', href: '/contact' }}
        secondaryCta={{ label: 'Voir les tarifs', href: '/tarifs' }}
        visual={<HomepageDashboardMockup className="w-full max-w-xl" />}
      />

      <LogoCloud title="Ils nous font confiance pour structurer leur actionnariat salarié" />

      <StatsBlock
        stats={[
          { value: '5', label: 'Instruments natifs', hint: 'BSPCE · SO · AGA · RSU · BSA' },
          { value: '100%', label: 'Conformité FR', hint: 'Art. 163 bis G CGI + IFRS 2' },
          { value: '🇫🇷', label: 'Hébergé en France', hint: 'RGPD strict, hors Cloud Act' },
          { value: '10×', label: 'Plus rapide', hint: 'vs Excel + cabinet externe' },
        ]}
      />

      <MarketingSection paper>
        <SectionHeader
          eyebrow="Quatre piliers produit"
          title={
            <>
              Tout l’actionnariat salarié,{' '}
              <span className="serif-italic text-brass-700">en un seul outil</span>.
            </>
          }
          description="Plans, attribution, valorisation, audit. Conçu en France pour les sociétés françaises, avec la rigueur d’un cabinet M&A."
        />
      </MarketingSection>

      <BigFeature
        eyebrow="Plans & Attributions"
        title="Créez vos plans en quelques clics, attribuez en toute conformité."
        description="Du wizard 7 étapes à la validation AGE automatique : 5 instruments natifs, calendaires ou conditionnels, contraintes légales pré-câblées."
        bullets={[
          '5 instruments natifs : BSPCE, Stock Options, AGA, RSU, BSA',
          'Wizard guidé avec auto-save et compliance live',
          'Validation automatique des contraintes légales (plafonds AGA, art. 163 bis G CGI)',
          'Workflow d’approbation N-niveaux (CFO → CEO → Board)',
          'Templates GLOBAL prêts à l’emploi (DOCX/PDF)',
        ]}
        cta={{ label: 'Découvrir le module Plans', href: '/produit/plans' }}
        visual={<HomepageDashboardMockup className="w-full" />}
      />

      <BigFeature
        reverse
        eyebrow="Valorisation IFRS 2"
        title={
          <>
            Monte Carlo 100 000 paths.{' '}
            <span className="serif-italic text-brass-700">Aussi simple qu’un export Excel.</span>
          </>
        }
        description="Pricer Black-Scholes & Heston, conditions de performance multi-conditions, juste valeur par tranche. Inclus, pas facturé en sus."
        bullets={[
          'Pricer Black-Scholes & Heston (modèle paramétrique)',
          'Conditions de performance (TSR, VWAP, EBITDA, market metrics)',
          'Juste valeur par tranche, refresh trimestriel automatique',
          'Visualisation Monte Carlo native (pas un PDF mort)',
          'Audit-ready : exports CAC + traces complètes',
        ]}
        cta={{ label: 'Découvrir la valorisation IFRS 2', href: '/produit/valorisation-ifrs2' }}
        visual={<MonteCarloVisual className="h-full w-full" />}
      />

      <BigFeature
        eyebrow="Conformité & Audit"
        title="Au-dessus du standard CAC, pas en-dessous."
        description="Audit trail immuable hash-chainé, exports auditeurs, defense-in-depth multi-tenant à 4 couches. Pensé pour passer le contrôle d’un Big Four."
        bullets={[
          'Audit trail immuable (hash chain SHA-256)',
          'Exports auditeurs (CSV, JSON, PDF) en 1 clic',
          'Chaîne d’approbation auditable, idempotente',
          'Defense-in-depth 4 couches (RLS · TENANT_VIOLATION · server checks · UI)',
          'Signature eIDAS qualifiée avancée via Yousign',
        ]}
        cta={{ label: 'Voir la conformité FR', href: '/produit/conformite-fr' }}
        visual={<AuditVisual className="h-full w-full" />}
      />

      <BigFeature
        reverse
        eyebrow="Portail bénéficiaire"
        title="Vos salariés comprennent enfin leur equity."
        description="Vesting visualisé, simulateur de départ, documents centralisés. Un espace dédié qui transforme leur stock-option de mystère en levier de motivation."
        bullets={[
          'Vesting timeline interactive avec progression cumulée',
          'Simulateur de départ (Good / Bad leaver, accélération)',
          'Documents signés en ligne, accès permanent',
          'Notifications smart sur les jalons (cliff, exercice ouvert)',
          'Espace RH dédié pour onboarding bénéficiaire',
        ]}
        cta={{ label: 'Découvrir le portail bénéficiaire', href: '/produit/portail-beneficiaire' }}
        visual={<PortalVisual className="h-full w-full" />}
      />

      <BigFeature
        eyebrow="Approbations & Workflow"
        title="Une chaîne d’approbation que vos auditeurs vont adorer."
        description="Définissez vos workflows N-niveaux, séquentiels ou parallèles, avec idempotence native et audit log automatique."
        bullets={[
          'Workflow custom illimité (jusqu’à 10 niveaux)',
          'Approbation séquentielle ou parallèle',
          'Idempotence stricte (impossible de double-approuver)',
          'Repli automatique si SLA dépassé (V2)',
          'Multi-org natif pour groupes avec filiales',
        ]}
        cta={{ label: 'Voir le module Attribution', href: '/produit/attribution' }}
        visual={<ApprovalVisual className="h-full w-full" />}
      />

      <MarketingSection paper>
        <SectionHeader
          eyebrow="Comparatif"
          title={
            <>
              Pourquoi choisir Capiwise{' '}
              <span className="serif-italic text-brass-700">plutôt que Carta&nbsp;?</span>
            </>
          }
          description="Cinq critères qui font la différence quand on gère un actionnariat salarié français."
        />
        <div className="mt-8">
          <ComparisonTable
            columns={[
              { name: 'Capiwise', highlight: true },
              { name: 'Carta' },
              { name: 'Uplaw' },
              { name: 'Equify' },
            ]}
            categories={[
              {
                title: 'Différenciation',
                rows: [
                  {
                    label: 'Conformité FR native (art. 163 bis G CGI)',
                    values: [
                      { type: 'check' },
                      { type: 'partial', label: 'Manuel' },
                      { type: 'check' },
                      { type: 'check' },
                    ],
                  },
                  {
                    label: 'Valorisation IFRS 2 incluse',
                    values: [
                      { type: 'check', label: 'Inclus' },
                      { type: 'paid', label: '$2-5k / valuation' },
                      { type: 'missing' },
                      { type: 'missing' },
                    ],
                  },
                  {
                    label: 'Hébergement France / RGPD strict',
                    values: [
                      { type: 'check' },
                      { type: 'warning', label: 'US / Cloud Act' },
                      { type: 'check' },
                      { type: 'check' },
                    ],
                  },
                  {
                    label: 'Pricing transparent',
                    values: [
                      { type: 'check', label: 'Public' },
                      { type: 'partial', label: 'Sales' },
                      { type: 'missing', label: 'Sur devis' },
                      { type: 'missing', label: 'Sur devis' },
                    ],
                  },
                  {
                    label: 'Multi-tenant audit-ready',
                    values: [
                      { type: 'check', label: '4 couches' },
                      { type: 'unknown' },
                      { type: 'unknown' },
                      { type: 'unknown' },
                    ],
                  },
                ],
              },
            ]}
            caption="Comparatif détaillé (≈30 lignes) sur la page dédiée."
          />
        </div>
        <div className="mt-6 text-center">
          <a
            href="/comparatif"
            className="text-brass-700 hover:text-brass-900 inline-flex items-center gap-1.5 text-sm font-medium"
          >
            Voir le comparatif détaillé →
          </a>
        </div>
      </MarketingSection>

      <MarketingSection>
        <SectionHeader
          eyebrow="Témoignages"
          title="Ce que disent nos premiers utilisateurs"
          description="Retours collectés en beta privée. Versions anonymisées pour préserver la confidentialité avant publication officielle."
        />
        <div className="mt-12">
          {/* TESTIMONIAL_PLACEHOLDER: à remplacer post-beta du 18 mai 2026 */}
          <TestimonialGrid
            placeholder
            testimonials={[
              {
                quote:
                  'On gérait nos BSPCE sur Excel. Le passage à Capiwise nous a fait gagner trois jours sur chaque attribution et a sécurisé notre passage en Série A.',
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
                  'Le portail bénéficiaire a transformé l’equity de zone d’ombre à levier de rétention. Nos salariés comprennent enfin ce qu’ils ont.',
                author: 'CHRO Groupe C',
                role: 'CHRO',
                company: 'Groupe industriel · ETI',
                initials: 'GC',
              },
            ]}
          />
        </div>
      </MarketingSection>

      <TrustBadges
        title="Sécurité, conformité, transparence"
        badges={[
          { label: 'RGPD strict', hint: 'DPO + registre + DPIA' },
          { label: 'Hébergement FR', hint: 'Vercel EU + Supabase EU' },
          { label: 'eIDAS qualifié', hint: 'Yousign avancé' },
          { label: 'ISO 27001', hint: 'Certification en cours · Q4 2026' },
          { label: 'Audit trail immuable', hint: 'Hash chain SHA-256' },
        ]}
      />

      <CTABanner
        eyebrow="Prêt à structurer votre actionnariat salarié ?"
        title="Démo personnalisée en 30 minutes."
        description="Sans engagement. Notre équipe vous montre comment Capiwise s’adapte à votre stade, vos instruments et votre stack."
        primaryCta={{ label: 'Demander une démo', href: '/contact' }}
        secondaryCta={{ label: 'Voir les tarifs', href: '/tarifs' }}
      />
    </MarketingLayout>
  );
}
