import type { Metadata } from 'next';
import { CheckCheck, Clock, FileSignature, Lock, Mail, ShieldCheck } from 'lucide-react';
import { ProductPage } from '@/components/marketing/product-page';
import { SignatureVisual } from '@/components/marketing/visuals';

export const metadata: Metadata = {
  title: 'Signature électronique eIDAS qualifié — Yousign avancé',
  description:
    'Signature légale FR via Yousign eIDAS qualifié avancé. Workflow multi-signataires, suivi temps réel, storage sécurisé, conforme RGPD strict. Pas DocuSign US.',
  alternates: { canonical: 'https://www.capiwise.fr/produit/signature-electronique' },
};

export default function ProduitSignaturePage() {
  return (
    <ProductPage
      eyebrow="Module — Signature électronique"
      title={
        <>
          Yousign eIDAS qualifié avancé.{' '}
          <span className="serif-italic text-brass-700">Pas DocuSign US</span>.
        </>
      }
      description="Signature électronique conforme à la loi française et au règlement eIDAS européen. Workflow multi-signataires, suivi temps réel, archivage sécurisé."
      features={[
        {
          icon: FileSignature,
          title: 'Signature légale FR',
          description:
            'eIDAS qualifié avancé. Valeur juridique équivalente à une signature manuscrite, opposable en justice française.',
        },
        {
          icon: Mail,
          title: 'Workflow multi-signataires',
          description:
            'Bénéficiaire + représentant légal + témoin. Workflows séquentiels ou parallèles configurables.',
        },
        {
          icon: Clock,
          title: 'Suivi temps réel',
          description:
            'Dashboard centralisé : sent / viewed / signed / declined / expired. Webhook native Yousign V3.',
        },
        {
          icon: Lock,
          title: 'Storage sécurisé',
          description:
            'Documents signés stockés dans Supabase EU. Signed URL à TTL 5 min, RLS strict, hashs vérifiables.',
        },
        {
          icon: ShieldCheck,
          title: 'Conforme RGPD strict',
          description:
            'Pas de transfert hors UE, pas de Cloud Act exposure, DPA Yousign signé. Hébergement français.',
        },
        {
          icon: CheckCheck,
          title: 'Idempotence native',
          description:
            'Webhook handler idempotent (anti-replay). Pré-check status COMPLETED → ack 100ms si retry.',
        },
      ]}
      bigFeatures={[
        {
          title: 'La signature électronique sans le risque US.',
          description:
            'DocuSign est exposé au Cloud Act (loi extraterritoriale US). Yousign est français, eIDAS qualifié, conforme RGPD strict. Aucune raison de ne pas l’utiliser pour vos documents legaux.',
          bullets: [
            'eIDAS niveau qualifié avancé (le plus haut hors notarié)',
            'Certificat conforme délivré par autorité de certification française',
            'Horodatage qualifié RFC 3161',
            'Archivage 10 ans inclus (obligation fiscale CGI)',
            'Audit trail signature complet (timestamps, IPs, fingerprints)',
          ],
          visual: <SignatureVisual />,
        },
      ]}
      useCases={[
        {
          title: 'Lettre d’attribution BSPCE',
          description:
            'Bénéficiaire signe la lettre d’attribution générée à l’approbation. Signature horodatée + certificat eIDAS. 2 minutes du clic à la signature.',
        },
        {
          title: 'Bon de souscription levée',
          description:
            'À la levée d’options, le bon est généré et signé bilatéralement (bénéficiaire + société). Cap table mis à jour automatiquement à signature complete.',
        },
        {
          title: 'Avenant plan après pivot',
          description:
            'Modification IFRS 2.27-28 → avenant généré → signé par tous les bénéficiaires impactés. Workflow parallèle (50 signatures en parallèle).',
        },
      ]}
      faq={[
        {
          question: 'Quelle différence avec DocuSign ?',
          answer:
            'DocuSign est une société américaine soumise au Cloud Act (loi extraterritoriale US qui autorise le gouvernement US à demander accès aux données stockées par des entreprises US, où qu’elles soient). Yousign est française, hébergée en UE, eIDAS qualifié. Pour des documents légaux français, Yousign est la seule option zero-risque.',
        },
        {
          question: 'Quelle est la valeur juridique d’une signature Yousign ?',
          answer:
            'eIDAS qualifié avancé = équivalent juridique à une signature manuscrite. Opposable en justice française. Le seul niveau supérieur (qualifié) est utilisé pour les actes notariés ou les contrats publics.',
        },
        {
          question: 'Combien de temps les documents signés sont-ils archivés ?',
          answer:
            'Archivage 10 ans inclus (obligation fiscale CGI art. L102 B). Pour les attributions BSPCE et levées d’options, l’archivage doit couvrir la période de prescription fiscale. Capiwise garantit cette durée nativement.',
        },
        {
          question: 'Que se passe-t-il si Yousign refuse une signature (déclinée) ?',
          answer:
            'Le webhook reçoit l’événement DECLINED, l’attribution repasse en CANCELLED côté Capiwise. Le bénéficiaire peut être notifié pour clarification. Si le refus est définitif, le RH peut ré-initier une nouvelle proposition.',
        },
        {
          question: 'Puis-je signer mes propres documents externes via Capiwise ?',
          answer:
            'Pas en V1 — l’intégration Yousign est dédiée aux documents générés par Capiwise (lettres, bons, avenants). Pour signer des documents externes, utilisez Yousign directement avec votre compte. V1.X = upload PDF custom prévu.',
        },
      ]}
    />
  );
}
