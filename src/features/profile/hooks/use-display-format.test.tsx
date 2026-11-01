import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import english from '../../../../messages/en.json'
import hindi from '../../../../messages/hi.json'
import hinglish from '../../../../messages/hi-en.json'
import { FormattingContext } from './use-display-format'
import type { FormattingPreferences } from '@/lib/preference-format'
import { DateInput } from '@/components/ui/date-input'
import { StatusPill } from '@/components/ui/status-pill'
import { DraftCard } from '@/features/drafts/components/draft-card'
import { ChequeTable } from '@/features/premium-workspace/components/cheque-table'
import { StatsDateFilter } from '@/features/cheques/components/stats-date-filter'
import { Calculator } from '@/components/calculator'
import type { ChequeRow } from '@/features/premium-workspace/types'

afterEach(cleanup)
const cheque: ChequeRow = {
  id: 'c1',
  business_id: 'b1',
  party_id: 'p1',
  account_id: 'a1',
  cheque_number: '123456',
  amount: 1000,
  cheque_date: '2026-10-31',
  deposit_date: null,
  type: 'Outward',
  status: 'Issued',
  notes: null,
  image_url: null,
  is_draft: false,
  remind_before_days: null,
  created_at: null,
  updated_at: null,
  deleted_at: null,
  deletion_batch_id: null,
}
const catalogs = { en: english, hi: hindi, 'hi-en': hinglish }
function wrap(
  children: React.ReactNode,
  preferences: FormattingPreferences,
  locale: keyof typeof catalogs = 'en',
) {
  return (
    <NextIntlClientProvider locale={locale} messages={catalogs[locale]}>
      <FormattingContext.Provider value={preferences}>
        {children}
      </FormattingContext.Provider>
    </NextIntlClientProvider>
  )
}

describe('application preference consumers', () => {
  it('updates date fields and table dates after a preference change while retaining ISO input values', () => {
    const changed = vi.fn(
      (event: React.ChangeEvent<HTMLInputElement>) => event.currentTarget.value,
    )
    const content = (
      <>
        <DateInput
          aria-label="Cheque date"
          value="2026-10-31"
          onChange={changed}
        />
        <ChequeTable cheques={[cheque]} currency="$" />
      </>
    )
    const { rerender } = render(
      wrap(content, {
        date_format: 'dd/MM/yyyy',
        time_zone: 'America/New_York',
      }),
    )
    expect(screen.getByRole('table')).toHaveTextContent('31/10/2026')
    expect(screen.getByLabelText('Cheque date')).toHaveValue('31/10/2026')
    expect(document.querySelector('input[hidden]')).toHaveValue('2026-10-31')
    expect(screen.getByRole('table')).toHaveTextContent('$1,000.00')
    rerender(
      wrap(content, { date_format: 'MM/dd/yyyy', time_zone: 'Asia/Kolkata' }),
    )
    expect(screen.getByRole('table')).toHaveTextContent('10/31/2026')
    expect(screen.getByLabelText('Cheque date')).toHaveValue('10/31/2026')
    fireEvent.change(screen.getByLabelText('Cheque date'), {
      target: { value: '2026-11-01' },
    })
    expect(changed.mock.results[0].value).toBe('2026-11-01')
    expect(changed).toHaveBeenCalledOnce()
  })

  it('applies date/time format and time zone to draft timestamps', () => {
    const card = (
      <DraftCard
        href="/draft"
        title="Draft"
        avatar={{ name: 'Asha' }}
        updatedAt="2026-10-31T22:45:00Z"
        onDelete={vi.fn()}
      />
    )
    const { rerender } = render(
      wrap(card, {
        date_format: 'yyyy-MM-dd',
        time_format: '24h',
        time_zone: 'Asia/Kolkata',
      }),
    )
    expect(screen.getByText('Edited 2026-11-01, 04:15')).toBeInTheDocument()
    rerender(
      wrap(card, {
        date_format: 'MM/dd/yyyy',
        time_format: '12h',
        time_zone: 'America/New_York',
      }),
    )
    expect(
      screen.getByText(/Edited 10\/31\/2026, 06:45 pm/i),
    ).toBeInTheDocument()
  })

  it('uses the preferred pattern for custom calendar ranges', () => {
    render(
      wrap(
        <StatsDateFilter
          preset="custom"
          onPresetChange={vi.fn()}
          customRange={{
            from: new Date(2026, 9, 30),
            to: new Date(2026, 9, 31),
          }}
          onCustomRangeChange={vi.fn()}
        />,
        { date_format: 'yyyy-MM-dd' },
      ),
    )
    expect(
      screen.getByRole('button', { name: '2026-10-30 – 2026-10-31' }),
    ).toBeInTheDocument()
  })

  it.each(['en', 'hi', 'hi-en'] as const)(
    'translates status badges, tables and calculator strings in %s',
    (locale) => {
      render(
        wrap(
          <>
            <StatusPill status="Overdue" />
            <ChequeTable cheques={[cheque]} currency="€" />
            <Calculator onClose={vi.fn()} />
          </>,
          { date_format: 'yyyy-MM-dd' },
          locale,
        ),
      )
      expect(
        screen.getByText(catalogs[locale].Dashboard.overdue),
      ).toBeInTheDocument()
      expect(screen.getByRole('table')).toHaveTextContent(
        catalogs[locale].PremiumWorkspace.statuses.Issued,
      )
      expect(
        screen.getByRole('dialog', {
          name: catalogs[locale].SharedUI.calculator,
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', {
          name: catalogs[locale].SharedUI.closeCalculator,
        }),
      ).toBeInTheDocument()
    },
  )
})
