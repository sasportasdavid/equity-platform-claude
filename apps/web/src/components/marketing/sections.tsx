import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { TitleRule } from '@/components/shared/title-rule';
import { cn } from '@/lib/utils';

type IconType = ComponentType<{ className?: string }>;

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('text-overline text-brass-700 inline-block', className)}>{children}</span>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  align = 'center',
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: 'left' | 'center';
  className?: string;
}) {
  const isCenter = align === 'center';
  return (
    <header
      className={cn(
        'flex flex-col gap-3',
        isCenter ? 'mx-auto max-w-2xl text-center' : 'max-w-3xl text-left',
        className,
      )}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="text-h1 text-ink-900">{title}</h2>
      <TitleRule width="64px" className={cn('not-prose', isCenter ? 'mx-auto' : undefined)} />
      {description ? (
        <p className="text-ink-500 text-base leading-relaxed sm:text-lg">{description}</p>
      ) : null}
    </header>
  );
}

export type HeroCta = {
  label: string;
  href: string;
};

/** Hero plein écran (homepage). Eyebrow + h1 + p + 2 CTAs + visuel. */
export function HeroLarge({
  eyebrow,
  title,
  description,
  primaryCta,
  secondaryCta,
  visual,
}: {
  eyebrow?: string;
  title: ReactNode;
  description: ReactNode;
  primaryCta: HeroCta;
  secondaryCta?: HeroCta;
  visual?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="from-brass-50/40 via-paper-100 to-paper-100 pointer-events-none absolute inset-0 bg-gradient-to-b"
      />
      <div className="mx-auto grid w-full max-w-7xl gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pb-28 lg:pt-24">
        <div className="relative z-10 flex flex-col justify-center gap-6">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <h1 className="text-ink-900 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            {title}
          </h1>
          <TitleRule width="64px" />
          <p className="text-ink-700 max-w-xl text-pretty text-base leading-relaxed sm:text-lg">
            {description}
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link href={primaryCta.href} className={cn(buttonVariants({ size: 'lg' }), 'gap-2')}>
              {primaryCta.label}
              <ArrowRight className="size-4" />
            </Link>
            {secondaryCta ? (
              <Link
                href={secondaryCta.href}
                className={cn(buttonVariants({ size: 'lg', variant: 'outline' }))}
              >
                {secondaryCta.label}
              </Link>
            ) : null}
          </div>
        </div>
        {visual ? <div className="relative z-10 flex items-center">{visual}</div> : null}
      </div>
    </section>
  );
}

