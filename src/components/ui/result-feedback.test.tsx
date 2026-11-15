import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/en.json'
import { FilterResultCount } from './filter-result-count'
import { NoResultsState } from './no-results-state'
import { SwitchWithState } from './switch-with-state'
import { DataState } from './data-state'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
afterEach(cleanup)

const wrap = (ui: ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  )

describe('FilterResultCount', () => {
  it('announces the live number of selected entities', () => {
    const { rerender } = wrap(
      <FilterResultCount count={3} total={10} entity="business" />,
    )
    const status = screen.getByTestId('filter-result-count')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('3 businesses selected')
    expect(status).toHaveTextContent('out of 10')
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <FilterResultCount count={1} entity="cheque" />
      </NextIntlClientProvider>,
    )
    expect(status).toHaveTextContent('1 cheque selected')
    expect(status).not.toHaveTextContent('out of')
  })
})

describe('NoResultsState', () => {
  it('explains the search, scope, filters and next step', () => {
    const onClear = vi.fn()
    wrap(
      <NoResultsState
        entity="cheque"
        total={42}
        search=" Nitin "
        filterCount={2}
        scope="Vibha Enterprises"
        onClear={onClear}
      />,
    )
    expect(
      screen.getByRole('heading', { name: 'No cheques matched “Nitin”' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('We searched 42 cheques in Vibha Enterprises.'),
    ).toBeInTheDocument()
    expect(screen.getByText('2 filters are applied.')).toBeInTheDocument()
    expect(
      screen.getByText(/Try a different spelling or fewer words/),
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Clear search & filters' }),
    )
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('describes filter-only misses without a scope or clear action', () => {
    wrap(<NoResultsState entity="party" total={1} />)
    expect(
      screen.getByRole('heading', {
        name: 'No parties matched the filters applied',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('We searched all 1 party.')).toBeInTheDocument()
    expect(
      screen.getByText('Clear the filters to see all parties again.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is rendered by DataState when search details are provided', () => {
    wrap(
      <DataState
        data={[]}
        allData={[1, 2]}
        noResults={{ entity: 'tag', search: 'gst' }}
        onClearFilters={vi.fn()}
      >
        rows
      </DataState>,
    )
    expect(screen.getByText('No tags matched “gst”')).toBeInTheDocument()
    expect(screen.getByText('We searched all 2 tags.')).toBeInTheDocument()
  })
})

describe('SwitchWithState', () => {
  it('shows a visual On/Off word next to the switch', () => {
    const { rerender } = wrap(
      <SwitchWithState checked={false} aria-label="Push" />,
    )
    expect(screen.getByText('Off')).toHaveAttribute('data-state', 'off')
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SwitchWithState checked aria-label="Push" />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText('On')).toHaveAttribute('data-state', 'on')
    expect(screen.getByRole('switch', { name: 'Push' })).toBeChecked()
  })
})
