import { screen, within } from '@testing-library/react'
import { expect } from 'vitest'

export function expectHorizontalPillRows(sectionTitles: string[]) {
  for (const title of sectionTitles) {
    const row = screen.getByRole('group', { name: title })
    expect(row).toHaveAttribute('data-slot', 'pill-scroller')
    expect(row).toHaveClass('flex', 'flex-nowrap', 'overflow-x-auto')
    expect(row.className).not.toMatch(/\b(grid|grid-cols-\d+|flex-wrap)\b/)
    const pills = within(row).getAllByRole('button')
    expect(pills.length).toBeGreaterThan(0)
    for (const pill of pills) expect(pill).toHaveClass('shrink-0')
  }
}
