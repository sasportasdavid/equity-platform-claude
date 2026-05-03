import { KPICard } from '@/components/shared/kpi-card';

export const metadata = { title: 'Dev — KPICard signature' };

/**
 * Sandbox /dev/design/kpi-card — Module Design System V1, Étape 6.
 *
 * 5 cas de validation visuelle pour le composant signature KPICard :
 *
 * 1. **Hero** avec sparkline up + delta positif (Fair Value IFRS 2)
 * 2. **Standard** avec delta négatif (cap libre)
 * 3. **Tendance baissière 3 derniers points** → ancrage final title-500
 *    (rouge éditorial)
 * 4. **Empty state intégré** (pas de "—" ou "Aucune donnée")
 * 5. **Status badge LIVE** + sparkline plate (alertes conformité
 *    temps réel)
 */

const upTrend = [
  { x: '2026-01', y: 11.2 },
  { x: '2026-02', y: 11.4 },
  { x: '2026-03', y: 11.7 },
  { x: '2026-04', y: 11.9 },
  { x: '2026-05', y: 12.4 },
];

const downTrend3 = [
  { x: '2026-01', y: 5.1 },
  { x: '2026-02', y: 4.8 },
  { x: '2026-03', y: 4.2 }, // déclenche détection 3-points down
  { x: '2026-04', y: 3.9 },
  { x: '2026-05', y: 3.2 },
];

const flatLive = [
  { x: 'J-7', y: 2 },
  { x: 'J-6', y: 1 },
  { x: 'J-5', y: 2 },
  { x: 'J-4', y: 1 },
  { x: 'J-3', y: 2 },
  { x: 'J-2', y: 1 },
  { x: 'J-1', y: 2 },
];

