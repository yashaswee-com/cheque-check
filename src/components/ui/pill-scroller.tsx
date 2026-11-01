'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'

import { cn } from '@/lib/utils'

function PillScroller({
  className,
  children,
  onScroll,
  ref,
  ...props
}: React.ComponentProps<'div'>) {
  const t = useTranslations('SharedUI')
  const elementRef = React.useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = React.useState({ left: false, right: false })
  const measure = React.useCallback(() => {
    const element = elementRef.current
    if (!element) return
    setOverflow({
      left: element.scrollLeft > 1,
      right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1,
    })
  }, [])
  React.useEffect(() => {
    measure()
    const element = elementRef.current
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (element) {
      observer?.observe(element)
      for (const child of element.children) observer?.observe(child)
    }
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [children, measure])
  const scroll = (direction: number) => {
    const element = elementRef.current
    element?.scrollBy({
      left: direction * element.clientWidth,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    })
  }
  return (
    <div className="relative min-w-0">
      <div
        role="group"
        data-slot="pill-scroller"
        className={cn(
          'flex snap-x snap-proximity flex-nowrap gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          className,
        )}
        {...props}
        ref={(element) => {
          elementRef.current = element
          if (typeof ref === 'function') return ref(element)
          if (ref) ref.current = element
        }}
        onScroll={(event) => {
          measure()
          onScroll?.(event)
        }}
      >
        {children}
      </div>
      {(['left', 'right'] as const).map(
        (side) =>
          overflow[side] && (
            <button
              key={side}
              type="button"
              aria-label={t(side === 'left' ? 'scrollLeft' : 'scrollRight')}
              onClick={() => scroll(side === 'left' ? -1 : 1)}
              className={cn(
                'absolute top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border bg-background shadow-sm',
                side === 'left' ? 'left-0' : 'right-0',
              )}
            >
              <HugeiconsIcon
                icon={side === 'left' ? ArrowLeft01Icon : ArrowRight01Icon}
                className="h-4 w-4"
              />
            </button>
          ),
      )}
    </div>
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
