import type { Metadata } from 'next';
import { LegalDraftBanner, LegalHeader } from '../_components';

export const metadata: Metadata = {
  title: 'Conditions d’utilisation',
};

const LAST_UPDATED = '5 mai 2026';

export default function TermsPage() {
  return (
    <>
      <LegalHeader
        title="Conditions d’utilisation."
        intro={`Dernière mise à jour : ${LAST_UPDATED}. Version v1.0-2026-05-05.`}
      />
      <LegalDraftBanner />

      <h2>1. Présentation du service</h2>
      <p>
        <strong>Capiwise</strong> est une plateforme SaaS éditée par Capiwise SAS, société par
        actions simplifiée immatriculée au RCS de Paris, dont le siège social est à Paris (France).
        Le service est exclusivement destiné aux entreprises (clients B2B) souhaitant gérer leurs
        plans d’actionnariat salarié (BSPCE, actions gratuites — AGA, stock options, BSA, RSU).
      </p>

      <h2>2. Acceptation des conditions</h2>
      <p>
        L’utilisation du service implique l’acceptation pleine et entière des présentes conditions
        d’utilisation. La création d’un compte vaut acceptation. Les mises à jour des conditions
        seront notifiées aux utilisateurs disposant d’un compte actif au moins 30 jours avant leur
        prise d’effet.
      </p>

      <h2>3. Compte utilisateur</h2>
      <ul>
        <li>
          L’inscription se fait par email professionnel, via un lien de connexion sécurisé (sans mot
          de passe).
        </li>
        <li>
          Chaque utilisateur est responsable de la confidentialité de l’accès à sa boîte email.
        </li>
        <li>
          Capiwise se réserve le droit de suspendre tout compte en cas d’usage non conforme aux
          présentes.
        </li>
      </ul>

      <h2>4. Données et conformité</h2>
      <p>
        Capiwise traite des données à caractère personnel et des informations financières sensibles
        (rémunération, identité, données fiscales). L’éditeur s’engage à respecter le Règlement
        général sur la protection des données (RGPD), la loi française « Informatique et libertés »
        et les normes IFRS 2 applicables à la valorisation des plans. Voir la
        <a href="/legal/privacy"> Politique de confidentialité</a> et l’
        <a href="/legal/dpa">Accord de traitement (DPA)</a>.
      </p>

      <h2>5. Disponibilité et maintenance</h2>
      <p>
        Le service est fourni « en l’état », sans garantie de disponibilité ininterrompue. Capiwise
        s’efforce de maintenir un taux de disponibilité supérieur à 99,5 % hors fenêtres de
        maintenance planifiées et incidents tiers (Supabase, Vercel, Resend, Yousign).
      </p>

      <h2>6. Responsabilité</h2>
      <p>
        Capiwise ne saurait être tenu responsable des décisions prises par les clients sur la base
        des données affichées sur la plateforme. Les calculs (valorisation, fiscalité, amortissement
        IFRS 2) sont fournis à titre indicatif. Le client demeure responsable des déclarations
        légales auprès des autorités (URSSAF, DGFiP, AMF, etc.).
      </p>

      <h2>7. Résiliation</h2>
      <p>
        Le client peut résilier son abonnement à tout moment depuis son espace administrateur.
        Capiwise peut résilier le contrat en cas de manquement grave après mise en demeure restée
        sans effet pendant 30 jours.
      </p>

      <h2>8. Droit applicable</h2>
      <p>
        Les présentes conditions sont régies par le droit français. Tout litige sera porté devant
        les tribunaux compétents de Paris, à défaut d’accord amiable.
      </p>

      <h2>9. Contact</h2>
      <p>
        Pour toute question concernant ces conditions, contactez{' '}
        <a href="mailto:legal@capiwise.com">legal@capiwise.com</a>.
      </p>
    </>
  );
}
