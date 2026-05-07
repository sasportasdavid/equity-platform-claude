import type { Metadata } from 'next';
import { MarketingLayout } from '@/components/marketing/layout';
import {
  BigFeature,
  CTABanner,
  HeroSmall,
  MarketingSection,
  SectionHeader,
} from '@/components/marketing/sections';
import {
  ComparisonTable,
  type ComparisonCategory,
  type ComparisonColumn,
} from '@/components/marketing/pricing';

export const metadata: Metadata = {
  title: 'Comparatif — Capiwise vs Carta vs Uplaw vs Equify',
  description:
    'Pourquoi choisir Capiwise plutôt que Carta (US), Uplaw (juridique-first) ou Equify (UI-first) ? Comparatif détaillé : conformité FR, IFRS 2, hébergement, pricing.',
  alternates: { canonical: 'https://www.capiwise.fr/comparatif' },
};

const COLUMNS: ComparisonColumn[] = [
  { name: 'Capiwise', highlight: true },
  { name: 'Carta' },
  { name: 'Uplaw' },
  { name: 'Equify' },
];

const CATEGORIES: ComparisonCategory[] = [
  {
    title: 'Conformité française',
    rows: [
      {
        label: 'BSPCE art. 163 bis G CGI',
        values: [
          { type: 'check', label: 'Natif' },
          { type: 'partial', label: 'Manuel' },
          { type: 'check', label: 'Natif' },
          { type: 'check', label: 'Natif' },
        ],
      },
      {
        label: 'Validation AGE automatique',
        values: [{ type: 'check' }, { type: 'missing' }, { type: 'partial' }, { type: 'partial' }],
      },
      {
        label: 'AGA contraintes légales (cap 30 %)',
        values: [
          { type: 'check', label: 'Natif' },
          { type: 'missing' },
          { type: 'check' },
          { type: 'check' },
        ],
      },
      {
        label: 'RSU + BSA natifs',
        values: [{ type: 'check' }, { type: 'partial' }, { type: 'partial' }, { type: 'partial' }],
      },
    ],
  },
  {
    title: 'Valorisation IFRS 2',
    rows: [
      {
        label: 'Monte Carlo 100K paths',
        values: [
          { type: 'check', label: 'Inclus' },
          { type: 'paid', label: '$2-5k / val.' },
          { type: 'missing' },
          { type: 'missing' },
        ],
      },
      {
        label: 'Black-Scholes & Heston',
        values: [{ type: 'check' }, { type: 'check' }, { type: 'missing' }, { type: 'missing' }],
      },
      {
        label: 'Conditions de performance (TSR, VWAP, EBITDA)',
        values: [{ type: 'check' }, { type: 'check' }, { type: 'missing' }, { type: 'missing' }],
      },
      {
        label: 'Refresh trimestriel automatique',
        values: [{ type: 'check' }, { type: 'partial' }, { type: 'missing' }, { type: 'missing' }],
      },
      {
        label: 'Visualisation Monte Carlo native',
        values: [
          { type: 'check' },
          { type: 'partial', label: 'PDF only' },
          { type: 'missing' },
          { type: 'missing' },
        ],
      },
    ],
  },
  {
    title: 'Workflow & Approbations',
    rows: [
      {
        label: 'Approbation N-niveaux',
        values: [
          { type: 'check', label: '10 niveaux' },
          { type: 'partial' },
          { type: 'partial' },
          { type: 'partial' },
        ],
      },
      {
        label: 'Idempotence native',
        values: [{ type: 'check' }, { type: 'unknown' }, { type: 'unknown' }, { type: 'unknown' }],
      },
      {
        label: 'Multi-org natif (groupes)',
        values: [{ type: 'check' }, { type: 'missing' }, { type: 'partial' }, { type: 'partial' }],
      },
    ],
  },
  {
    title: 'Audit & Compliance',
    rows: [
      {
        label: 'Audit trail immuable',
        values: [
          { type: 'check', label: 'Hash chain' },
          { type: 'check' },
          { type: 'check' },
          { type: 'check' },
        ],
      },
      {
        label: 'Exports CAC',
        values: [{ type: 'check' }, { type: 'check' }, { type: 'check' }, { type: 'check' }],
      },
      {
        label: 'Defense-in-depth multi-tenant',
        values: [
          { type: 'check', label: '4 couches' },
          { type: 'unknown' },
          { type: 'unknown' },
          { type: 'unknown' },
        ],
      },
    ],
  },
  {
    title: 'Sécurité & RGPD',
    rows: [
      {
        label: 'Hébergement FR / EU',
        values: [
          { type: 'check' },
          { type: 'missing', label: 'US' },
          { type: 'check' },
          { type: 'check' },
        ],
      },
      {
        label: 'RGPD natif',
        values: [{ type: 'check' }, { type: 'partial' }, { type: 'check' }, { type: 'check' }],
      },
      {
        label: 'Cloud Act exposition',
        values: [
          { type: 'check', label: 'Hors zone' },
          { type: 'warning', label: 'Oui · US' },
          { type: 'check', label: 'Hors zone' },
          { type: 'check', label: 'Hors zone' },
        ],
      },
    ],
  },
  {
    title: 'Signature & Documents',
    rows: [
      {
        label: 'Signature eIDAS qualifiée',
        values: [
          { type: 'check', label: 'Yousign' },
          { type: 'check', label: 'DocuSign' },
          { type: 'check', label: 'DocuSign' },
          { type: 'check', label: 'Yousign' },
        ],
      },
      {
        label: 'Templates GLOBAL prêts à l’emploi',
        values: [{ type: 'check' }, { type: 'partial' }, { type: 'partial' }, { type: 'partial' }],
      },
    ],
  },
  {
    title: 'Pricing',
    rows: [
      {
        label: 'Tier gratuit',
        values: [
          { type: 'check', label: 'Starter' },
          { type: 'check', label: 'Launch (limité)' },
          { type: 'missing' },
          { type: 'missing' },
        ],
      },
      {
        label: 'Pricing transparent (public)',
        values: [
          { type: 'check' },
          { type: 'partial', label: 'Sales' },
          { type: 'missing', label: 'Sur devis' },
          { type: 'missing', label: 'Sur devis' },
        ],
      },
      {
        label: 'Prix entrée Growth tier',
        values: [
          { type: 'text', label: '1 490 €/an' },
          { type: 'text', label: '$2 988/an' },
          { type: 'text', label: 'Custom' },
          { type: 'text', label: 'Custom' },
        ],
      },
    ],
  },
];

