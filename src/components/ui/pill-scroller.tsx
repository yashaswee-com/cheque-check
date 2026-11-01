import * as React from 'react'

import { cn } from '@/lib/utils'

function PillScroller({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      role="group"
      data-slot="pill-scroller"
      className={cn(
        'flex snap-x snap-proximity flex-nowrap gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
      {...props}
    />
  )
}

function FilterPillSection({
  title,
  className,
  scrollerClassName,
  children,
}: {
  title: React.ReactNode
  className?: string
  scrollerClassName?: string
  children: React.ReactNode
}) {
  const headingId = React.useId()

  return (
    <div className={cn('space-y-3', className)}>
      <h3
        id={headingId}
        className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
      >
        {title}
      </h3>
      <PillScroller aria-labelledby={headingId} className={scrollerClassName}>
        {children}
      </PillScroller>
    </div>
  )
}

function filterPillClassName(active: boolean, className?: string) {
  return cn(
    'flex shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-xl border px-4 py-3 transition-all active:scale-[0.98]',
    active
      ? 'bg-primary/5 border-primary text-primary'
      : 'bg-muted/30 border-transparent text-foreground',
    className,
  )
}

export { FilterPillSection, PillScroller, filterPillClassName }
