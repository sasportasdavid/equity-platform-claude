/**
 * Composants éditoriaux du site public V1 (PR #50).
 *
 * Reproduction fidèle du brief `capiwise-public-home.html` :
 * H1 serif 68px italique brass, 4 piliers alternés numérotés en
 * romain, stats sur fond ink-900, comparatif col Capiwise teintée
 * brass, témoignages serif italique.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/* === Section wrappers ====================================== */

export function MktSection({
  children,
  variant = 'default',
  className,
  tight = false,
}: {
  children: ReactNode;
  variant?: 'default' | 'ink' | 'paper-200';
  tight?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn(
        tight ? 'py-[72px]' : 'py-[96px]',
        variant === 'ink' && 'bg-ink-900 text-paper-50',
        variant === 'paper-200' && 'bg-paper-200',
        className,
      )}
    >
      <div className="mx-auto w-full max-w-[1280px] px-10">{children}</div>
    </section>
  );
}

export function MktSectionHead({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-12', className)}>
      {eyebrow ? (
        <span className="text-mkt-overline text-brass-500 mb-3.5 inline-block">{eyebrow}</span>
      ) : null}
      <h2 className="text-mkt-h2 text-ink-900 mb-4 max-w-[22ch]">{title}</h2>
      {description ? (
        <p className="text-ink-500 max-w-[56ch] text-[16px] leading-[1.55]">{description}</p>
      ) : null}
    </div>
  );
}

/* === Hero éditorial ======================================== */

