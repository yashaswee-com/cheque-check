import { Command, Option } from 'commander'
import { createContext, type GlobalOptions, type OpsContext } from './context'
import type { EnvName } from './env'
import { DryRunComplete, EXIT_CODES, toOpsError, type ExitCode } from './errors'
import type { Ui } from './ui'

export interface OptionDef {
  /** Commander flag syntax, e.g. `--user <user>` or `--no-transaction`. */
  flags: string
  description: string
  choices?: readonly string[]
  defaultValue?: string | boolean
}

export type ActionOptions = Record<string, unknown> & GlobalOptions

/**
 * One support operation. `run` gathers missing input (prompting when
 * interactive), previews and confirms mutations via confirmMutation(), applies
 * them, and returns a JSON-serialisable result. `render` prints that result for
 * humans; with --json the result is emitted as-is instead.
 */
export interface ActionDef<TResult = unknown> {
  name: string
  title: string
  description: string
  mutates: boolean
  options?: OptionDef[]
  /** Positional arguments forwarded verbatim (e.g. Playwright args). */
  passThrough?: { name: string; description: string }
  examples?: string[]
  /** Hidden from the interactive hub (dev tooling with its own flow). */
  hubHidden?: boolean
  /** Environment used when --env is not passed (e.g. e2e-qa always targets qa). */
  defaultEnv?: EnvName
  run(ctx: OpsContext, options: ActionOptions): Promise<TResult>
  render?(ctx: OpsContext, result: TResult): void
}

export interface GroupDef {
  name: string
  title: string
  description: string
  actions: ActionDef<never>[]
}

/** Erases the result type so actions with different results share one list. */
export function defineAction<TResult>(
  action: ActionDef<TResult>,
): ActionDef<never> {
  return action as unknown as ActionDef<never>
}

export async function executeAction(
  ctx: OpsContext,
  group: GroupDef,
  action: ActionDef<never>,
  options: ActionOptions,
): Promise<void> {
  ctx.ui.debug(
    `${group.name} ${action.name} · env=${ctx.envName} · operator=${ctx.operator}`,
  )
  const result = await action.run(ctx, options)
  if (ctx.flags.json) {
    ctx.ui.emitJson({
      ok: true,
      action: `${group.name}.${action.name}`,
      data: result,
    })
  } else {
    action.render?.(ctx, result)
  }
}

/** Prints an error consistently and returns the exit code to use. */
export function reportError(ui: Ui, error: unknown): ExitCode {
  const opsError = toOpsError(error)
  if (opsError instanceof DryRunComplete) {
    ui.info(opsError.message)
    if (ui.json) ui.emitJson({ ok: true, dryRun: true })
    return EXIT_CODES.OK
  }
  if (ui.json) {
    ui.emitJson({
      ok: false,
      error: {
        type: opsError.name,
        message: opsError.message,
        hint: opsError.hint ?? null,
        exitCode: opsError.exitCode,
      },
    })
  }
  ui.error(opsError.message, opsError.hint)
  if (ui.verbose && opsError.cause) {
    ui.debug(String((opsError.cause as Error).stack ?? opsError.cause))
  }
  return opsError.exitCode
}

function exampleHelp(action: ActionDef<never>, prefix: string) {
  if (!action.examples?.length) return ''
  return `\nExamples:\n${action.examples.map((line) => `  $ ${prefix} ${line}`).join('\n')}\n`
}

export function registerGroups(
  program: Command,
  groups: GroupDef[],
  contextFactory: (options: GlobalOptions) => OpsContext = createContext,
) {
  for (const group of groups) {
    const groupCommand = program
      .command(group.name)
      .summary(group.title)
      .description(group.description)

    for (const action of group.actions) {
      const command = groupCommand
        .command(action.name)
        .summary(action.title)
        .description(action.description)
        .addHelpText('after', exampleHelp(action, 'npm run ops --'))

      for (const def of action.options ?? []) {
        const option = new Option(def.flags, def.description)
        if (def.choices) option.choices(def.choices)
        if (def.defaultValue !== undefined) option.default(def.defaultValue)
        command.addOption(option)
      }
      if (action.passThrough) {
        command
          .argument(
            `[${action.passThrough.name}...]`,
            action.passThrough.description,
          )
          .allowUnknownOption()
      }

      command.action(async (...args: unknown[]) => {
        const cmd = args[args.length - 1] as Command
        const options = cmd.optsWithGlobals<ActionOptions>()
        if (action.passThrough) options[action.passThrough.name] = args[0]
        const ctx = contextFactory({
          ...options,
          env: options.env ?? action.defaultEnv,
        })
        await executeAction(ctx, group, action, options)
      })
    }
  }
}
