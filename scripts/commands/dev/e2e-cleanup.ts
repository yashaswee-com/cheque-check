import { defineAction } from '../../lib/action'
import { GuardRefusedError, toOpsError, UsageError } from '../../lib/errors'

export const E2E_EMAIL_PATTERN = /^e2e-.+@example\.com$/
const NON_PRODUCTION_URL = /staging|localhost|127\.0\.0\.1/
const PAGE_SIZE = 200

interface CleanupOutcome {
  matched: number
  deleted: number
  failed: { email: string; error: string }[]
  dryRun: boolean
}

export const e2eCleanup = defineAction<CleanupOutcome>({
  name: 'e2e-cleanup',
  title: 'Delete e2e test users',
  description:
    'Deletes users whose email matches e2e-*@example.com (their data goes with them via cascades). Refuses unless the Supabase URL looks like staging/local.',
  mutates: true,
  hubHidden: true,
  options: [
    {
      flags: '--confirm',
      description: 'Required: confirms the deletion (same as --yes)',
    },
  ],
  examples: ['dev e2e-cleanup --confirm', 'dev e2e-cleanup --dry-run'],
  async run(ctx, options) {
    const url = ctx.credentials().url
    if (!NON_PRODUCTION_URL.test(url)) {
      throw new GuardRefusedError(
        `Refusing to run: ${url} does not look like a staging/local project.`,
      )
    }
    const confirmed = Boolean(options.confirm) || ctx.flags.yes
    if (!confirmed && !ctx.flags.dryRun) {
      throw new UsageError(
        'Refusing to run without --confirm.',
        'Re-run as: npm run test:e2e:cleanup -- --confirm',
      )
    }

    const db = ctx.db()
    const outcome: CleanupOutcome = {
      matched: 0,
      deleted: 0,
      failed: [],
      dryRun: ctx.flags.dryRun,
    }
    // Collect first: deleting while paging shifts later users onto earlier pages.
    const targets: { id: string; email: string }[] = []
    for (let page = 1; ; page += 1) {
      const { data, error } = await db.auth.admin.listUsers({
        page,
        perPage: PAGE_SIZE,
      })
      if (error) throw toOpsError(error, 'Listing users')
      for (const user of data.users) {
        if (user.email && E2E_EMAIL_PATTERN.test(user.email))
          targets.push({ id: user.id, email: user.email })
      }
      if (data.users.length < PAGE_SIZE) break
    }
    outcome.matched = targets.length

    for (const user of targets) {
      if (ctx.flags.dryRun) {
        ctx.ui.info(`[dry-run] would delete ${user.email}`)
        continue
      }
      const { error } = await db.auth.admin.deleteUser(user.id)
      if (error) {
        outcome.failed.push({ email: user.email, error: error.message })
        ctx.ui.warn(`Failed to delete ${user.email}: ${error.message}`)
      } else {
        outcome.deleted += 1
        ctx.ui.debug(`Deleted ${user.email}`)
      }
    }
    if (outcome.failed.length > 0) process.exitCode = 1
    return outcome
  },
  render(ctx, outcome) {
    if (outcome.dryRun)
      ctx.ui.info(`Dry run: ${outcome.matched} e2e user(s) would be deleted.`)
    else
      ctx.ui.success(
        `Deleted ${outcome.deleted} e2e user(s)${outcome.failed.length ? `, ${outcome.failed.length} failed` : ''}.`,
      )
  },
})
