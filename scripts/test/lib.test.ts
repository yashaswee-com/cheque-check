// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { loadEnv, parseEnvName, requireEnv } from '../lib/env'
import {
  AbortedError,
  EXIT_CODES,
  NotFoundError,
  OpsError,
  toOpsError,
  unwrap,
  unwrapRows,
  UsageError,
} from '../lib/errors'
import {
  classifyTarget,
  isLocalSupabaseUrl,
  projectRefFromUrl,
} from '../lib/project'

describe('parseEnvName', () => {
  it('defaults to local and accepts the production alias', () => {
    expect(parseEnvName(undefined)).toBe('local')
    expect(parseEnvName('Production')).toBe('prod')
    expect(parseEnvName('qa')).toBe('qa')
  })

  it('rejects unknown names with a usage error', () => {
    expect(() => parseEnvName('dev')).toThrow(UsageError)
  })
})

describe('loadEnv / requireEnv', () => {
  let root: string
  const KEY = 'OPS_TEST_ONLY_KEY'

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ops-env-'))
    delete process.env[KEY]
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    delete process.env[KEY]
  })

  it('layers .env under .env.local for the local env', () => {
    writeFileSync(join(root, '.env'), `${KEY}=base\nOTHER=1\n`)
    writeFileSync(join(root, '.env.local'), `${KEY}=local\n`)
    const env = loadEnv('local', { root, applyToProcess: false })
    expect(env.values[KEY]).toBe('local')
    expect(env.values.OTHER).toBe('1')
    expect(env.fileExists).toBe(true)
  })

  it('lets variables already in the process environment win', () => {
    writeFileSync(join(root, '.env.qa'), `${KEY}=file\n`)
    process.env[KEY] = 'exported'
    expect(loadEnv('qa', { root, applyToProcess: false }).values[KEY]).toBe(
      'exported',
    )
  })

  it('names the missing variables and the file to fix', () => {
    const env = loadEnv('staging', { root, applyToProcess: false })
    expect(() => requireEnv(env, [KEY])).toThrow(
      expect.objectContaining({
        message: expect.stringContaining(KEY),
        hint: expect.stringContaining('.env.staging does not exist'),
      }),
    )
  })
})

describe('classifyTarget', () => {
  const allowlist = new Set(['devref123'])

  it('parses project refs and local URLs', () => {
    expect(projectRefFromUrl('https://abcd.supabase.co')).toBe('abcd')
    expect(isLocalSupabaseUrl('http://127.0.0.1:54321')).toBe(true)
    expect(isLocalSupabaseUrl('https://abcd.supabase.co')).toBe(false)
  })

  it('always treats --env prod as production', () => {
    expect(
      classifyTarget('prod', 'http://127.0.0.1:54321', allowlist).isProduction,
    ).toBe(true)
  })

  it('treats local and allowlisted projects as non-production', () => {
    expect(
      classifyTarget('local', 'http://127.0.0.1:54321', allowlist).isProduction,
    ).toBe(false)
    expect(
      classifyTarget('qa', 'https://devref123.supabase.co', allowlist),
    ).toMatchObject({
      projectRef: 'devref123',
      isProduction: false,
    })
  })

  it('fails safe for unknown or missing projects', () => {
    expect(
      classifyTarget('local', 'https://other.supabase.co', allowlist)
        .isProduction,
    ).toBe(true)
    expect(classifyTarget('local', undefined, allowlist)).toMatchObject({
      isProduction: true,
      reason: 'project ref could not be determined',
    })
  })
})

describe('toOpsError', () => {
  it('passes OpsErrors through untouched', () => {
    const error = new NotFoundError('nope')
    expect(toOpsError(error)).toBe(error)
  })

  it('maps PostgREST codes to exit codes and hints', () => {
    expect(toOpsError({ code: 'PGRST116', message: 'no rows' })).toBeInstanceOf(
      NotFoundError,
    )
    expect(toOpsError({ code: '23514', message: 'bad' }).exitCode).toBe(
      EXIT_CODES.USAGE,
    )
    expect(toOpsError({ code: '42883', message: 'missing fn' }).hint).toMatch(
      /admin_ops\.sql/,
    )
    expect(toOpsError({ code: '42501', message: 'denied' }).hint).toMatch(
      /service-role/,
    )
  })

  it('prefixes context and recognises prompt cancellation and network errors', () => {
    const exit = Object.assign(new Error('x'), { name: 'ExitPromptError' })
    expect(toOpsError(exit)).toBeInstanceOf(AbortedError)

    const network = new Error('fetch failed', {
      cause: { code: 'ECONNREFUSED' },
    })
    expect(toOpsError(network, 'Loading user').message).toBe(
      'Loading user: Network error (ECONNREFUSED)',
    )
    expect(toOpsError('boom')).toBeInstanceOf(OpsError)
  })

  it('unwrap throws typed errors and unwrapRows defaults to []', () => {
    expect(() =>
      unwrap({ data: null, error: { code: 'P0002', message: 'gone' } }, 'Ctx'),
    ).toThrow(NotFoundError)
    expect(unwrapRows({ data: null, error: null }, 'Ctx')).toEqual([])
  })
})
