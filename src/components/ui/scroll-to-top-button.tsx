'use client'

import { useEffect, useRef, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowUp02Icon } from '@hugeicons/core-free-icons'
import { useTranslations } from 'next-intl'
import { useReducedMotionPreference } from '@/hooks/use-reduced-motion'
import { useSoftwareKeyboard } from '@/hooks/use-software-keyboard'
import { cn } from '@/lib/utils'
import { Button } from './button'

export function ScrollToTopButton({ className }: { className?: string }) {
  const t = useTranslations('Common')
  const reducedMotion = useReducedMotionPreference()
  const keyboardOpen = useSoftwareKeyboard()
  const anchor = useRef<HTMLDivElement>(null)
  const scrollingToTop = useRef(false)
  const [visible, setVisible] = useState(false)
  const [ascending, setAscending] = useState(false)

  useEffect(() => {
    const scroller = anchor.current?.closest<HTMLElement>('[data-page-scroll]')
    const target = scroller ?? window
    const position = () =>
      Math.max(0, scroller ? scroller.scrollTop : window.scrollY)
    let previous = position()

    const onScroll = () => {
      const current = position()
      if (current <= 160) {
        scrollingToTop.current = false
        setAscending(false)
        setVisible(false)
      } else if (!scrollingToTop.current && current !== previous) {
        setVisible(current < previous)
      }
      previous = current
    }
    const onUserInput = () => {
      scrollingToTop.current = false
      setAscending(false)
    }
    const onScrollEnd = () => {
      scrollingToTop.current = false
      setAscending(false)
    }
    target.addEventListener('scroll', onScroll, { passive: true })
    target.addEventListener('scrollend', onScrollEnd)
    target.addEventListener('wheel', onUserInput, { passive: true })
    target.addEventListener('touchstart', onUserInput, { passive: true })
    target.addEventListener('keydown', onUserInput)
    return () => {
      target.removeEventListener('scroll', onScroll)
      target.removeEventListener('scrollend', onScrollEnd)
      target.removeEventListener('wheel', onUserInput)
      target.removeEventListener('touchstart', onUserInput)
      target.removeEventListener('keydown', onUserInput)
    }
  }, [])

  const shown = (visible || ascending) && !keyboardOpen

  return (
    <div ref={anchor} className="contents">
      <Button
        type="button"
        size="icon"
        aria-label={t('scrollToTop')}
        aria-hidden={!shown || ascending}
        tabIndex={shown && !ascending ? 0 : -1}
        className={cn(
          'fixed bottom-[calc(5rem+var(--shell-bottom-extra,0px)+env(safe-area-inset-bottom))] left-1/2 z-40 size-12 -translate-x-1/2 rounded-full shadow-lg transition-[opacity,translate,visibility] duration-300 ease-out motion-reduce:transition-none',
          shown
            ? 'visible translate-y-0 opacity-100'
            : 'invisible pointer-events-none translate-y-8 opacity-0',
          ascending && 'pointer-events-none',
          className,
        )}
        onClick={() => {
          scrollingToTop.current = true
          setVisible(false)
          setAscending(!reducedMotion)
          const scroller =
            anchor.current?.closest<HTMLElement>('[data-page-scroll]')
          const options: ScrollToOptions = {
            top: 0,
            behavior: reducedMotion ? 'instant' : 'smooth',
          }
          if (scroller) scroller.scrollTo(options)
          else window.scrollTo(options)
        }}
      >
        <HugeiconsIcon
          icon={ArrowUp02Icon}
          className={cn(
            'size-6',
            ascending && 'animate-bounce motion-reduce:animate-none',
          )}
          aria-hidden="true"
        />
      </Button>
    </div>
  )
}
