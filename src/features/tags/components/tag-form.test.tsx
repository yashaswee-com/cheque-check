import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { TAG_COLORS } from '../lib/tag-colors'
import { TagForm } from './tag-form'

afterEach(cleanup)
it('previews name and color edits and submits only trimmed valid values when idle', () => {
  const submit = vi.fn()
  const form = (isSaving: boolean) => (
    <NextIntlClientProvider locale="en" messages={messages}>
      <TagForm
        defaultValues={{ name: '', color: TAG_COLORS[0].value }}
        submitLabel="Save tag"
        isSaving={isSaving}
        onSubmit={submit}
      >
        <a href="https://example.com/help">Help</a>
      </TagForm>
    </NextIntlClientProvider>
  )
  const { rerender } = render(form(false))
  expect(screen.getByTestId('tag-form-submit-button')).toBeDisabled()
  fireEvent.submit(screen.getByRole('textbox').closest('form')!)
  expect(submit).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: '  Invoice  ' },
  })
  fireEvent.click(screen.getByRole('radio', { name: TAG_COLORS[1].name }))
  expect(screen.getByText('Invoice')).toHaveStyle({
    backgroundColor: TAG_COLORS[1].value,
  })
  fireEvent.click(screen.getByTestId('tag-form-submit-button'))
  expect(submit).toHaveBeenCalledExactlyOnceWith({
    name: 'Invoice',
    color: TAG_COLORS[1].value,
  })
  rerender(form(true))
  fireEvent.submit(screen.getByRole('textbox').closest('form')!)
  expect(submit).toHaveBeenCalledOnce()
  expect(screen.getByRole('link', { name: 'Help' })).toBeInTheDocument()
})
