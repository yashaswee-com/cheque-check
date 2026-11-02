import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import messages from '../../../messages/en.json'
import { InfoPopover } from './info-popover'

afterEach(cleanup)

it('reveals help with the keyboard, dismisses with Escape and returns focus', async () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <InfoPopover title="Reminders">
        Choose a time for each reminder.
      </InfoPopover>
    </NextIntlClientProvider>,
  )
  const user = userEvent.setup()
  const trigger = screen.getByRole('button', { name: 'More about Reminders' })
  expect(
    screen.queryByText('Choose a time for each reminder.'),
  ).not.toBeInTheDocument()
  await user.tab()
  expect(trigger).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(await screen.findByRole('dialog')).toHaveAccessibleName('Reminders')
  expect(screen.getByText('Choose a time for each reminder.')).toBeVisible()
  await user.keyboard('{Escape}')
  expect(trigger).toHaveFocus()
})
