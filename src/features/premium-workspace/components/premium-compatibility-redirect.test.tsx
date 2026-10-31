import { act, cleanup, render, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { PremiumCompatibilityRedirect } from './premium-compatibility-redirect'

const { replace, setActiveBusiness, context, state } = vi.hoisted(() => ({
  replace: vi.fn(),
  setActiveBusiness: vi.fn(),
  context: vi.fn(),
  state: { isLoading: false, activeBusiness: true },
}))

const businesses = [
  { id: 'b1', name: 'Acme' },
  { id: 'b2', name: 'Second' },
]

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}))
vi.mock('@/features/businesses/hooks/use-business', () => ({
  useBusiness: () => ({
    activeBusiness: state.activeBusiness ? businesses[0] : null,
    businesses,
    isLoading: state.isLoading,
    setActiveBusiness,
  }),
}))
vi.mock('../service', () => ({
  premiumWorkspaceService: { context },
}))

const renderEntry = () =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PremiumCompatibilityRedirect />
    </NextIntlClientProvider>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  state.isLoading = false
  state.activeBusiness = true
})

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/premium')
})

describe('legacy Premium routes', () => {
  it('routes message templates to the active business detail', async () => {
    window.history.replaceState(null, '', '/premium#message-templates')
    renderEntry()
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/businesses/b1#message-templates'),
    )
  })

  it('waits for business data before redirecting and falls back for unknown fragments', async () => {
    window.history.replaceState(null, '', '/premium#unknown-tool')
    state.isLoading = true
    const { rerender } = renderEntry()
    expect(replace).not.toHaveBeenCalled()
    state.isLoading = false
    rerender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <PremiumCompatibilityRedirect />
      </NextIntlClientProvider>,
    )
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/cheques#bulk-import'),
    )
  })

  it('uses the default cheque destination when no business is active for messages', async () => {
    window.history.replaceState(null, '', '/premium#message-templates')
    state.activeBusiness = false
    renderEntry()
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/businesses#message-templates'),
    )
  })

  it('continues to other owned businesses after a context read fails', async () => {
    window.history.replaceState(
      null,
      '',
      '/premium?partyId=p1#party-statements',
    )
    context
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ parties: [{ id: 'p1' }] })
    renderEntry()
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/parties/p1#party-statements'),
    )
  })

  it.each([{ parties: [] }, { parties: [{ id: 'p1' }] }])(
    'does not redirect after unmount with pending party lookup',
    async ({ parties }) => {
      window.history.replaceState(
        null,
        '',
        '/premium?partyId=p1#party-statements',
      )
      let resolve!: (value: { parties: { id: string }[] }) => void
      context
        .mockImplementationOnce(
          () =>
            new Promise((done) => {
              resolve = done
            }),
        )
        .mockResolvedValue({ parties: [] })
      const { unmount } = renderEntry()
      unmount()
      await act(async () => {
        resolve({ parties })
      })
      expect(replace).not.toHaveBeenCalled()
    },
  )
  it('preserves the native destination fragment for cheque tools', async () => {
    window.history.replaceState(null, '', '/premium#saved-views')
    renderEntry()
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/cheques#saved-views'),
    )
  })

  it('validates partyId in an owned business before selecting it', async () => {
    window.history.replaceState(
      null,
      '',
      '/premium?partyId=p1#party-statements',
    )
    context.mockImplementation(async (businessId: string) => ({
      parties: businessId === 'b2' ? [{ id: 'p1' }] : [],
    }))
    renderEntry()
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/parties/p1#party-statements'),
    )
    expect(setActiveBusiness).toHaveBeenCalledWith(businesses[1])
  })

  it('does not route a foreign party id into a selected detail', async () => {
    window.history.replaceState(
      null,
      '',
      '/premium?partyId=foreign#party-statements',
    )
    context.mockResolvedValue({ parties: [] })
    renderEntry()
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/parties#party-statements'),
    )
    expect(setActiveBusiness).not.toHaveBeenCalled()
  })
})
