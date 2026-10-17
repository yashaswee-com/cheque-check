import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineAction } from '../../lib/action'
import { AbortedError, GuardRefusedError, UsageError } from '../../lib/errors'
import { ROOT_DIR } from '../../lib/paths'
import { allowlistedRefs, LOCAL_ALLOWLIST } from '../../lib/project'
import { runSupabase } from '../../lib/supabase-cli'

const LINKED_PROJECT_FILE = resolve(ROOT_DIR, 'supabase/.temp/project-ref')

export function linkedProjectRef(): string | undefined {
  if (!existsSync(LINKED_PROJECT_FILE)) return undefined
  return readFileSync(LINKED_PROJECT_FILE, 'utf8').trim() || undefined
}

export const reset = defineAction<{ projectRef: string }>({
  name: 'reset',
  title: 'Reset the linked dev database (destructive)',
  description:
    'Drops and recreates the linked Supabase project database from migrations + seed.sql. Only works on allowlisted dev projects.',
  mutates: true,
  hubHidden: true,
  options: [],
  examples: ['dev reset'],
  async run(ctx) {
    const projectRef = linkedProjectRef()
    if (!projectRef) {
      throw new UsageError(
        'No linked Supabase project found.',
        'Run `npm run supabase:setup` first.',
      )
    }
    if (!allowlistedRefs().has(projectRef)) {
      throw new GuardRefusedError(
        `Refusing to reset ${projectRef}: it is not an allowlisted dev project.`,
        `Add it to ${LOCAL_ALLOWLIST} only if it is a disposable test project.`,
      )
    }
    if (!ctx.flags.interactive)
      throw new UsageError('dev reset is interactive; run it in a terminal.')
    ctx.ui.banner(
      [`DESTRUCTIVE: every row in ${projectRef} will be deleted.`],
      'danger',
    )
    const typed = await ctx.prompt.text({
      message: `Type ${projectRef} to confirm`,
    })
    if (typed !== projectRef)
      throw new AbortedError('Project ref did not match; reset cancelled.')
    if (
      !(await ctx.prompt.confirm(
        'Reset the linked database and reload seed data?',
        false,
      ))
    ) {
      throw new AbortedError()
    }
    if (ctx.flags.dryRun) {
      ctx.ui.info('Dry run: would run `supabase db reset --linked`.')
      return { projectRef }
    }
    runSupabase(['db', 'reset', '--linked'])
    return { projectRef }
  },
  render(ctx, outcome) {
    if (!ctx.flags.dryRun)
      ctx.ui.success(
        `Reset ${outcome.projectRef}: migrations and supabase/seed.sql applied.`,
      )
  },
})
