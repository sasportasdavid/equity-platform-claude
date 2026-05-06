import type { Metadata } from 'next';
import { MarketingLayout } from '@/components/marketing/layout';
import {
  CTABanner,
  HeroSmall,
  MarketingSection,
  SectionHeader,
} from '@/components/marketing/sections';
import { FAQAccordion } from '@/components/marketing/faq';

export const metadata: Metadata = {
  title: 'FAQ — Questions fréquentes sur Capiwise',
  description:
    'Plateforme, BSPCE, AGA, Stock Options, IFRS 2, sécurité, RGPD, tarification. Plus de 30 questions/réponses.',
  alternates: { canonical: 'https://www.capiwise.fr/ressources/faq' },
};

const PLATFORM_FAQ = [
  {
    question: 'Capiwise est-elle adaptée aux startups early-stage ?',
    answer:
      'Oui, le tier Starter (gratuit) couvre 1 plan + 10 bénéficiaires + 1 valorisation/an. Idéal pour valider l’outil avant Série A.',
  },
  {
    question: 'Combien de temps pour onboarder ?',
    answer:
      'Starter / Growth : self-service en 30 minutes. Scale : onboarding accompagné sur 2 semaines (1h/sem). Enterprise : sur-mesure (2-8 semaines selon complexité).',
  },
  {
    question: 'Y a-t-il une API ?',
    answer:
      'API REST disponible sur Scale et Enterprise. Webhooks pour les événements clés (attribution, levée, signature). Documentation OpenAPI publiée en V1.X.',
  },
  {
    question: 'Comment migrer depuis Excel ?',
    answer:
      'Import CSV bénéficiaires + import share classes. Templates fournis. Migration accompagnée pour Scale et Enterprise.',
  },
  {
    question: 'Comment migrer depuis Carta / Uplaw ?',
    answer:
      'Format CSV cap table standard. L’équipe Capiwise vous accompagne dans la migration (inclus pour Scale et Enterprise).',
  },
];

const BSPCE_FAQ = [
  {
    question: 'Ma société est-elle éligible aux BSPCE ?',
    answer:
      'Critères cumulatifs : moins de 15 ans, capitalisation < 150 M€, soumise à l’IS, 50 % du capital détenu par PP. Le wizard Capiwise vérifie automatiquement ces critères à la création du plan.',
  },
  {
    question: 'Quel calendrier de vesting choisir pour les BSPCE ?',
    answer:
      '4 ans / 1 an cliff est le standard Tech français (25 % au cliff, puis 1/48ᵉ par mois). Pour les profils key hires senior, 3 ans / 1 an cliff. Les conditions de performance sont possibles mais pas obligatoires.',
  },
  {
    question: 'Comment se passe la fiscalité avant 3 ans ?',
    answer:
      'Plus-value imposée au taux forfaitaire de 30 % (12,8 % IR + 17,2 % PS). Identique au régime PFU classique mais sans alternative au barème IR.',
  },
  {
    question: 'Comment se passe la fiscalité après 3 ans ?',
    answer:
      'PFU 30 % par défaut. Alternative possible : barème progressif IR + 17,2 % PS, à choisir selon votre TMI. Le simulateur de départ Capiwise calcule les deux scénarios.',
  },
  {
    question: 'Puis-je attribuer des BSPCE à un consultant ?',
    answer:
      'Non. Les BSPCE sont réservés aux salariés et mandataires sociaux. Pour un consultant, utilisez des BSA (zéro charges sociales société, mais pas de régime fiscal préférentiel pour le bénéficiaire).',
  },
  {
    question: 'Puis-je attribuer des BSPCE à un tiers étranger non résident ?',
    answer:
      'Oui si le bénéficiaire est lié à la société par un contrat de travail français ou un mandat social. La fiscalité s’applique selon la convention bilatérale FR-pays de résidence.',
  },
  {
    question: 'Que se passe-t-il en cas de cession de la société ?',
    answer:
      'Si BSPCE non encore exercés : généralement remboursement par l’acquéreur à la juste valeur (cash-out). Le module M&A V1.1 (PR #49) gère ces cessions globales.',
  },
  {
    question: 'Combien de temps pour exercer après attribution ?',
    answer:
      'Pas de durée légale. La pratique : 5 à 10 ans à partir de la date d’attribution. Un délai trop court (< 5 ans) peut être requalifié fiscalement.',
  },
];

