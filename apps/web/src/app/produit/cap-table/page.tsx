import type { Metadata } from 'next';
import { Briefcase, Camera, FileSpreadsheet, GitBranch, History, Layers } from 'lucide-react';
import { ProductPage } from '@/components/marketing/product-page';
import { CapTableVisual } from '@/components/marketing/visuals';

export const metadata: Metadata = {
  title: 'Cap Table dynamique — Vue catégorielle, dilution, waterfall',
  description:
    'La table de capitalisation comme un avocat M&A la veut : vue catégorielle (ordinary, preferred, BSPCE, AGA), simulations de dilution, waterfall sortie, exports investisseurs.',
  alternates: { canonical: 'https://www.capiwise.fr/produit/cap-table' },
};

export default function ProduitCapTablePage() {
  return (
    <ProductPage
      eyebrow="Module — Cap Table dynamique"
      title={
        <>
          La table de capitalisation{' '}
          <span className="serif-italic text-brass-700">comme un avocat M&A la veut</span>.
        </>
      }
      description="Vue catégorielle, dilution simulée, waterfall sortie, exports investisseurs. Pour passer une due diligence Série B sans avoir à reconstruire un Excel."
      features={[
        {
          icon: Layers,
          title: 'Vue catégorielle',
          description:
            'Ordinary, Preferred A/B/C, BSPCE, AGA, RSU, BSA — chaque catégorie avec ses droits, son prix d’émission, sa date.',
        },
        {
          icon: GitBranch,
          title: 'Dilution simulée',
          description:
            'Scenarios déterministes : New Round, Pool top-up, Bulk Exercise, Exit. Comparaison côte-à-côte.',
        },
        {
          icon: Briefcase,
          title: 'Waterfall sortie',
          description:
            'Calcul détaillé en cas d’exit : préférences, participation, conversion, vesting acceleration.',
        },
        {
          icon: FileSpreadsheet,
          title: 'Exports investisseurs',
          description:
            'CSV, Excel, PDF executive summary. Format compatible due diligence (cap table standard).',
        },
        {
          icon: History,
          title: 'Versioning historique',
          description:
            'Snapshots quotidiens (V1.5) et auto post-round. Comparaison versions, rollback impossible (audit trail).',
        },
        {
          icon: Camera,
          title: 'Snapshots manuels',
          description:
            'Pour les moments clés : closing Série A, attribution massive, bulk exercise. Frozen et auditables.',
        },
      ]}
      bigFeatures={[
        {
          title: 'La vue dont les avocats M&A rêvent depuis 10 ans.',
          description:
            'Pas un simple tableau Excel : un cap table dynamique avec catégories séparées, dilution par scénario, et waterfall détaillé. Conçu pour que vos avocats aient zéro question.',
          bullets: [
            'Vue catégorielle (ordinary / preferred / pool BSPCE / AGA)',
            '4 scénarios déterministes (New Round, Pool Top-up, Bulk Exercise, Exit)',
            'Comparateur de dilution côte-à-côte',
            'Waterfall sortie avec préférences + participation + conversion',
            'Exports investisseurs au format due diligence standard',
          ],
          visual: <CapTableVisual />,
        },
      ]}
      useCases={[
        {
          title: 'Préparation Série B',
          description:
            'Simulation de dilution sur plusieurs rounds, comparaison pool top-up vs convertible note. Export PDF pour le pitch deck investisseur.',
        },
        {
          title: 'Due diligence acquéreur',
          description:
            'Cap table à jour en 2 clics, exports CSV/Excel attendus par les acquéreurs. Snapshot frozen au moment de la signature LOI.',
        },
        {
          title: 'Reporting board',
          description:
            'Snapshot mensuel avec dilution + équity allocation. Export PDF pour la slide « Equity » du board pack.',
        },
      ]}
      faq={[
        {
          question: 'Comment importer mon cap table existant ?',
          answer:
            'Import CSV bénéficiaires + import share classes manuel via le module dédié. Pour les cas complexes (multi-rounds, convertibles), contactez-nous pour un onboarding accompagné.',
        },
        {
          question: 'Le waterfall sortie inclut-il les conditions des liquidation preferences ?',
          answer:
            'Oui, vous définissez les préférences par share class (1x non-participating, 2x participating cap, etc). Le waterfall calcule le payout optimal pour chaque investisseur en fonction du multiple de sortie.',
        },
        {
          question: 'Les snapshots sont-ils signés cryptographiquement ?',
          answer:
            'Le hash du snapshot est stocké dans l’audit trail. Tout snapshot frozen est inviolable (RLS empêche update, hash chain SHA-256 verifie l’intégrité). Disponible en V1, étendu V2 avec timestamps qualifiés.',
        },
        {
          question: 'Puis-je exporter au format Carta CSV ?',
          answer:
            'V1 = format CSV standard cap table (compatible avec la plupart des outils de due diligence). Format Carta-spécifique en V1.X si demande client.',
        },
        {
          question: 'Les scénarios Monte Carlo de dilution sont-ils disponibles ?',
          answer:
            'Pas en V1. Les scénarios sont déterministes (paramètres fixes que vous définissez). Le Monte Carlo de dilution est prévu V1.5 (endpoint Python à livrer côté quant engine).',
        },
      ]}
    />
  );
}
