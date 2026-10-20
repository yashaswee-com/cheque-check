import { defineAction } from '../../lib/action'
import type { OpsContext } from '../../lib/context'
import { requireEnv } from '../../lib/env'
import { GuardRefusedError, UsageError } from '../../lib/errors'
import { confirmMutation } from '../../lib/guards'
import { runSupabase } from '../../lib/supabase-cli'

function databaseTarget(ctx: OpsContext) {
  const values = requireEnv(ctx.env, [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_DB_URL',
  ])
  let api: URL
  let database: URL
  try {
    api = new URL(values.NEXT_PUBLIC_SUPABASE_URL)
    database = new URL(values.SUPABASE_DB_URL)
  } catch {
    throw new UsageError(
      'Invalid Supabase API or database URL.',
      `Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_URL in ${ctx.env.file}.`,
    )
  }
  const projectRef = api.hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1]
  const databaseRef =
    database.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1] ??
    (database.hostname.endsWith('.pooler.supabase.com')
      ? database.username.match(/^postgres\.([a-z0-9]+)$/)?.[1]
      : undefined)
  const routingParameters = new Set([
    'host',
    'hostaddr',
    'port',
    'user',
    'dbname',
    'service',
    'servicefile',
  ])
  if (
    !['postgres:', 'postgresql:'].includes(database.protocol) ||
    [...database.searchParams.keys()].some((key) =>
      routingParameters.has(key.toLowerCase()),
    ) ||
    !projectRef ||
    databaseRef !== projectRef ||
    ctx.target.projectRef !== projectRef
  ) {
    throw new GuardRefusedError(
      'Refusing database operation: API and database URLs must identify the same hosted Supabase project.',
      `Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_URL in ${ctx.env.file}. Use a direct or session-pooler connection string with a percent-encoded password and no connection-routing query parameters.`,
    )
  }
  return { projectRef, databaseUrl: values.SUPABASE_DB_URL }
}

export const databaseReset = defineAction<{ projectRef: string }>({
  name: 'db-reset',
  title: 'Reset an environment database and reapply migrations + seed',
  description:
    'Destructively resets the hosted database from SUPABASE_DB_URL, reapplies all migrations, and loads seed.sql. Does not use or change the linked project.',
  mutates: true,
  hubHidden: true,
  examples: ['dev db-reset --env prod --dry-run', 'dev db-reset --env prod'],
  async run(ctx) {
    const { projectRef, databaseUrl } = databaseTarget(ctx)
    await confirmMutation(ctx, {
      title: `Reset database: ${projectRef}`,
      destructive: true,
      changes: [
        {
          field: 'Environment file',
          before: ctx.env.file,
          after: ctx.env.file,
        },
        { field: 'Application data', before: 'current rows', after: 'DELETED' },
        {
          field: 'Schema',
          before: 'current schema',
          after: 'all migrations + seed.sql',
        },
      ],
      notes: [
        'Take and verify a database backup before proceeding. This cannot be undone.',
        'Remote reset does not wipe managed Auth users or Storage files.',
        'A failed migration can leave the database partially rebuilt; stop application writes during maintenance.',
      ],
    })
    runSupabase(['db', 'reset', '--db-url', databaseUrl, '--yes'], {
      secretArgs: true,
    })
    return { projectRef }
  },
  render(ctx, result) {
    ctx.ui.success(
      `Reset ${result.projectRef}: all migrations and seed.sql applied.`,
    )
  },
})

export const databaseMigrate = defineAction<{ projectRef: string }>({
  name: 'db-migrate',
  title: 'Apply pending migrations to an environment database',
  description:
    'Applies pending migrations using SUPABASE_DB_URL without resetting the database or loading seed data. Does not use or change the linked project.',
  mutates: true,
  hubHidden: true,
  examples: [
    'dev db-migrate --env prod --dry-run',
    'dev db-migrate --env prod',
  ],
  async run(ctx) {
    const { projectRef, databaseUrl } = databaseTarget(ctx)
    await confirmMutation(ctx, {
      title: `Apply pending migrations: ${projectRef}`,
      changes: [
        {
          field: 'Environment file',
          before: ctx.env.file,
          after: ctx.env.file,
        },
        {
          field: 'Schema',
          before: 'current schema',
          after: 'pending migrations applied',
        },
      ],
      notes: [
        'No database reset or seed reload. Review pending migration SQL and take a backup first.',
      ],
    })
    runSupabase(['db', 'push', '--db-url', databaseUrl, '--yes'], {
      secretArgs: true,
    })
    return { projectRef }
  },
  render(ctx, result) {
    ctx.ui.success(`Applied pending migrations to ${result.projectRef}.`)
  },
})
