import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { Check, Minus } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type PricingTier = {
  id: string;
  tier: string;
  description: string;
  price: string;
  /** Texte sous le prix (ex "/an", "Sur devis"). */
  priceSuffix?: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  highlighted?: boolean;
  badge?: string;
};

export function PricingCard({ tier }: { tier: PricingTier }) {
  return (
    <article
      className={cn(
        'relative flex flex-col gap-5 rounded-2xl p-6 sm:p-8',
        tier.highlighted
          ? 'border-brass-500 bg-paper-50 shadow-brass border-2'
          : 'border-paper-300 bg-paper-50 border',
      )}
      data-pricing-tbd
    >
      {tier.badge ? (
        <span className="bg-brass-500 text-paper-50 absolute -top-3 left-6 inline-flex rounded-full px-3 py-0.5 text-xs font-semibold">
          {tier.badge}
        </span>
      ) : null}
      <div className="flex flex-col gap-2">
        <h3 className="text-h3 text-ink-900">{tier.tier}</h3>
        <p className="text-ink-500 text-sm">{tier.description}</p>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn('text-numeric-xl', tier.highlighted ? 'text-brass-700' : 'text-ink-900')}
        >
          {tier.price}
        </span>
        {tier.priceSuffix ? <span className="text-ink-500 text-sm">{tier.priceSuffix}</span> : null}
      </div>
      <Link
        href={tier.ctaHref}
        className={cn(
          buttonVariants({ size: 'lg', variant: tier.highlighted ? 'default' : 'outline' }),
          'w-full',
        )}
      >
        {tier.ctaLabel}
      </Link>
      <ul className="border-paper-200 flex flex-col gap-2.5 border-t pt-5">
        {tier.features.map((feature) => (
          <li key={feature} className="text-ink-700 flex items-start gap-2.5 text-sm">
            <span
              aria-hidden
              className="bg-bond-50 text-bond-700 mt-0.5 inline-flex size-5 flex-none items-center justify-center rounded-full"
            >
              <Check className="size-3" strokeWidth={3} />
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function PricingTable({ tiers }: { tiers: PricingTier[] }) {
  return (
    <section className="px-6 py-16">
      <div className="mx-auto w-full max-w-7xl">
        <div
          className={cn(
            'grid grid-cols-1 gap-6',
            tiers.length === 4
              ? 'lg:grid-cols-4'
              : tiers.length === 3
                ? 'lg:grid-cols-3'
                : 'lg:grid-cols-2',
          )}
        >
          {tiers.map((tier) => (
            <PricingCard key={tier.id} tier={tier} />
          ))}
        </div>
        {/* PRICING_TBD: David à valider avant lancement public */}
        <p className="text-ink-500 mt-8 text-center text-xs">
          Prix indicatifs — proposition en cours de validation avant lancement public.
        </p>
      </div>
    </section>
  );
}

export type ComparisonValue =
  | { type: 'check'; label?: string }
  | { type: 'partial'; label?: string }
  | { type: 'missing'; label?: string }
  | { type: 'paid'; label?: string }
  | { type: 'warning'; label?: string }
  | { type: 'unknown'; label?: string }
  | { type: 'text'; label: string };

export type ComparisonRow = {
  label: string;
  values: ComparisonValue[];
  highlight?: boolean;
};

export type ComparisonCategory = {
  title: string;
  rows: ComparisonRow[];
};

export type ComparisonColumn = {
  name: string;
  highlight?: boolean;
};

function ComparisonCell({ value }: { value: ComparisonValue }) {
  switch (value.type) {
    case 'check':
      return (
        <span className="text-bond-700 inline-flex items-center gap-1.5 text-sm">
          <Check className="size-4" strokeWidth={2.5} />
          {value.label ? <span>{value.label}</span> : null}
        </span>
      );
    case 'partial':
      return (
        <span className="text-saffron-700 inline-flex items-center gap-1.5 text-sm">
          <Minus className="size-4" strokeWidth={2.5} />
          {value.label ?? 'Partiel'}
        </span>
      );
    case 'missing':
      return (
        <span className="text-ink-400 inline-flex items-center gap-1.5 text-sm">
          <span aria-hidden>—</span>
          {value.label ? <span>{value.label}</span> : null}
        </span>
      );
    case 'paid':
      return (
        <span className="text-saffron-700 text-sm font-medium">
          {value.label ?? 'Payant en sus'}
        </span>
      );
    case 'warning':
      return <span className="text-title-700 text-sm font-medium">{value.label ?? 'Risque'}</span>;
    case 'unknown':
      return <span className="text-ink-400 text-sm">{value.label ?? 'Non documenté'}</span>;
    case 'text':
      return <span className="text-ink-700 text-sm">{value.label}</span>;
    default:
      return null;
  }
}

export function ComparisonTable({
  columns,
  categories,
  caption,
}: {
  columns: ComparisonColumn[];
  categories: ComparisonCategory[];
  caption?: ReactNode;
}) {
  return (
    <section className="px-6 py-12">
      <div className="border-paper-300 mx-auto w-full max-w-7xl overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[720px] table-fixed">
          <caption className="sr-only">
            Comparatif Capiwise vs concurrents — fonctionnalités par catégorie.
          </caption>
          <thead className="bg-paper-50 border-paper-300 border-b">
            <tr>
              <th
                scope="col"
                className="text-overline text-ink-500 px-4 py-4 text-left"
                style={{ width: '32%' }}
              >
                Fonctionnalité
              </th>
              {columns.map((column) => (
                <th
                  key={column.name}
                  scope="col"
                  className={cn(
                    'text-overline px-4 py-4 text-left',
                    column.highlight ? 'text-brass-700' : 'text-ink-700',
                  )}
                >
                  {column.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => (
              <Fragment key={`cat-${category.title}`}>
                <tr className="bg-paper-100">
                  <th
                    scope="rowgroup"
                    colSpan={1 + columns.length}
                    className="text-ink-700 text-overline px-4 py-2.5 text-left"
                  >
                    {category.title}
                  </th>
                </tr>
                {category.rows.map((row) => (
                  <tr key={`${category.title}-${row.label}`} className="border-paper-200 border-t">
                    <th
                      scope="row"
                      className="text-ink-900 px-4 py-3 text-left text-sm font-normal"
                    >
                      {row.label}
                    </th>
                    {row.values.map((value, idx) => (
                      <td
                        key={`${row.label}-${idx}`}
                        className={cn(
                          'px-4 py-3 align-middle',
                          columns[idx]?.highlight ? 'bg-brass-50/40' : '',
                        )}
                      >
                        <ComparisonCell value={value} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {caption ? (
        <p className="text-ink-500 mx-auto mt-4 max-w-3xl text-center text-xs">{caption}</p>
      ) : null}
    </section>
  );
}