export function MktHero({
  eyebrow,
  title,
  lede,
  primaryCta,
  secondaryCta,
  trustItems,
  visual,
}: {
  eyebrow: string;
  title: ReactNode;
  lede: ReactNode;
  primaryCta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  trustItems?: string[];
  visual?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden pb-16 pt-[88px]">
      <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 items-start gap-14 px-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div>
          <div className="mb-5 flex items-center gap-3.5">
            <span className="bg-brass-500 h-px w-9" aria-hidden />
            <span className="text-mkt-overline text-brass-500">{eyebrow}</span>
          </div>
          <h1 className="text-mkt-hero text-ink-900 mb-5">{title}</h1>
          <p className="text-ink-700 mb-8 max-w-[54ch] text-[17px] leading-[1.55]">{lede}</p>
          <div className="mb-9 flex items-center gap-3.5">
            <Link
              href={primaryCta.href}
              className="bg-brass-500 hover:bg-brass-700 text-paper-50 shadow-brass inline-flex items-center gap-2 rounded-md px-[18px] py-2.5 text-[13.5px] font-medium transition-all"
            >
              {primaryCta.label}
              <ArrowRight className="size-3.5" />
            </Link>
            {secondaryCta ? (
              <Link
                href={secondaryCta.href}
                className="border-paper-300 hover:border-ink-700 text-ink-800 inline-flex items-center gap-2 rounded-md border bg-transparent px-[18px] py-2.5 text-[13.5px] font-medium transition-all"
              >
                {secondaryCta.label}
              </Link>
            ) : null}
          </div>
          {trustItems && trustItems.length > 0 ? (
            <div className="text-mkt-mono text-ink-500 flex flex-wrap gap-x-7 gap-y-4 text-[11px] tracking-wider">
              {trustItems.map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <span className="bg-bond-500 size-2 rounded-full" aria-hidden />
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {visual ? <div className="relative">{visual}</div> : null}
      </div>
    </section>
  );
}

/* === Stats sur fond ink-900 ================================ */

export type StatInk = {
  value: string;
  unit?: string;
  italic?: boolean;
  label: string;
  labelBold?: string;
};

export function MktStatsInk({ stats }: { stats: StatInk[] }) {
  return (
    <div className="border-paper-50/15 grid grid-cols-1 border-y sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => (
        <div
          key={stat.label}
          className={cn(
            'relative px-8 py-9',
            i < stats.length - 1 ? 'lg:border-paper-50/12 lg:border-r' : '',
          )}
        >
          <div
            className="text-paper-50 mb-3.5 flex items-baseline gap-2 text-[64px] font-medium leading-none tracking-[-0.03em]"
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {stat.italic ? (
              <span className="text-mkt-italic text-brass-300">{stat.value}</span>
            ) : (
              <span>{stat.value}</span>
            )}
            {stat.unit ? (
              <span className="text-mkt-mono text-brass-300 text-[18px] font-medium tracking-[-0.01em]">
                {stat.unit}
              </span>
            ) : null}
          </div>
          <div className="text-paper-50/70 max-w-[24ch] text-[13px] leading-snug">
            {stat.labelBold ? (
              <>
                <span className="text-brass-300 font-medium">{stat.labelBold}</span>
                <br />
              </>
            ) : null}
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  );
}

/* === Pilier alterné ======================================== */

export type PillarBullet = {
  /** Mot mis en évidence (ink-900 semibold) */
  highlight?: string;
  /** Reste du bullet (ink-800) */
  rest: ReactNode;
};

export function MktPillar({
  index,
  category,
  title,
  description,
  bullets,
  ctaLabel,
  ctaHref,
  visual,
  reverse,
}: {
  index: 'i' | 'ii' | 'iii' | 'iv';
  category: string;
  title: ReactNode;
  description: ReactNode;
  bullets: PillarBullet[];
  ctaLabel: string;
  ctaHref: string;
  visual: ReactNode;
  reverse?: boolean;
}) {
  return (
    <article
      className={cn(
        'border-paper-300 grid grid-cols-1 items-center gap-20 border-t py-16 first:border-t-0 first:pt-0 lg:grid-cols-2',
      )}
    >
      <div className={cn(reverse ? 'lg:order-2' : '')}>
        <span className="text-mkt-italic text-brass-700 mb-3.5 block text-[16px]">
          {index}. {category}
        </span>
        <h3 className="text-mkt-h3 text-ink-900 mb-4.5 max-w-[18ch]" style={{ marginBottom: 18 }}>
          {title}
        </h3>
        <p className="text-ink-700 mb-6 max-w-[48ch] text-[15px] leading-[1.6]">{description}</p>
        <ul className="m-0 mb-7 list-none p-0">
          {bullets.map((b, i) => (
            <li
              key={i}
              className={cn(
                'border-paper-300 text-ink-800 flex items-start gap-3.5 py-2.5 text-[14px] leading-[1.5]',
                i > 0 ? 'border-t' : 'border-t',
              )}
            >
              <span
                className="bg-brass-500 mt-[7px] size-1.5 flex-shrink-0 rounded-full"
                aria-hidden
              />
              <span>
                {b.highlight ? (
                  <>
                    <span className="text-ink-900 mr-1.5 font-semibold">{b.highlight}</span>
                    {' — '}
                  </>
                ) : null}
                {b.rest}
              </span>
            </li>
          ))}
        </ul>
        <Link
          href={ctaHref}
          className="text-brass-700 border-brass-300 inline-block border-b pb-0.5 text-[13.5px] font-medium"
        >
          {ctaLabel} →
        </Link>
      </div>
      <div className={cn(reverse ? 'lg:order-1' : '')}>{visual}</div>
    </article>
  );
}

/* === Logo cloud ============================================ */

export function MktLogoCloud({ title, count = 6 }: { title?: string; count?: number }) {
  return (
    <div>
      {title ? (
        <div className="text-mkt-mono text-ink-500 mb-8 text-center text-[11px] uppercase tracking-[0.16em]">
          {title}
        </div>
      ) : null}
      <div className="grid grid-cols-2 items-center gap-6 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="bg-paper-200 text-ink-300 text-mkt-italic flex h-9 items-center justify-center rounded text-[13px]"
          >
            logo
          </div>
        ))}
      </div>
    </div>
  );
}

/* === Comparatif éditorial =================================== */

export type CompCellValue =
  | { type: 'yes'; label?: string }
  | { type: 'no'; label?: string }
  | { type: 'partial'; label?: string }
  | { type: 'paid'; label: string };

