import type { Metadata } from 'next';
import { ClipboardList, FileCheck, Layers, ShieldCheck, Sparkles, Workflow } from 'lucide-react';
import { ProductPage } from '@/components/marketing/product-page';
import { PlansVisual } from '@/components/marketing/visuals';

export const metadata: Metadata = {
  title: 'Création de plans — BSPCE, AGA, Stock Options, RSU, BSA',
  description:
    'Créez vos plans BSPCE, AGA, SO, RSU et BSA avec un wizard 7 étapes : conformité FR native, validation AGE, vesting calendaire ou conditionnel, templates GLOBAL.',
  alternates: { canonical: 'https://www.capiwise.fr/produit/plans' },
};

export default function ProduitPlansPage() {
  return (
    <ProductPage
      eyebrow="Module — Création de plans"
      title={
        <>
          Du wizard à la validation AGE,{' '}
          <span className="serif-italic text-brass-700">en quelques clics</span>.
        </>
      }
      description="Création guidée de plans pour BSPCE, Stock Options, AGA, RSU et BSA. Conformité FR native, contraintes légales pré-câblées, templates prêts à l’emploi."
      features={[
        {
          icon: Workflow,
          title: 'Wizard 7 étapes guidé',
          description:
            'De l’instrument au calendrier de vesting en passant par les conditions de performance — auto-save à chaque étape.',
        },
        {
          icon: Layers,
          title: '5 instruments natifs',
          description:
            'BSPCE, Stock Options, AGA, RSU, BSA. Chaque instrument a ses contraintes pré-câblées (plafonds, AGE, art. 163 bis G CGI).',
        },
        {
          icon: ClipboardList,
          title: 'Vesting calendaire ou conditionnel',
          description:
            'Time-based, market conditions (TSR, VWAP), performance conditions (EBITDA, KPI). Multi-tranches supportées.',
        },
        {
          icon: ShieldCheck,
          title: 'Plafonds réglementaires automatiques',
          description:
            'AGA cap 30 % du capital, BSPCE éligibilité société et bénéficiaire, contraintes AGE — automatisé.',
        },
        {
          icon: FileCheck,
          title: 'Templates GLOBAL prêts à l’emploi',
          description:
            'Lettres d’attribution BSPCE/SO/AGA/RSU/BSA générées automatiquement avec variables typées.',
        },
        {
          icon: Sparkles,
          title: 'Compliance live',
          description:
            'Avertissements et erreurs affichés en temps réel pendant le wizard — pas de plan invalide jamais créé.',
        },
      ]}
      bigFeatures={[
        {
          title: 'Le wizard qui ne vous laisse pas faire d’erreur.',
          description:
            'Chaque champ valide en temps réel les contraintes légales et les paramètres métier. Vous ne pouvez pas créer un plan AGA qui dépasse 30 % du capital, ni un BSPCE pour une société non éligible.',
          bullets: [
            'Auto-save à chaque étape (zero perte de données)',
            'Validation Zod stricte côté client + RPC atomique côté serveur',
            'Compliance V1 : 4 rules câblées (BSPCE_BENEFICIARY_TYPE, AGA_30_PERCENT_CAP, POOL_AVAILABLE, GRANT_DATE_RECENT)',
            'Soft warnings + hard errors différenciés',
          ],
          visual: <PlansVisual />,
        },
      ]}
      useCases={[
        {
          title: 'Premier plan BSPCE post-amorçage',
          description:
            'Société de 8 personnes en seed, première vague de BSPCE pour les key hires. Wizard guide les contraintes art. 163 bis G CGI.',
        },
        {
          title: 'AGA Performance pour C-level',
          description:
            'Attribution conditionnelle TSR pour CFO/CRO/COO. Conditions de performance multi-tranches gérées nativement.',
        },
        {
          title: 'Refresh annuel sur 3 ans',
          description:
            'Plan BSPCE renouvelé chaque année avec ajustement du pool. Templates et workflows réutilisables.',
        },
      ]}
      faq={[
        {
          question: 'Puis-je créer un plan multi-instrument (BSPCE + AGA) ?',
          answer:
            'Non, chaque plan correspond à un instrument unique pour préserver la lisibilité juridique et fiscale. Vous pouvez créer plusieurs plans en parallèle dans la même org. Les attributions de chaque plan suivent le calendrier et les règles de l’instrument.',
        },
        {
          question: 'Comment sont gérés les plafonds AGA ?',
          answer:
            'Le plafond légal (30 % du capital social) est calculé en temps réel à partir du cap table effectif. Le wizard refuse de créer un plan ou une attribution qui pousserait au-delà. Un soft warning s’affiche dès 27 %.',
        },
        {
          question: 'Les plans sont-ils modifiables après création ?',
          answer:
            'Oui, via le module Modifications IFRS 2.27-28 dédié. Cinq types de modifications sont supportés (allocation, conditions, calendrier, prix, modification générique). Chaque modification déclenche une nouvelle valorisation incrémentale et un audit log complet.',
        },
        {
          question: 'Puis-je importer un plan existant depuis Excel ?',
          answer:
            'Oui, via l’import CSV bénéficiaires. Le plan est créé via le wizard puis les attributions individuelles sont importées en bulk avec validation par bénéficiaire. Compatible avec les sorties Carta et Uplaw.',
        },
        {
          question: 'Quels documents sont générés automatiquement ?',
          answer:
            'Lettre d’attribution (BSPCE/SO/AGA/RSU/BSA), bon de souscription (au moment de la levée), avenant en cas de modification, attestation de sortie. Tous via React PDF, signables en ligne via Yousign eIDAS.',
        },
      ]}
    />
  );
}
