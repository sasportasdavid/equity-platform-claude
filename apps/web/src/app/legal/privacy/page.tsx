import type { Metadata } from 'next';
import { LegalDraftBanner, LegalHeader } from '../_components';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
};

const LAST_UPDATED = '5 mai 2026';

export default function PrivacyPage() {
  return (
    <>
      <LegalHeader
        title="Politique de confidentialité."
        intro={`Dernière mise à jour : ${LAST_UPDATED}.`}
      />
      <LegalDraftBanner />

      <h2>1. Responsable du traitement</h2>
      <p>
        Capiwise SAS, immatriculée au RCS de Paris, agit en qualité de responsable du traitement
        pour les données collectées via le site capiwise.com. Pour les données traitées au compte
        d’une organisation cliente (collaborateurs et bénéficiaires), Capiwise agit en qualité de
        sous-traitant au sens du RGPD — voir l’<a href="/legal/dpa">Accord de traitement (DPA)</a>.
      </p>

      <h2>2. Données collectées</h2>
      <ul>
        <li>
          <strong>Identifiants</strong> : email professionnel, prénom, nom, rôle/titre,
          organisation.
        </li>
        <li>
          <strong>Données salariales</strong> : poste, date d’embauche, données fiscales (résidence,
          numéro de sécurité sociale chiffré), coordonnées bancaires (IBAN/BIC chiffrés).
        </li>
        <li>
          <strong>Données financières</strong> : attributions d’actions/options (BSPCE, AGA, SO,
          BSA), prix d’exercice, vesting, dates de cession.
        </li>
        <li>
          <strong>Données techniques</strong> : adresse IP, user-agent, logs de connexion (utilisés
          uniquement pour la sécurité et l’audit).
        </li>
      </ul>

      <h2>3. Finalités</h2>
      <ul>
        <li>Exécution du contrat de service (gestion des plans, signature électronique).</li>
        <li>Conformité légale (audit IFRS 2, déclarations fiscales du client).</li>
        <li>
          Sécurité (lutte contre les accès non autorisés, audit trail tamper-evident — Module 13).
        </li>
        <li>Communication transactionnelle (emails de notification).</li>
      </ul>
      <p>
        <strong>Aucun tracking analytique ni publicitaire</strong> n’est mis en œuvre en V1. Aucune
        donnée personnelle n’est partagée avec des tiers à des fins marketing.
      </p>

      <h2>4. Sous-traitants techniques</h2>
      <ul>
        <li>
          <strong>Supabase</strong> (Allemagne, UE) — hébergement DB + Auth.
        </li>
        <li>
          <strong>Vercel</strong> (USA, contrat SCC) — hébergement frontend.
        </li>
        <li>
          <strong>Resend</strong> (USA, contrat SCC) — envoi d’emails transactionnels.
        </li>
        <li>
          <strong>Yousign</strong> (France) — signature électronique des documents.
        </li>
      </ul>

      <h2>5. Durée de conservation</h2>
      <p>
        Les données sont conservées pendant la durée du contrat plus 10 ans (durée légale de
        conservation des registres d’actionnariat — IFRS 2.46). Les logs techniques sont conservés
        12 mois.
      </p>

      <h2>6. Cookies</h2>
      <p>
        En V1, Capiwise utilise uniquement des cookies <strong>strictement nécessaires</strong> au
        fonctionnement du service : cookies de session Supabase Auth (<code>sb-access-token</code>,
        <code>sb-refresh-token</code>), cookie de consentement (<code>cookie_consent_v1</code>) et
        cookies de préférences UI (theme, etc.). Aucun cookie tiers analytics ou marketing.
      </p>

      <h2>7. Vos droits</h2>
      <p>
        Conformément au RGPD, vous disposez des droits d’accès, de rectification, d’effacement, de
        portabilité, d’opposition et de limitation du traitement. Pour les exercer, contactez{' '}
        <a href="mailto:legal@capiwise.com">legal@capiwise.com</a>. Vous pouvez également déposer
        une réclamation auprès de la CNIL (<a href="https://cnil.fr">cnil.fr</a>).
      </p>

      <h2>8. Sécurité</h2>
      <p>
        Capiwise met en œuvre des mesures techniques et organisationnelles appropriées : Row Level
        Security (RLS) côté base de données, chiffrement Supabase Vault des données sensibles, audit
        trail tamper-evident (chaîne de hachage cryptographique), contrôle d’accès granulaire RBAC.
      </p>

      <h2>9. Contact</h2>
      <p>
        Pour toute question, contactez le délégué à la protection des données :{' '}
        <a href="mailto:legal@capiwise.com">legal@capiwise.com</a>.
      </p>
    </>
  );
}
