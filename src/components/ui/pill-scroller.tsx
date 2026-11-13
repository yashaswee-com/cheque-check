'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { AnimatePresence, motion } from 'framer-motion'
import { useReducedMotionPreference } from '@/hooks/use-reduced-motion'

import { cn } from '@/lib/utils'

function PillScroller({
  className,
  children,
  onScroll,
  ref,
  floatingControls = false,
  ...props
}: React.ComponentProps<'div'> & { floatingControls?: boolean }) {
  const t = useTranslations('SharedUI')
  const reduced = useReducedMotionPreference()
  const elementRef = React.useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = React.useState({ left: false, right: false })
  const measure = React.useCallback(() => {
    const element = elementRef.current
    if (!element) return
    const bounds = element.getBoundingClientRect()
    const children = Array.from(element.children)
    setOverflow({
      left: children.some(
        (child) =>
          child.getBoundingClientRect().width > 0 &&
          child.getBoundingClientRect().left < bounds.left - 1,
      ),
      right: children.some(
        (child) =>
          child.getBoundingClientRect().width > 0 &&
          child.getBoundingClientRect().right > bounds.right + 1,
      ),
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
      behavior:
        reduced || document.documentElement.hasAttribute('data-reduce-motion')
          ? 'instant'
          : 'smooth',
    })
  }
  return (
    <div className="relative flex min-w-0 items-center">
      <AnimatePresence initial={false}>
        {overflow.left && (
          <motion.button
            key="left"
            initial={{
              opacity: 0,
              x: reduced ? 0 : -6,
              width: floatingControls ? 32 : 0,
            }}
            animate={{ opacity: 1, x: 0, width: 32 }}
            exit={{
              opacity: 0,
              x: reduced ? 0 : -6,
              width: floatingControls ? 32 : 0,
            }}
            transition={{ duration: reduced ? 0 : 0.2, ease: 'easeInOut' }}
            type="button"
            aria-label={t('scrollLeft')}
            onClick={() => scroll(-1)}
            className={cn(
              'flex h-8 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-background shadow-sm',
              floatingControls &&
                'absolute left-0 top-1/2 z-10 -translate-y-1/2',
            )}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="h-4 w-4" />
          </motion.button>
        )}
      </AnimatePresence>
      <div
        role="group"
        data-slot="pill-scroller"
        className={cn(
          'scroll-fade-x scroll-fade-4 flex min-w-0 flex-1 snap-x snap-proximity flex-nowrap gap-2 overflow-x-auto overscroll-x-contain pb-1 scrollbar-none [&::-webkit-scrollbar]:hidden',
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
      <AnimatePresence initial={false}>
        {overflow.right && (
          <motion.button
            key="right"
            initial={{
              opacity: 0,
              x: reduced ? 0 : 6,
              width: floatingControls ? 32 : 0,
            }}
            animate={{ opacity: 1, x: 0, width: 32 }}
            exit={{
              opacity: 0,
              x: reduced ? 0 : 6,
              width: floatingControls ? 32 : 0,
            }}
            transition={{ duration: reduced ? 0 : 0.2, ease: 'easeInOut' }}
            type="button"
            aria-label={t('scrollRight')}
            onClick={() => scroll(1)}
            className={cn(
              'flex h-8 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-background shadow-sm',
              floatingControls &&
                'absolute right-0 top-1/2 z-10 -translate-y-1/2',
            )}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} className="h-4 w-4" />
          </motion.button>
        )}
      </AnimatePresence>
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
        className="text-[10px] font-normal uppercase tracking-widest text-muted-foreground"
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
    'flex shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-xl border px-4 py-3 font-normal transition-all active:scale-[0.98]',
    active
      ? 'bg-primary/5 border-primary text-primary'
      : 'bg-muted/30 border-transparent text-foreground',
    className,
  )
}

export { FilterPillSection, PillScroller, filterPillClassName }
