import { describe, expect, it, vi } from 'vitest'
import { AuthService } from './auth.service'
import type { IAuthRepository } from '@/features/auth/repositories/auth.repository'

describe('AuthService', () => {
  it('delegates password login to the injected repository', async () => {
    const repository = {
      loginWithPassword: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as unknown as IAuthRepository
    const service = new AuthService(repository)

    await service.loginWithPassword('user@example.com', 'password')

    expect(repository.loginWithPassword).toHaveBeenCalledWith(
      'user@example.com',
      'password',
    )
  })

  it('returns the authenticated user from the repository response', async () => {
    const user = { id: 'user-1' }
    const repository = {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    } as unknown as IAuthRepository
    const service = new AuthService(repository)

    await expect(service.getUser()).resolves.toEqual(user)
  })

  it('does not silently treat an auth-provider error as an unsigned user', async () => {
    const error = new Error('Auth lookup failed')
    const repository = {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error }),
    } as unknown as IAuthRepository
    await expect(new AuthService(repository).getUser()).rejects.toBe(error)
  })

  it('preserves the normal signed-out state when no auth session exists', async () => {
    const repository = {
      getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: { name: 'AuthSessionMissingError' },
      }),
    } as unknown as IAuthRepository
    await expect(new AuthService(repository).getUser()).resolves.toBeNull()
  })
})
