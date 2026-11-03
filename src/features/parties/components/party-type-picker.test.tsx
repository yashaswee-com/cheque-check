import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import {
  PARTY_TYPE_ICONS,
  PartyTypePicker,
  usePartyTypeLabel,
} from './party-type-picker'
import type { PartyType } from '@/types'

afterEach(cleanup)

function renderWithIntl(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  )
}

function Controlled({ onChange }: { onChange: (v: PartyType | null) => void }) {
  const [value, setValue] = useState<PartyType | null>(null)
  return (
    <PartyTypePicker
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange(next)
      }}
    />
  )
}

describe('PartyTypePicker', () => {
  it('renders the three hard-coded types in one labelled horizontal row', () => {
    renderWithIntl(<PartyTypePicker value={null} onChange={vi.fn()} />)
    const row = screen.getByRole('group', { name: 'Party type (optional)' })
    expect(row).toHaveAttribute('data-slot', 'pill-scroller')
    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['Customer', 'Supplier', 'Vendor'])
  })

  it('shows a distinct icon inside every party type pill', () => {
    renderWithIntl(<PartyTypePicker value="vendor" onChange={vi.fn()} />)
    for (const type of ['customer', 'supplier', 'vendor']) {
      expect(screen.getByTestId(`party-type-${type}`)).toContainElement(
        screen.getByTestId(`party-type-icon-${type}`),
      )
    }
    expect(new Set(Object.values(PARTY_TYPE_ICONS)).size).toBe(3)
  })

  it('selects a type, switches type, and clears when the active pill is tapped again', () => {
    const onChange = vi.fn()
    renderWithIntl(<Controlled onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: 'Supplier' }))
    expect(onChange).toHaveBeenLastCalledWith('supplier')
    expect(screen.getByRole('button', { name: 'Supplier' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Vendor' }))
    expect(onChange).toHaveBeenLastCalledWith('vendor')
    expect(screen.getByRole('button', { name: 'Supplier' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Vendor' }))
    expect(onChange).toHaveBeenLastCalledWith(null)
  })

  it('accepts a custom section title', () => {
    renderWithIntl(
      <PartyTypePicker value="customer" onChange={vi.fn()} title="Type" />,
    )
    expect(screen.getByRole('group', { name: 'Type' })).toBeInTheDocument()
  })
})

describe('usePartyTypeLabel', () => {
  it('labels every type and falls back to "Not set"', () => {
    function Labels() {
      const label = usePartyTypeLabel()
      return (
        <p>
          {[
            label('customer'),
            label('supplier'),
            label('vendor'),
            label(null),
          ].join('|')}
        </p>
      )
    }
    renderWithIntl(<Labels />)
    expect(
      screen.getByText('Customer|Supplier|Vendor|Not set'),
    ).toBeInTheDocument()
  })
})
