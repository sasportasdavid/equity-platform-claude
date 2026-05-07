import type { Metadata } from 'next';
import { MarketingLayout } from '@/components/marketing/layout';
import { ArticleLayout } from '../_components';

export const metadata: Metadata = {
  title: 'IFRS 2 démystifié — Valorisation des plans d’actionnariat salarié',
  description:
    'Comprendre IFRS 2 : pourquoi obligatoire, méthodes Black-Scholes/Heston/Monte Carlo, conditions de performance, étapes d’une valorisation, automatisation Capiwise.',
  alternates: { canonical: 'https://www.capiwise.fr/ressources/ifrs2-explique' },
};

export default function Ifrs2Page() {
  return (
    <MarketingLayout>
      <ArticleLayout
        category="Guide · IFRS 2"
        title="IFRS 2 démystifié"
        intro="Norme comptable internationale qui régit la valorisation des paiements en actions. Obligatoire en France pour les sociétés cotées et les filiales de groupes IFRS. Voici ce qu’il faut savoir."
        readTime="12 min"
      >
        <h2>Qu’est-ce qu’IFRS 2 ?</h2>
        <p>
          IFRS 2 (« Share-based Payment ») est la norme comptable internationale qui régit le
          traitement des paiements fondés sur des actions. Émise en 2004 par l’IASB, elle impose aux
          sociétés de comptabiliser une charge correspondant à la juste valeur des instruments
          d’actionnariat salarié attribués (BSPCE, SO, AGA, RSU, BSA).
        </p>
        <p>
          <strong>L’idée fondamentale</strong> : un BSPCE attribué à un salarié est une forme de
          rémunération. Cette rémunération doit donc apparaître dans le compte de résultat comme une
          charge, étalée sur la période de vesting.
        </p>

        <h2>Périmètre obligatoire en France</h2>
        <p>IFRS 2 s’applique :</p>
        <ul>
          <li>
            <strong>Sociétés cotées</strong> : obligatoire dans les comptes consolidés
          </li>
          <li>
            <strong>Filiales de groupes IFRS</strong> : obligatoire pour le reporting groupe
          </li>
          <li>
            <strong>Sociétés non cotées en Normes Françaises (PCG)</strong> : non obligatoire, mais
            bonne pratique pour la due diligence Série B+
          </li>
        </ul>

        <h2>Méthodes de valorisation</h2>
        <h3>Black-Scholes</h3>
        <p>
          Modèle paramétrique fermé pour les options vanilla. Inputs : prix sous-jacent, strike,
          volatilité, taux sans risque, dividendes, maturité. Calcul instantané (&lt;1s). Adapté aux
          BSPCE / SO sans condition de performance complexe.
        </p>
        <h3>Heston</h3>
        <p>
          Extension de Black-Scholes avec volatilité stochastique. Calcul en quelques secondes.
          Adapté aux options sensibles aux chocs de marché (TSR conditionnels).
        </p>
        <h3>Monte Carlo</h3>
        <p>
          Simulation stochastique. 100 000 paths simulés, calcul de la juste valeur moyenne avec
          intervalle de confiance. Indispensable pour les conditions de performance multi-tranches
          ou les market metrics complexes (TSR vs benchmark, VWAP fenêtre glissante).
        </p>

        <h2>Conditions de performance</h2>
        <p>IFRS 2 distingue deux types de conditions :</p>
        <ul>
          <li>
            <strong>Service conditions</strong> (présence) : le bénéficiaire doit rester salarié
            pendant la période de vesting. Affecte le nombre attribué, pas la juste valeur.
          </li>
          <li>
            <strong>Performance conditions non-marché</strong> (EBITDA, ARR) : affectent le nombre
            attribué, pas la juste valeur. Réestimées à chaque clôture.
          </li>
          <li>
            <strong>Market conditions</strong> (TSR, cours boursier, VWAP) : affectent la juste
            valeur. Calculées par Monte Carlo. Pas de réestimation à chaque clôture.
          </li>
        </ul>

        <h2>Étapes d’une valorisation</h2>
        <ol>
          <li>Identification de l’instrument (BSPCE, SO, AGA, etc.)</li>
          <li>Collecte des hypothèses (prix sous-jacent, volatilité, taux sans risque)</li>
          <li>Définition du calendrier de vesting (calendaire ou conditionnel)</li>
          <li>Choix de la méthode (Black-Scholes / Heston / Monte Carlo)</li>
          <li>Calcul de la juste valeur par tranche</li>
          <li>Génération de l’expense IFRS 2 sur la période de vesting</li>
          <li>Documentation pour audit (inputs, outputs, méthodologie)</li>
        </ol>

        <h2>Comment Capiwise automatise</h2>
        <p>
          Le moteur Python Capiwise (FastAPI sur Fly.io) implémente les 3 modèles. Il accepte des
          plans multi-tranches avec conditions de performance complexes, retourne la juste valeur
          par tranche et l’expense IFRS 2 par période. Visualisation Monte Carlo native intégrée à
          l’UI.
        </p>
        <p>
          <strong>Économie réelle</strong> : un cabinet d’expertise facture en moyenne 10–15k€ par
          exercice annuel pour une valorisation IFRS 2 multi-instrument. Capiwise inclut 4
          valorisations dans le tier Growth (1 490 €/an).
        </p>

        <h3>Refresh automatique</h3>
        <p>
          Cron pg_cron mensuel actif (1ᵉʳ du mois à 3h UTC). Refresh trimestriel ou annuel
          configurable selon votre cycle d’audit. Tous les inputs et outputs sont stockés et
          rejoyables (replay viewer).
        </p>

        <h2>Pour aller plus loin</h2>
        <ul>
          <li>
            <a href="/produit/valorisation-ifrs2">Module Valorisation IFRS 2 sur Capiwise</a>
          </li>
          <li>
            <a href="/ressources/guide-bspce">Le guide complet du BSPCE 2026</a>
          </li>
          <li>
            <a href="/comparatif">Capiwise vs Carta : pourquoi IFRS 2 inclus</a>
          </li>
        </ul>
      </ArticleLayout>
    </MarketingLayout>
  );
}
