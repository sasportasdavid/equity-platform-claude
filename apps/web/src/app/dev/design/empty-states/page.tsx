'use client';

import { EmptyState } from '@/components/shared/empty-state';
import {
  BookIllustration,
  CompassIllustration,
  LighthouseIllustration,
  PlumeIllustration,
  ScalesIllustration,
  LettrineIllustration,
  SignatureIllustration,
  VaultIllustration,
} from '@/components/shared/illustrations';

/**
 * Sandbox /dev/design/empty-states — Module Design System V1, Étape 7.
 *
 * 8 illustrations SVG inline custom × 4 variantes (list / filtered /
 * error / permission). Validation visuelle de la cohérence éditoriale.
 *
 * Décisions design notables (à reporter après commit) :
 *
 * 1. **Lettrine ornée** (remplace seedling) : capitale « C » Fraunces
 *    serif dans cadre cuivre orné, façon manuscrit médiéval. Évoque
 *    l'ouverture d'un chapitre — métaphore juste pour démarrer son
 *    histoire d'equity. Le vert reste réservé à `bond-500` (succès).
 *    Alternatives documentées dans le composant lettrine-illustration.tsx.
 *
 * 2. **Tous les SVG** sur palette brass + ink + paper-200/50 + ink-300.
 *    Aucun bond-500 (vert) ni title-500 (rouge) pour ne pas pré-influencer
 *    le ton (les CTA fournissent la couleur sémantique).
 *
 * 3. **Stroke 1.5** universel cohérent avec Lucide stroke 1.5 du DS V1.
 *
 * 4. **viewBox 64×64** standardisé — taille rendue 60-80px selon le
 *    contexte d'usage.
 */

