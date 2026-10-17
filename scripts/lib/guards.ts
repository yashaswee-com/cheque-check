import type { OpsContext } from './context'
import {
  AbortedError,
  DryRunComplete,
  GuardRefusedError,
  UsageError,
} from './errors'
import type { Cell } from './ui'

export interface Change {
  field: string
  before: Cell
  after: Cell
}

export interface MutationPlan {
  title: string
  changes: Change[]
  notes?: string[]
  /** Irreversible or user-visible side effects (calls, emails, deletions): defaults the prompt to "No". */
  destructive?: boolean
}

/**
 * The single gate every mutating action passes through:
 *   1. always shows a before/after preview;
 *   2. --dry-run stops here (exit 0);
 *   3. production targets require the project ref, typed or via --confirm-ref
 *      (--yes never bypasses this);
 *   4. otherwise confirm, unless --yes.
 */
export async function confirmMutation(
  ctx: OpsContext,
  plan: MutationPlan,
): Promise<void> {
  const { ui, flags, target } = ctx
  ui.preview(plan.title, plan.changes, plan.notes)

  if (flags.dryRun) throw new DryRunComplete()

  if (target.isProduction) {
    const ref = target.projectRef
    if (!ref) {
      throw new GuardRefusedError(
        'Refusing to write: the target project ref could not be determined.',
        'Check NEXT_PUBLIC_SUPABASE_URL for this environment.',
      )
    }
    ui.banner(
      [
        `PRODUCTION WRITE · ${ref}`,
        `Why production: ${target.reason}`,
        `Operator: ${ctx.operator}`,
      ],
      'danger',
    )
    if (flags.confirmRef !== undefined) {
      if (flags.confirmRef !== ref) {
        throw new GuardRefusedError(
          `--confirm-ref "${flags.confirmRef}" does not match the target project "${ref}".`,
        )
      }
      return
    }
    if (!flags.interactive) {
      throw new GuardRefusedError(
        'Production writes need explicit confirmation.',
        `Re-run with --confirm-ref ${ref}.`,
      )
    }
    const typed = await ctx.prompt.text({
      message: `Type the project ref (${ref}) to apply this change`,
    })
    if (typed !== ref) {
      throw new GuardRefusedError(
        'Project ref did not match. No changes were made.',
      )
    }
    return
  }

  if (flags.yes) return
  if (!flags.interactive) {
    throw new UsageError(
      'Confirmation required.',
      'Re-run with --yes to apply, or --dry-run to preview only.',
    )
  }
  const proceed = await ctx.prompt.confirm(
    'Apply this change?',
    !plan.destructive,
  )
  if (!proceed) throw new AbortedError()
}
