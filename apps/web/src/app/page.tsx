import type { Metadata } from 'next';
import { MarketingLayout } from '@/components/marketing/layout';
import {
  MktComparison,
  MktCtaBanner,
  MktHero,
  MktLogoCloud,
  MktPillar,
  MktSection,
  MktSectionHead,
  MktStatsInk,
  MktTestimonials,
  MktTrust,
} from '@/components/marketing/editorial';
import {
  HeroMockup,
  PvAudit,
  PvMonteCarlo,
  PvPortal,
  PvWizard,
} from '@/components/marketing/pillar-visuals';

export const metadata: Metadata = {
  title: 'Capiwise — Pilotez vos plans BSPCE, AGA et Stock Options sans bricolage juridique',
  description:
    'Plateforme française de gestion d’actionnariat salarié : conformité native (art. 163 bis G CGI), valorisation IFRS 2 par Monte Carlo, workflow d’approbation auditable. Hébergée en France.',
  alternates: { canonical: 'https://www.capiwise.fr/' },
  openGraph: {
    title: 'Capiwise — Plateforme française d’actionnariat salarié',
    description:
      'Conçue pour les CFO exigeants et les fondateurs ambitieux. BSPCE, AGA, Stock Options, BSA, RSU.',
    url: 'https://www.capiwise.fr/',
    siteName: 'Capiwise',
    locale: 'fr_FR',
    type: 'website',
  },
};

