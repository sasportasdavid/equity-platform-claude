import type { ReactNode } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/status-badge';
import { Sparkline2 } from '@/components/shared/Sparkline2';

/**
 * PR #37 B2 — HeroKpi (canonique cw-chrome2.jsx).
 *
 * Card 1.5× signature du Dashboard CFO. Embarque :
 * - overline brass-500 + badge optionnel `bond` (PAS live — réservé Alertes)
 * - valeur principale 56px mono tabular-nums + unité 22px + delta 15px
 * - rule cuivre 36×1
 * - ctx mono 13px ink-500
 * - narrative italic Fraunces 14 + `font-variation-settings: 'opsz' 144`
 *   (axe optical size — Fraunces a un axe variable opsz 9..144, 144 =
 *   "display rich" pour les phrases courtes mises en valeur)
 * - Sparkline2 64h tout en bas
 * - link CTA brass-700 mono
 *
 * Attribut signature : `gridRow: 'span 2'` pour occuper la hauteur des
 * 2 lignes des satellites (alignement asymétrique mockup).
 *
 * Props alignées sur le brief PR #37 §HeroKpi.
 */
export type HeroKpiProps = {
  /** Overline éditoriale brass-500 — ex "Fair Value · IFRS 2". */
  overline: string;
  /** Valeur principale (string formatée). Ex "12,4". */
  value: string;
  /** Unité optionnelle. Ex "M€". */
  unit?: string;
  /** Delta optionnel. Ex "+4,2 %". */
  delta?: string;
  /** Direction du delta (couleur + flèche). */
  deltaDir?: 'up' | 'down';
  /** Ligne contexte mono 13px ink-500. */
  ctx?: string;
  /** Citation italic Fraunces sous le ctx. */
  narrative?: string;
  /** Série sparkline (>= 2 points). */
  spark: number[];
  /** Couleur sparkline. Default brass-500. */
  sparkColor?: string;
  /** 3 ticks dates affichés sous la sparkline. */
  ticks?: [string, string, string] | string[];
  /** Lien CTA optionnel. */
  link?: string;
  href?: string;
  /** Slot custom pour empty state (override des autres props). */
  emptyState?: ReactNode;
  /** Identifiant a11y unique (article aria-labelledby). */
  id?: string;
};

export function HeroKpi({
  overline,
  value,
  unit,
  delta,
  deltaDir = 'up',
  ctx,
  narrative,
  spark,
  sparkColor = 'var(--brass-500)',
  ticks,
  link,
  href,
  emptyState,
  id,
}: HeroKpiProps) {
  const headingId = id ?? `hero-kpi-${overline.replace(/\s+/g, '-')}`;
  const isUp = deltaDir === 'up';
  const deltaColor = isUp ? 'var(--bond-500)' : 'var(--title-500)';
  const arrow = isUp ? '↗' : '↘';

  return (
    <article
      role="region"
      aria-labelledby={headingId}
      className="bg-paper-50 border-paper-300 relative flex h-full flex-col overflow-hidden rounded-[10px] border"
      style={{ padding: '24px 28px', gridRow: 'span 2' }}
      data-testid="hero-kpi"
    >
      {emptyState ? (
        <>
          <div className="flex items-start justify-between gap-2">
            <p
              id={headingId}
              className="text-overline text-brass-500"
              data-testid="hero-kpi-overline"
            >
              {overline}
            </p>
          </div>
          <div className="flex flex-1 flex-col">{emptyState}</div>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <p
              id={headingId}
              className="text-overline text-brass-500"
              data-testid="hero-kpi-overline"
            >
              {overline}
            </p>
            <StatusBadge tone="bond">● IFRS 2</StatusBadge>
          </div>

          {/* Valeur principale 56px — règle nowrap anti-bug "4 [retour] 200" */}
          <div
            className="text-ink-900 flex items-baseline gap-1.5 font-mono tabular-nums"
            style={{
              fontSize: 56,
              marginTop: 10,
              fontWeight: 500,
              lineHeight: 1,
              letterSpacing: '-0.02em',
              whiteSpace: 'nowrap',
            }}
            data-testid="hero-kpi-value"
          >
            <span>{value}</span>
            {unit ? (
              <span
                className="text-ink-500 font-mono"
                style={{
                  fontSize: 22,
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
                style={{ fontSize: 15, fontWeight: 600, marginLeft: 8, color: deltaColor }}
                data-testid="hero-kpi-delta"
              >
                {arrow} {delta}
              </span>
            ) : null}
          </div>

          {/* Rule cuivre 36×1 (différent du TitleRule 64) */}
          <div
            className="bg-brass-500"
            style={{ width: 36, height: 1, marginTop: 10 }}
            aria-hidden="true"
          />

          {/* Ctx mono */}
          {ctx ? (
            <p
              className="text-ink-500 font-mono"
              style={{ fontSize: 13, marginTop: 6 }}
              data-testid="hero-kpi-ctx"
            >
              {ctx}
            </p>
          ) : null}

          {/* Narrative italic Fraunces 14 (axe opsz 144) */}
          {narrative ? (
            <p
              className="font-serif italic"
              style={{
                fontSize: 14,
                color: 'var(--ink-700)',
                lineHeight: 1.5,
                marginTop: 14,
                maxWidth: '40ch',
                fontVariationSettings: "'opsz' 144",
              }}
              data-testid="hero-kpi-narrative"
            >
              {narrative}
            </p>
          ) : null}

          {/* Sparkline2 64h en bas */}
          <div style={{ marginTop: 'auto', paddingTop: 12 }}>
            <Sparkline2
              values={spark}
              color={sparkColor}
              height={64}
              ticks={ticks}
              ariaLabel={`Sparkline ${overline}`}
            />
          </div>

          {/* Link CTA */}
          {link ? (
            href ? (
              <Link
                href={href}
                className="text-brass-700 hover:text-brass-900 inline-flex items-center gap-1 font-medium"
                style={{ marginTop: 6, fontSize: 12 }}
                data-testid="hero-kpi-link"
              >
                {link} <span aria-hidden="true">→</span>
              </Link>
            ) : (
              <span
                className="text-brass-700 inline-flex items-center gap-1 font-medium"
                style={{ marginTop: 6, fontSize: 12 }}
                data-testid="hero-kpi-link"
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
