import {
  executeAction,
  reportError,
  type ActionDef,
  type GroupDef,
} from './lib/action'
import { targetLabel, type GlobalOptions, type OpsContext } from './lib/context'
import { availableEnvs, ENV_FILES, type EnvName } from './lib/env'
import { AbortedError } from './lib/errors'
import type { Prompter } from './lib/prompts'
import { selectUser } from './commands/shared'

const EXIT = '__exit'
const BACK = '__back'
const SWITCH_USER = '__switch_user'
const CLEAR_USER = '__clear_user'

export interface HubDependencies {
  groups: GroupDef[]
  prompt: Prompter
  createContext(options: GlobalOptions): OpsContext
  envs?: EnvName[]
}

async function pickEnv(prompt: Prompter, envs: EnvName[]): Promise<EnvName> {
  if (envs.length <= 1) return envs[0] ?? 'local'
  return prompt.select<EnvName>({
    message: 'Environment',
    choices: envs.map((name) => ({
      value: name,
      name: `${name} (${ENV_FILES[name]})`,
    })),
    default: envs.includes('local') ? 'local' : envs[0],
  })
}

function showBanner(ctx: OpsContext) {
  const lines = [
    `Cheque Check ops · ${targetLabel(ctx)}`,
    `Operator: ${ctx.operator}`,
  ]
  if (ctx.target.isProduction)
    lines.push(`PRODUCTION (${ctx.target.reason}): changes affect real users`)
  ctx.ui.banner(lines, ctx.target.isProduction ? 'danger' : 'normal')
}

function visibleActions(group: GroupDef): ActionDef<never>[] {
  return group.actions.filter((action) => !action.hubHidden)
}

/**
 * Menu-driven support console: pick an area, then an action. Each action
 * prompts for what it needs; the selected user is remembered between actions.
 * Errors are reported and the menu continues; only Exit/Ctrl+C at the top
 * level ends the session.
 */
export async function runHub(
  options: GlobalOptions,
  deps: HubDependencies,
): Promise<void> {
  const envName =
    options.env ?? (await pickEnv(deps.prompt, deps.envs ?? availableEnvs()))
  const ctx = deps.createContext({ ...options, env: envName })
  showBanner(ctx)
  const groups = deps.groups.filter((group) => visibleActions(group).length > 0)

  for (;;) {
    const user = ctx.session.user
    let choice: string
    try {
      choice = await ctx.prompt.select({
        message: user
          ? `What do you need? (user: ${user.label})`
          : 'What do you need?',
        choices: [
          ...groups.map((group) => ({ value: group.name, name: group.title })),
          user
            ? {
                value: CLEAR_USER,
                name: `Forget selected user (${user.label})`,
              }
            : { value: SWITCH_USER, name: 'Select a user' },
          { value: EXIT, name: 'Exit' },
        ],
      })
    } catch (error) {
      if (error instanceof AbortedError) return
      throw error
    }
    if (choice === EXIT) return
    if (choice === CLEAR_USER) {
      ctx.session.user = undefined
      continue
    }

    try {
      if (choice === SWITCH_USER) {
        await selectUser(ctx, undefined)
        continue
      }
      const group = groups.find((item) => item.name === choice)
      if (!group) continue
      const actions = visibleActions(group)
      const actionName = await ctx.prompt.select({
        message: group.title,
        choices: [
          ...actions.map((action) => ({
            value: action.name,
            name: `${action.title}${action.mutates ? '' : ' (read-only)'}`,
            description: action.description,
          })),
          { value: BACK, name: '← Back' },
        ],
      })
      const action = actions.find((item) => item.name === actionName)
      if (!action) continue
      await executeAction(ctx, group, action, { ...options, env: envName })
    } catch (error) {
      reportError(ctx.ui, error)
    }
    ctx.ui.print()
  }
}