export type CompRow = {
  criterion: string;
  values: CompCellValue[];
};

function CompCell({ value }: { value: CompCellValue }) {
  switch (value.type) {
    case 'yes':
      return (
        <span className="text-bond-500 text-mkt-mono text-[14px] font-semibold">
          ✓ {value.label ?? 'Natif'}
        </span>
      );
    case 'no':
      return (
        <span className="text-ink-400 text-mkt-mono text-[14px]">— {value.label ?? 'Non'}</span>
      );
    case 'partial':
      return (
        <span className="text-saffron-700 text-mkt-mono text-[12px]">
          ◐ {value.label ?? 'Partiel'}
        </span>
      );
    case 'paid':
      return (
        <span className="text-title-500 text-mkt-mono text-[11.5px] italic">{value.label}</span>
      );
  }
}

export function MktComparison({
  columns,
  rows,
}: {
  /** Première colonne réservée au critère, ensuite Capiwise + concurrents */
  columns: string[];
  rows: CompRow[];
}) {
  return (
    <div className="border-paper-300 bg-paper-50 overflow-hidden rounded-[12px] border shadow-sm">
      {/* Header */}
      <div
        className="bg-ink-900 text-paper-50 grid"
        style={{
          gridTemplateColumns: `2fr repeat(${columns.length - 1}, 1fr)`,
        }}
      >
        {columns.map((col, i) => (
          <div
            key={col}
            className={cn(
              'border-paper-50/8 px-4.5 py-5.5 border-r text-[11px] font-semibold uppercase tracking-[0.18em]',
              i === 0 ? 'text-brass-300 text-left' : 'text-center',
              i === 1 ? 'bg-brass-500 text-paper-50' : '',
              i === columns.length - 1 ? 'border-r-0' : '',
            )}
            style={{ padding: '22px 18px' }}
          >
            {col}
          </div>
        ))}
      </div>
      {/* Rows */}
      {rows.map((row) => (
        <div
          key={row.criterion}
          className="border-paper-300 grid border-t"
          style={{
            gridTemplateColumns: `2fr repeat(${columns.length - 1}, 1fr)`,
          }}
        >
          <div
            className="border-paper-300 text-ink-900 px-4.5 py-4.5 border-r text-[14px] font-medium"
            style={{ padding: 18 }}
          >
            {row.criterion}
          </div>
          {row.values.map((val, i) => (
            <div
              key={i}
              className={cn(
                'border-paper-300 px-4.5 py-4.5 flex items-center justify-center text-center text-[13.5px]',
                i < row.values.length - 1 ? 'border-r' : '',
                i === 0 ? 'bg-brass-500/[0.06] text-ink-900 font-semibold' : 'text-ink-700',
              )}
              style={{ padding: 18 }}
            >
              <CompCell value={val} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* === Testimonials éditoriaux ================================ */

export type MktTestimonial = {
  quote: string;
  initials: string;
  name: string;
  role: string;
};

export function MktTestimonials({ testimonials }: { testimonials: MktTestimonial[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {testimonials.map((t) => (
        <article
          key={t.name}
          className="border-paper-300 bg-paper-50 gap-4.5 relative flex flex-col rounded-[12px] border p-8"
        >
          <span
            className="text-mkt-mono text-ink-300 right-4.5 top-4.5 absolute rounded-[3px] border border-dashed px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.16em]"
            style={{ top: 18, right: 18 }}
          >
            Beta · Q2 2026
          </span>
          <p
            className="text-ink-900 mt-2 flex-1 text-[19px] italic leading-[1.45] tracking-[-0.005em]"
            style={{ fontFamily: 'var(--font-serif)', fontVariationSettings: "'opsz' 144" }}
          >
            <span className="text-brass-500 not-italic">«&nbsp;</span>
            {t.quote}
            <span className="text-brass-500 not-italic">&nbsp;»</span>
          </p>
          <div className="border-paper-300 pt-4.5 flex items-center gap-3.5 border-t">
            <span
              className="bg-ink-900 text-brass-300 flex size-[38px] items-center justify-center rounded-full text-[13px] font-semibold"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {t.initials}
            </span>
            <div className="text-ink-700 text-[13px] leading-tight">
              <b className="text-ink-900 block font-semibold">{t.name}</b>
              <span className="text-mkt-mono text-ink-500 text-[10.5px] tracking-wider">
                {t.role}
              </span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

/* === Trust badges grid 4 col ================================ */

export type MktTrustBadge = {
  label: string;
  /** Nom (peut contenir <em> via prop italicSuffix) */
  name: string;
  italicSuffix?: string;
  desc: string;
  pending?: boolean;
};

export function MktTrust({ badges }: { badges: MktTrustBadge[] }) {
  return (
    <div className="border-paper-300 grid grid-cols-1 border-y sm:grid-cols-2 lg:grid-cols-4">
      {badges.map((b, i) => (
        <div
          key={b.name}
          className={cn(
            'flex flex-col gap-2 px-6 py-7',
            i < badges.length - 1 ? 'lg:border-paper-300 lg:border-r' : '',
          )}
        >
          <span
            className={cn(
              'text-mkt-mono text-[10px] font-semibold uppercase tracking-[0.16em]',
              b.pending ? 'text-saffron-700' : 'text-brass-500',
            )}
          >
            {b.label}
          </span>
          <span
            className={cn(
              'text-[20px] font-medium tracking-[-0.01em]',
              b.pending ? 'text-ink-500' : 'text-ink-900',
            )}
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {b.name}
            {b.italicSuffix ? (
              <>
                {' '}
                <span className="text-mkt-italic">{b.italicSuffix}</span>
              </>
            ) : null}
          </span>
          <span className="text-ink-500 text-[12.5px] leading-[1.45]">{b.desc}</span>
        </div>
      ))}
    </div>
  );
}

/* === CTA banner ink avec radial brass ======================= */

export function MktCtaBanner({
  title,
  description,
  primaryCta,
  secondaryCta,
  asideContact,
}: {
  title: ReactNode;
  description: ReactNode;
  primaryCta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
  asideContact?: string;
}) {
  return (
    <div className="bg-ink-900 text-paper-50 relative grid grid-cols-1 gap-12 overflow-hidden rounded-[14px] px-14 py-16 lg:grid-cols-[1.4fr_1fr] lg:items-center">
      <div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          top: '-50%',
          right: '-20%',
          width: '60%',
          height: '200%',
          background: 'radial-gradient(closest-side, rgba(184,134,91,0.18), transparent)',
        }}
      />
      <div className="relative">
        <h2
          className="text-paper-50 mb-4.5 max-w-[18ch] text-[44px] font-medium leading-[1.05] tracking-[-0.025em]"
          style={{ fontFamily: 'var(--font-serif)', textWrap: 'balance' }}
        >
          {title}
        </h2>
        <p className="text-paper-50/70 max-w-[42ch] text-[15px] leading-[1.6]">{description}</p>
      </div>
      <div className="relative flex flex-col items-stretch gap-3.5">
        <Link
          href={primaryCta.href}
          className="bg-brass-500 hover:bg-brass-700 text-paper-50 inline-flex w-full items-center justify-center gap-2 rounded-md px-6 py-3.5 text-[14px] font-medium transition-all"
        >
          {primaryCta.label}
          <ArrowRight className="size-3.5" />
        </Link>
        {secondaryCta ? (
          <Link
            href={secondaryCta.href}
            className="border-paper-50/25 text-paper-50 hover:bg-paper-50/5 inline-flex w-full items-center justify-center gap-2 rounded-md border bg-transparent px-6 py-3.5 text-[14px] font-medium transition-all"
          >
            {secondaryCta.label}
          </Link>
        ) : null}
        {asideContact ? (
          <div className="text-mkt-mono text-paper-50/50 mt-1 text-[11px] leading-[1.5] tracking-wider">
            {asideContact}
          </div>
        ) : null}
      </div>
    </div>
  );
}
