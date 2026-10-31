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

vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { time_zone: 'Asia/Kolkata' } }),
}))
beforeEach(() => {
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
