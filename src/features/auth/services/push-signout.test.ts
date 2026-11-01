import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthService } from './auth.service'

const mocks = vi.hoisted(() => ({ disable: vi.fn(), signOut: vi.fn() }))
vi.mock('@/features/notifications/services/push.service', () => ({
  pushService: { disable: mocks.disable },
}))
vi.mock('@/features/auth/repositories/auth.repository', () => ({
  SupabaseAuthRepository: class {
    signOut = mocks.signOut
  },
}))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.disable.mockResolvedValue(undefined)
  mocks.signOut.mockResolvedValue({ error: null })
})
describe('account-safe push sign-out', () => {
  it('detaches device before revoking auth', async () => {
    await new AuthService().signOut()
    expect(mocks.disable.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.signOut.mock.invocationCallOrder[0],
    )
  })
  it('blocks sign-out when device cleanup fails', async () => {
    mocks.disable.mockRejectedValueOnce(new Error('offline'))
    await expect(new AuthService().signOut()).rejects.toThrow('offline')
    expect(mocks.signOut).not.toHaveBeenCalled()
  })
  it('propagates auth failure rather than allowing a success-shaped redirect', async () => {
    mocks.signOut.mockResolvedValueOnce({ error: new Error('revoke failed') })
    await expect(new AuthService().signOut()).rejects.toThrow('revoke failed')
  })
})
