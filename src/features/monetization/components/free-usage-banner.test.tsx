import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
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
    const progress = await screen.findByRole('progressbar', {
      name: 'Active cheques',
    })
    expect(progress.parentElement).toHaveAttribute('data-state', state)
    expect(progress).toHaveAttribute('aria-valuenow', String(used * 2))
    expect(progress).toHaveAttribute('aria-valuetext', `${used} / 50 used`)
    expect(screen.getByRole('link')).toHaveAttribute(
      'href',
      '/features/catalog',
    )
  })
  it('uses distinct icons and green, yellow and red rings without relying on color alone', async () => {
    mount()
    const cheques = await screen.findByRole('progressbar', {
      name: 'Active cheques',
    })
    const scans = screen.getByRole('progressbar', { name: 'AI scans' })
    const voice = screen.getByRole('progressbar', { name: 'Voice reminders' })
    expect(cheques).toHaveClass('text-green-600')
    expect(scans).toHaveClass('text-red-600')
    expect(voice).toHaveClass('text-yellow-600')
    const icons = [cheques, scans, voice].map(
      (element) => element.querySelectorAll('svg')[1].innerHTML,
    )
    expect(new Set(icons).size).toBe(3)
    expect(screen.getByText(/Limit reached/)).toBeVisible()
    expect(screen.getByText(/Almost used up/)).toBeVisible()
  })
  it.each([
    [0, 0],
    [60, 50],
  ])(
    'bounds progress at 100 for %s / %s without hiding the true count',
    async (used, limit) => {
      data.ai_scans_used = used
      data.ai_scans_limit = limit
      mount()
      const progress = await screen.findByRole('progressbar', {
        name: 'AI scans',
      })
      expect(progress).toHaveAttribute('aria-valuenow', '100')
      expect(progress).toHaveAttribute(
        'aria-valuetext',
        `${used} / ${limit} used`,
      )
      expect(progress.parentElement).toHaveAttribute('data-state', 'exhausted')
      expect(
        within(progress.parentElement!).getByText(/0 remaining/),
      ).toBeVisible()
    },
  )
  it('opens the quota explanation on demand', async () => {
    mount()
    const button = await screen.findByRole('button', {
      name: 'More about Your free plan usage',
    })
    expect(screen.queryByText(messages.FreeUsage.help)).not.toBeInTheDocument()
    fireEvent.click(button)
    expect(await screen.findByText(messages.FreeUsage.help)).toBeVisible()
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
