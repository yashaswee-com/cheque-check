import { defineAction } from '../../lib/action'
import { loadEnv, requireEnv } from '../../lib/env'
import { GuardRefusedError, UsageError } from '../../lib/errors'
import { runNodeCli, runSupabase } from '../../lib/supabase-cli'

/**
 * Project ref from a project URL or a Postgres connection string (direct
 * `db.<ref>.supabase.co` or pooler `postgres.<ref>@...`).
 */
export function refFromAnyUrl(value: string | undefined): string | null {
  if (!value) return null
  return (
    value.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ??
    value.match(/db\.([a-z0-9]+)\.supabase\.co/i)?.[1] ??
    value.match(/postgres\.([a-z0-9]+)[:@]/i)?.[1] ??
    null
  )
}

/** Refuses when the DB URL and API URL disagree, or either points at production. */
export function assertQaTargets(
  apiUrl: string,
  dbUrl: string,
  productionUrl: string | undefined,
) {
  const qaRef = refFromAnyUrl(apiUrl)
  const dbRef = refFromAnyUrl(dbUrl)
  if (qaRef && dbRef && qaRef !== dbRef) {
    throw new GuardRefusedError(
      `SUPABASE_DB_URL targets project "${dbRef}" but NEXT_PUBLIC_SUPABASE_URL is "${qaRef}".`,
      'Fix .env.qa before continuing; a mismatch would reset the wrong database.',
    )
  }
  const prodRef = refFromAnyUrl(productionUrl)
  if (prodRef && (prodRef === qaRef || prodRef === dbRef)) {
    throw new GuardRefusedError(
      '.env.qa targets the same Supabase project as .env.production.',
    )
  }
}

export const e2eQa = defineAction<{
  reset: boolean
  playwrightStatus: number | null
}>({
  name: 'e2e-qa',
  title: 'Reset the QA database and run the Playwright suite',
  description:
    'Resets the QA project from local migrations + seed, then runs Playwright against a production build. Extra arguments are passed to Playwright.',
  mutates: true,
  hubHidden: true,
  defaultEnv: 'qa',
  options: [
    {
      flags: '--skip-reset',
      description: 'Reuse current QA data; only run the tests',
    },
    {
      flags: '--reset-only',
      description: 'Only reset the database; do not run the tests',
    },
  ],
  passThrough: {
    name: 'playwrightArgs',
    description: 'Arguments for `playwright test`',
  },
  examples: [
    'dev e2e-qa',
    'dev e2e-qa --skip-reset -- --project=chromium e2e/auth.spec.ts',
    'dev e2e-qa --reset-only',
  ],
  async run(ctx, options) {
    if (ctx.envName !== 'qa')
      throw new UsageError('dev e2e-qa only runs against --env qa.')
    if (options.skipReset && options.resetOnly) {
      throw new UsageError('--skip-reset and --reset-only cannot be combined.')
    }
    const values = requireEnv(ctx.env, [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_DB_URL',
    ])
    const production = loadEnv('prod', { applyToProcess: false })
    assertQaTargets(
      values.NEXT_PUBLIC_SUPABASE_URL,
      values.SUPABASE_DB_URL,
      production.fileExists
        ? production.values.NEXT_PUBLIC_SUPABASE_URL
        : undefined,
    )

    const reset = !options.skipReset
    if (reset) {
      ctx.ui.info(
        `Resetting QA database (${values.NEXT_PUBLIC_SUPABASE_URL}) from local migrations + seed...`,
      )
      if (ctx.flags.dryRun)
        ctx.ui.info('Dry run: skipping `supabase db reset`.')
      else
        runSupabase(
          ['db', 'reset', '--db-url', values.SUPABASE_DB_URL, '--yes'],
          { secretArgs: true },
        )
    } else {
      ctx.ui.info('Skipping the database reset (--skip-reset).')
    }
    if (options.resetOnly || ctx.flags.dryRun)
      return { reset, playwrightStatus: null }

    ctx.ui.info('Running the Playwright suite against QA (production build)...')
    const args = Array.isArray(options.playwrightArgs)
      ? (options.playwrightArgs as string[])
      : []
    const status = runNodeCli('@playwright/test/cli', ['test', ...args], {
      ...process.env,
      PLAYWRIGHT_PROD_BUILD: '1',
    })
    process.exitCode = status
    return { reset, playwrightStatus: status }
  },
  render(ctx, outcome) {
    if (outcome.playwrightStatus === null)
      ctx.ui.success('Done (tests not run).')
    else if (outcome.playwrightStatus === 0)
      ctx.ui.success('Playwright passed.')
    else
      ctx.ui.error(`Playwright exited with status ${outcome.playwrightStatus}.`)
  },
})
