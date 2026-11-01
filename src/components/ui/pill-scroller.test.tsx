import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  FilterPillSection,
  PillScroller,
  filterPillClassName,
} from './pill-scroller'

afterEach(cleanup)

describe('PillScroller', () => {
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