export default function KPICardSandboxPage() {
  return (
    <div className="bg-background mx-auto min-h-screen max-w-6xl p-8">
      <header className="mb-8 space-y-2">
        <p className="text-overline text-brass-500">DESIGN SYSTEM V1 · SANDBOX</p>
        <h1 className="text-h1 text-ink-900">
          KPICard <span className="serif-italic text-brass-500">signature</span>
        </h1>
        <div className="bg-brass-500 animate-draw-line mt-3 h-[2px] w-16" aria-hidden="true" />
        <p className="text-ink-500 mt-3 text-sm">
          5 cas de validation : hero, standard, tendance baissière, empty state, status live.
        </p>
      </header>

      <section className="space-y-8">
        {/* CAS 1 — HERO sparkline up */}
        <div className="space-y-3">
          <h2 className="text-h3 text-ink-900">Cas 1 — Hero · sparkline up + delta positif</h2>
          <p className="text-ink-500 text-sm">
            Référence : Dashboard CFO (mockup 1) — KPI Fair Value · IFRS 2.
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <KPICard
                size="hero"
                label="FAIR VALUE · IFRS 2"
                value="12,4"
                unit="M€"
                delta={{ value: 4.2, period: 'vs T-1', direction: 'up' }}
                contextLine="vs T-1 · valorisation 31 mars 2026 · CAC E&Y"
                italicCommentary="Hausse soutenue par la signature du plan BSPCE-2026-001 et la révision de la FMV (312 €)."
                sparklineData={upTrend}
                href="/dashboard/valuations"
                ctaLabel="Voir le rapport IFRS 2"
              />
            </div>
            <div className="text-ink-500 text-xs leading-relaxed">
              <p className="mb-2 font-mono uppercase tracking-wider">Notes :</p>
              <ul className="list-disc space-y-1 pl-4">
                <li>Sparkline gradient brass-100 → transparent</li>
                <li>Stroke brass-500 1.5px</li>
                <li>Point ancrage final = couleur brass (tendance positive)</li>
                <li>Citation italic visible (size=hero)</li>
                <li>CTA &laquo;&nbsp;Voir le rapport IFRS 2 &rarr;&nbsp;&raquo;</li>
                <li>Hover : translateY -2px + shadow</li>
              </ul>
            </div>
          </div>
        </div>

        {/* CAS 2 — STANDARD delta négatif */}
        <div className="space-y-3">
          <h2 className="text-h3 text-ink-900">
            Cas 2 — Standard · delta négatif sans tendance baissière
          </h2>
          <p className="text-ink-500 text-sm">
            Cap libre ESOP en baisse récente mais pas 3 points down.
          </p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KPICard
              label="CAP LIBRE ESOP"
              value="3,2"
              unit="%"
              delta={{ value: -0.3, period: 'vs T-1', direction: 'down' }}
              contextLine="6 720 unités sans révision du pool"
              sparklineData={[
                { x: '2026-01', y: 3.0 },
                { x: '2026-02', y: 3.5 },
                { x: '2026-03', y: 3.4 },
                { x: '2026-04', y: 3.5 },
                { x: '2026-05', y: 3.2 },
              ]}
              href="/dashboard/captable"
              ctaLabel="Réviser le pool"
            />
          </div>
        </div>

        {/* CAS 3 — TENDANCE BAISSIÈRE 3 points down → ancrage title-500 */}
        <div className="space-y-3">
          <h2 className="text-h3 text-ink-900">
            Cas 3 — <span className="serif-italic text-brass-500">Tendance baissière</span> · 3
            derniers points y[n-2] {'>'} y[n-1] {'>'} y[n]
          </h2>
          <p className="text-ink-500 text-sm">
            Détection automatique : ancrage final passe en{' '}
            <code className="bg-paper-200 rounded px-1 font-mono text-xs">title-500</code> (rouge
            éditorial). Données : 5,1 → 4,8 → 4,2 → 3,9 → 3,2.
          </p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KPICard
              label="POOL ESOP DISPONIBLE"
              value="3,2"
              unit="%"
              delta={{ value: -1.9, period: '5 mois', direction: 'down' }}
              contextLine="dilution accélérée depuis janvier"
              sparklineData={downTrend3}
            />
          </div>
        </div>

        {/* CAS 4 — EMPTY STATE intégré */}
        <div className="space-y-3">
          <h2 className="text-h3 text-ink-900">
            Cas 4 — Empty state intégré · jamais &laquo;&nbsp;&mdash;&nbsp;&raquo;
          </h2>
          <p className="text-ink-500 text-sm">
            Quand la donnée n&apos;est pas encore disponible (sparkline manquante, valeur null) →
            illustration SVG inline + phrase éditoriale.
          </p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KPICard
              label="VESTING · 30 JOURS"
              value={null}
              emptyState={{
                copy: 'Pas de tranche prévue dans les 30 prochains jours pour les plans actifs.',
              }}
            />
            <KPICard
              label="ALERTES CONFORMITÉ"
              value={null}
              emptyState={{
                copy: 'Aucune alerte critique sur les plans en cours.',
              }}
            />
          </div>
        </div>

        {/* CAS 5 — STATUS BADGE LIVE + sparkline plate */}
        <div className="space-y-3">
          <h2 className="text-h3 text-ink-900">Cas 5 — Status badge LIVE · sparkline plate</h2>
          <p className="text-ink-500 text-sm">
            Données temps réel — pulse animé sur le badge. La sparkline plate symbolise
            l&apos;absence d&apos;événement majeur (zone calme).
          </p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <KPICard
              label="ALERTES CONFORMITÉ"
              value="2"
              delta={{ value: -1, period: 'depuis 30 jours', direction: 'down' }}
              contextLine="1 critique · 1 warning"
              sparklineData={flatLive}
              statusBadge={{ tone: 'bond', pattern: 'pulse', label: 'LIVE' }}
              href="/dashboard/approvals"
              ctaLabel="Traiter (2)"
            />
          </div>
        </div>
      </section>

      <footer className="text-ink-400 border-paper-300 mt-16 border-t pt-6 font-mono text-xs">
        <p>
          KPICard · Editorial Finance V1 · spec 5.1 · sandbox{' '}
          <code className="bg-paper-200 rounded px-1">/dev/design/kpi-card</code>
        </p>
      </footer>
    </div>
  );
}
