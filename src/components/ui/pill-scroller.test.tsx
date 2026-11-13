import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FilterPillSection,
  PillScroller,
  filterPillClassName,
} from './pill-scroller'

afterEach(cleanup)
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
})
afterEach(() => {
  document.documentElement.removeAttribute('data-reduce-motion')
  vi.unstubAllGlobals()
})

describe('PillScroller', () => {
  it.each([false, true])(
    'shows physical overflow directions and scrolls a visible width (floating: %s)',
    async (floatingControls) => {
      render(
        <PillScroller aria-label="Options" floatingControls={floatingControls}>
          <button>One</button>
          <button>Two</button>
        </PillScroller>,
      )
      const row = screen.getByRole('group', { name: 'Options' })
      const scrollBy = vi.fn()
      const makeRect = (left: number, right: number) =>
        ({
          left,
          right,
          top: 0,
          bottom: 20,
          width: right - left,
          height: 20,
          x: left,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect
      const children = Array.from(row.children)
      Object.defineProperties(row, {
        clientWidth: { value: 200 },
        scrollWidth: { value: 600 },
        scrollBy: { value: scrollBy },
        getBoundingClientRect: { value: () => makeRect(0, 200) },
      })
      vi.spyOn(children[0], 'getBoundingClientRect').mockReturnValue(
        makeRect(0, 100),
      )
      const lastChildRect = vi
        .spyOn(children[1], 'getBoundingClientRect')
        .mockReturnValue(makeRect(350, 450))
      fireEvent.scroll(row)
      expect(screen.queryByRole('button', { name: 'scrollLeft' })).toBeNull()
      const scrollRight = screen.getByRole('button', { name: 'scrollRight' })
      await waitFor(() => expect(scrollRight).toBeVisible())
      expect(scrollRight.parentElement).toBe(row.parentElement)
      if (floatingControls) {
        expect(scrollRight).toHaveClass('absolute', 'right-0')
        expect(row.parentElement).not.toHaveClass('gap-1')
      } else {
        expect(scrollRight).not.toHaveClass('absolute')
      }
      fireEvent.click(screen.getByRole('button', { name: 'scrollRight' }))
      expect(scrollBy).toHaveBeenCalledWith({ left: 200, behavior: 'smooth' })
      vi.spyOn(children[0], 'getBoundingClientRect').mockReturnValue(
        makeRect(-250, -150),
      )
      lastChildRect.mockReturnValue(makeRect(100, 200))
      fireEvent.scroll(row)
      await waitFor(() =>
        expect(
          screen.queryByRole('button', { name: 'scrollRight' }),
        ).toBeNull(),
      )
      document.documentElement.setAttribute('data-reduce-motion', 'true')
      fireEvent.click(screen.getByRole('button', { name: 'scrollLeft' }))
      expect(scrollBy).toHaveBeenLastCalledWith({
        left: -200,
        behavior: 'instant',
      })
    },
  )
  it('detects left-side overflow in right-to-left layouts', async () => {
    render(
      <PillScroller aria-label="Options" dir="rtl">
        <button>First</button>
        <button>Last</button>
      </PillScroller>,
    )
    const row = screen.getByRole('group', { name: 'Options' })
    const scrollBy = vi.fn()
    const makeRect = (left: number, right: number) =>
      ({
        left,
        right,
        top: 0,
        bottom: 20,
        width: right - left,
        height: 20,
        x: left,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect
    const [first, last] = Array.from(row.children)
    Object.defineProperties(row, {
      clientWidth: { value: 200 },
      scrollBy: { value: scrollBy },
      getBoundingClientRect: { value: () => makeRect(0, 200) },
    })
    vi.spyOn(first, 'getBoundingClientRect').mockReturnValue(makeRect(140, 200))
    vi.spyOn(last, 'getBoundingClientRect').mockReturnValue(makeRect(-120, -20))

    fireEvent.scroll(row)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'scrollLeft' })).toBeVisible(),
    )
    expect(screen.queryByRole('button', { name: 'scrollRight' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'scrollLeft' }))
    expect(scrollBy).toHaveBeenCalledWith({ left: -200, behavior: 'smooth' })
  })
  it('hides chevrons when all pills fit in the viewport', () => {
    render(
      <PillScroller aria-label="Options">
        <button>Only option</button>
      </PillScroller>,
    )
    const row = screen.getByRole('group', { name: 'Options' })
    const rect = {
      left: 0,
      right: 200,
      top: 0,
      bottom: 20,
      width: 200,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect
    Object.defineProperty(row, 'getBoundingClientRect', {
      value: () => rect,
    })
    vi.spyOn(row.children[0], 'getBoundingClientRect').mockReturnValue(rect)

    fireEvent.scroll(row)

    expect(screen.queryByRole('button', { name: 'scrollLeft' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'scrollRight' })).toBeNull()
  })
  it('renders a single horizontally scrollable row instead of a wrapping grid', () => {
    render(
      <PillScroller aria-label="Options" className="gap-3">
        <button type="button">One</button>
      </PillScroller>,
    )
    const row = screen.getByRole('group', { name: 'Options' })
    expect(row).toHaveAttribute('data-slot', 'pill-scroller')
    expect(row).toHaveClass(
      'flex',
      'flex-nowrap',
      'overflow-x-auto',
      'scroll-fade-x',
      'snap-x',
      'gap-3',
    )
    expect(row).not.toHaveClass('gap-2')
    expect(row.className).not.toMatch(/\b(grid|flex-wrap)\b/)
  })
})

describe('FilterPillSection', () => {
  it('labels the scrollable row with its section heading', () => {
    render(
      <FilterPillSection title="Sort By" scrollerClassName="p-1">
        <button type="button" className={filterPillClassName(true)}>
          Date
        </button>
        <button type="button" className={filterPillClassName(false)}>
          Amount
        </button>
      </FilterPillSection>,
    )
    const heading = screen.getByRole('heading', { name: 'Sort By' })
    const row = screen.getByRole('group', { name: 'Sort By' })
    expect(row).toHaveAttribute('aria-labelledby', heading.id)
    expect(row).toHaveClass('overflow-x-auto', 'p-1')
    expect(heading).toHaveClass('font-normal')
    expect(screen.getByRole('button', { name: 'Date' })).toHaveClass(
      'font-normal',
    )
  })
})

describe('filterPillClassName', () => {
  it('keeps pills at their natural width so the row scrolls', () => {
    expect(filterPillClassName(false)).toContain('shrink-0')
    expect(filterPillClassName(false)).toContain('whitespace-nowrap')
    expect(filterPillClassName(false)).toContain('font-normal')
  })

  it('distinguishes active and inactive pills', () => {
    expect(filterPillClassName(true)).toContain('border-primary')
    expect(filterPillClassName(false)).toContain('border-transparent')
    expect(filterPillClassName(false, 'max-w-48')).toContain('max-w-48')
  })
})
