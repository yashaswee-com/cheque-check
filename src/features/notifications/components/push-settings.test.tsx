import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { PushSettings } from './push-settings'

const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
}))
vi.mock('../services/push.service', () => ({ pushService: mocks }))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { user_id: 'user' } }),
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
function mount() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <PushSettings
          enabled={false}
          disabled={false}
          onEnabledChange={vi.fn()}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  )
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.state.mockResolvedValue('available')
  mocks.enable.mockResolvedValue(undefined)
})
afterEach(cleanup)
describe('push device settings', () => {
  it('never opts in on mount; enables only after a click', async () => {
    mount()
    await screen.findByText(/This device is not registered/)
    expect(mocks.enable).not.toHaveBeenCalled()
    mocks.state.mockResolvedValue('enabled')
    fireEvent.click(
      screen.getByRole('button', { name: 'Enable on this device' }),
    )
    expect(
      await screen.findByRole('button', { name: 'Disable on this device' }),
    ).toBeInTheDocument()
    expect(mocks.enable).toHaveBeenCalledWith('user')
  })
  it.each(['unsupported', 'install', 'unconfigured', 'denied'])(
    'disables opt-in when %s',
    async (state) => {
      mocks.state.mockResolvedValue(state)
      mount()
      await screen.findByRole('status')
      expect(
        screen.getByRole('button', { name: 'Enable on this device' }),
      ).toBeDisabled()
    },
  )
  it('shows action errors and allows retry', async () => {
    mocks.enable.mockRejectedValueOnce(new Error('offline'))
    mount()
    await screen.findByRole('status')
    fireEvent.click(
      screen.getByRole('button', { name: 'Enable on this device' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Push action failed',
    )
    expect(
      screen.getByRole('button', { name: 'Enable on this device' }),
    ).not.toBeDisabled()
  })
})
