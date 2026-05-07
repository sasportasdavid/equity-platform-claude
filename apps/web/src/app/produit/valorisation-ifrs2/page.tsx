import type { Metadata } from 'next';
import { BarChart3, Calculator, Clock, FileCheck, Layers3, Sparkles } from 'lucide-react';
import { ProductPage } from '@/components/marketing/product-page';
import { SectionHeader } from '@/components/marketing/sections';
import {
  MonteCarloViewer,
  MonteCarloViewerCompact,
} from '@/components/marketing/monte-carlo-viewer';

export const metadata: Metadata = {
  title: 'Valorisation IFRS 2 — Monte Carlo 100K paths inclus',
  description:
    'Pricer Black-Scholes & Heston, Monte Carlo 100K paths, conditions de performance multi-conditions. Inclus dans tous les plans (Carta vous facture 2-5k$ par valorisation).',
  alternates: { canonical: 'https://www.capiwise.fr/produit/valorisation-ifrs2' },
};

const ReplayViewerSection = () => (
  <section className="bg-paper-50 px-0 py-20">
    <div className="mx-auto w-full max-w-7xl px-6">
      <SectionHeader
        eyebrow="Replay viewer · Module 11"
        title={
          <>
            Le viewer Monte Carlo{' '}
            <span className="serif-italic text-brass-700">tel que vos auditeurs le voient</span>.
          </>
        }
        description="Pas un PDF mort. Une vue interactive avec trajectoires, percentiles p5/p50/p95, barrières, Greeks par différences finies, et tweaks live de la volatilité, barrière et maturité. Hash SHA-256 des inputs pour rejouabilité bit-à-bit."
      />
    </div>
    <div className="mx-auto mt-12 w-full max-w-[1400px] px-4 lg:px-10">
      <MonteCarloViewer />
    </div>
    <div className="mx-auto mt-16 w-full max-w-7xl px-6">
      <SectionHeader
        eyebrow="Pourquoi Capiwise pour IFRS 2"
        title={
          <>
            Inclus chez nous,{' '}
            <span className="serif-italic text-brass-700">facturé en sus partout ailleurs</span>.
          </>
        }
      />
      <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
        {[
          {
            before: 'Carta vous facture',
            big: '2 000–5 000 $',
            unit: 'par valorisation',
            after: 'Inclus chez Capiwise.',
          },
          {
            before: 'Cabinet externe (Big Four)',
            big: '10 000–15 000 €',
            unit: 'par exercice annuel',
            after: 'Inclus chez Capiwise.',
          },
          {
            before: 'Output Capiwise',
            big: 'Visualisation native',
            unit: 'pas un PDF mort',
            after: 'Replay Monte Carlo, audit trail, exports.',
          },
        ].map((card) => (
          <article
            key={card.big}
            className="border-paper-300 bg-paper-50 flex flex-col gap-3 rounded-xl border p-6"
          >
            <span className="text-overline text-ink-500">{card.before}</span>
            <span className="text-numeric-lg text-title-700">{card.big}</span>
            <span className="text-ink-500 text-xs">{card.unit}</span>
            <p className="text-bond-700 text-sm font-medium">{card.after}</p>
          </article>
        ))}
      </div>
    </div>
  </section>
);

