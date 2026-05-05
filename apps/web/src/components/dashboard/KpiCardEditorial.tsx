import type { ReactNode } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/status-badge';
import { Sparkline } from '@/components/shared/Sparkline';

/**
 * PR #37 B3 — KpiCardEditorial (canonique cw-chrome.jsx).
 *
 * Card slim signature pour les 4 satellites du Dashboard CFO en grille 2×2.
 * **Pure SVG sparkline** (pas Recharts) avec point d'ancrage final + valeur
 * mono 11 à droite.
 *
 * Ne remplace **PAS** le legacy `KPICard` (apps/web/src/components/shared/
 * kpi-card.tsx) qui reste utilisé sur Awards/Plans/Portail. Ce composant est
 * spécifique au Dashboard V1e refondu.
 *
 * Structure (cw-chrome.jsx) :
 * - head : overline brass-500 + badge optionnel (`live` → `<StatusBadge tone="bond" pattern="pulse">Live</StatusBadge>`)
 * - val  : mono 36px tabular nowrap + unit 0.46em ink-500 + delta mono 13 bond/title
 * - rule : brass 24×1
 * - ctx  : mono 12 ink-500
 * - spark: Sparkline embarquée + valeur finale mono 11 ink-700 (ou title-700 trailDown)
 * - link : sans 12 brass-700 weight 500
 */
export type KpiCardEditorialProps = {
  /** Overline brass-500 (sans uppercase forcée — brass renderer le fait via .text-overline). */
  overline: string;
  /** Valeur principale (string). */
  value: string;
  /** Unité optionnelle (rendue en 0.46em ink-500). */
  unit?: string;
  /** Delta optionnel (string formaté). */
  delta?: string;
  /** Direction delta (couleur + flèche). */
  deltaDir?: 'up' | 'down';
  /** Ligne contexte mono 12 ink-500. */
  ctx?: string;
  /** Série sparkline (>= 2 points). Optionnel : pas de sparkline rendue si absent. */
  spark?: number[];
  /** Couleur sparkline (default brass-500 dans le composant Sparkline). */
  sparkColor?: string;
  /** Si true → dot final passe en title-500 + valeur finale en title-700. */
  sparkTrailDown?: boolean;
  /** Lien CTA optionnel. */
  link?: string;
  href?: string;
  /** Si true → badge `Live` (bond.live) en head — signal "en direct" doux. */
  live?: boolean;
  /** Slot custom pour empty state (override des autres props quand value invalide). */
  emptyState?: ReactNode;
  /** Identifiant a11y unique. */
  id?: string;
};

export function KpiCardEditorial({
  overline,
  value,
  unit,
  delta,
  deltaDir = 'up',
  ctx,
  spark,
  sparkColor = 'var(--brass-500)',
  sparkTrailDown = false,
  link,
  href,
  live = false,
  emptyState,
  id,
}: KpiCardEditorialProps) {
  const headingId = id ?? `kpi-${overline.replace(/\s+/g, '-')}`;
  const isUp = deltaDir === 'up';
  const deltaColor = isUp ? 'var(--bond-500)' : 'var(--title-500)';
  const arrow = isUp ? '↗' : '↘';
  const lastSparkValue = spark && spark.length > 0 ? spark[spark.length - 1] : null;
  const finalValueColor = sparkTrailDown ? 'var(--title-700)' : 'var(--ink-700)';

  return (
    <article
      role="region"
      aria-labelledby={headingId}
      className="bg-paper-50 border-paper-300 relative flex h-full flex-col gap-2 overflow-hidden rounded-[10px] border"
      style={{ padding: '18px 20px' }}
      data-testid="kpi-card-editorial"
    >
      {emptyState ? (
        <>
          <p
            id={headingId}
            className="text-overline text-brass-500"
            data-testid="kpi-card-overline"
          >
            {overline}
          </p>
          <div className="flex flex-1 flex-col">{emptyState}</div>
        </>
      ) : (
        <>
          {/* Head : overline + badge optionnel */}
          <div className="flex items-center justify-between gap-2">
            <p
              id={headingId}
              className="text-overline text-brass-500"
              data-testid="kpi-card-overline"
            >
              {overline}
            </p>
            {live ? (
              <StatusBadge
                tone="bond"
                pattern="pulse"
                data-testid="kpi-card-live-badge"
                aria-label="Indicateur en temps réel"
              >
                Live
              </StatusBadge>
            ) : null}
          </div>

          {/* Val : mono 36 tabular nowrap + unit + delta */}
          <div
            className="text-ink-900 flex items-baseline gap-1.5 font-mono tabular-nums"
            style={{
              fontSize: 36,
              marginTop: 4,
              fontWeight: 500,
              lineHeight: 1,
              letterSpacing: '-0.02em',
              whiteSpace: 'nowrap',
            }}
            data-testid="kpi-card-value"
          >
            <span>{value}</span>
            {unit ? (
              <span
                className="text-ink-500 font-mono"
                style={{
                  fontSize: '0.46em',
                  fontWeight: 500,
                  marginLeft: 6,
                  letterSpacing: '0.01em',
                }}
              >
                {unit}
              </span>
            ) : null}
            {delta ? (
              <span
                className="font-mono"
                style={{ fontSize: 13, fontWeight: 600, marginLeft: 8, color: deltaColor }}
                data-testid="kpi-card-delta"
              >
                {arrow} {delta}
              </span>
            ) : null}
          </div>

          {/* Rule cuivre 24×1 */}
          <div
            className="bg-brass-500"
            style={{ width: 24, height: 1, marginTop: 6 }}
            aria-hidden="true"
          />

          {/* Ctx mono */}
          {ctx ? (
            <p
              className="text-ink-500 font-mono"
              style={{ fontSize: 12 }}
              data-testid="kpi-card-ctx"
            >
              {ctx}
            </p>
          ) : null}

          {/* Sparkline embarquée + valeur finale mono à droite */}
          {spark && spark.length > 0 ? (
            <div
              style={{
                marginTop: 'auto',
                paddingTop: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
              data-testid="kpi-card-spark"
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <Sparkline
                  values={spark}
                  color={sparkColor}
                  trailDown={sparkTrailDown}
                  ariaLabel={`Sparkline ${overline}`}
                />
              </div>
              <span
                className="font-mono tabular-nums"
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  color: finalValueColor,
                }}
              >
                {typeof lastSparkValue === 'number'
                  ? lastSparkValue.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
                  : ''}
              </span>
            </div>
          ) : null}

          {/* Link CTA brass */}
          {link ? (
            href ? (
              <Link
                href={href}
                className="text-brass-700 hover:text-brass-900 inline-flex items-center gap-1 font-medium"
                style={{ marginTop: 6, fontSize: 12 }}
                data-testid="kpi-card-link"
              >
                {link} <span aria-hidden="true">→</span>
              </Link>
            ) : (
              <span
                className="text-brass-700 inline-flex items-center gap-1 font-medium"
                style={{ marginTop: 6, fontSize: 12 }}
                data-testid="kpi-card-link"
              >
                {link} <span aria-hidden="true">→</span>
              </span>
            )
          ) : null}
        </>
      )}
    </article>
  );
}
