'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type FAQItem = {
  question: string;
  answer: React.ReactNode;
};

export function FAQAccordion({ items, className }: { items: FAQItem[]; className?: string }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <ul
      className={cn(
        'border-paper-300 divide-paper-300 mx-auto w-full max-w-3xl divide-y rounded-xl border',
        className,
      )}
    >
      {items.map((item, idx) => {
        const isOpen = openIdx === idx;
        const id = `faq-item-${idx}`;
        return (
          <li key={item.question}>
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={id}
              onClick={() => setOpenIdx(isOpen ? null : idx)}
              className="text-ink-900 hover:bg-paper-100 flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors"
            >
              <span className="text-base font-medium">{item.question}</span>
              <ChevronDown
                className={cn(
                  'text-ink-500 size-4 flex-none transition-transform',
                  isOpen ? 'rotate-180' : '',
                )}
              />
            </button>
            {isOpen ? (
              <div id={id} className="text-ink-700 px-5 pb-5 pt-1 text-sm leading-relaxed">
                {item.answer}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export type BlogCardProps = {
  title: string;
  excerpt: string;
  category: string;
  readTime: string;
  href: string;
  placeholder?: boolean;
};

export function BlogCard({ title, excerpt, category, readTime, href, placeholder }: BlogCardProps) {
  const Wrapper = placeholder ? 'div' : Link;
  const props = placeholder ? {} : { href };
  return (
    <Wrapper
      {...(props as { href: string })}
      className={cn(
        'border-paper-300 bg-paper-50 group flex h-full flex-col gap-3 rounded-xl border p-6 transition-colors',
        placeholder ? 'cursor-default opacity-70' : 'hover:border-brass-300',
      )}
    >
      <div className="flex items-center gap-3">
        <span className="text-overline text-brass-700">{category}</span>
        <span className="text-ink-300 text-xs">·</span>
        <span className="text-ink-500 text-xs">{readTime}</span>
      </div>
      <h3
        className={cn(
          'text-ink-900 font-semibold leading-snug tracking-tight',
          placeholder ? '' : 'group-hover:text-brass-700 transition-colors',
        )}
      >
        {title}
      </h3>
      <p className="text-ink-500 text-sm leading-relaxed">{excerpt}</p>
      <span
        className={cn(
          'mt-auto text-sm font-medium',
          placeholder ? 'text-ink-400' : 'text-brass-700',
        )}
      >
        {placeholder ? 'À paraître' : 'Lire l’article →'}
      </span>
    </Wrapper>
  );
}
