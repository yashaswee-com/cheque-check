import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
afterEach(() => vi.unstubAllGlobals())

describe('PillScroller', () => {
  it('shows only overflow directions and scrolls a visible width', () => {
    render(
      <PillScroller aria-label="Options">
        <button>One</button>
      </PillScroller>,
    )
    const row = screen.getByRole('group', { name: 'Options' })
    const scrollBy = vi.fn()
    Object.defineProperties(row, {
      clientWidth: { value: 200 },
      scrollWidth: { value: 600 },
      scrollBy: { value: scrollBy },
    })
    expect(screen.queryByRole('button', { name: 'scrollRight' })).toBeNull()
    fireEvent.scroll(row)
    expect(screen.queryByRole('button', { name: 'scrollLeft' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'scrollRight' }))
    expect(scrollBy).toHaveBeenCalledWith({ left: 200, behavior: 'smooth' })
    row.scrollLeft = 400
    fireEvent.scroll(row)
    expect(screen.queryByRole('button', { name: 'scrollRight' })).toBeNull()
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    fireEvent.click(screen.getByRole('button', { name: 'scrollLeft' }))
    expect(scrollBy).toHaveBeenLastCalledWith({
      left: -200,
      behavior: 'instant',
    })
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
  })
})

describe('filterPillClassName', () => {
  it('keeps pills at their natural width so the row scrolls', () => {
    expect(filterPillClassName(false)).toContain('shrink-0')
    expect(filterPillClassName(false)).toContain('whitespace-nowrap')
  })

  it('distinguishes active and inactive pills', () => {
    expect(filterPillClassName(true)).toContain('border-primary')
    expect(filterPillClassName(false)).toContain('border-transparent')
    expect(filterPillClassName(false, 'max-w-48')).toContain('max-w-48')
  })
})
