import type { Metadata } from 'next';
import { CheckCircle2, FileLock, Globe, Layers, ShieldCheck } from 'lucide-react';
import { ProductPage } from '@/components/marketing/product-page';
import { ComplianceVisual } from '@/components/marketing/visuals';

export const metadata: Metadata = {
  title: 'Conformité FR native — BSPCE, AGA, AGE automatisés',
  description:
    'Validation art. 163 bis G CGI, plafonds AGA contraints, AGE workflow, defense-in-depth multi-tenant, audit trail immuable. Conformité française pré-câblée.',
  alternates: { canonical: 'https://www.capiwise.fr/produit/conformite-fr' },
};

export default function ProduitConformitePage() {
  return (
    <ProductPage
      eyebrow="Module — Conformité FR"
      title={
        <>
          Conformité FR native :{' '}
          <span className="serif-italic text-brass-700">BSPCE, AGA, AGE — automatisé</span>.
        </>
      }
      description="Validation art. 163 bis G CGI, plafonds AGA contraints, AGE workflow auditable, defense-in-depth cross-org, audit trail immuable. Conçu pour passer un contrôle URSSAF ou un Big Four."
      features={[
        {
          icon: CheckCircle2,
          title: 'Art. 163 bis G CGI',
          description:
            'Éligibilité société (âge < 15 ans, capi < 150 M€, IS) et bénéficiaire (salarié ou dirigeant) vérifiée à chaque attribution.',
        },
        {
          icon: ShieldCheck,
          title: 'Plafonds AGA contraints',
          description:
            'Cap 30 % du capital social vérifié en temps réel sur le cap table effectif. Soft warning à 27 %, hard error au-delà.',
        },
        {
          icon: FileLock,
          title: 'AGE workflow',
          description:
            'Délibérations consignées, votes auditables, attestation auto-générée. Conforme art. L225-129-1 du Code de commerce.',
        },
        {
          icon: Layers,
          title: 'Defense-in-depth 4 couches',
          description:
            'RLS Postgres + TENANT_VIOLATION guards + checks Server Actions + filtering UI. Cross-org leak impossible.',
        },
        {
          icon: ShieldCheck,
          title: 'Audit trail immuable',
          description:
            'Hash chain SHA-256, every event signed, no UPDATE possible. Conforme exigences Big Four.',
        },
        {
          icon: Globe,
          title: 'Multi-juridiction (V1.X)',
          description:
            'Extension prévue pour holdings internationales : UK, US (Delaware), DE. Restera FR-first.',
        },
      ]}
      bigFeatures={[
        {
          title: 'Au-dessus du standard CAC, pas en-dessous.',
          description:
            'Capiwise est conçu pour passer un contrôle Big Four sans question. Audit trail immuable, defense-in-depth, exports auditeurs prêts à l’emploi. Vos CAC vous remercieront.',
          bullets: [
            'Audit trail immuable hash-chainé (SHA-256)',
            'Defense-in-depth multi-tenant à 4 couches (validé en prod, 0 incident)',
            'Exports auditeurs CSV/JSON/PDF en 1 clic',
            'Compliance Engine V2 configurable par org (Module 12)',
            '23 rules métier wired (BSPCE, AGA, FMV, vesting, approvals)',
          ],
          visual: <ComplianceVisual />,
        },
      ]}
      useCases={[
        {
          title: 'Pré-due diligence Série A',
          description:
            'Génération automatique du « cap table audit pack » pour les avocats acquéreur : conformité art. 163 bis G CGI vérifiée, AGA dans le cap, audit trail consolidé.',
        },
        {
          title: 'Audit CAC fin d’année',
          description:
            'Export auditeur (inputs IFRS 2, outputs valuation, événements de cap table, modifications de plans) au format demandé par les Big Four.',
        },
        {
          title: 'Levée internationale (V1.X)',
          description:
            'Extension prévue pour gérer les holdings internationales : UK Limited, US Delaware C-corp, DE GmbH. Reste FR-first.',
        },
      ]}
      faq={[
        {
          question: 'Que se passe-t-il si une attribution viole une règle de conformité ?',
          answer:
            'Cela dépend de la severity de la rule. « Hard » : l’attribution est refusée, l’utilisateur voit un message explicite (ex « AGA cap 30 % dépassé »). « Soft » : l’attribution passe avec un warning visible dans l’audit trail (ex « FMV stale > 90 jours »). Configurable par org via le Compliance Engine V2.',
        },
        {
          question: 'Les rules de conformité sont-elles modifiables ?',
          answer:
            'Oui via le module Compliance Engine V2 (Module 12). Chaque org peut adapter les paramètres (ex « FMV stale » : 90 j default, ajustable à 30/60/120 j) et la severity (hard/soft/disabled). Les rules art. 163 bis G CGI sont en hard non-modifiable (loi).',
        },
        {
          question: 'Comment fonctionne le hash chain de l’audit trail ?',
          answer:
            'Chaque event audit a un hash SHA-256 qui inclut le hash de l’event précédent. Toute modification briserait la chaîne, donc immutable de fait. Vérifiable par tout auditeur via le ChainIntegrityBadge.',
        },
        {
          question: 'Êtes-vous certifiés ISO 27001 ?',
          answer:
            'Pas encore. Certification en cours pour Q4 2026. SOC 2 Type II prévu 2027. En attendant : RGPD strict avec DPO, registre des traitements, DPIA, defense-in-depth, audit trail. Documentation disponible sur demande.',
        },
        {
          question: 'Comment garantissez-vous l’absence de cross-org leak ?',
          answer:
            '4 couches de défense : (1) RLS Postgres avec policies par table, (2) TENANT_VIOLATION exception levée par RPC SECURITY DEFINER si org_id mismatch, (3) check explicite dans chaque Server Action via requirePermission(), (4) filtering UI côté React. Validé en prod sur 14 modules livrés, 0 incident.',
        },
      ]}
    />
  );
}
