import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import messages from '../../../messages/en.json'
import { FormattingContext } from '@/features/profile/hooks/use-display-format'
import { DateInput, type DateInputProps } from './date-input'

afterEach(cleanup)

function Field({
  initialValue = '2026-11-01',
  ...props
}: DateInputProps & { initialValue?: string }) {
  const [value, setValue] = useState(initialValue)
  return (
    <DateInput
      {...props}
      aria-label="Date"
      name="date"
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  )
}

function wrap(
  content: React.ReactNode,
  date_format = 'dd/MM/yyyy',
  time_zone = 'America/New_York',
) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <FormattingContext.Provider value={{ date_format, time_zone }}>
        {content}
      </FormattingContext.Provider>
    </NextIntlClientProvider>
  )
}

describe('preference-formatted date input', () => {
  it.each([
    ['dd/MM/yyyy', '29/02/2028'],
    ['MM/dd/yyyy', '02/29/2028'],
    ['yyyy-MM-dd', '2028-02-29'],
  ])('accepts %s while emitting canonical ISO values', (pattern, entry) => {
    render(wrap(<Field />, pattern))
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: entry },
    })
    expect(screen.getByLabelText('Date')).toHaveValue(entry)
    expect(document.querySelector('input[hidden]')).toHaveValue('2028-02-29')
  })

  it('accepts ISO entries and reformats them using the preference', () => {
    render(wrap(<Field />))
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2028-02-29' },
    })
    expect(screen.getByLabelText('Date')).toHaveValue('29/02/2028')
  })

  it.each(['1', '31/02/2028', '29/02/2027', '13/13/2028'])(
    'rejects %s without retaining a stale valid date',
    (entry) => {
      const validity = vi.fn()
      render(
        wrap(<Field onValidityChange={validity} aria-describedby="help" />),
      )
      fireEvent.change(screen.getByLabelText('Date'), {
        target: { value: entry },
      })
      expect(document.querySelector('input[hidden]')).toHaveValue('')
      expect(screen.getByLabelText('Date')).toHaveValue(entry)
      expect(screen.getByLabelText('Date')).toHaveAttribute(
        'aria-invalid',
        'true',
      )
      expect(screen.getByLabelText('Date')).toHaveAccessibleDescription(
        screen.getByRole('alert').textContent ?? '',
      )
      expect(validity).toHaveBeenLastCalledWith(false)
      fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(validity).toHaveBeenLastCalledWith(true)
    },
  )

  it('enforces changing min/max boundaries and disables disallowed calendar days', () => {
    const validity = vi.fn()
    const { rerender } = render(
      wrap(
        <Field min="2026-11-01" max="2026-11-03" onValidityChange={validity} />,
      ),
    )
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '04/11/2026' },
    })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(validity).toHaveBeenLastCalledWith(false)
    rerender(
      wrap(
        <Field min="2026-11-01" max="2026-11-04" onValidityChange={validity} />,
      ),
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(validity).toHaveBeenLastCalledWith(true)
    fireEvent.click(
      screen.getByRole('button', { name: messages.Common.chooseDate }),
    )
    expect(
      document.querySelector('button[data-day="2026-11-05"]'),
    ).toBeDisabled()
    const day = document.querySelector<HTMLButtonElement>(
      'button[data-day="2026-11-02"]',
    )
    if (!day) throw new Error('Expected selectable calendar day')
    fireEvent.click(day)
    expect(document.querySelector('input[hidden]')).toHaveValue('2026-11-02')
    expect(screen.getByLabelText('Date')).toHaveValue('02/11/2026')
  })

  it('updates patterns without shifting the selected calendar day', () => {
    const { rerender } = render(wrap(<Field />))
    rerender(wrap(<Field />, 'MM/dd/yyyy', 'Asia/Kolkata'))
    expect(screen.getByLabelText('Date')).toHaveValue('11/01/2026')
    expect(document.querySelector('input[hidden]')).toHaveValue('2026-11-01')
  })

  it.each([{ disabled: true }, { readOnly: true }])(
    'prevents editing unavailable fields: %j',
    (props) => {
      render(wrap(<Field {...props} />))
      fireEvent.change(screen.getByLabelText('Date'), {
        target: { value: '02/11/2026' },
      })
      expect(document.querySelector('input[hidden]')).toHaveValue('2026-11-01')
      expect(
        screen.getByRole('button', { name: messages.Common.chooseDate }),
      ).toBeDisabled()
    },
  )

  it('integrates with React Hook Form submission and external resets', async () => {
    const submit = vi.fn()
    function Form() {
      const { register, control, handleSubmit, reset } = useForm({
        defaultValues: { date: '2026-11-01' },
      })
      const date = useWatch({ control, name: 'date' })
      return (
        <form onSubmit={handleSubmit(submit)}>
          <DateInput
            {...register('date', { required: true })}
            aria-label="Date"
            value={date}
            required
          />
          <button type="submit">Submit</button>
          <button type="button" onClick={() => reset({ date: '2028-02-29' })}>
            Reset
          </button>
        </form>
      )
    }
    render(wrap(<Form />))
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '31/02/2028' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(submit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Date')).toHaveValue('29/02/2028')
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        { date: '2028-02-29' },
        expect.anything(),
      ),
    )
  })
})