const AGA_FAQ = [
  {
    question: 'Quel est le plafond AGA ?',
    answer:
      '30 % du capital social cumulé. Le wizard Capiwise refuse de créer un plan ou une attribution qui pousserait au-delà. Soft warning à 27 %.',
  },
  {
    question: 'Quel cliff minimum pour les AGA ?',
    answer:
      '1 an légal (loi Macron 2015). En pratique, la plupart des plans AGA Performance utilisent 3 ans + conditions TSR.',
  },
  {
    question: 'Comment fonctionnent les conditions de performance AGA ?',
    answer:
      'Conditions service (présence) + conditions performance (KPI EBITDA, ARR) + market conditions (TSR, cours boursier). Toutes calculées par Monte Carlo Capiwise.',
  },
  {
    question: 'Charges sociales sur AGA ?',
    answer:
      '20 % côté société (plus douces que SO à 47 %). Côté bénéficiaire : gain d’acquisition imposé au barème IR + 9,7 % PS, plus-value de cession au PFU 30 %.',
  },
  {
    question: 'AGA pour des dirigeants non salariés ?',
    answer:
      'Oui pour mandataires sociaux SA / SAS. Vérification automatique de l’éligibilité dans le wizard Capiwise.',
  },
];

const SO_FAQ = [
  {
    question: 'Quelle différence entre BSPCE et SO ?',
    answer:
      'BSPCE = régime fiscal favorable (PFU 30 %, 0 % charges société) mais société éligible. SO = régime IR + 47 % charges société, mais éligible à toute société.',
  },
  {
    question: 'Quand utiliser des SO plutôt que des BSPCE ?',
    answer:
      'Société non éligible (>15 ans ou >150M€), bénéficiaire non éligible (consultant), ou holding internationale qui veut un instrument standardisé.',
  },
  {
    question: 'Le wizard Capiwise gère-t-il les SO multi-juridiction ?',
    answer:
      'V1 = FR uniquement. V1.X = extension multi-juridiction (UK Limited, US Delaware, DE GmbH).',
  },
];

const VALUATION_FAQ = [
  {
    question: 'Quels modèles de valorisation sont supportés ?',
    answer:
      'Black-Scholes (formule fermée, vanilla), Heston (volatilité stochastique), Monte Carlo (100K paths). Le routeur auto sélectionne le modèle adapté en V1.X — V1 utilise Monte Carlo Multi-Tranche partout.',
  },
  {
    question: 'Combien de temps prend une valorisation ?',
    answer:
      'Black-Scholes : <1s. Heston : 5–10s. Monte Carlo 100K paths : 30–60s pour des plans simples, jusqu’à 2 min pour multi-tranches complexes.',
  },
  {
    question: 'À quelle fréquence faut-il refaire la valorisation ?',
    answer:
      'Trimestriel pour les sociétés cotées et filiales de groupes IFRS. Annuel acceptable pour les non cotées en PCG. Capiwise : cron mensuel automatique, refresh manuel possible à tout moment.',
  },
  {
    question: 'Mes commissaires aux comptes acceptent-ils vos sorties ?',
    answer:
      'Le rapport contient inputs, outputs, méthodologie, payload Python stocké. Compatible CAC français standards. Validation Big Four en cours.',
  },
  {
    question: 'Puis-je rejouer une valorisation passée ?',
    answer:
      'Oui via le replay viewer. Tous les inputs sont stockés (hash SHA-256 pour intégrité), la simulation est ré-exécutable bit à bit. Idéal pour audit annuel CAC.',
  },
];