export default function HomePage() {
  return (
    <MarketingLayout>
      {/* ===== HERO ===== */}
      <MktHero
        eyebrow="Plateforme française de gestion d'actionnariat salarié"
        title={
          <>
            Pilotez vos plans <span className="text-mkt-italic text-brass-700">BSPCE, AGA</span> et{' '}
            <span className="text-mkt-italic text-brass-700">Stock Options</span> sans bricolage
            juridique.
          </>
        }
        lede={
          <>
            La seule plateforme française qui combine conformité native (art. 163 bis G CGI),
            valorisation IFRS&nbsp;2 par Monte Carlo, et workflow d’approbation auditable. Conçue
            pour les CFO exigeants et les fondateurs ambitieux.
          </>
        }
        primaryCta={{ label: 'Demander une démo', href: '/contact' }}
        secondaryCta={{ label: 'Voir les tarifs', href: '/tarifs' }}
        trustItems={[
          'Hébergement France · RGPD strict',
          'eIDAS qualifié avancé via Yousign',
          'Audit-trail immuable',
        ]}
        visual={<HeroMockup />}
      />

      {/* ===== LOGO CLOUD ===== */}
      <MktSection tight className="!pt-0">
        <MktLogoCloud title="Ils nous font confiance pour structurer leur actionnariat salarié" />
      </MktSection>

      {/* ===== STATS sur fond ink-900 ===== */}
      <MktSection variant="ink" tight>
        <MktStatsInk
          stats={[
            {
              value: '5',
              italic: true,
              labelBold: 'Instruments couverts',
              label: 'BSPCE, SO, AGA, RSU, BSA',
            },
            {
              value: '100',
              unit: '%',
              labelBold: 'Conforme FR',
              label: 'art. 163 bis G CGI · IFRS 2',
            },
            {
              value: 'FR',
              italic: true,
              labelBold: 'Hébergement',
              label: 'RGPD strict · pas de Cloud Act',
            },
            {
              value: '10',
              unit: '×',
              labelBold: 'Plus rapide',
              label: 'vs Excel + cabinet externe',
            },
          ]}
        />
      </MktSection>

      {/* ===== 4 PILIERS ALTERNÉS ===== */}
      <MktSection>
        <MktSectionHead
          eyebrow="Quatre piliers, une rigueur"
          title={
            <>
              De la création du plan à la{' '}
              <span className="text-mkt-italic text-brass-700">levée d’options</span>, tout sur une
              seule plateforme.
            </>
          }
          description="On ne facture pas la valorisation IFRS 2 en sus. On ne sous-traite pas la conformité à un cabinet. On ne renvoie pas vos salariés sur un PDF mort. La valeur est dans la chaîne complète, et elle vous revient."
        />

        {/* Pilier 1 — Plans & Attributions */}
        <MktPillar
          index="i"
          category="Plans & Attributions"
          title={
            <>
              Créez vos plans, attribuez en toute{' '}
              <span className="text-mkt-italic text-brass-700">conformité</span>.
            </>
          }
          description="Wizard guidé, 5 instruments natifs, validation automatique des contraintes légales (BSPCE éligibilité, AGA plafonds AGE), et workflow d’approbation N-niveaux. Vous n’oubliez plus rien parce que la plateforme refuse de continuer si quelque chose manque."
          bullets={[
            {
              highlight: 'BSPCE, SO, AGA, RSU, BSA',
              rest: 'instruments natifs avec contrôles juridiques inline',
            },
            { highlight: 'Vesting', rest: 'calendaire ou conditionnel, cliff configurable' },
            {
              highlight: 'Workflow',
              rest: 'chaînes d’approbation séquentielles ou parallèles, idempotentes',
            },
          ]}
          ctaLabel="Découvrir les plans"
          ctaHref="/produit/plans"
          visual={<PvWizard />}
        />

        {/* Pilier 2 — Valorisation IFRS 2 */}
        <MktPillar
          index="ii"
          category="Valorisation IFRS 2"
          title={
            <>
              Monte Carlo <span className="text-mkt-italic text-brass-700">100&nbsp;K paths</span>.
              Aussi simple qu’un export Excel.
            </>
          }
          description="Pricer Black-Scholes & Heston, conditions de performance multi-conditions (TSR, VWAP, EBITDA), juste valeur par tranche, refresh trimestriel automatisé. Carta facture 2-5 k$ par valorisation. Cabinet externe : 10-15 k€ par exercice. Inclus chez nous."
          bullets={[
            { highlight: 'Pricers', rest: 'Black-Scholes, Heston, modèle binomial' },
            {
              highlight: 'Audit-ready',
              rest: 'exports CAC, traçabilité paramètres, versionning',
            },
            { highlight: 'Refresh', rest: 'trimestriel automatique, annuel via pg_cron' },
          ]}
          ctaLabel="Découvrir IFRS 2"
          ctaHref="/produit/valorisation-ifrs2"
          visual={<PvMonteCarlo />}
          reverse
        />

        {/* Pilier 3 — Conformité & Audit */}
        <MktPillar
          index="iii"
          category="Conformité & Audit"
          title={
            <>
              Au-dessus du standard CAC,{' '}
              <span className="text-mkt-italic text-brass-700">pas en-dessous</span>.
            </>
          }
          description="Audit trail immuable (chaîne de hash), exports auditeurs en un clic, defense-in-depth multi-tenant à 4 couches, signature eIDAS qualifié avancé via Yousign. Chaque action est horodatée, cosignée, et reproductible."
          bullets={[
            {
              highlight: 'Hash chain',
              rest: 'preuve d’intégrité cryptographique de bout en bout',
            },
            {
              highlight: 'Exports CAC',
              rest: 'registre des mouvements + journal des décisions, en un clic',
            },
            {
              highlight: 'Defense-in-depth',
              rest: 'RLS Postgres, TENANT_VIOLATION guards, server checks, frontend filtering',
            },
          ]}
          ctaLabel="Découvrir la conformité"
          ctaHref="/produit/conformite-fr"
          visual={<PvAudit />}
        />

        {/* Pilier 4 — Portail bénéficiaire */}
        <MktPillar
          index="iv"
          category="Portail bénéficiaire"
          title={
            <>
              Vos salariés <span className="text-mkt-italic text-brass-700">comprennent enfin</span>{' '}
              leur equity.
            </>
          }
          description="Vesting visualisé en timeline, simulateur de sortie what-if, documents centralisés, acceptation en ligne. La meilleure manière de transformer un BSPCE oublié dans un drawer en outil de motivation salariale."
          bullets={[
            {
              highlight: 'Timeline vesting',
              rest: 'segments acquis, en cours, futurs, conditionnels',
            },
            {
              highlight: 'Simulateur de sortie',
              rest: 'slider what-if, gain net après PFU 30 %',
            },
            { highlight: 'Acceptation', rest: 'signature en ligne, archive eIDAS' },
          ]}
          ctaLabel="Découvrir le portail"
          ctaHref="/produit/portail-beneficiaire"
          visual={<PvPortal />}
          reverse
        />
      </MktSection>

      {/* ===== COMPARATIF ===== */}
      <MktSection variant="paper-200">
        <MktSectionHead
          eyebrow="Capiwise vs concurrents"
          title={
            <>
              Pourquoi nous, plutôt que{' '}
              <span className="text-mkt-italic text-brass-700">Carta, Uplaw</span> ou Equify ?
            </>
          }
          description="Cinq différences qui comptent quand vous structurez vos premiers plans, montez en série A/B, ou préparez une due diligence acquéreur."
        />
        <MktComparison
          columns={['Critère', 'Capiwise', 'Carta', 'Uplaw', 'Equify']}
          rows={[
            {
              criterion: 'Conformité FR native (BSPCE / AGA / AGE)',
              values: [
                { type: 'yes', label: 'Natif' },
                { type: 'partial', label: 'Manuel' },
                { type: 'yes', label: 'Natif' },
                { type: 'yes', label: 'Natif' },
              ],
            },
            {
              criterion: 'Valorisation IFRS 2 (Monte Carlo)',
              values: [
                { type: 'yes', label: 'Inclus' },
                { type: 'paid', label: '2-5 k$ / val.' },
                { type: 'no', label: 'Non' },
                { type: 'no', label: 'Non' },
              ],
            },
            {
              criterion: 'Hébergement FR / EU · pas de Cloud Act',
              values: [
                { type: 'yes', label: 'Vercel + Supabase EU' },
                { type: 'no', label: 'US' },
                { type: 'yes', label: 'FR' },
                { type: 'yes', label: 'FR' },
              ],
            },
            {
              criterion: 'Pricing transparent & public',
              values: [
                { type: 'yes', label: '3 plans publics' },
                { type: 'partial', label: 'Sales-led' },
                { type: 'no', label: 'Sur devis' },
                { type: 'no', label: 'Sur devis' },
              ],
            },
            {
              criterion: 'Multi-tenant audit-ready (defense-in-depth)',
              values: [
                { type: 'yes', label: '4 couches' },
                { type: 'partial', label: 'Non documenté' },
                { type: 'partial', label: 'Non documenté' },
                { type: 'partial', label: 'Non documenté' },
              ],
            },
          ]}
        />
        <div className="mt-8 flex justify-center">
          <a
            href="/comparatif"
            className="border-paper-300 hover:border-ink-700 text-ink-800 inline-flex items-center gap-2 rounded-md border bg-transparent px-[18px] py-2.5 text-[13.5px] font-medium transition-all"
          >
            Voir le comparatif détaillé sur 30+ critères →
          </a>
        </div>
      </MktSection>

      {/* ===== TESTIMONIALS ===== */}
      <MktSection>
        <MktSectionHead
          eyebrow="Premiers retours"
          title={
            <>
              Ils ont structuré leur actionnariat{' '}
              <span className="text-mkt-italic text-brass-700">chez nous</span>.
            </>
          }
          description="Témoignages de notre cohorte beta privée, ouverte le 18 mai 2026. Les noms et logos sont anonymisés en attendant la sortie publique."
        />
        <MktTestimonials
          testimonials={[
            {
              quote:
                'Le wizard nous a forcés à expliciter ce qu’on faisait à la main depuis trois ans. On a découvert deux non-conformités AGE en 20 minutes. Plus jamais Excel pour ça.',
              initials: 'CL',
              name: 'Camille L.',
              role: 'CFO · SaaS Série A · 32 béné.',
            },
            {
              quote:
                'L’IFRS 2 par Monte Carlo, c’était un sujet annuel à 12 k€ de cabinet. Maintenant c’est un onglet. Notre CAC valide les exports sans question.',
              initials: 'JM',
              name: 'Jean-Marc D.',
              role: 'DAF · Industriel · 80 béné.',
            },
            {
              quote:
                'Mes 47 salariés ont un portail qui leur dit ce qu’ils ont, ce qu’ils auront, et ce que ça vaut si on sort à 200 M€. Ça a changé leurs conversations RH.',
              initials: 'SR',
              name: 'Sophie R.',
              role: 'People Ops · Scale-up B · 47 béné.',
            },
          ]}
        />
      </MktSection>

      {/* ===== TRUST BADGES ===== */}
      <MktSection tight>
        <MktTrust
          badges={[
            {
              label: 'Conformité',
              name: 'RGPD',
              italicSuffix: 'strict',
              desc: 'DPO interne · DPIA documenté · registre des traitements',
            },
            {
              label: 'Hébergement',
              name: 'France',
              italicSuffix: '& EU',
              desc: 'Vercel EU · Supabase EU · Sentry DE · pas d’exposition Cloud Act',
            },
            {
              label: 'Signature',
              name: 'eIDAS',
              italicSuffix: 'qualifié',
              desc: 'via Yousign · niveau qualifié avancé · valeur juridique FR',
            },
            {
              label: 'En cours · Q4 2026',
              name: 'ISO',
              italicSuffix: '27001',
              desc: 'Audit en cours · SOC 2 Type II prévu 2027',
              pending: true,
            },
          ]}
        />
      </MktSection>

      {/* ===== CTA BANNER ===== */}
      <MktSection tight>
        <MktCtaBanner
          title={
            <>
              Prêt à structurer votre{' '}
              <span className="text-mkt-italic text-brass-300">actionnariat salarié</span> ?
            </>
          }
          description="Démo personnalisée en 30 minutes avec un consultant equity. Sans engagement, sans script commercial. Vous repartez avec une cartographie de vos plans actuels et des recommandations chiffrées."
          primaryCta={{ label: 'Demander une démo', href: '/contact' }}
          secondaryCta={{ label: 'Voir les tarifs', href: '/tarifs' }}
          asideContact="contact@capiwise.fr · réponse sous 24 h ouvrées"
        />
      </MktSection>
    </MarketingLayout>
  );
}
