import type { Metadata } from 'next';
import { LegalDraftBanner, LegalHeader } from '../_components';

export const metadata: Metadata = {
  title: 'Mentions légales',
  description:
    'Mentions légales du site Capiwise.fr — éditeur, hébergeur, directeur de publication, contact DPO.',
  alternates: { canonical: 'https://www.capiwise.fr/legal/mentions-legales' },
};

{
  /* LEGAL_REVIEW_REQUIRED: à valider avec avocat avant lancement public */
}

export default function MentionsLegalesPage() {
  return (
    <>
      <LegalHeader
        title="Mentions légales"
        intro="Informations légales obligatoires conformément à l’article 6 III de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l’économie numérique."
      />
      <LegalDraftBanner />

      <h2>Éditeur du site</h2>
      <p>
        <strong>Raison sociale</strong> : Capiwise SAS (à compléter)
        <br />
        <strong>Forme juridique</strong> : Société par Actions Simplifiée
        <br />
        <strong>Capital social</strong> : à compléter
        <br />
        <strong>Siège social</strong> : à compléter, 75XXX Paris, France
        <br />
        <strong>RCS</strong> : Paris (à compléter)
        <br />
        <strong>SIREN</strong> : à compléter
        <br />
        <strong>N° TVA intracommunautaire</strong> : à compléter
        <br />
        <strong>Email de contact</strong> :{' '}
        <a href="mailto:contact@capiwise.fr">contact@capiwise.fr</a>
      </p>

      <h2>Directeur de la publication</h2>
      <p>Représentant légal de Capiwise SAS — à compléter.</p>

      <h2>Hébergement</h2>
      <p>
        <strong>Hébergeur frontend</strong> : Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789,
        USA. Région d’hébergement : Paris (cdg1).
        <br />
        <strong>Hébergeur backend &amp; base de données</strong> : Supabase Inc., 970 Toa Payoh
        North #07-04, Singapore 318992. Région d’hébergement : Europe (eu-west-1, Dublin).
        <br />
        <strong>Hébergeur monitoring</strong> : Functional Software, Inc. d/b/a Sentry, 132
        Hawthorne Street, San Francisco, CA 94107, USA. Région d’hébergement : Frankfurt (DE).
      </p>

      <h2>Délégué à la protection des données (DPO)</h2>
      <p>
        Pour toute question relative au traitement de vos données personnelles ou pour exercer vos
        droits RGPD, contactez notre DPO à <a href="mailto:dpo@capiwise.fr">dpo@capiwise.fr</a>.
      </p>

      <h2>Propriété intellectuelle</h2>
      <p>
        L’ensemble des contenus du site (textes, logos, icônes, photos, illustrations, code source,
        design) sont protégés par le droit d’auteur et la propriété intellectuelle. Toute
        reproduction, distribution ou modification, totale ou partielle, sans autorisation écrite
        préalable de Capiwise SAS est strictement interdite.
      </p>

      <h2>Liens hypertextes</h2>
      <p>
        Le site Capiwise.fr peut contenir des liens vers des sites tiers. Capiwise n’exerce aucun
        contrôle sur ces sites externes et décline toute responsabilité quant à leur contenu.
      </p>

      <h2>Cookies</h2>
      <p>
        Capiwise utilise uniquement des cookies essentiels à son fonctionnement (session, sécurité).
        Pas de tracking analytique ni marketing. Voir notre{' '}
        <a href="/legal/privacy">politique de confidentialité</a> pour plus de détails.
      </p>

      <h2>Loi applicable</h2>
      <p>Le présent site est soumis au droit français. Les tribunaux de Paris sont compétents.</p>
    </>
  );
}
