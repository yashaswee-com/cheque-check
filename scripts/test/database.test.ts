// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { databaseMigrate, databaseReset } from '../commands/dev/database'
import { DryRunComplete, GuardRefusedError, UsageError } from '../lib/errors'
import { runSupabase } from '../lib/supabase-cli'
import { fakePromptAdapter, makeTestContext } from './helpers'

vi.mock('../lib/supabase-cli', () => ({ runSupabase: vi.fn() }))

const ref = 'abcdefghijklmnopqrst'
const databaseUrl = `postgresql://postgres:encoded%26password@db.${ref}.supabase.co:5432/postgres`

function productionContext(flags: Parameters<typeof makeTestContext>[0] = {}) {
  const result = makeTestContext({
    ...flags,
    target: {
      projectRef: ref,
      isProduction: true,
      reason: '--env prod',
    },
  })
  result.ctx.envName = 'prod'
  result.ctx.env = {
    name: 'prod',
    file: 'env\\.env.production',
    fileExists: true,
    values: {
      NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
      SUPABASE_DB_URL: databaseUrl,
    },
  }
  return result
}

beforeEach(() => vi.resetAllMocks())

describe('environment database commands', () => {
  it('previews production reset without running Supabase or revealing credentials', async () => {
    const { ctx, stderr } = productionContext({ flags: { dryRun: true } })
    await expect(databaseReset.run(ctx, {})).rejects.toBeInstanceOf(
      DryRunComplete,
    )
    expect(runSupabase).not.toHaveBeenCalled()
    expect(stderr.text()).toContain(ref)
    expect(stderr.text()).toContain('seed.sql')
    expect(stderr.text()).not.toContain(databaseUrl)
    expect(stderr.text()).not.toContain('encoded')
  })

  it.each([databaseReset, databaseMigrate])(
    '$name refuses --yes without production confirmation',
    async (action) => {
      const { ctx } = productionContext({ flags: { yes: true } })
      await expect(action.run(ctx, {})).rejects.toBeInstanceOf(
        GuardRefusedError,
      )
      expect(runSupabase).not.toHaveBeenCalled()
    },
  )

  it('rejects an incorrect confirmation ref', async () => {
    const { ctx } = productionContext({ flags: { confirmRef: 'wrong' } })
    await expect(databaseReset.run(ctx, {})).rejects.toBeInstanceOf(
      GuardRefusedError,
    )
    expect(runSupabase).not.toHaveBeenCalled()
  })

  it('resets the explicit database with migrations and seed, not the linked project', async () => {
    const { ctx } = productionContext({ flags: { confirmRef: ref } })
    await databaseReset.run(ctx, {})
    expect(runSupabase).toHaveBeenCalledExactlyOnceWith(
      ['db', 'reset', '--db-url', databaseUrl, '--yes'],
      { secretArgs: true },
    )
  })

  it('accepts a typed production ref and pushes migrations without seed or reset', async () => {
    const { ctx } = productionContext({
      flags: { interactive: true },
      adapter: fakePromptAdapter({ input: [ref] }),
    })
    await databaseMigrate.run(ctx, {})
    expect(runSupabase).toHaveBeenCalledExactlyOnceWith(
      ['db', 'push', '--db-url', databaseUrl, '--yes'],
      { secretArgs: true },
    )
  })

  it('accepts a session-pooler URL for the matching project', async () => {
    const { ctx } = productionContext({ flags: { confirmRef: ref } })
    ctx.env.values.SUPABASE_DB_URL = `postgresql://postgres.${ref}:password@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`
    await databaseMigrate.run(ctx, {})
    expect(runSupabase).toHaveBeenCalledOnce()
  })

  it.each([
    'postgresql://postgres:password@db.other.supabase.co/postgres',
    'postgresql://postgres.other:password@aws-0-ap-south-1.pooler.supabase.com/postgres',
    `postgresql://postgres:password@db.${ref}.supabase.co.attacker.example/postgres`,
    `https://db.${ref}.supabase.co/postgres`,
    `${databaseUrl}?host=db.other.supabase.co`,
    `${databaseUrl}?user=postgres.other`,
  ])('refuses mismatched or overridden database routing: %s', async (url) => {
    const { ctx } = productionContext({ flags: { confirmRef: ref } })
    ctx.env.values.SUPABASE_DB_URL = url
    await expect(databaseReset.run(ctx, {})).rejects.toBeInstanceOf(
      GuardRefusedError,
    )
    expect(runSupabase).not.toHaveBeenCalled()
  })

  it('reports missing or malformed URLs without revealing their contents', async () => {
    const { ctx } = productionContext({ flags: { confirmRef: ref } })
    delete ctx.env.values.SUPABASE_DB_URL
    await expect(databaseReset.run(ctx, {})).rejects.toBeInstanceOf(UsageError)
    ctx.env.values.SUPABASE_DB_URL = 'invalid-secret'
    await expect(databaseReset.run(ctx, {})).rejects.toMatchObject({
      message: 'Invalid Supabase API or database URL.',
    })
    expect(runSupabase).not.toHaveBeenCalled()
  })

  it('propagates CLI failure instead of reporting success', async () => {
    const { ctx } = productionContext({ flags: { confirmRef: ref } })
    vi.mocked(runSupabase).mockImplementation(() => {
      throw new Error('migration failed')
    })
    await expect(databaseReset.run(ctx, {})).rejects.toThrow('migration failed')
  })
})
