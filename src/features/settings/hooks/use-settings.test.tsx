import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChequeWithRelations } from '@/types'
import { useSettings } from './use-settings'

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  delete: vi.fn(),
  export: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}))
vi.mock('@/features/auth/services/auth.service', () => ({
  authService: { signOut: mocks.signOut },
}))
vi.mock('@/features/reports/services/report.service', () => ({
  reportService: { exportToCSV: mocks.export },
}))
vi.mock('@/features/profile/services/profile.service', () => ({
  profileService: { delete: mocks.delete },
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
beforeEach(() => {
  vi.resetAllMocks()
  mocks.signOut.mockResolvedValue(undefined)
  mocks.delete.mockResolvedValue({ providerCleanup: true })
})
afterEach(() => vi.restoreAllMocks())
describe('useSettings', () => {
  it('guards empty exports and uses business name or a fallback in the CSV filename', () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    const { result } = renderHook(() => useSettings())
    result.current.handleExport(undefined, 'Acme')
    expect(alert).toHaveBeenCalledWith('No cheques found to export.')
    expect(mocks.export).not.toHaveBeenCalled()
    const cheques = [{ id: 'c1' }] as ChequeWithRelations[]
    result.current.handleExport(cheques, 'Acme')
    expect(mocks.export).toHaveBeenCalledWith(cheques, 'Acme_Cheques.csv')
    result.current.handleExport(cheques, '')
    expect(mocks.export).toHaveBeenLastCalledWith(
      cheques,
      'Business_Cheques.csv',
    )
  })
  it('navigates after logout only when sign-out succeeds', async () => {
    const { result } = renderHook(() => useSettings())
    await act(async () => result.current.handleLogout())
    expect(mocks.push).toHaveBeenCalledWith('/login')
    mocks.signOut.mockRejectedValueOnce(new Error('logout failed'))
    await expect(result.current.handleLogout()).rejects.toThrow('logout failed')
    expect(mocks.push).toHaveBeenCalledOnce()
  })
  it('warns when provider cleanup is incomplete and propagates deactivation errors', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    const { result } = renderHook(() => useSettings())
    await act(async () => result.current.handleDeleteProfile())
    expect(alert).not.toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledWith('/login')
    mocks.delete.mockResolvedValueOnce({ providerCleanup: false })
    await act(async () => result.current.handleDeleteProfile())
    expect(alert).toHaveBeenCalledWith('deactivationCleanupWarning')
    mocks.delete.mockRejectedValueOnce(new Error('deactivation failed'))
    await expect(result.current.handleDeleteProfile()).rejects.toThrow(
      'deactivation failed',
    )
    expect(mocks.replace).toHaveBeenCalledTimes(2)
  })
})
