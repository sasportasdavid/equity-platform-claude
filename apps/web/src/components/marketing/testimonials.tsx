import { Quote } from 'lucide-react';
import { cn } from '@/lib/utils';

export type Testimonial = {
  quote: string;
  author: string;
  role: string;
  company: string;
  initials?: string;
};

export function TestimonialCard({
  testimonial,
  placeholder,
  className,
}: {
  testimonial: Testimonial;
  /** Affiche un overlay "À venir" quand le contenu n'est pas encore validé. */
  placeholder?: boolean;
  className?: string;
}) {
  const initials =
    testimonial.initials ??
    testimonial.author
      .split(' ')
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  return (
    <figure
      className={cn(
        'border-paper-300 bg-paper-50 relative flex h-full flex-col gap-4 rounded-xl border p-6',
        className,
      )}
    >
      <Quote className="text-brass-300 size-6" />
      <blockquote className="text-ink-700 flex-1 text-base leading-relaxed">
        <p className={cn(placeholder ? 'opacity-60' : undefined)}>« {testimonial.quote} »</p>
      </blockquote>
      <figcaption className="border-paper-200 mt-2 flex items-center gap-3 border-t pt-4">
        <span
          aria-hidden
          className="bg-brass-100 text-brass-700 flex size-10 flex-none items-center justify-center rounded-full font-mono text-sm font-semibold"
        >
          {initials}
        </span>
        <span className="flex flex-col">
          <span className="text-ink-900 text-sm font-semibold">{testimonial.author}</span>
          <span className="text-ink-500 text-xs">
            {testimonial.role} · {testimonial.company}
          </span>
        </span>
      </figcaption>
      {placeholder ? (
        <span className="border-paper-300 bg-paper-100/80 text-ink-500 absolute right-3 top-3 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide">
          À publier post-beta
        </span>
      ) : null}
    </figure>
  );
}

export function TestimonialGrid({
  testimonials,
  placeholder,
}: {
  testimonials: Testimonial[];
  placeholder?: boolean;
}) {
  return (
    <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {testimonials.map((testimonial) => (
        <li key={`${testimonial.author}-${testimonial.company}`}>
          <TestimonialCard testimonial={testimonial} placeholder={placeholder} />
        </li>
      ))}
    </ul>
  );
}

/** LogoCloud — placeholder gris en attendant des vrais clients beta. */
export function LogoCloud({
  title,
  count = 6,
  placeholder = true,
}: {
  title?: string;
  count?: number;
  placeholder?: boolean;
}) {
  return (
    <section className="border-paper-300 bg-paper-50/60 border-y px-6 py-12">
      <div className="mx-auto w-full max-w-5xl">
        {title ? <p className="text-ink-500 mb-8 text-center text-sm">{title}</p> : null}
        <ul className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: count }).map((_, i) => (
            <li
              key={i}
              className={cn(
                'flex items-center justify-center',
                placeholder
                  ? 'border-paper-300 text-ink-300 h-10 rounded border border-dashed text-xs uppercase tracking-wider'
                  : '',
              )}
            >
              {placeholder ? <span>Logo</span> : null}
            </li>
          ))}
        </ul>
        {placeholder ? (
          <p className="text-ink-500 mt-6 text-center text-xs italic">
            Logos clients à publier après la beta privée du 18 mai 2026.
          </p>
        ) : null}
      </div>
    </section>
  );
}
