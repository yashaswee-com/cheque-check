import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../messages/en.json'
import {
  APPEARANCE_BOOTSTRAP,
  APPEARANCE_KEY,
  applyAppearance,
} from './lib/appearance'
import { AppearancePreference } from './components/appearance-preference'
import { AppearanceSync } from './components/appearance-sync'
import { toProfileUpdate } from './repositories/profile.repository'
const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  appearance: 'system' as 'system' | 'dark' | 'light',
}))
vi.mock('./hooks/use-profile', () => ({
  useProfile: () => ({
    profile: { user_id: 'user', appearance: mocks.appearance },
    updateProfile: mocks.update,
  }),
}))
vi.mock('@/components/ui/combobox', () => ({
  Combobox: ({
    value,
    onValueChange,
    disabled,
  }: {
    value: string
    onValueChange: (value: string) => void
    disabled: boolean
  }) => (
    <select
      aria-label="Appearance"
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
    >
      <option>system</option>
      <option>dark</option>
      <option>light</option>
    </select>
  ),
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
let dark = false
const listeners = new Set<() => void>()
beforeEach(() => {
  dark = false
  mocks.appearance = 'system'
  mocks.update.mockReset().mockResolvedValue(undefined)
  localStorage.clear()
  document.documentElement.classList.remove('dark')
  listeners.clear()
  vi.stubGlobal('matchMedia', () => ({
    matches: dark,
    addEventListener: (_type: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_type: string, fn: () => void) =>
      listeners.delete(fn),
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
describe('persistent appearance', () => {
  it.each(['light', 'dark', 'system'] as const)(
    'bootstrap applies %s before hydration',
    (appearance) => {
      dark = true
      localStorage.setItem(APPEARANCE_KEY, appearance)
      new Function(APPEARANCE_BOOTSTRAP)()
      expect(document.documentElement.classList.contains('dark')).toBe(
        appearance !== 'light',
      )
      expect(document.documentElement.dataset.appearance).toBe(appearance)
    },
  )
  it('follows OS changes only in System and removes listeners', () => {
    const { unmount } = render(<AppearanceSync />)
    dark = true
    listeners.forEach((fn) => fn())
    expect(document.documentElement).toHaveClass('dark')
    unmount()
    expect(listeners.size).toBe(0)
    applyAppearance('light')
    expect(document.documentElement).not.toHaveClass('dark')
  })
  it('saves immediately and restores the prior preference on failed persistence', async () => {
    mocks.update.mockRejectedValue(new Error('Offline'))
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AppearancePreference />
      </NextIntlClientProvider>,
    )
    fireEvent.change(screen.getByLabelText('Appearance'), {
      target: { value: 'dark' },
    })
    expect(document.documentElement).toHaveClass('dark')
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(mocks.update).toHaveBeenCalledWith({ appearance: 'dark' })
    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorage.getItem(APPEARANCE_KEY)).toBe('system')
  })
  it('validates profile appearance as a closed choice', () => {
    expect(toProfileUpdate({ appearance: 'dark' })).toEqual({
      appearance: 'dark',
    })
    expect(() => toProfileUpdate({ appearance: 'invalid' as 'dark' })).toThrow()
  })
})
