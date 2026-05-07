import type { Metadata } from 'next';
import {
  ArrowDownToLine,
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  Receipt,
  RefreshCcw,
} from 'lucide-react';
import { ProductPage } from '@/components/marketing/product-page';
import { ExerciseVisual } from '@/components/marketing/visuals';

export const metadata: Metadata = {
  title: 'Levée d’options — Workflow rigoureux et cap table à jour',
  description:
    'De l’intention à la souscription effective : demande bénéficiaire, validation employeur, génération du bon de souscription, mise à jour cap table automatique.',
  alternates: { canonical: 'https://www.capiwise.fr/produit/levee-options' },
};

export default function ProduitExercisePage() {
  return (
    <ProductPage
      eyebrow="Module — Levée d’options"
      title={
        <>
          De l’intention à la souscription effective :{' '}
          <span className="serif-italic text-brass-700">un workflow ultra-rigoureux</span>.
        </>
      }
      description="Le bénéficiaire demande, l’employeur valide, le bon de souscription se génère, le cap table se met à jour. Sans bricolage Excel, sans email aller-retour."
      features={[
        {
          icon: ClipboardCheck,
          title: 'Demande bénéficiaire',
          description:
            'Le bénéficiaire initie sa levée depuis son portail, avec simulation fiscale temps réel.',
        },
        {
          icon: CheckCircle2,
          title: 'Validation employeur',
          description: 'Approbateur (CFO ou DAF) valide ou refuse la demande. Audit trail complet.',
        },
        {
          icon: ArrowDownToLine,
          title: 'Bon de souscription auto-généré',
          description: 'Document légal généré à la validation, signé via Yousign eIDAS, archivé.',
        },
        {
          icon: Banknote,
          title: 'Suivi encaissement',
          description:
            'Confirmation manuelle de paiement (V1) ou intégration bancaire (V2). Réconciliation par référence.',
        },
        {
          icon: RefreshCcw,
          title: 'Cap table mis à jour',
          description:
            'Snapshot avant/après automatique. Les BSPCE deviennent ordinaires, le cap table reflète immédiatement.',
        },
        {
          icon: Receipt,
          title: 'Audit fiscal complet',
          description:
            'Simulation fiscale FR 2026 archivée à la levée. Conforme contrôle URSSAF et fiscal.',
        },
      ]}
      bigFeatures={[
        {
          title: 'Du clic « Lever mes options » au cap table mis à jour, en 3 étapes.',
          description:
            'Tout est tracé, tout est signé, tout est audité. Le bénéficiaire n’a pas à vous demander où il en est, et vous n’avez pas à mettre à jour Excel à la main.',
          bullets: [
            'Demande bénéficiaire : sélection du nombre d’unités, simulation fiscale instantanée',
            'Validation employeur : approbation simple ou multi-niveaux selon le workflow',
            'Document : bon de souscription généré et signé via Yousign eIDAS',
            'Encaissement : référence bancaire ou IBAN dédié, confirmation manuelle',
            'Cap table : update automatique, snapshot avant/après',
          ],
          visual: <ExerciseVisual />,
        },
      ]}
      useCases={[
        {
          title: 'Levée pré-IPO',
          description:
            'Window d’exercice ouverte avant introduction. 80 bénéficiaires lèvent simultanément, traitement bulk avec workflow CFO + Board.',
        },
        {
          title: 'Levée standard 4 ans après grant',
          description:
            'BSPCE arrivent à maturité, le bénéficiaire lève 50 % via le portail. Cap table mis à jour sous 24h.',
        },
        {
          title: 'Sortie d’un dirigeant',
          description:
            'Window d’exercice limitée (3 mois post-départ). Notification automatique au bénéficiaire, suivi dashboard côté RH.',
        },
      ]}
      faq={[
        {
          question: 'Le calcul fiscal du simulateur est-il fiable ?',
          answer:
            'Oui, basé sur la lib pure TS testée par 56 cas Vitest. Couvre BSPCE (taux 30 % avant 3 ans, taux PFU après 3 ans), Stock Options (taux IR), AGA (taux gain d’acquisition + plus-value), BSA. Pour les cas particuliers (M&A, expat), V1.X.',
        },
        {
          question: 'Comment se passe l’encaissement ?',
          answer:
            'V1 : référence bancaire générée à la validation, suivi manuel par le DAF (confirmation dans le dashboard). V2 : intégration Stripe pour encaissement direct. V3 : compte titres Treezor.',
        },
        {
          question: 'Que se passe-t-il si le paiement n’arrive pas ?',
          answer:
            'Le DAF peut annuler la levée tant que le paiement n’est pas confirmé. La demande passe en CANCELLED, l’audit log retrace l’annulation, le bénéficiaire est notifié.',
        },
        {
          question: 'Puis-je ouvrir une window d’exercice limitée ?',
          answer:
            'Oui via les paramètres du plan. Vous définissez la période d’exercice (ex « 3 mois post-départ ») ou des windows fixes (ex « 1er trimestre chaque année »).',
        },
        {
          question: 'Le bon de souscription est-il opposable juridiquement ?',
          answer:
            'Oui, signé via Yousign eIDAS qualifié avancé. Valeur juridique équivalente à une signature manuscrite, archivage 10 ans, audit trail signature inclus.',
        },
      ]}
    />
  );
}
