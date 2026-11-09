// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { getIncident, readSentryIssue } from '../domain/incident'

const mocks = vi.hoisted(() => ({ execFile: vi.fn() }))
vi.mock('node:child_process', () => ({ execFile: mocks.execFile }))

const issue = {
  id: '123',
  shortId: 'CHEQUE-CHECK-WEB-D',
  status: 'unresolved',
  level: 'error',
  count: '3',
  firstSeen: '2026-11-09T05:24:47Z',
  lastSeen: '2026-11-09T05:47:24Z',
  project: { slug: 'cheque-check-web' },
  title: 'Private error contents',
  event: {
    id: 'a'.repeat(32),
    dateCreated: '2026-11-09T05:47:24Z',
    user: { email: 'private@example.test' },
    tags: [
      { key: 'environment', value: 'production' },
      { key: 'release', value: 'test-release' },
      { key: 'user', value: 'private@example.test' },
    ],
  },
}

describe('Sentry incident metadata', () => {
  it('uses the stored login and excludes npm binary shadows from the child environment', async () => {
    vi.stubEnv('SENTRY_AUTH_TOKEN', 'build-token')
    vi.stubEnv('SENTRY_API_KEY', 'legacy-key')
    vi.stubEnv('PATH', '/repo/node_modules/.bin:/opt/homebrew/bin:/usr/bin')
    mocks.execFile.mockImplementation((_file, _args, options, callback) => {
      expect(options.env.SENTRY_AUTH_TOKEN).toBeUndefined()
      expect(options.env.SENTRY_API_KEY).toBeUndefined()
      expect(options.env.PATH).toBe('/opt/homebrew/bin:/usr/bin')
      expect(options.timeout).toBe(30_000)
      callback(null, 'selected metadata', '')
    })
    try {
      await expect(readSentryIssue(['issue', 'view'])).resolves.toBe(
        'selected metadata',
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('withholds raw subprocess errors and provides an actionable failure', async () => {
    mocks.execFile.mockImplementation((_file, _args, _options, callback) => {
      callback(new Error('private raw failure'))
    })
    await expect(readSentryIssue([])).rejects.toThrow(
      'Sentry issue lookup failed.',
    )
  })

  it('uses a bounded read-only lookup and emits only approved metadata', async () => {
    const read = vi.fn().mockResolvedValue(JSON.stringify(issue))
    const result = await getIncident(issue.shortId, read)
    expect(read).toHaveBeenCalledWith([
      'issue',
      'view',
      'cheque-check/CHEQUE-CHECK-WEB-D',
      '--fresh',
      '--json',
      '--fields',
      expect.stringContaining('event.tags'),
    ])
    expect(result.latestEvent?.environment).toBe('production')
    expect(result.latestEvent?.release).toBe('test-release')
    expect(JSON.stringify(result)).not.toContain('private')
    expect(result).not.toHaveProperty('title')
  })

  it.each(['', '--web', 'OTHER-PROJECT-D', '../CHEQUE-CHECK-WEB-D'])(
    'rejects invalid short ID %j before executing a CLI',
    async (id) => {
      const read = vi.fn()
      await expect(getIncident(id, read)).rejects.toThrow('Pass --issue')
      expect(read).not.toHaveBeenCalled()
    },
  )

  it.each([
    'not json',
    '{}',
    JSON.stringify({ ...issue, shortId: 'CHEQUE-CHECK-WEB-E' }),
    JSON.stringify({ ...issue, project: { slug: 'other' } }),
  ])('fails explicitly on invalid or mismatched output', async (output) => {
    await expect(
      getIncident(issue.shortId, async () => output),
    ).rejects.toThrow()
  })

  it('keeps absent events explicit', async () => {
    const result = await getIncident(issue.shortId, async () =>
      JSON.stringify({ ...issue, event: null }),
    )
    expect(result.latestEvent).toBeNull()
  })

  it('does not silently succeed when the CLI fails', async () => {
    await expect(
      getIncident(issue.shortId, async () => {
        throw new Error('lookup unavailable')
      }),
    ).rejects.toThrow('lookup unavailable')
  })
})
