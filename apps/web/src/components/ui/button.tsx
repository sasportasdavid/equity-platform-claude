import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "group/button focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-lg border border-transparent bg-clip-padding text-sm font-medium outline-none transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Editorial Finance — primary cuivre avec hover lift + shadow brass
        default:
          'bg-primary text-primary-foreground hover:bg-brass-700 transition-[transform,box-shadow,background-color] duration-150 hover:-translate-y-px hover:shadow-[0_6px_16px_-4px_rgba(184,134,91,0.25),0_2px_4px_-2px_rgba(184,134,91,0.15)] active:translate-y-0 active:shadow-none',
        outline:
          'border-brass-500 bg-background text-brass-700 hover:bg-brass-50 hover:text-brass-900 aria-expanded:bg-brass-50 dark:border-brass-500 dark:hover:bg-brass-100/50',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'text-ink-700 hover:bg-paper-200 hover:text-ink-900 aria-expanded:bg-paper-200 aria-expanded:text-ink-900 dark:text-ink-700 dark:hover:bg-paper-300/50',
        destructive:
          'bg-destructive hover:bg-title-700 text-white transition-colors duration-150 active:translate-y-0',
        link: 'text-brass-700 decoration-brass-300 hover:decoration-brass-500 underline-offset-4 hover:underline',
      },
      size: {
        default:
          'has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 h-8 gap-1.5 px-2.5',
        xs: "in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 h-9 gap-1.5 px-2.5',
        icon: 'size-8',
        'icon-xs':
          "in-data-[slot=button-group]:rounded-lg size-6 rounded-[min(var(--radius-md),10px)] [&_svg:not([class*='size-'])]:size-3",
        'icon-sm':
          'in-data-[slot=button-group]:rounded-lg size-7 rounded-[min(var(--radius-md),12px)]',
        'icon-lg': 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
