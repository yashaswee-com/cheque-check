import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineAction } from '../../lib/action'
import type { OpsContext } from '../../lib/context'
import { ENV_FILES } from '../../lib/env'
import { OpsError, UsageError } from '../../lib/errors'
import { ROOT_DIR } from '../../lib/paths'
import { addLocalAllowlistRef } from '../../lib/project'
import { EDGE_FUNCTIONS } from '../../lib/supabase'
import { runSupabase } from '../../lib/supabase-cli'

const TYPES_PATH = resolve(ROOT_DIR, 'src/types/database.types.ts')
const SECRETS_FILE = resolve(ROOT_DIR, '.supabase-secrets.tmp')

/** Sets KEY=value lines in an env file, keeping every other line as it is. */
export function upsertEnvValues(
  current: string,
  values: Record<string, string>,
): string {
  const lines = current.split(/\r?\n/).filter(Boolean)
  for (const [key, value] of Object.entries(values)) {
    if (!value) continue
    const index = lines.findIndex((line) => line.startsWith(`${key}=`))
    const line = `${key}=${value}`
    if (index === -1) lines.push(line)
    else lines[index] = line
  }
  return `${lines.join('\n')}\n`
}

function writeEnvFile(values: Record<string, string>) {
  const path = resolve(ROOT_DIR, ENV_FILES.local)
  const current = existsSync(path) ? readFileSync(path, 'utf8') : ''
  writeFileSync(path, upsertEnvValues(current, values))
}

function parseApiKeys(output: string) {
  try {
    const keys = JSON.parse(output) as Array<{
      name?: string
      api_key?: string
    }>
    return {
      anon: keys.find((key) => key.name === 'anon')?.api_key ?? '',
      serviceRole:
        keys.find((key) => key.name === 'service_role')?.api_key ?? '',
    }
  } catch {
    return { anon: '', serviceRole: '' }
  }
}

async function deployFunctions(ctx: OpsContext, supabaseUrl: string) {
  // SUPABASE_* names are reserved for auto-injected function secrets.
  const secrets: Record<string, string> = {
    RAZORPAY_WEBHOOK_SECRET: await ctx.prompt.secret({
      message: 'Razorpay webhook secret (blank to skip)',
    }),
    TWILIO_ACCOUNT_SID: await ctx.prompt.text({
      message: 'Twilio account SID (blank to skip)',
    }),
    TWILIO_AUTH_TOKEN: await ctx.prompt.secret({
      message: 'Twilio auth token (blank to skip)',
    }),
    TWILIO_FROM_NUMBER: await ctx.prompt.text({
      message: 'Twilio from number (blank to skip)',
    }),
    NOTIFICATIONS_TEST_MODE: (await ctx.prompt.confirm(
      'Enable NOTIFICATIONS_TEST_MODE (redirect all voice calls to one test number)?',
      true,
    ))
      ? 'true'
      : 'false',
    NOTIFICATIONS_TEST_PHONE: await ctx.prompt.text({
      message: 'Test phone for NOTIFICATIONS_TEST_MODE (E.164, blank to skip)',
    }),
  }
  for (const name of EDGE_FUNCTIONS) runSupabase(['functions', 'deploy', name])
  const lines = Object.entries(secrets)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
  if (lines.length > 0) {
    writeFileSync(SECRETS_FILE, `${lines.join('\n')}\n`)
    try {
      runSupabase(['secrets', 'set', '--env-file', SECRETS_FILE])
    } finally {
      unlinkSync(SECRETS_FILE)
    }
  }
  ctx.ui.warn(
    'Run these once in the Supabase SQL editor so pg_cron can reach the functions:',
  )
  ctx.ui.print(`  select vault.create_secret('${supabaseUrl}', 'project_url');`)
  ctx.ui.print(
    "  select vault.create_secret('<paste your service-role key>', 'service_role_key');",
  )
}

export const setup = defineAction<{ projectRef: string }>({
  name: 'setup',
  title: 'Link a hosted Supabase project for local development',
  description:
    'Logs in, links the project, applies migrations, writes .env.local, allowlists the project as dev, regenerates database types, and optionally deploys the edge functions.',
  mutates: true,
  hubHidden: true,
  options: [],
  examples: ['dev setup'],
  async run(ctx) {
    if (!ctx.flags.interactive)
      throw new UsageError('dev setup is interactive; run it in a terminal.')
    if (ctx.envName !== 'local')
      throw new UsageError('dev setup always writes .env.local; drop --env.')

    if (process.env.SUPABASE_ACCESS_TOKEN)
      ctx.ui.info('Using SUPABASE_ACCESS_TOKEN; skipping login.')
    else runSupabase(['login'])

    const projectRef = await ctx.prompt.text({
      message: 'Supabase project ref',
      validate: (value) =>
        /^[a-z0-9]{20}$/.test(value.trim())
          ? true
          : 'Project refs are 20 lowercase letters/digits.',
    })
    ctx.ui.warn(
      'Only link a disposable dev project: it is added to your dev allowlist.',
    )
    const dbPassword = await ctx.prompt.secret({ message: 'Database password' })
    runSupabase(
      ['link', '--project-ref', projectRef, '--password', dbPassword],
      { secretArgs: true },
    )
    runSupabase(['db', 'push'])

    const keys = parseApiKeys(
      runSupabase(
        [
          'projects',
          'api-keys',
          '--project-ref',
          projectRef,
          '--output',
          'json',
        ],
        { capture: true },
      ),
    )
    const supabaseUrl = await ctx.prompt.text({
      message: 'Supabase URL',
      default: `https://${projectRef}.supabase.co`,
    })
    writeEnvFile({
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        keys.anon ||
        (await ctx.prompt.secret({ message: 'Supabase anon key' })),
      SUPABASE_SERVICE_ROLE_KEY:
        keys.serviceRole ||
        (await ctx.prompt.secret({
          message: 'Supabase service-role key (optional)',
        })),
    })
    addLocalAllowlistRef(projectRef)

    const types = runSupabase(
      ['gen', 'types', 'typescript', '--linked', '--schema', 'public'],
      { capture: true },
    )
    if (!types) throw new OpsError('supabase gen types returned nothing.')
    writeFileSync(TYPES_PATH, types.endsWith('\n') ? types : `${types}\n`)

    if (
      await ctx.prompt.confirm(
        `Deploy ${EDGE_FUNCTIONS.join(', ')} now?`,
        false,
      )
    ) {
      await deployFunctions(ctx, supabaseUrl)
    }
    return { projectRef }
  },
  render(ctx, outcome) {
    ctx.ui.success(
      `Linked ${outcome.projectRef}. Review .env.local, then run npm run dev.`,
    )
    ctx.ui.info(
      'Hosted projects may need pg_cron and pg_net enabled in the Supabase dashboard.',
    )
  },
})
