import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/en.json'
import { DeveloperMessage } from './components/developer-message'
const mocks = vi.hoisted(() => ({ read: false, acknowledge: vi.fn() }))
vi.mock('./hooks/use-announcement', () => ({
  useAnnouncement: () => ({
    data: {
      id: '1',
      read: mocks.read,
      author: 'Team',
      content: { en: 'Hello', hi: 'नमस्ते', 'hi-en': 'Namaste' },
    },
    isLoading: false,
    error: null,
    acknowledge: mocks.acknowledge,
  }),
}))
vi.mock('@/components/pwa-install-card', () => ({
  PwaInstallCard: () => <span>Install card</span>,
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
beforeEach(() => {
  mocks.read = false
  mocks.acknowledge.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)
function mount(onboarding = true) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DeveloperMessage onboarding={onboarding} />
    </NextIntlClientProvider>,
  )
}
describe('developer message delivery', () => {
  it('prioritizes message over installation and acknowledges explicitly', async () => {
    mount()
    expect(screen.queryByText('Install card')).not.toBeInTheDocument()
    expect(await screen.findByText('Hello')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await vi.waitFor(() => expect(mocks.acknowledge).toHaveBeenCalledOnce())
  })
  it('shows install card only after durable acknowledgement', () => {
    mocks.read = true
    mount()
    expect(screen.getByText('Install card')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('shows About message even after acknowledgement', () => {
    mocks.read = true
    mount(false)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })
  it('shows acknowledgement failure rather than dismissing silently', async () => {
    mocks.acknowledge.mockRejectedValueOnce(new Error('offline'))
    mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save')
  })
})
