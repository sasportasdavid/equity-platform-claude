'use client';

import Link from 'next/link';
import { type ReactNode, useMemo } from 'react';
import { Area, AreaChart, ResponsiveContainer, XAxis } from 'recharts';
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusBadge, type StatusBadgeTone } from '@/components/ui/status-badge';

/**
 * Module Design System V1 — KPICard signature Editorial Finance.
 *
 * Le composant le plus emblématique du DS V1. Présent sur :
 *   - Dashboard CFO (mockup 1)
 *   - Plan Detail (mockup 4)
 *   - Portail bénéficiaire (mockup 2)
 *
 * **Caractéristiques signature** :
 *
 * 1. Sparkline Recharts AreaChart minimaliste
 *    - Gradient brass-100 → transparent
 *    - Stroke brass-500 1.5px
 *
 * 2. **Point d'ancrage final OBLIGATOIRE** sur la sparkline :
 *    - Cercle rempli 5px brass-500
 *    - Cercle creux 8px stroke 1.5 brass-500
 *    - Valeur en text-numeric-sm ink-900 à côté
 *
 * 3. **Détection tendance baissière** sur les 3 derniers points
 *    (`y[n-2] > y[n-1] > y[n]`) → point final en title-500 (rouge)
 *
 * 4. **Empty state intégré** (jamais "—" ou "Aucune donnée") :
 *    illustration SVG inline + 1 phrase éditoriale
 *
 * 5. Hover : translateY(-2px), shadow-md → shadow-lg en 200ms
 *
 * 6. Variante `size="hero"` : largeur 1.5×, sparkline 2× plus haute,
 *    citation italic toujours visible
 */

export type SparklinePoint = { x: string; y: number };

export type KPICardDelta = {
  /** Valeur signée du delta (ex: +4.2 → +4,2 % affiché) */
  value: number;
  /** Période courte affichée à droite du delta (ex: "vs T-1") */
  period?: string;
  /** Override la direction calculée automatiquement depuis le sign */
  direction?: 'up' | 'down' | 'flat';
};

export type KPICardEmptyState = {
  illustration?: ReactNode;
  copy: string;
};

export type KPICardProps = {
  /** Overline éditoriale au-dessus du chiffre. Ex: "FAIR VALUE · IFRS 2" */
  label: string;
  /** Valeur principale. `null` ou `undefined` → empty state intégré */
  value: number | string | null | undefined;
  /** Unité affichée à droite de la valeur. Ex: "M€", "%", "u." */
  unit?: string;
  delta?: KPICardDelta;
  /** Ligne de contexte mono. Ex: "vs T-1 · valorisation 31 mars 2026" */
  contextLine?: string;
  /** Citation italic serif. Visible uniquement en variante hero. */
  italicCommentary?: string;
  /** Données sparkline. Si vide ou < 2 points → pas de sparkline */
  sparklineData?: ReadonlyArray<SparklinePoint>;
  /** StatusBadge complémentaire (ex: LIVE) */
  statusBadge?: {
    tone: StatusBadgeTone;
    pattern?: 'solid' | 'dotted' | 'pulse' | 'lock';
    label: string;
  };
  /** Lien CTA optionnel. */
  href?: string;
  ctaLabel?: string;
  /** Empty state personnalisé. Sinon fallback éditorial générique. */
  emptyState?: KPICardEmptyState;
  /** Taille — `hero` agrandit largeur + sparkline + commentaire italic */
  size?: 'default' | 'hero';
  className?: string;
};