export default function ProduitValuationPage() {
  return (
    <ProductPage
      eyebrow="Module — Valorisation IFRS 2"
      title={
        <>
          Valorisation IFRS 2 par Monte Carlo.{' '}
          <span className="serif-italic text-brass-700">Sans cabinet d’audit en plus</span>.
        </>
      }
      description="Pricer Black-Scholes & Heston, Monte Carlo 100K paths, conditions de performance multi-conditions, juste valeur par tranche, refresh trimestriel automatique."
      features={[
        {
          icon: Calculator,
          title: 'Pricer Black-Scholes & Heston',
          description:
            'Modèles paramétriques classiques pour les options vanilla. Heston pour les conditions de marché stochastiques.',
        },
        {
          icon: Sparkles,
          title: 'Monte Carlo 100K paths',
          description:
            'Pour les conditions de performance complexes (TSR, VWAP, multi-tranches). Convergence stable, IC 95 %.',
        },
        {
          icon: Layers3,
          title: 'Conditions de performance',
          description:
            'TSR (relatif vs benchmark), VWAP, EBITDA targets, KPI métiers. Multi-conditions ET / OU.',
        },
        {
          icon: BarChart3,
          title: 'Juste valeur par tranche',
          description:
            'Décomposition multi-tranches avec vesting calendaire ou conditionnel. Refresh incrémental sur modifications.',
        },
        {
          icon: Clock,
          title: 'Refresh trimestriel automatique',
          description:
            'Cron mensuel actif (10 plans concernés actuellement). Refresh annuel forcé via pg_cron.',
        },
        {
          icon: FileCheck,
          title: 'Audit-ready',
          description:
            'Inputs hash SHA-256, payload Python complet stocké, outputs typés. Conforme contrôle CAC.',
        },
      ]}
      bigFeatures={[
        {
          title: 'Visualisation Monte Carlo native, pas un PDF mort.',
          description:
            'Vous pouvez rejouer chaque simulation, voir les paths individuels, drilldown sur les tranches. Le moteur Python (FastAPI sur Fly.io) tourne en quelques secondes pour 100K paths.',
          bullets: [
            'Replay viewer interactif (zoom, hover, paths individuels)',
            'Greeks (Delta, Vega, Theta) calculés et affichés',
            'Debug paths pour inspection des trajectoires extrêmes',
            'Export PDF executive summary par exercice',
            'Compatible audit annuel CAC (template d’export dédié)',
          ],
          visual: <MonteCarloViewerCompact />,
        },
      ]}
      useCases={[
        {
          title: 'Première valorisation post-Série A',
          description:
            'Plan BSPCE de 10 bénéficiaires, 4 tranches de vesting. Black-Scholes en 2 clics, juste valeur par tranche, expense IFRS 2 sur 48 mois.',
        },
        {
          title: 'AGA Performance avec conditions TSR',
          description:
            'AGA pour C-level conditionnée à un TSR > benchmark sur 3 ans. Monte Carlo 100K paths, juste valeur stochastique précise.',
        },
        {
          title: 'Audit annuel CAC',
          description:
            'Refresh trimestriel automatique + export PDF auditeur. Le CAC reçoit les inputs, payloads et outputs en un seul package.',
        },
      ]}
      customSection={<ReplayViewerSection />}
      faq={[
        {
          question: 'Le moteur Python est-il vraiment déterministe ?',
          answer:
            'Oui pour Black-Scholes (formule fermée). Pour Monte Carlo, le seed est fixé par run pour assurer la reproductibilité. Le hash SHA-256 des inputs garantit qu’un même payload donnera toujours le même output.',
        },
        {
          question: 'Combien de temps prend une valorisation ?',
          answer:
            'Black-Scholes : <1s. Heston : 5–10s. Monte Carlo 100K paths : 30–60s. Pour les plans multi-tranches complexes, jusqu’à 2 min. Architecture asynchrone avec callback : pas de blocage UI.',
        },
        {
          question: 'Mes commissaires aux comptes acceptent-ils vos sorties ?',
          answer:
            'Le rapport contient tous les inputs (paramètres de marché, hypothèses, conditions de performance), les outputs (juste valeur, expense par période), et le payload Python stocké pour audit. Compatible CAC français standards. Validation Big Four en cours.',
        },
        {
          question: 'Puis-je modifier les inputs après valorisation ?',
          answer:
            'Oui via le module Modifications IFRS 2.27-28. Une nouvelle valorisation est générée, le delta (incremental fair value) est calculé et tracé. L’ancienne valorisation reste archivée.',
        },
        {
          question: 'Quelle est la fréquence de refresh ?',
          answer:
            'Cron mensuel automatique (1er du mois à 3h UTC). Refresh manuel possible à tout moment via UI. Pour V1.5, planification flexible (trimestriel, annuel, on-demand).',
        },
      ]}
    />
  );
}
