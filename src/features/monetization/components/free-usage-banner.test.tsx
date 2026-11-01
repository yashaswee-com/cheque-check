import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { FreeUsageBanner } from './free-usage-banner'
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => mocks }))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { user_id: 'u' } }),
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
let data: Record<string, unknown>
beforeEach(() => {
  data = {
    unlimited: false,
    cheques_used: 39,
    cheques_limit: 50,
    ai_scans_used: 10,
    ai_scans_limit: 10,
    voice_used: 8,
    voice_limit: 10,
  }
  mocks.rpc.mockImplementation(async () => ({ data: [data], error: null }))
})
afterEach(cleanup)
function mount() {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <NextIntlClientProvider locale="en" messages={messages}>
        <FreeUsageBanner />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}
describe('free usage thresholds', () => {
  it.each([
    [39, 'normal'],
    [40, 'warning'],
    [50, 'exhausted'],
  ])('classifies %s of 50 as %s', async (used, state) => {
    data.cheques_used = used
    mount()
    const text = await screen.findByText(`Active cheques: ${used} / 50 used`)
    expect(text.parentElement).toHaveAttribute('data-state', state)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/features')
  })
  it('hides the card for unlimited access', async () => {
    data.unlimited = true
    mount()
    await vi.waitFor(() =>
      expect(screen.queryByRole('status')).not.toBeInTheDocument(),
    )
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })
  it('rejects malformed or absent quota results instead of showing zero', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null })
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Usage could not be loaded',
    )
  })
})
