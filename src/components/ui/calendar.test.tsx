import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Calendar } from './calendar'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../messages/en.json'
import { calendarDay } from '@/lib/preference-format'

function renderCalendar(children: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>,
  )
}
afterEach(cleanup)

describe('Calendar', () => {
  it('fills mobile sheets while retaining intrinsic desktop width', () => {
    const { container } = renderCalendar(<Calendar mode="single" />)
    expect(container.querySelector('.group\\/calendar')).toHaveClass(
      'w-fit',
      'max-sm:w-full',
    )
  })
  it('selects a date and navigates months', () => {
    const onSelect = vi.fn()
    renderCalendar(
      <Calendar
        mode="single"
        defaultMonth={new Date(2026, 9, 1)}
        onSelect={onSelect}
      />,
    )
    const day = document.querySelector<HTMLButtonElement>(
      'button[data-day="2026-10-15"]',
    )
    if (!day) throw new Error('October 15 day button missing')
    fireEvent.click(day)
    expect(calendarDay(onSelect.mock.calls[0][0])).toBe('2026-10-15')
    fireEvent.click(screen.getByRole('button', { name: /next month/i }))
    expect(screen.getByText('November 2026')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /previous month/i }))
    expect(screen.getByText('October 2026')).toBeInTheDocument()
  })

  it('renders range markers and blocks disabled dates', () => {
    renderCalendar(
      <Calendar
        mode="range"
        defaultMonth={new Date(2026, 9, 1)}
        selected={{ from: new Date(2026, 9, 10), to: new Date(2026, 9, 12) }}
        disabled={new Date(2026, 9, 15)}
        showWeekNumber
      />,
    )
    expect(
      document.querySelector('button[data-day="2026-10-10"]'),
    ).toHaveAttribute('data-range-start', 'true')
    expect(
      document.querySelector('button[data-day="2026-10-11"]'),
    ).toHaveAttribute('data-range-middle', 'true')
    expect(
      document.querySelector('button[data-day="2026-10-12"]'),
    ).toHaveAttribute('data-range-end', 'true')
    expect(
      document.querySelector('button[data-day="2026-10-15"]'),
    ).toBeDisabled()
  })

  it('supports month dropdown captions and selected single-date styling', () => {
    renderCalendar(
      <Calendar
        mode="single"
        defaultMonth={new Date(2026, 9, 1)}
        selected={new Date(2026, 9, 15)}
        captionLayout="dropdown"
      />,
    )
    expect(screen.getAllByRole('combobox')).toHaveLength(2)
    expect(
      document.querySelector('button[data-day="2026-10-15"]'),
    ).toHaveAttribute('data-selected-single', 'true')
  })
})
