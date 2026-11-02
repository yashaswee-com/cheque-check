import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { AppearancePreference } from './appearance-preference'
import { ReminderTimesEditor } from './reminder-times-editor'
import type { Appearance } from '../lib/appearance'

const state = vi.hoisted(() => ({
  appearance: 'system' as Appearance,
  update: vi.fn(),
}))
vi.mock('../hooks/use-profile', () => ({
  useProfile: () => ({
    profile: { appearance: state.appearance },
    updateProfile: state.update,
  }),
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
beforeEach(() => {
  state.appearance = 'system'
  state.update.mockReset().mockResolvedValue(undefined)
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
  document.documentElement.classList.remove('dark')
})
function mount(children: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {children}
    </NextIntlClientProvider>,
  )
}

it('preserves the appearance trigger, its dimensions and nearby controls while saving', async () => {
  let finish!: () => void
  state.update.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = () => {
          state.appearance = 'dark'
          resolve()
        }
      }),
  )
  mount(
    <>
      <AppearancePreference />
      <button>Next setting</button>
    </>,
  )
  const trigger = screen.getByLabelText('Appearance')
  const neighbor = screen.getByRole('button', { name: 'Next setting' })
  const classes = trigger.className
  fireEvent.click(trigger)
  fireEvent.click(
    await screen.findByTestId('preferences-appearance-option-dark'),
  )
  await waitFor(() =>
    expect(state.update).toHaveBeenCalledWith({ appearance: 'dark' }),
  )
  expect(trigger).toBeEnabled()
  expect(trigger).toHaveTextContent('Dark')
  expect(trigger).toHaveClass('h-14', 'w-full', 'min-w-0')
  expect(trigger.className).toBe(classes)
  expect(screen.getByRole('button', { name: 'Next setting' })).toBe(neighbor)
  await act(async () => finish())
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(screen.getByLabelText('Appearance')).toBe(trigger)
})

it('does not clear or resave the selected appearance', async () => {
  mount(<AppearancePreference />)
  fireEvent.click(screen.getByLabelText('Appearance'))
  fireEvent.click(
    await screen.findByTestId('preferences-appearance-option-system'),
  )
  expect(state.update).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Appearance')).toHaveTextContent('System')
})

it('renders three full-width reminder rows, excludes duplicate times and exposes help on demand', async () => {
  const change = vi.fn()
  mount(
    <ReminderTimesEditor
      times={['09:00', '12:00', '18:00']}
      timeFormat="24h"
      onChange={change}
    />,
  )
  const editor = screen.getByTestId('reminder-times-editor')
  expect(editor.querySelector('.grid')).toHaveClass('grid-cols-1')
  expect(editor.querySelector('.grid')).not.toHaveClass('sm:grid-cols-3')
  for (let index = 1; index <= 3; index++) {
    expect(screen.getByTestId(`reminder-time-${index}`)).toHaveClass(
      'w-full',
      'h-14',
    )
  }
  fireEvent.click(screen.getByTestId('reminder-time-1'))
  fireEvent.change(await screen.findByTestId('reminder-time-1-search'), {
    target: { value: '12:00' },
  })
  expect(
    screen.queryByTestId('reminder-time-1-option-12:00'),
  ).not.toBeInTheDocument()
  fireEvent.change(screen.getByTestId('reminder-time-1-search'), {
    target: { value: '10:00' },
  })
  fireEvent.click(await screen.findByTestId('reminder-time-1-option-10:00'))
  expect(change).toHaveBeenCalledWith(['10:00', '12:00', '18:00'])
  expect(
    screen.queryByText(messages.Settings.reminderTimesHelp),
  ).not.toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', {
      name: `More about ${messages.Settings.reminderTimes}`,
    }),
  )
  expect(
    await screen.findByText(messages.Settings.reminderTimesHelp),
  ).toBeVisible()
})

it('disables every reminder control when the editor is disabled', () => {
  mount(
    <ReminderTimesEditor
      times={['09:00', '12:00', '18:00']}
      timeFormat="24h"
      onChange={vi.fn()}
      disabled
    />,
  )
  for (let index = 1; index <= 3; index++)
    expect(screen.getByTestId(`reminder-time-${index}`)).toBeDisabled()
})
