import type { Metadata } from 'next';
import { LegalDraftBanner, LegalHeader } from '../_components';

export const metadata: Metadata = {
  title: 'Accord de traitement des données (DPA)',
};

const LAST_UPDATED = '5 mai 2026';

export default function DpaPage() {
  return (
    <>
      <LegalHeader
        title="Accord de traitement des données."
        intro={`Annexe au contrat de service · Dernière mise à jour : ${LAST_UPDATED}.`}
      />
      <LegalDraftBanner />

      <h2>1. Objet</h2>
      <p>
        Le présent Accord de traitement des données (« <strong>DPA</strong> ») encadre les
        traitements de données à caractère personnel effectués par Capiwise SAS («{' '}
        <strong>le Sous-traitant</strong> ») pour le compte de l’organisation cliente («{' '}
        <strong>le Responsable de traitement</strong> ») dans le cadre de l’utilisation de la
        plateforme Capiwise. Il constitue une annexe au contrat de service principal et s’applique
        de plein droit dès la création d’un compte.
      </p>

      <h2>2. Description du traitement</h2>
      <ul>
        <li>
          <strong>Nature</strong> : hébergement et traitement de données salariales et financières
          relatives aux plans d’actionnariat (BSPCE, AGA, SO, BSA, RSU).
        </li>
        <li>
          <strong>Catégories de personnes</strong> : collaborateurs administrateurs, bénéficiaires
          de plans, dirigeants et membres du conseil.
        </li>
        <li>
          <strong>Catégories de données</strong> : identité, coordonnées, données salariales,
          données fiscales (chiffrées via Supabase Vault), coordonnées bancaires (chiffrées).
        </li>
        <li>
          <strong>Durée</strong> : durée du contrat principal + 10 ans (conservation légale).
        </li>
      </ul>

      <h2>3. Obligations du Sous-traitant</h2>
      <p>Capiwise s’engage à :</p>
      <ul>
        <li>Ne traiter les données que sur instruction documentée du Responsable de traitement.</li>
        <li>
          Garantir la confidentialité des personnes habilitées à traiter les données (clauses
          internes + RBAC granulaire).
        </li>
        <li>
          Mettre en œuvre des mesures de sécurité conformes à l’article 32 du RGPD : chiffrement au
          repos et en transit, isolation par tenant (RLS), audit trail tamper-evident.
        </li>
        <li>
          N’avoir recours qu’aux sous-traitants ultérieurs listés à l’
          <a href="/legal/privacy#section-4">article 4 de la Politique de confidentialité</a>, et
          notifier le Responsable de tout changement avec un préavis de 30 jours.
        </li>
        <li>
          Aider le Responsable à répondre aux demandes d’exercice de droits des personnes concernées
          et à respecter les obligations des articles 32 à 36 du RGPD.
        </li>
        <li>Notifier au Responsable toute violation de données dans les 72 heures.</li>
      </ul>

      <h2>4. Localisation des données</h2>
      <p>
        Les données sont stockées dans des centres de données situés dans l’Espace Économique
        Européen (Supabase, région <code>eu-west-1</code> Irlande). Les sous-traitants ultérieurs
        situés hors EEE (Vercel, Resend) sont liés par des Clauses Contractuelles Types (SCC) et des
        accords de transfert de données conformes à la jurisprudence Schrems II.
      </p>

      <h2>5. Audit et conformité</h2>
      <p>
        Le Responsable peut demander une fois par an, sous préavis de 30 jours, un audit de
        conformité à ce DPA. Capiwise fournit également sur demande les rapports de tests
        d’intrusion et de conformité ISO 27001 dès que ces certifications seront obtenues.
      </p>

      <h2>6. Effacement et restitution</h2>
      <p>
        En fin de contrat, le Responsable peut demander l’effacement ou la restitution intégrale des
        données dans un délai de 30 jours, hors obligations de conservation légale (registres
        d’actionnariat IFRS 2.46).
      </p>

      <h2>7. Contact</h2>
      <p>
        Délégué à la protection des données :{' '}
        <a href="mailto:legal@capiwise.com">legal@capiwise.com</a>.
      </p>
    </>
  );
}