export default function EmptyStatesSandboxPage() {
  return (
    <div className="bg-background mx-auto min-h-screen max-w-6xl space-y-12 p-8">
      <header className="space-y-2">
        <p className="text-overline text-brass-500">DESIGN SYSTEM V1 · SANDBOX</p>
        <h1 className="text-h1 text-ink-900">
          8 illustrations <span className="serif-italic text-brass-500">éditoriales</span>
        </h1>
        <div className="bg-brass-500 animate-draw-line mt-3 h-[2px] w-16" aria-hidden="true" />
        <p className="text-ink-500 mt-3 text-sm">
          SVG inline custom — palette brass + ink uniquement. Stroke 1.5, viewBox 64×64.
        </p>
      </header>

      {/* Section 1 — Vue d'ensemble des 8 illustrations */}
      <section>
        <h2 className="text-h2 text-ink-900 mb-4">Inventaire illustrations</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <IllustrationTile name="plume" caption="empty awards">
            <PlumeIllustration size={80} />
          </IllustrationTile>
          <IllustrationTile name="book" caption="empty plans">
            <BookIllustration size={80} />
          </IllustrationTile>
          <IllustrationTile name="compass" caption="empty filtered">
            <CompassIllustration size={80} />
          </IllustrationTile>
          <IllustrationTile name="vault" caption="empty documents">
            <VaultIllustration size={80} />
          </IllustrationTile>
          <IllustrationTile name="signature" caption="empty signatures">
            <SignatureIllustration size={80} />
          </IllustrationTile>
          <IllustrationTile name="scales" caption="empty compliance">
            <ScalesIllustration size={80} />
          </IllustrationTile>
          <IllustrationTile name="lettrine" caption="empty premier truc · capitale ornée">
            <LettrineIllustration size={80} />
          </IllustrationTile>
          <IllustrationTile name="lighthouse" caption="empty error/permission">
            <LighthouseIllustration size={80} />
          </IllustrationTile>
        </div>
      </section>

      {/* Section 2 — 4 variantes complètes */}
      <section className="space-y-8">
        <h2 className="text-h2 text-ink-900">4 variantes EmptyState</h2>

        <div className="space-y-3">
          <h3 className="text-h3 text-ink-900">
            Variante <span className="serif-italic text-brass-500">list</span> · empty awards
          </h3>
          <EmptyState
            variant="list"
            illustration={<PlumeIllustration size={72} />}
            title="Aucune attribution active pour le moment."
            description="Créez votre premier plan d'actionnariat salarié et attribuez-le à un bénéficiaire pour démarrer le suivi."
            action={{ label: 'Nouveau plan →', href: '/dashboard/plans/new' }}
            secondaryLink={{ label: 'Lire le guide BSPCE', href: '#' }}
          />
        </div>

        <div className="space-y-3">
          <h3 className="text-h3 text-ink-900">
            Variante <span className="serif-italic text-brass-500">filtered</span> · empty filtered
          </h3>
          <EmptyState
            variant="filtered"
            illustration={<CompassIllustration size={72} />}
            title="Aucun résultat ne correspond à votre recherche."
            description="Vos filtres sont peut-être trop stricts. Élargissez la période, le type de plan ou réinitialisez tous les filtres."
            action={{ label: 'Réinitialiser les filtres', onClick: () => {} }}
            secondaryLink={{ label: 'Voir tous les plans', href: '/dashboard/plans' }}
          />
        </div>

        <div className="space-y-3">
          <h3 className="text-h3 text-ink-900">
            Variante <span className="serif-italic text-brass-500">error</span> · empty error
          </h3>
          <EmptyState
            variant="error"
            illustration={<LighthouseIllustration size={72} />}
            title="Le moteur de valorisation est inaccessible."
            description="Le calcul IFRS 2 n'a pas pu aboutir. Vérifiez votre connexion ou réessayez dans quelques instants."
            action={{ label: 'Réessayer', onClick: () => {} }}
            secondaryLink={{ label: 'Contacter le support', href: 'mailto:support@capiwise.com' }}
          />
        </div>

        <div className="space-y-3">
          <h3 className="text-h3 text-ink-900">
            Variante <span className="serif-italic text-brass-500">permission</span> · empty
            permission
          </h3>
          <EmptyState
            variant="permission"
            illustration={<VaultIllustration size={72} />}
            title="Vous n'avez pas accès à ce coffre."
            description="L'accès aux documents signés est réservé aux rôles OWNER, ADMIN_HR et au bénéficiaire concerné. Demandez à votre administrateur."
            secondaryLink={{ label: "Voir la politique d'accès", href: '#' }}
          />
        </div>
      </section>

      {/* Section 3 — Tableau des autres usages */}
      <section className="space-y-3">
        <h2 className="text-h2 text-ink-900">Autres usages</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <EmptyState
            illustration={<BookIllustration size={72} />}
            title="Aucun plan signé pour le moment."
            description="Créez votre premier plan BSPCE, AGA ou stock options pour démarrer le suivi."
            action={{ label: 'Nouveau plan →', href: '#' }}
          />
          <EmptyState
            illustration={<SignatureIllustration size={72} />}
            title="Aucune signature en attente."
            description="Toutes vos demandes de signature ont été traitées."
            secondaryLink={{ label: "Voir l'historique", href: '#' }}
          />
          <EmptyState
            illustration={<ScalesIllustration size={72} />}
            title="Tous les contrôles sont validés."
            description="Aucune alerte de conformité active sur vos plans en cours."
          />
          <EmptyState
            illustration={<LettrineIllustration size={72} />}
            title="Bienvenue sur Capiwise."
            description="Commencez par créer votre première organisation et inviter votre équipe."
            action={{ label: 'Créer mon organisation', href: '#' }}
          />
        </div>
      </section>

      <footer className="text-ink-400 border-paper-300 mt-16 border-t pt-6 font-mono text-xs">
        <p>
          EmptyState · Editorial Finance V1 · spec 5.6 · sandbox{' '}
          <code className="bg-paper-200 rounded px-1">/dev/design/empty-states</code>
        </p>
        <p className="mt-2">
          ⚠ <strong>Décision design « premier truc »</strong> : lettrine ornée &laquo; C &raquo;
          Fraunces (remplace seedling), métaphore d&apos;ouverture d&apos;un chapitre plus alignée
          avec le registre Editorial Finance. Alternatives documentées dans
          <code className="bg-paper-200 rounded px-1">lettrine-illustration.tsx</code>.
        </p>
      </footer>
    </div>
  );
}

function IllustrationTile({
  name,
  caption,
  children,
}: {
  name: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-border/40 bg-card flex flex-col items-center gap-3 rounded-lg border p-4">
      <div className="flex h-24 items-center justify-center">{children}</div>
      <div className="text-center">
        <p className="text-ink-900 font-mono text-xs font-semibold uppercase tracking-wider">
          {name}
        </p>
        <p className="text-ink-500 mt-1 text-xs">{caption}</p>
      </div>
    </div>
  );
}
