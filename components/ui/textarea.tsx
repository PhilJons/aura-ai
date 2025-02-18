import * as React from 'react';

import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<'textarea'>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-[var(--radius-lg)]',
        'border border-zinc-200 dark:border-zinc-800',
        'bg-background dark:bg-zinc-900',
        'text-foreground dark:text-zinc-100',
        'placeholder:text-zinc-500 dark:placeholder:text-zinc-400',
        'px-3 py-2 text-base md:text-sm',
        'transition-colors duration-200',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:focus:ring-zinc-700',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';

export { Textarea };
