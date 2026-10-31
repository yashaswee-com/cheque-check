import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { BusinessSwitcher } from './business-switcher'

const state = vi.hoisted(() => ({ setActiveBusiness: vi.fn() }))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => ({
    activeBusiness: null,
    businesses: [{ id: 'business-1', name: 'Acme' }],
    setActiveBusiness: state.setActiveBusiness,
  }),
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: keyof typeof messages.Businesses) =>
    messages.Businesses[key],
}))

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()
  },
)
Element.prototype.scrollIntoView = vi.fn()
afterEach(cleanup)

describe('BusinessSwitcher', () => {
  it('selects a business and closes its dialog, and closes when adding a new business', async () => {
    render(<BusinessSwitcher />)
    fireEvent.click(screen.getByTestId('business-switcher-trigger'))
    fireEvent.click((await screen.findByText('Acme')).closest('[cmdk-item]')!)
    expect(state.setActiveBusiness).toHaveBeenCalledWith({
      id: 'business-1',
      name: 'Acme',
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('business-switcher-trigger'))
    fireEvent.click(await screen.findByTestId('business-switcher-add-business'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('offers to create a business when the search has no matches', async () => {
    render(<BusinessSwitcher trigger={<button>Choose business</button>} />)

    fireEvent.click(screen.getByRole('button', { name: 'Choose business' }))
    fireEvent.change(screen.getByPlaceholderText('Search business...'), {
      target: { value: 'missing' },
    })

    expect(await screen.findByText('No business found.')).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Add New Business' }),
    ).toHaveAttribute('href', '/businesses/create')
  })
})
