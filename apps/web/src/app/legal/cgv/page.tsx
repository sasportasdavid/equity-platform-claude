import type { Metadata } from 'next';
import { LegalDraftBanner, LegalHeader } from '../_components';

export const metadata: Metadata = {
  title: 'Conditions générales de vente (CGV)',
  description:
    'CGV applicables aux abonnements à la plateforme Capiwise — souscription, tarifs, paiement, durée, résiliation, garanties.',
  alternates: { canonical: 'https://www.capiwise.fr/legal/cgv' },
};

{
  /* LEGAL_REVIEW_REQUIRED: à valider avec avocat avant lancement public */
}

export default function CgvPage() {
  return (
    <>
      <LegalHeader
        title="Conditions générales de vente"
        intro="CGV applicables aux abonnements à la plateforme Capiwise. Conditions susceptibles d’évoluer — version en vigueur disponible sur cette page."
      />
      <LegalDraftBanner />

      <h2>1. Définitions</h2>
      <p>
        <strong>Capiwise</strong> : Capiwise SAS, éditeur de la plateforme.
        <br />
        <strong>Client</strong> : société souscrivant un abonnement à la plateforme.
        <br />
        <strong>Plateforme</strong> : application SaaS accessible à l’adresse
        https://www.capiwise.fr.
        <br />
        <strong>Service</strong> : ensemble des fonctionnalités de la Plateforme accessibles selon
        le plan d’abonnement souscrit.
        <br />
        <strong>Bénéficiaire</strong> : personne physique attribuée d’instruments d’actionnariat
        salarié dans le cadre d’un plan géré sur la Plateforme.
      </p>

      <h2>2. Souscription &amp; abonnement</h2>
      <p>
        La souscription à un abonnement Capiwise se fait par signature d’un bon de commande ou
        acceptation en ligne d’un devis. L’abonnement prend effet à la date d’activation du compte
        par Capiwise et pour une durée de 12 mois.
      </p>

      <h2>3. Tarification</h2>
      <p>
        Les tarifs sont publiés sur la page <a href="/tarifs">/tarifs</a>. Quatre plans sont
        disponibles : Starter (gratuit), Growth, Scale, Enterprise (sur devis). Les conditions
        spécifiques au plan choisi (quotas, fonctionnalités) sont précisées dans le bon de commande.
      </p>

      <h2>4. Modalités de paiement</h2>
      <p>
        Paiement annuel par défaut, en début d’abonnement. Paiement mensuel disponible sur Growth et
        Scale (+10 %). Modes acceptés : virement SEPA, CB via Stripe, prélèvement SEPA. Délai
        standard 30 jours fin de mois pour Scale et Enterprise.
      </p>

      <h2>5. Durée &amp; résiliation</h2>
      <p>
        Engagement initial de 12 mois renouvelables tacitement par périodes successives de 12 mois.
        Résiliation possible 30 jours avant échéance par email à{' '}
        <a href="mailto:contact@capiwise.fr">contact@capiwise.fr</a>. Pas de pénalité de
        résiliation.
      </p>

      <h2>6. Service Level Agreement (SLA)</h2>
      <p>
        Capiwise s’engage à un taux de disponibilité de 99,5 % en mode Growth et 99,9 % en mode
        Scale et Enterprise (calculé sur le mois civil). Maintenance planifiée hors heures ouvrées
        (week-end, jours fériés) ne compte pas comme indisponibilité.
      </p>

      <h2>7. Garanties</h2>
      <p>
        Capiwise garantit le bon fonctionnement de la Plateforme conformément aux spécifications. En
        cas de défaillance avérée, Capiwise s’engage à corriger dans les meilleurs délais. La
        responsabilité de Capiwise est limitée au montant de l’abonnement annuel.
      </p>

      <h2>8. Force majeure</h2>
      <p>
        Aucune des parties ne pourra être tenue responsable d’une inexécution de ses obligations en
        cas de force majeure (pannes opérateurs, attaques DDoS, catastrophes naturelles, décisions
        gouvernementales).
      </p>

      <h2>9. Données personnelles</h2>
      <p>
        Capiwise agit en tant que sous-traitant pour les données personnelles des bénéficiaires
        gérés via la Plateforme. Les conditions de traitement sont précisées dans notre{' '}
        <a href="/legal/dpa">DPA</a> et notre{' '}
        <a href="/legal/privacy">politique de confidentialité</a>.
      </p>

      <h2>10. Propriété intellectuelle</h2>
      <p>
        Le Client conserve la propriété de ses données. Capiwise conserve la propriété de la
        Plateforme, du code source, du design et de la documentation. Une licence d’usage non
        exclusive et non transférable est concédée au Client pendant la durée de l’abonnement.
      </p>

      <h2>11. Confidentialité</h2>
      <p>
        Les parties s’engagent à conserver confidentielles toutes les informations échangées dans le
        cadre du contrat (données du Client, fonctionnalités non publiques de Capiwise).
      </p>

      <h2>12. Loi applicable &amp; juridiction</h2>
      <p>
        Les présentes CGV sont soumises au droit français. Tout litige relèvera de la compétence
        exclusive des tribunaux de Paris, après tentative de résolution amiable.
      </p>
    </>
  );
}
