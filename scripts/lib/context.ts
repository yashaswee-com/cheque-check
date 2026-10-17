import {
  loadEnv,
  parseEnvName,
  requireEnv,
  type EnvName,
  type LoadedEnv,
} from './env'
import { resolveOperator } from './operator'
import { classifyTarget, type TargetClassification } from './project'
import { Prompter, type PromptAdapter } from './prompts'
import {
  createAdminClient,
  createAnonClient,
  type AdminClient,
  type SupabaseCredentials,
} from './supabase'
import { Ui } from './ui'

/** Options accepted by every command (defined once on the root program). */
export interface GlobalOptions {
  env?: string
  json?: boolean
  dryRun?: boolean
  yes?: boolean
  operator?: string
  reason?: string
  confirmRef?: string
  verbose?: boolean
}

export interface OpsFlags {
  json: boolean
  dryRun: boolean
  yes: boolean
  reason?: string
  confirmRef?: string
  verbose: boolean
  interactive: boolean
}

export interface SelectedUser {
  userId: string
  label: string
  email: string | null
}

export interface OpsContext {
  envName: EnvName
  env: LoadedEnv
  target: TargetClassification
  operator: string
  flags: OpsFlags
  ui: Ui
  prompt: Prompter
  /** State kept across actions in the interactive hub (sticky selected user). */
  session: { user?: SelectedUser }
  credentials(): SupabaseCredentials
  db(): AdminClient
  anon(): AdminClient
}

export interface ContextDependencies {
  isTTY?: boolean
  promptAdapter?: PromptAdapter
  ui?: Ui
  createAdmin?: (credentials: SupabaseCredentials) => AdminClient
}

export function createContext(
  options: GlobalOptions,
  deps: ContextDependencies = {},
): OpsContext {
  const envName = parseEnvName(options.env)
  const env = loadEnv(envName)
  const json = Boolean(options.json)
  const isTTY =
    deps.isTTY ?? Boolean(process.stdin.isTTY && process.stderr.isTTY)
  const flags: OpsFlags = {
    json,
    dryRun: Boolean(options.dryRun),
    yes: Boolean(options.yes),
    reason: options.reason?.trim() || undefined,
    confirmRef: options.confirmRef?.trim() || undefined,
    verbose: Boolean(options.verbose),
    interactive: isTTY && !json,
  }
  const ui = deps.ui ?? new Ui({ json, verbose: flags.verbose })
  const target = classifyTarget(envName, env.values.NEXT_PUBLIC_SUPABASE_URL)

  let admin: AdminClient | undefined
  let anon: AdminClient | undefined

  const credentials = (): SupabaseCredentials => {
    const values = requireEnv(env, [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    ])
    return {
      url: values.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, ''),
      serviceRoleKey: values.SUPABASE_SERVICE_ROLE_KEY,
    }
  }

  return {
    envName,
    env,
    target,
    operator: resolveOperator(options.operator),
    flags,
    ui,
    prompt: new Prompter(flags.interactive, deps.promptAdapter),
    session: {},
    credentials,
    db() {
      admin ??= (deps.createAdmin ?? createAdminClient)(credentials())
      return admin
    },
    anon() {
      if (!anon) {
        const values = requireEnv(env, [
          'NEXT_PUBLIC_SUPABASE_URL',
          'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        ])
        anon = createAnonClient(
          values.NEXT_PUBLIC_SUPABASE_URL,
          values.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        )
      }
      return anon
    },
  }
}

export function targetLabel(ctx: OpsContext): string {
  return `${ctx.envName} · ${ctx.target.projectRef ?? 'unknown project'}`
}