export function KPICard({
  label,
  value,
  unit,
  delta,
  contextLine,
  italicCommentary,
  sparklineData,
  statusBadge,
  href,
  ctaLabel,
  emptyState,
  size = 'default',
  className,
}: KPICardProps) {
  const isEmpty = value === null || value === undefined;
  const isHero = size === 'hero';

  // Détection tendance baissière sur les 3 derniers points
  const isDownTrend = useMemo(() => {
    if (!sparklineData || sparklineData.length < 3) return false;
    const last3 = sparklineData.slice(-3);
    return last3[0]!.y > last3[1]!.y && last3[1]!.y > last3[2]!.y;
  }, [sparklineData]);

  const finalPointColor = isDownTrend ? 'var(--title-500)' : 'var(--brass-500)';

  const content = (
    <div
      className={cn(
        'bg-card border-border/50 group relative flex h-full flex-col gap-3 rounded-lg border p-5 transition-all duration-200',
        href &&
          'hover:border-brass-300 hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-6px_rgba(11,24,56,0.10),0_4px_8px_-4px_rgba(11,24,56,0.06)]',
        isHero && 'gap-4 p-6',
        className,
      )}
      data-testid="kpi-card"
    >
      {/* Header — overline + status badge */}
      <div className="flex items-start justify-between gap-2">
        <p className="text-overline text-brass-500">{label}</p>
        {statusBadge ? (
          <StatusBadge tone={statusBadge.tone} pattern={statusBadge.pattern}>
            {statusBadge.label}
          </StatusBadge>
        ) : null}
      </div>

      {/* Body — value + unit + delta OU empty state */}
      {isEmpty ? (
        <KPIEmptyState emptyState={emptyState} />
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span
              className={cn('text-ink-900', isHero ? 'text-numeric-xl' : 'text-numeric-lg')}
              data-testid="kpi-value"
            >
              {value}
            </span>
            {unit ? <span className="text-numeric-md text-ink-500">{unit}</span> : null}
            {delta ? <KPIDelta delta={delta} /> : null}
          </div>

          {contextLine ? (
            <p className="text-numeric-sm text-ink-500" data-testid="kpi-context-line">
              {contextLine}
            </p>
          ) : null}

          {italicCommentary && isHero ? (
            <p className="serif-italic text-ink-700 max-w-md text-sm leading-relaxed">
              {italicCommentary}
            </p>
          ) : null}

          {/* Sparkline + final anchor point */}
          {sparklineData && sparklineData.length >= 2 ? (
            <div
              className={cn('relative mt-2', isHero ? 'h-20' : 'h-12')}
              data-testid="kpi-sparkline"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={sparklineData as SparklinePoint[]}
                  margin={{ top: 4, right: 32, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient
                      id={`spark-gradient-${label.replace(/\s+/g, '-')}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="var(--brass-500)" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="var(--brass-500)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  {isHero ? <XAxis dataKey="x" hide /> : null}
                  <Area
                    type="monotone"
                    dataKey="y"
                    stroke="var(--brass-500)"
                    strokeWidth={1.5}
                    fill={`url(#spark-gradient-${label.replace(/\s+/g, '-')})`}
                    isAnimationActive={false}
                    activeDot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
              {/* Final anchor point — overlay SVG */}
              <FinalAnchorPoint data={sparklineData} color={finalPointColor} heroMode={isHero} />
            </div>
          ) : null}

          {/* CTA */}
          {href && ctaLabel ? (
            <div className="mt-auto pt-2">
              <span className="text-brass-700 group-hover:text-brass-900 inline-flex items-center gap-1 text-xs font-medium">
                {ctaLabel}
                <ArrowRight className="size-3" strokeWidth={1.5} />
              </span>
            </div>
          ) : null}
        </>
      )}
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  ) : (
    content
  );
}

function KPIDelta({ delta }: { delta: KPICardDelta }) {
  const direction = delta.direction ?? (delta.value > 0 ? 'up' : delta.value < 0 ? 'down' : 'flat');
  const isUp = direction === 'up';
  const isDown = direction === 'down';
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : null;

  return (
    <span
      className={cn(
        'text-numeric-sm ml-2 inline-flex items-center gap-1',
        isUp && 'text-bond-500',
        isDown && 'text-title-500',
        !isUp && !isDown && 'text-ink-500',
      )}
      data-testid="kpi-delta"
    >
      {Icon ? <Icon className="size-3" strokeWidth={1.5} /> : null}
      <span>
        {delta.value > 0 ? '+' : ''}
        {delta.value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %
      </span>
      {delta.period ? <span className="text-ink-400">{delta.period}</span> : null}
    </span>
  );
}

/**
 * Final anchor point — l'élément signature du KPICard.
 *
 * Position calculée via le ratio (lastY - minY) / (maxY - minY) projeté
 * sur la hauteur du conteneur. Padding 4px top, 0 bottom (cohérent
 * margin Recharts AreaChart).
 *
 * Composant :
 *   - Cercle creux 8px stroke 1.5 (couleur)
 *   - Cercle rempli 5px (couleur)
 *   - Valeur mono à côté (heroMode uniquement, pour ne pas saturer
 *     les KPI satellites)
 */
function FinalAnchorPoint({
  data,
  color,
  heroMode,
}: {
  data: ReadonlyArray<SparklinePoint>;
  color: string;
  heroMode: boolean;
}) {
  const last = data[data.length - 1]!;
  const ys = data.map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const range = maxY - minY || 1;
  // Ratio inversé (Recharts Y va du bas vers le haut, mais SVG/CSS top=0)
  const ratio = (last.y - minY) / range;
  const topPct = `${(1 - ratio) * 100}%`;

  return (
    <>
      {/* Cercle creux 8px */}
      <span
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
        style={{
          right: '24px',
          top: topPct,
          width: 8,
          height: 8,
          borderRadius: '50%',
          border: `1.5px solid ${color}`,
          background: 'transparent',
        }}
        aria-hidden="true"
      />
      {/* Cercle rempli 5px (centré dans le creux) */}
      <span
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
        style={{
          right: '24px',
          top: topPct,
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: color,
          marginLeft: '1.5px',
          marginTop: '0.5px',
        }}
        aria-hidden="true"
      />
      {heroMode ? (
        <span
          className="text-numeric-sm text-ink-900 absolute -translate-y-1/2"
          style={{ right: '-6px', top: topPct, paddingLeft: '4px' }}
          aria-hidden="true"
        >
          {last.y.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
        </span>
      ) : null}
    </>
  );
}

function KPIEmptyState({ emptyState }: { emptyState?: KPICardEmptyState }) {
  const copy = emptyState?.copy ?? 'Pas encore de données pour cet indicateur.';
  return (
    <div className="flex flex-1 flex-col items-start gap-2 py-2" data-testid="kpi-empty-state">
      {emptyState?.illustration ?? <KPIDefaultIllustration />}
      <p className="serif-italic text-ink-500 text-sm leading-relaxed">{copy}</p>
    </div>
  );
}

function KPIDefaultIllustration() {
  return (
    <svg
      width="32"
      height="24"
      viewBox="0 0 32 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Sparkline plate stylisée — métaphore "pas encore de mouvement" */}
      <path
        d="M 2 16 Q 8 14 14 15 T 30 12"
        stroke="var(--brass-300)"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeDasharray="2 3"
      />
      <circle cx="30" cy="12" r="2.5" stroke="var(--brass-300)" strokeWidth="1.5" fill="none" />
    </svg>
  );
}
