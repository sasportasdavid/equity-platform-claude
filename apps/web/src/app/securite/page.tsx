import type { Metadata } from 'next';
import { Award, FileLock, Globe, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { MarketingLayout } from '@/components/marketing/layout';
import {
  BigFeature,
  CTABanner,
  FeatureGrid,
  HeroSmall,
  MarketingSection,
  SectionHeader,
} from '@/components/marketing/sections';
import { AuditVisual } from '@/components/marketing/visuals';

export const metadata: Metadata = {
  title: 'Sécurité & conformité — Hébergement FR, RGPD, eIDAS',
  description:
    'Hébergement français (Vercel EU + Supabase EU + Sentry DE), RGPD strict, chiffrement AES-256 / TLS 1.3, audit trail immuable, Yousign eIDAS qualifié.',
  alternates: { canonical: 'https://www.capiwise.fr/securite' },
};

const SECURITY_FEATURES = [
  {
    icon: Globe,
    title: 'Hébergement France',
    description:
      'Vercel EU (Paris) + Supabase EU (eu-west-1, Irlande) + Sentry DE. Aucun transfert hors UE.',
  },
  {
    icon: ShieldCheck,
    title: 'RGPD strict',
    description:
      'DPO désigné, registre des traitements, DPIA pour les fonctionnalités sensibles. Pas de tracking marketing.',
  },
  {
    icon: Lock,
    title: 'Chiffrement de bout en bout',
    description:
      'At-rest : AES-256 (Supabase). In-transit : TLS 1.3. Phone bénéficiaire chiffré au niveau application.',
  },
  {
    icon: FileLock,
    title: 'Audit trail immuable',
    description:
      'Hash chain SHA-256, every event signed, no UPDATE possible. Conforme exigences Big Four.',
  },
  {
    icon: KeyRound,
    title: 'Authentification robuste',
    description:
      'Magic link passwordless (Supabase Auth). MFA optionnel. SSO SAML / OIDC pour Enterprise.',
  },
  {
    icon: Award,
    title: 'eIDAS qualifié avancé',
    description:
      'Yousign signature légale FR. Certificats conformes ANSSI. Horodatage qualifié RFC 3161.',
  },
];

const SUBPROCESSORS = [
  {
    name: 'Vercel Inc.',
    purpose: 'Hosting frontend Next.js',
    location: 'EU (Paris)',
    risk: '🇪🇺 Faible',
  },
  {
    name: 'Supabase Inc.',
    purpose: 'Database Postgres + Auth + Storage',
    location: 'EU (Dublin)',
    risk: '🇪🇺 Faible',
  },
  {
    name: 'Sentry GmbH',
    purpose: 'Monitoring d’erreurs',
    location: 'DE (Frankfurt)',
    risk: '🇪🇺 Faible',
  },
  {
    name: 'Yousign SAS',
    purpose: 'Signature électronique eIDAS',
    location: 'FR (Caen)',
    risk: '🇫🇷 Très faible',
  },
  {
    name: 'Resend Inc.',
    purpose: 'Envoi d’emails transactionnels',
    location: 'US (clauses contractuelles types)',
    risk: '🇺🇸 Modéré · données limitées (email + nom)',
  },
];

export default function SecuritePage() {
  return (
    <MarketingLayout>
      <HeroSmall
        eyebrow="Sécurité & conformité"
        title={
          <>
            Sécurité de niveau <span className="serif-italic text-brass-700">cabinet d’audit</span>.
          </>
        }
        description="Hébergement France, RGPD strict, chiffrement at-rest et in-transit, audit trail immuable, eIDAS qualifié. Pas de Cloud Act, pas de tracking, pas de gotcha."
      />

      <MarketingSection paper>
        <SectionHeader
          eyebrow="Six piliers"
          title="Notre architecture de sécurité"
          description="Chaque pilier a été pensé pour passer le contrôle d’un Big Four."
        />
        <div className="mt-12">
          <FeatureGrid features={SECURITY_FEATURES} cols={3} />
        </div>
      </MarketingSection>

      <BigFeature
        eyebrow="Defense-in-depth"
        title="Multi-tenant à 4 couches. Cross-org leak impossible."
        description="L’architecture multi-tenant Capiwise empile 4 couches de défense. Pour qu’un user de l’org A voie une donnée de l’org B, il faudrait que les 4 couches échouent simultanément. Validé en prod sur 14 modules livrés, 0 incident."
        bullets={[
          'Couche 1 — RLS Postgres : policies par table, vérifie current_org_id() automatiquement',
          'Couche 2 — TENANT_VIOLATION : RPCs SECURITY DEFINER lèvent une exception si org_id mismatch',
          'Couche 3 — Server Actions : requirePermission() avec check explicite avant chaque action',
          'Couche 4 — Frontend : filtering UI côté React (defense-in-depth, pas seul rempart)',
          'Audit trail consolidé : tout cross-org access tenté est loggé, even si bloqué',
        ]}
        visual={<AuditVisual />}
      />

      <MarketingSection paper>
        <SectionHeader eyebrow="Certifications" title="Certifications & conformité" />
        <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-4 md:grid-cols-2">
          {[
            { label: 'RGPD (UE)', status: 'En conformité', tone: 'bond' },
            { label: 'Hébergement France', status: 'Vercel EU + Supabase EU', tone: 'bond' },
            { label: 'eIDAS qualifié avancé', status: 'Via Yousign', tone: 'bond' },
            {
              label: 'ISO 27001',
              status: 'Certification en cours · Q4 2026',
              tone: 'saffron',
            },
            {
              label: 'SOC 2 Type II',
              status: 'Roadmap 2027',
              tone: 'saffron',
            },
            {
              label: 'PCI DSS',
              status: 'Non applicable (pas de carte stockée)',
              tone: 'slate',
            },
          ].map((cert) => (
            <article
              key={cert.label}
              className="border-paper-300 bg-paper-50 flex items-center justify-between gap-3 rounded-xl border p-4"
            >
              <span className="text-ink-900 font-medium">{cert.label}</span>
              <span
                className={
                  cert.tone === 'bond'
                    ? 'text-bond-700 text-sm font-medium'
                    : cert.tone === 'saffron'
                      ? 'text-saffron-700 text-sm font-medium'
                      : 'text-ink-500 text-sm'
                }
              >
                {cert.status}
              </span>
            </article>
          ))}
        </div>
      </MarketingSection>

      <MarketingSection>
        <SectionHeader
          eyebrow="Transparence"
          title="Sous-traitants"
          description="Tous les sous-traitants utilisés par Capiwise — leur rôle, leur localisation, leur niveau de risque RGPD."
        />
        <div className="border-paper-300 mx-auto mt-10 max-w-5xl overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[640px]">
            <thead className="bg-paper-50 border-paper-300 border-b">
              <tr>
                <th className="text-overline text-ink-500 px-4 py-3 text-left">Société</th>
                <th className="text-overline text-ink-500 px-4 py-3 text-left">Rôle</th>
                <th className="text-overline text-ink-500 px-4 py-3 text-left">Localisation</th>
                <th className="text-overline text-ink-500 px-4 py-3 text-left">Risque</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((sp) => (
                <tr key={sp.name} className="border-paper-200 bg-paper-50 border-t">
                  <td className="text-ink-900 px-4 py-3 text-sm font-medium">{sp.name}</td>
                  <td className="text-ink-700 px-4 py-3 text-sm">{sp.purpose}</td>
                  <td className="text-ink-700 px-4 py-3 text-sm">{sp.location}</td>
                  <td className="text-ink-700 px-4 py-3 text-sm">{sp.risk}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-ink-500 mx-auto mt-6 max-w-3xl text-center text-xs">
          Tous les sous-traitants sont liés par DPA conformes RGPD. Les transferts hors UE (Resend)
          sont encadrés par les clauses contractuelles types CCT 2021/914 de la Commission
          européenne. Données limitées (email + nom + métadonnées de delivery).
        </p>
      </MarketingSection>

      <MarketingSection paper>
        <SectionHeader
          eyebrow="Documentation"
          title="Documentation détaillée"
          description="Pour les CISO, DPO et auditeurs qui veulent creuser."
        />
        <div className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-2">
          {[
            {
              href: '/legal/dpa',
              title: 'Accord de traitement (DPA)',
              description: 'DPA standard signable en ligne. Annexes sous-traitants à jour.',
            },
            {
              href: '/legal/privacy',
              title: 'Politique de confidentialité',
              description: 'Détail des traitements, durées de conservation, droits RGPD.',
            },
          ].map((doc) => (
            <Link
              key={doc.href}
              href={doc.href}
              className="border-paper-300 hover:border-brass-300 bg-paper-50 group flex flex-col gap-2 rounded-xl border p-5 transition-colors"
            >
              <span className="text-ink-900 group-hover:text-brass-700 font-semibold">
                {doc.title}
              </span>
              <span className="text-ink-500 text-sm">{doc.description}</span>
              <span className="text-brass-700 mt-2 text-sm font-medium">Lire le document →</span>
            </Link>
          ))}
        </div>
      </MarketingSection>

      <CTABanner
        eyebrow="Audit de sécurité ?"
        title="Notre équipe répond aux questionnaires CISO."
        description="Pour les DSI/CISO qui doivent valider Capiwise pour leur org : envoyez-nous votre questionnaire, on revient sous 5 jours ouvrés."
        primaryCta={{ label: 'Demander une revue de sécurité', href: '/contact' }}
      />
    </MarketingLayout>
  );
}
