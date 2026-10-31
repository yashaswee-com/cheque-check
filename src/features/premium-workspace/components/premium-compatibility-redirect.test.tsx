import { act, cleanup, render, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { PremiumCompatibilityRedirect } from './premium-compatibility-redirect'

const { replace, setActiveBusiness, context } = vi.hoisted(() => ({
  replace: vi.fn(),
  setActiveBusiness: vi.fn(),
  context: vi.fn(),
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
    activeBusiness: businesses[0],
    businesses,
    isLoading: false,
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
