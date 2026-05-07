import type { Metadata } from 'next';
import { CalendarCheck, Compass, FileText, MessagesSquare } from 'lucide-react';
import { MarketingLayout } from '@/components/marketing/layout';
import {
  FeatureGrid,
  HeroSmall,
  MarketingSection,
  SectionHeader,
  TrustBadges,
} from '@/components/marketing/sections';
import { ContactForm } from './contact-form';

export const metadata: Metadata = {
  title: 'Contact — Demandez une démo',
  description:
    'Discutons de votre projet d’actionnariat salarié. Démo personnalisée en 30 minutes, sans engagement.',
  alternates: { canonical: 'https://www.capiwise.fr/contact' },
};

export default function ContactPage() {
  return (
    <MarketingLayout>
      <HeroSmall
        eyebrow="Contact"
        title={
          <>
            Discutons de votre projet d’{' '}
            <span className="serif-italic text-brass-700">actionnariat salarié</span>.
          </>
        }
        description="Démo personnalisée en 30 minutes. Sans engagement, sans script de vente. Notre équipe vous montre les modules adaptés à votre stade et vos instruments."
      />

      <MarketingSection>
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="text-h2 text-ink-900 mb-6">Demander une démo</h2>
            <ContactForm />
          </div>
          <aside className="border-paper-300 bg-paper-50 flex flex-col gap-6 rounded-xl border p-6">
            <div>
              <span className="text-overline text-brass-700">Email direct</span>
              <a
                href="mailto:contact@capiwise.fr"
                className="text-ink-900 hover:text-brass-700 mt-2 block text-base font-medium"
              >
                contact@capiwise.fr
              </a>
            </div>
            <div>
              <span className="text-overline text-brass-700">Adresse postale</span>
              <p className="text-ink-700 mt-2 text-sm leading-relaxed">
                Capiwise SAS
                <br />
                {/* LEGAL_REVIEW_REQUIRED: à valider avec avocat avant lancement public */}
                Adresse à compléter
                <br />
                75XXX Paris
              </p>
            </div>
            <div>
              <span className="text-overline text-brass-700">Identité légale</span>
              <p className="text-ink-700 mt-2 text-sm leading-relaxed">
                {/* LEGAL_REVIEW_REQUIRED */}
                SIREN : à compléter
                <br />
                Capital social : à compléter
              </p>
            </div>
            <div className="border-paper-300 border-t pt-4">
              <span className="text-overline text-brass-700">Calendrier de démo</span>
              <p className="text-ink-700 mt-2 text-sm leading-relaxed">
                Calendly intégré disponible en V1.X. En attendant, le formulaire ci-contre déclenche
                une réponse sous 24 h ouvrées.
              </p>
            </div>
          </aside>
        </div>
      </MarketingSection>

      <MarketingSection paper>
        <SectionHeader
          eyebrow="Comment ça se passe"
          title="4 étapes du premier contact à la proposition"
        />
        <div className="mt-12">
          <FeatureGrid
            cols={4}
            features={[
              {
                icon: Compass,
                title: 'Discovery (15 min)',
                description: 'Comprendre votre stack, votre stade, vos instruments.',
              },
              {
                icon: MessagesSquare,
                title: 'Démo personnalisée (30 min)',
                description: 'Tour des modules adaptés à votre cas (BSPCE, AGA, etc.).',
              },
              {
                icon: CalendarCheck,
                title: 'Use case scoping (15 min)',
                description: 'Identification des features critiques + roadmap migration.',
              },
              {
                icon: FileText,
                title: 'Proposition (J+2)',
                description: 'Devis + plan de migration + démarrage POC si pertinent.',
              },
            ]}
          />
        </div>
      </MarketingSection>

      <TrustBadges
        badges={[
          { label: 'Hébergement FR' },
          { label: 'RGPD strict' },
          { label: 'eIDAS qualifié' },
          { label: 'Audit trail immuable' },
        ]}
      />
    </MarketingLayout>
  );
}
