import { Heading, Text } from '@react-email/components';
import { EmailLayout } from './EmailLayout';

export type InvitationExpiredRenotifyProps = {
  /** Email de l'inviteur (recipient) */
  inviterEmail: string;
  /** Email de l'invité (mentionné dans le corps) */
  inviteeEmail: string;
  /** Nom de l'org concernée */
  orgName: string;
};

/**
 * Module 14 PR §B3 — email envoyé à l'inviteur quand un invité tente
 * d'utiliser un lien expiré ou déjà consommé.
 *
 * UX brief §"Pièges" #10 : si l'invité reçoit l'email mais clique 8 jours
 * après (expiré), bon UX = page graceful "Cette invitation a expiré,
 * demande à [Inviteur] de t'en envoyer une nouvelle" + bouton "Renvoyer"
 * → cet email part chez l'inviteur original.
 *
 * Pas de bouton CTA — c'est une notification informative ; l'inviteur
 * doit aller dans /dashboard/settings/members pour renvoyer.
 */
export function InvitationExpiredRenotify({
  inviterEmail,
  inviteeEmail,
  orgName,
}: InvitationExpiredRenotifyProps) {
  return (
    <EmailLayout preview={`${inviteeEmail} demande une nouvelle invitation pour ${orgName}`}>
      <Heading as="h1" className="my-0 text-2xl font-semibold tracking-tight text-slate-900">
        Une invitation a expiré
      </Heading>
      <Text className="mt-3 text-sm leading-6 text-slate-700">Bonjour,</Text>
      <Text className="mt-3 text-sm leading-6 text-slate-700">
        <strong>{inviteeEmail}</strong> a tenté d’utiliser une invitation que vous lui aviez envoyée
        pour rejoindre <strong>{orgName}</strong> sur Capiwise — mais le lien a expiré ou avait déjà
        été utilisé.
      </Text>
      <Text className="mt-3 text-sm leading-6 text-slate-700">
        Pour lui envoyer une nouvelle invitation, rendez-vous dans{' '}
        <strong>Paramètres &gt; Membres</strong> de votre espace Capiwise et cliquez sur « Renvoyer
        » ou créez une nouvelle invitation.
      </Text>
      <Text className="mt-3 text-xs text-slate-500">
        Cet email vous est adressé en tant qu’<strong>{inviterEmail}</strong> car vous étiez
        l’inviteur initial.
      </Text>
    </EmailLayout>
  );
}

InvitationExpiredRenotify.subject = ({ inviteeEmail }: InvitationExpiredRenotifyProps) =>
  `${inviteeEmail} demande une nouvelle invitation · Capiwise`;