export default function ComparatifPage() {
  return (
    <MarketingLayout>
      <HeroSmall
        eyebrow="Comparatif"
        title={
          <>
            Pourquoi choisir Capiwise plutôt que{' '}
            <span className="serif-italic text-brass-700">Carta, Uplaw ou Equify&nbsp;?</span>
          </>
        }
        description="Comparatif factuel, ligne par ligne. Pas de FUD, pas de claims gratuits — juste les faits vérifiables sur 7 catégories."
      />

      <ComparisonTable
        columns={COLUMNS}
        categories={CATEGORIES}
        caption={
          <>
            <strong className="text-ink-900">Légende :</strong>{' '}
            <span className="text-bond-700">✓ Natif/Inclus</span> ·{' '}
            <span className="text-saffron-700">∼ Partiel ou manuel</span> ·{' '}
            <span className="text-ink-400">— Non disponible</span> ·{' '}
            <span className="text-saffron-700">💰 Disponible mais facturé en sus</span> ·{' '}
            <span className="text-title-700">⚠ Risque</span> ·{' '}
            <span className="text-ink-400">❓ Non documenté publiquement</span>
            <br />
            <span className="mt-2 inline-block">
              Sources : sites web officiels des concurrents (consultés avril 2026), pricing publics,
              documentation technique. Si une info n’est pas vérifiable publiquement, c’est marqué «
              Non documenté ».
            </span>
          </>
        }
      />

      <MarketingSection paper>
        <SectionHeader eyebrow="Notre lecture" title="Comment Capiwise se positionne" />
      </MarketingSection>

      <BigFeature
        eyebrow="vs Carta"
        title="Carta est US-first. Capiwise est FR-first."
        description="Carta a 15 ans d’avance écosystème, mais leur conformité française est une feature secondaire. Pour une société française avec des BSPCE et de l’AGA, on est natif là où ils sont approximatifs. Plus l’IFRS 2 inclus."
        bullets={[
          'BSPCE art. 163 bis G CGI : natif chez nous, manuel chez Carta',
          'IFRS 2 : inclus chez nous, $2-5k/valuation chez Carta',
          'Hébergement : EU/FR chez nous, US chez Carta (Cloud Act)',
          'Pricing : public chez nous, sales-led chez Carta',
        ]}
      />

      <BigFeature
        reverse
        eyebrow="vs Uplaw"
        title="Uplaw est juridique-first. Capiwise est produit-first."
        description="Uplaw a 600+ clients FR et une excellente expertise juridique. Mais leur UX date des années 2010 et ils n’ont pas d’IFRS 2 ni de simulation. On les complémente plus qu’on ne les remplace pour les structures complexes ; on les surclasse pour le quotidien."
        bullets={[
          'IFRS 2 : inclus chez nous, absent chez Uplaw',
          'Simulation départ : native chez nous, absente chez Uplaw',
          'UX : moderne (Editorial Finance design system) chez nous',
          'Portail bénéficiaire : interactif chez nous, statique chez Uplaw',
        ]}
      />

      <BigFeature
        eyebrow="vs Equify"
        title="Equify est UI-first. Capiwise est CFO-first."
        description="Equify a un visuel sympathique mais peu de profondeur produit. Leur cap table est OK, mais pas d’IFRS 2, pas de Monte Carlo, pas de Compliance Engine V2. Pour une société qui veut juste un bel outil de cap table, ils suffisent. Pour passer un audit Big Four, non."
        bullets={[
          'IFRS 2 Monte Carlo : natif chez nous, absent chez Equify',
          'Compliance Engine V2 : 23 rules wired chez nous, 0 chez Equify',
          'Audit trail immuable hash-chainé chez nous',
          'Multi-org natif chez nous (groupes), pas chez Equify',
        ]}
      />

      <CTABanner
        eyebrow="Convaincu ?"
        title="Faisons le point sur vos besoins."
        description="30 minutes pour comprendre votre stack actuel et voir où Capiwise apporte de la valeur."
        primaryCta={{ label: 'Demander une démo', href: '/contact' }}
        secondaryCta={{ label: 'Voir les tarifs', href: '/tarifs' }}
      />
    </MarketingLayout>
  );
}
