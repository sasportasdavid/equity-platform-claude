import type { Metadata } from 'next';
import { Bell, Calculator, Calendar, CheckCheck, FileText, TrendingUp } from 'lucide-react';
import { ProductPage } from '@/components/marketing/product-page';
import { PortalVisual } from '@/components/marketing/visuals';

export const metadata: Metadata = {
  title: 'Portail bénéficiaire — Vesting visualisé + simulateur de départ',
  description:
    'Vos salariés visualisent leur vesting en temps réel, simulent leur départ (Good/Bad leaver), accèdent à leurs documents signés. Espace dédié RH inclus.',
  alternates: { canonical: 'https://www.capiwise.fr/produit/portail-beneficiaire' },
};

export default function ProduitPortalPage() {
  return (
    <ProductPage
      eyebrow="Module — Portail bénéficiaire"
      title={
        <>
          Vos salariés comprennent enfin leur{' '}
          <span className="serif-italic text-brass-700">equity</span>.
        </>
      }
      description="Un espace dédié pour chaque bénéficiaire : vesting visualisé, simulateur de départ, documents signés en ligne, notifications smart sur les jalons."
      features={[
        {
          icon: Calendar,
          title: 'Vesting timeline interactive',
          description:
            'Barre de progression cumulée, ticks de cliff, indicateur AUJOURD’HUI animé. Acquis vs En cours vs Future vs Conditionnel.',
        },
        {
          icon: Calculator,
          title: 'Simulateur de départ',
          description:
            'Good leaver, Bad leaver, full accelerate. Calcul fiscal France 2026 par instrument (BSPCE/SO/BSA/AGA).',
        },
        {
          icon: FileText,
          title: 'Documents centralisés',
          description:
            'Lettres d’attribution, bons de souscription, attestations. Téléchargement signed URL (5 min TTL).',
        },
        {
          icon: CheckCheck,
          title: 'Acceptation en ligne',
          description:
            'Pour les attributions GRANTED, confirmation de réception du document signé en 1 clic.',
        },
        {
          icon: Bell,
          title: 'Notifications smart',
          description:
            'Cliff atteint, fenêtre d’exercice ouverte, document à signer, plan modifié — emails et in-app.',
        },
        {
          icon: TrendingUp,
          title: 'Calcul potentiel temps réel',
          description:
            'FMV multiplié par les unités acquises. Visible dans le dashboard bénéficiaire, mise à jour à chaque valorisation.',
        },
      ]}
      bigFeatures={[
        {
          title: 'Le vesting timeline qu’un salarié comprend en 5 secondes.',
          description:
            'Pas un graphique abstrait : une vraie timeline avec ticks, segments colorés, et un curseur AUJOURD’HUI animé. Le salarié sait exactement où il en est sans avoir à demander à la RH.',
          bullets: [
            'Segments distincts : acquis (bond green) · live (gradient) · future (hatched) · conditionnel (dashed brass)',
            'Cumulative numbers sous la barre (ex : « 5 625 acquis sur 15 000 »)',
            'Légende auto-générée pour chaque type de segment',
            'Snapshot fallback si vesting events vides en DB',
            'Compatible mobile (375px+)',
          ],
          visual: <PortalVisual />,
        },
      ]}
      useCases={[
        {
          title: 'Onboarding salarié avec attribution',
          description:
            'Le salarié reçoit un magic link, complète son profil en 2 étapes (welcome + setup), accède à son tableau de bord avec sa première attribution.',
        },
        {
          title: 'Suivi vesting en temps réel',
          description:
            'Le salarié voit chaque mois la progression de son vesting. Notifications push à chaque jalon : cliff, anniversaire d’embauche, etc.',
        },
        {
          title: 'Levée d’options self-service',
          description:
            'Le salarié initie sa levée en quelques clics, simule l’impact fiscal, signe le bon de souscription en ligne.',
        },
      ]}
      faq={[
        {
          question: 'Comment un salarié accède-t-il au portail ?',
          answer:
            'Il reçoit un email d’invitation avec un magic link au moment de sa première attribution. Pas de mot de passe à mémoriser, authentification passwordless via Supabase Auth.',
        },
        {
          question: 'Le simulateur de départ est-il fiable ?',
          answer:
            'Il est basé sur la lib pure TypeScript de simulation fiscale FR 2026 (testée par 56 cas Vitest). Les calculs incluent BSPCE (taux 30 % avant 3 ans, après 3 ans), SO, AGA, BSA. Pour V1.X, intégration des plans M&A.',
        },
        {
          question: 'Les bénéficiaires peuvent-ils modifier leurs informations ?',
          answer:
            'Ils peuvent modifier leur téléphone et leur adresse via leur profil. Les informations identitaires (nom, email, IBAN) sont en lecture seule et nécessitent une demande au RH (workflow approval V2).',
        },
        {
          question: 'Le portail est-il accessible en anglais ?',
          answer:
            'V1 = français uniquement. La structure i18n est préparée (constantes nommées partout) pour une migration vers next-intl en V1.X.',
        },
        {
          question: 'Combien de temps les documents sont-ils accessibles ?',
          answer:
            'Tant que le bénéficiaire reste actif. Les documents signés sont conservés 10 ans après cessation (obligation fiscale CGI). Les liens de téléchargement sont signed URL avec TTL 5 minutes.',
        },
      ]}
    />
  );
}
