import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '@/lib/query-keys'
import { ProfileProvider, useProfile } from './use-profile'
import { useReminderOptions } from './use-reminder-options'
import { REMINDER_DAYS, REMINDERS_PER_DAY } from '../lib/preference-options'

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }))
vi.mock('../services/profile.service', () => ({ profileService: mocks }))
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values: { count: number }) =>
    `${key}:${values.count}`,
}))
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <ProfileProvider>{children}</ProfileProvider>
    </QueryClientProvider>
  )
  return { client, wrapper }
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.get.mockResolvedValue({ id: 'profile1', reduce_motion: true })
  mocks.update.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute('data-reduce-motion')
})
describe('profile hooks', () => {
  it('requires a provider and exposes a loaded profile while applying reduce-motion preferences', async () => {
    expect(() => renderHook(() => useProfile())).toThrow('ProfileProvider')
    const { wrapper, client } = setup()
    const { result } = renderHook(() => useProfile(), { wrapper })
    expect(result.current.profile).toBeNull()
    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.profile?.id).toBe('profile1'))
    expect(document.documentElement.hasAttribute('data-reduce-motion')).toBe(
      true,
    )
    act(() =>
      client.setQueryData(queryKeys.profile.detail(), {
        id: 'profile1',
        reduce_motion: false,
      }),
    )
    await waitFor(() =>
      expect(document.documentElement.hasAttribute('data-reduce-motion')).toBe(
        false,
      ),
    )
  })
  it('invalidates after updates and propagates mutation errors', async () => {
    const { wrapper, client } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useProfile(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () =>
      result.current.updateProfile({ reduce_motion: false }),
    )
    expect(mocks.update).toHaveBeenCalledWith({ reduce_motion: false })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.profile.detail(),
    })
    mocks.update.mockRejectedValueOnce(new Error('update failed'))
    await act(async () => {
      await expect(
        result.current.updateProfile({ reduce_motion: true }),
      ).rejects.toThrow('update failed')
    })
    expect(invalidate).toHaveBeenCalledOnce()
  })
  it('maps reminder options to localized labels and string form values', () => {
    const { result } = renderHook(() => useReminderOptions())
    expect(result.current.REMINDERS_PER_DAY_OPTIONS).toEqual(
      REMINDERS_PER_DAY.map((count) => ({
        label: `remindersPerDay:${count}`,
        value: String(count),
      })),
    )
    expect(result.current.REMINDER_FREQUENCY_OPTIONS).toEqual(
      REMINDER_DAYS.map((count) => ({
        label: `reminderDays:${count}`,
        value: String(count),
      })),
    )
  })
})