const SECURITY_FAQ = [
  {
    question: 'Où sont hébergées mes données ?',
    answer:
      'Vercel EU (Paris) pour le frontend, Supabase EU (Dublin) pour la DB et le storage, Sentry DE (Frankfurt) pour le monitoring. Aucun transfert hors UE.',
  },
  {
    question: 'Êtes-vous certifiés ISO 27001 ?',
    answer:
      'Pas encore. Certification en cours pour Q4 2026. SOC 2 Type II prévu 2027. En attendant : RGPD strict, defense-in-depth 4 couches, audit trail immuable.',
  },
  {
    question: 'Comment fonctionne le chiffrement ?',
    answer:
      'At-rest : AES-256 (Supabase). In-transit : TLS 1.3. Le téléphone des bénéficiaires est chiffré au niveau application (pgcrypto).',
  },
  {
    question: 'Que se passe-t-il en cas de breach ?',
    answer:
      'Notification CNIL sous 72h conformément RGPD. Notification clients impactés sous 24h. Procédure documentée dans notre runbook interne.',
  },
  {
    question: 'Puis-je exporter toutes mes données ?',
    answer:
      'Oui à tout moment. Export complet CSV / JSON / PDF. Conforme droit à la portabilité RGPD article 20.',
  },
];

const PRICING_FAQ = [
  {
    question: 'Le tier Starter est-il vraiment gratuit ?',
    answer:
      'Oui, 100 % gratuit, dans la limite de 1 plan + 10 bénéficiaires + 1 valorisation/an. Idéal pour valider Capiwise avant Série A.',
  },
  {
    question: 'Comment se passe la facturation ?',
    answer:
      'Annuel par défaut. Mensuel disponible (+10 %). Paiement SEPA, CB Stripe ou prélèvement.',
  },
  {
    question: 'Y a-t-il des frais de mise en place ?',
    answer:
      'Pas pour Starter / Growth / Scale. Pour Enterprise, l’onboarding sur-mesure peut être facturé selon la complexité.',
  },
  {
    question: 'Puis-je résilier en cours d’engagement ?',
    answer: 'Engagement 12 mois. Résiliation 30 jours avant échéance par email. Pas de pénalité.',
  },
];

export default function FaqPage() {
  return (
    <MarketingLayout>
      <HeroSmall
        eyebrow="FAQ"
        title="Questions fréquentes"
        description="Plus de 30 questions / réponses sur la plateforme, les instruments d’actionnariat salarié, la valorisation IFRS 2, la sécurité et la tarification."
      />

      <MarketingSection>
        <SectionHeader eyebrow="Plateforme" title="Capiwise en général" align="left" />
        <div className="mt-8">
          <FAQAccordion items={PLATFORM_FAQ} />
        </div>
      </MarketingSection>

      <MarketingSection paper>
        <SectionHeader
          eyebrow="BSPCE"
          title="Bons de Souscription de Parts de Créateur d’Entreprise"
          align="left"
        />
        <div className="mt-8">
          <FAQAccordion items={BSPCE_FAQ} />
        </div>
      </MarketingSection>

      <MarketingSection>
        <SectionHeader eyebrow="AGA" title="Actions Gratuites" align="left" />
        <div className="mt-8">
          <FAQAccordion items={AGA_FAQ} />
        </div>
      </MarketingSection>

      <MarketingSection paper>
        <SectionHeader eyebrow="Stock Options" title="Stock Options classiques" align="left" />
        <div className="mt-8">
          <FAQAccordion items={SO_FAQ} />
        </div>
      </MarketingSection>

      <MarketingSection>
        <SectionHeader eyebrow="IFRS 2" title="Valorisation IFRS 2" align="left" />
        <div className="mt-8">
          <FAQAccordion items={VALUATION_FAQ} />
        </div>
      </MarketingSection>

      <MarketingSection paper>
        <SectionHeader eyebrow="Sécurité" title="Sécurité & RGPD" align="left" />
        <div className="mt-8">
          <FAQAccordion items={SECURITY_FAQ} />
        </div>
      </MarketingSection>

      <MarketingSection>
        <SectionHeader eyebrow="Tarification" title="Pricing & facturation" align="left" />
        <div className="mt-8">
          <FAQAccordion items={PRICING_FAQ} />
        </div>
      </MarketingSection>

      <CTABanner
        title="Une question pas couverte ?"
        description="Notre équipe technique répond sous 24 h ouvrées."
        primaryCta={{ label: 'Nous contacter', href: '/contact' }}
      />
    </MarketingLayout>
  );
}
