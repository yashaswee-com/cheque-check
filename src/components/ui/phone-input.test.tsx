import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import messages from '../../../messages/en.json'
import { PhoneInput } from './phone-input'
import { renderToString } from 'react-dom/server'

const profile = vi.hoisted(() => ({
  useProfile: vi.fn(() => ({ profile: { time_zone: 'Asia/Kolkata' } })),
}))
vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: profile.useProfile,
}))
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('normalizes legacy numbers and propagates edits and country selections', async () => {
  const change = vi.fn()
  const blur = vi.fn()
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PhoneInput
        value="9876543210"
        onChange={change}
        onBlur={blur}
        placeholder="Phone"
        aria-invalid
      />
    </NextIntlClientProvider>,
  )
  await waitFor(() => expect(change).toHaveBeenCalledWith('+919876543210'))
  fireEvent.change(screen.getByPlaceholderText('Phone'), {
    target: { value: '' },
  })
  expect(change).toHaveBeenLastCalledWith('')
  fireEvent.blur(screen.getByPlaceholderText('Phone'))
  expect(blur).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Select country' }))
  const search = await screen.findByPlaceholderText(
    messages.Common.searchCountry,
  )
  fireEvent.change(search, { target: { value: 'United States' } })
  fireEvent.click(await screen.findByRole('option', { name: /United States/ }))
  expect(
    screen.getByRole('button', { name: 'Select country' }),
  ).toHaveTextContent('+1')
})

it('uses the profile country on the server without a browser timezone', () => {
  const html = renderToString(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PhoneInput onChange={vi.fn()} value="+919876543210" />
    </NextIntlClientProvider>,
  )
  expect(html).toContain('+91')
})

it('does not normalize an invalid legacy value and honors a disabled input', () => {
  const change = vi.fn()
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PhoneInput value="not a phone" onChange={change} disabled />
    </NextIntlClientProvider>,
  )
  expect(change).not.toHaveBeenCalled()
  expect(screen.getByRole('textbox')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Select country' })).toBeDisabled()
})

it('keeps an unset phone value empty without reporting an edit', () => {
  const change = vi.fn()
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PhoneInput onChange={change} />
    </NextIntlClientProvider>,
  )
  expect(screen.getByRole('textbox')).toHaveValue('')
  expect(change).not.toHaveBeenCalled()
})

it('locks the country for public auth without reading the user profile', () => {
  const change = vi.fn()
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <label htmlFor="auth-phone">Phone</label>
      <PhoneInput
        id="auth-phone"
        fixedCountry="IN"
        onChange={change}
        aria-invalid
        aria-describedby="phone-error"
        data-testid="auth-phone"
      />
      <p id="phone-error">Check your phone number</p>
    </NextIntlClientProvider>,
  )

  expect(profile.useProfile).not.toHaveBeenCalled()
  const country = screen.getByRole('button', { name: 'Select country' })
  expect(country).toBeDisabled()
  expect(country).toHaveTextContent('+91')
  const input = screen.getByLabelText('Phone')
  expect(input).toBe(screen.getByTestId('auth-phone'))
  expect(input).toHaveAttribute('type', 'tel')
  expect(input).toHaveAttribute('autocomplete', 'tel')
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(input).toHaveAccessibleDescription('Check your phone number')
  fireEvent.change(input, { target: { value: '9876543210' } })
  expect(change).toHaveBeenLastCalledWith('+919876543210')
})
