import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { Controller, useForm } from 'react-hook-form'
import { useEffect } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import messages from '../../../../messages/en.json'
import { DueDatePresets } from './due-date-presets'

vi.mock('@/features/profile/hooks/use-profile', () => ({
  useProfile: () => ({ profile: { time_zone: 'Asia/Kolkata' } }),
}))
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-31T23:30:00Z'))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('preserves a restored date until selected and emits a form change for draft autosave', () => {
  const onChange = vi.fn()
  function Form() {
    const form = useForm({ defaultValues: { deposit_date: '2025-12-15' } })
    useEffect(() => {
      const subscription = form.watch(onChange)
      return () => subscription.unsubscribe()
    }, [form])
    return (
      <Controller
        control={form.control}
        name="deposit_date"
        render={({ field }) => (
          <>
            <output>{field.value}</output>
            <DueDatePresets value={field.value} onSelect={field.onChange} />
          </>
        )}
      />
    )
  }
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <Form />
    </NextIntlClientProvider>,
  )
  expect(screen.getByRole('status')).toHaveTextContent('2025-12-15')
  expect(onChange).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '+7 days' }))
  expect(screen.getByRole('status')).toHaveTextContent('2026-02-08')
  expect(onChange).toHaveBeenCalledWith(
    { deposit_date: '2026-02-08' },
    expect.objectContaining({ name: 'deposit_date', type: 'change' }),
  )
  fireEvent.click(screen.getByRole('button', { name: 'End of month' }))
  expect(screen.getByRole('status')).toHaveTextContent('2026-02-28')
})