/** Hero compact (pages produit / autres). */
export function HeroSmall({
  eyebrow,
  title,
  description,
  primaryCta,
  secondaryCta,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  primaryCta?: HeroCta;
  secondaryCta?: HeroCta;
}) {
  return (
    <section className="border-paper-300 from-paper-50 to-paper-100 border-b bg-gradient-to-b">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-5 px-6 py-16 text-center sm:py-20 lg:py-24">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className="text-ink-900 text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
          {title}
        </h1>
        <TitleRule width="64px" className="mx-auto" />
        {description ? (
          <p className="text-ink-700 mx-auto max-w-2xl text-pretty text-base leading-relaxed sm:text-lg">
            {description}
          </p>
        ) : null}
        {primaryCta || secondaryCta ? (
          <div className="mt-3 flex flex-wrap justify-center gap-3">
            {primaryCta ? (
              <Link href={primaryCta.href} className={cn(buttonVariants({ size: 'lg' }), 'gap-2')}>
                {primaryCta.label}
                <ArrowRight className="size-4" />
              </Link>
            ) : null}
            {secondaryCta ? (
              <Link
                href={secondaryCta.href}
                className={cn(buttonVariants({ size: 'lg', variant: 'outline' }))}
              >
                {secondaryCta.label}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Hero split (pricing/comparatif) — texte gauche, slot droite custom. */
export function HeroSplit({
  eyebrow,
  title,
  description,
  rightSlot,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  rightSlot?: ReactNode;
}) {
  return (
    <section className="border-paper-300 bg-paper-50 border-b">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-16 lg:grid-cols-[1.2fr_1fr] lg:py-20">
        <div className="flex flex-col justify-center gap-5">
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <h1 className="text-ink-900 text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            {title}
          </h1>
          <TitleRule width="64px" />
          {description ? (
            <p className="text-ink-700 max-w-xl text-pretty text-base leading-relaxed sm:text-lg">
              {description}
            </p>
          ) : null}
        </div>
        {rightSlot ? <div className="flex items-center justify-center">{rightSlot}</div> : null}
      </div>
    </section>
  );
}

export type Feature = {
  icon?: IconType;
  title: string;
  description: string;
};

export function FeatureGrid({
  features,
  cols = 3,
  className,
}: {
  features: Feature[];
  cols?: 2 | 3 | 4 | 6;
  className?: string;
}) {
  const colClass =
    cols === 2
      ? 'sm:grid-cols-2'
      : cols === 3
        ? 'sm:grid-cols-2 lg:grid-cols-3'
        : cols === 4
          ? 'sm:grid-cols-2 lg:grid-cols-4'
          : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6';
  return (
    <ul className={cn('grid grid-cols-1 gap-6', colClass, className)}>
      {features.map((feature) => {
        const Icon = feature.icon;
        return (
          <li
            key={feature.title}
            className="border-paper-300 bg-paper-50 hover:border-brass-300 flex flex-col gap-3 rounded-xl border p-6 transition-colors"
          >
            {Icon ? (
              <span className="bg-brass-50 text-brass-700 inline-flex size-10 items-center justify-center rounded-lg">
                <Icon className="size-5" />
              </span>
            ) : null}
            <h3 className="text-ink-900 font-semibold tracking-tight">{feature.title}</h3>
            <p className="text-ink-500 text-sm leading-relaxed">{feature.description}</p>
          </li>
        );
      })}
    </ul>
  );
}

export type BigFeatureProps = {
  eyebrow?: string;
  title: ReactNode;
  description: ReactNode;
  bullets?: string[];
  cta?: HeroCta;
  visual?: ReactNode;
  reverse?: boolean;
};

export function BigFeature({
  eyebrow,
  title,
  description,
  bullets,
  cta,
  visual,
  reverse,
}: BigFeatureProps) {
  return (
    <article
      className={cn(
        'mx-auto grid w-full max-w-7xl items-center gap-10 px-6 py-12 lg:grid-cols-2 lg:gap-16 lg:py-16',
      )}
    >
      <div className={cn('flex flex-col gap-5', reverse ? 'lg:order-2' : undefined)}>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h3 className="text-ink-900 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {title}
        </h3>
        <TitleRule width="48px" />
        <p className="text-ink-700 max-w-xl text-pretty text-base leading-relaxed">{description}</p>
        {bullets && bullets.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-2.5">
            {bullets.map((bullet) => (
              <li key={bullet} className="text-ink-700 flex items-start gap-2.5 text-sm">
                <span
                  aria-hidden
                  className="bg-bond-50 text-bond-700 mt-0.5 inline-flex size-5 flex-none items-center justify-center rounded-full"
                >
                  <Check className="size-3" strokeWidth={3} />
                </span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {cta ? (
          <div className="mt-4">
            <Link
              href={cta.href}
              className="text-brass-700 hover:text-brass-900 inline-flex items-center gap-1.5 text-sm font-medium"
            >
              {cta.label}
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        ) : null}
      </div>
      {visual ? (
        <div
          className={cn(
            'border-paper-300 bg-paper-50 relative aspect-[4/3] overflow-hidden rounded-xl border shadow-sm',
            reverse ? 'lg:order-1' : undefined,
          )}
        >
          {visual}
        </div>
      ) : null}
    </article>
  );
}

export type Stat = {
  value: string;
  label: string;
  hint?: string;
};

export function StatsBlock({ stats }: { stats: Stat[] }) {
  return (
    <section className="border-paper-300 bg-paper-50 border-y">
      <div className="bg-paper-300 mx-auto grid w-full max-w-7xl gap-px overflow-hidden px-0 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-paper-50 flex flex-col items-center gap-2 px-6 py-10 text-center"
          >
            <span className="text-numeric-xl text-brass-700">{stat.value}</span>
            <span className="text-ink-700 text-sm font-medium">{stat.label}</span>
            {stat.hint ? <span className="text-ink-500 mt-1 text-xs">{stat.hint}</span> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function CTABanner({
  eyebrow,
  title,
  description,
  primaryCta,
  secondaryCta,
  variant = 'brass',
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  primaryCta: HeroCta;
  secondaryCta?: HeroCta;
  variant?: 'brass' | 'ink';
}) {
  const isInk = variant === 'ink';
  return (
    <section className="px-6 py-16 sm:py-20">
      <div
        className={cn(
          'mx-auto w-full max-w-5xl overflow-hidden rounded-2xl px-8 py-12 text-center shadow-lg sm:px-12 sm:py-16',
          isInk
            ? 'bg-ink-900 text-paper-50'
            : 'from-brass-500 to-brass-700 text-paper-50 bg-gradient-to-br',
        )}
      >
        {eyebrow ? (
          <span
            className={cn(
              'text-overline mb-3 inline-block',
              isInk ? 'text-brass-300' : 'text-paper-200',
            )}
          >
            {eyebrow}
          </span>
        ) : null}
        <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {title}
        </h2>
        {description ? (
          <p
            className={cn(
              'mx-auto mt-4 max-w-2xl text-pretty text-base leading-relaxed sm:text-lg',
              isInk ? 'text-paper-200' : 'text-paper-100',
            )}
          >
            {description}
          </p>
        ) : null}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href={primaryCta.href}
            className={cn(
              buttonVariants({ size: 'lg', variant: isInk ? 'default' : 'secondary' }),
              'gap-2',
            )}
          >
            {primaryCta.label}
            <ArrowRight className="size-4" />
          </Link>
          {secondaryCta ? (
            <Link
              href={secondaryCta.href}
              className={cn(
                buttonVariants({ size: 'lg', variant: 'outline' }),
                'border-paper-50/30 text-paper-50 hover:bg-paper-50/10',
              )}
            >
              {secondaryCta.label}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export type TrustBadge = {
  label: string;
  hint?: string;
};

export function TrustBadges({ badges, title }: { badges: TrustBadge[]; title?: string }) {
  return (
    <section className="px-6 py-12">
      <div className="mx-auto w-full max-w-5xl text-center">
        {title ? <p className="text-ink-500 text-sm">{title}</p> : null}
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {badges.map((badge) => (
            <li
              key={badge.label}
              className="border-paper-300 bg-paper-50 text-ink-700 inline-flex flex-col rounded-lg border px-4 py-3 text-sm"
            >
              <span className="font-medium">{badge.label}</span>
              {badge.hint ? <span className="text-ink-500 text-xs">{badge.hint}</span> : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function MarketingSection({
  children,
  className,
  paper = false,
  bordered = false,
}: {
  children: ReactNode;
  className?: string;
  paper?: boolean;
  bordered?: boolean;
}) {
  return (
    <section
      className={cn(
        'px-6 py-16 sm:py-20',
        paper ? 'bg-paper-50' : undefined,
        bordered ? 'border-paper-300 border-y' : undefined,
        className,
      )}
    >
      <div className="mx-auto w-full max-w-7xl">{children}</div>
    </section>
  );
}
