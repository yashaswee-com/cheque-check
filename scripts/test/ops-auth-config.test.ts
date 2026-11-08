// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { checkAuthUrlConfiguration } from '../domain/ops'

const expectedSiteUrl = 'https://chequecheck.in'
const baseInput = {
  projectRef: 'abcdefghijklmnopqrst',
  expectedSiteUrl,
  accessToken: 'test-token-never-rendered',
}

function mockFetch(payload: unknown, status = 200) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch
}

describe('checkAuthUrlConfiguration', () => {
  it('passes when the Site URL matches and the callback is allow-listed', async () => {
    const fetchImpl = mockFetch({
      site_url: `${expectedSiteUrl}/`,
      uri_allow_list: `${expectedSiteUrl}/auth/callback,https://localhost:3000/**`,
    })

    await expect(
      checkAuthUrlConfiguration(baseInput, fetchImpl),
    ).resolves.toMatchObject({ status: 'ok' })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/config/auth',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token-never-rendered' },
      }),
    )
  })

  it('fails and identifies both incorrect URL settings', async () => {
    const result = await checkAuthUrlConfiguration(
      baseInput,
      mockFetch({
        site_url: 'http://localhost:3000',
        uri_allow_list: 'http://localhost:3000/auth/callback',
      }),
    )

    expect(result.status).toBe('fail')
    expect(result.detail).toContain('Site URL mismatch')
    expect(result.detail).toContain('callback is not allow-listed')
    expect(JSON.stringify(result)).not.toContain('test-token-never-rendered')
  })

  it('fails closed for missing credentials, invalid origin, and absent required check', async () => {
    await expect(
      checkAuthUrlConfiguration({ ...baseInput, accessToken: undefined }),
    ).resolves.toMatchObject({ status: 'fail' })
    await expect(
      checkAuthUrlConfiguration({
        ...baseInput,
        expectedSiteUrl: 'http://example.com',
      }),
    ).resolves.toMatchObject({ status: 'fail' })
    await expect(
      checkAuthUrlConfiguration({
        ...baseInput,
        expectedSiteUrl: 'http://localhost:3000',
        required: true,
      }),
    ).resolves.toMatchObject({ status: 'fail' })
    await expect(
      checkAuthUrlConfiguration({
        projectRef: baseInput.projectRef,
        required: true,
      }),
    ).resolves.toMatchObject({ status: 'fail' })
  })

  it('does not expose response details when the Management API denies access', async () => {
    const result = await checkAuthUrlConfiguration(
      baseInput,
      mockFetch({ message: 'private response text' }, 403),
    )

    expect(result.status).toBe('fail')
    expect(result.detail).toContain('HTTP 403')
    expect(JSON.stringify(result)).not.toContain('private response text')
  })
})
