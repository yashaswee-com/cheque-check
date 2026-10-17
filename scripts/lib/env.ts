import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'dotenv'
import { UsageError } from './errors'
import { ROOT_DIR } from './paths'

export const ENV_NAMES = ['local', 'qa', 'staging', 'prod'] as const
export type EnvName = (typeof ENV_NAMES)[number]

export const ENV_FILES: Record<EnvName, string> = {
  local: '.env.local',
  qa: '.env.qa',
  staging: '.env.staging',
  prod: '.env.production',
}

export function parseEnvName(value: string | undefined): EnvName {
  const name = (value ?? 'local').toLowerCase()
  if (name === 'production') return 'prod'
  if ((ENV_NAMES as readonly string[]).includes(name)) return name as EnvName
  throw new UsageError(
    `Unknown environment "${value}".`,
    `Use one of: ${ENV_NAMES.join(', ')}.`,
  )
}

export function envFilePath(name: EnvName, root = ROOT_DIR) {
  return resolve(root, ENV_FILES[name])
}

/** Environments whose env file exists, for the interactive picker. */
export function availableEnvs(root = ROOT_DIR): EnvName[] {
  return ENV_NAMES.filter((name) => existsSync(envFilePath(name, root)))
}

export interface LoadedEnv {
  name: EnvName
  file: string
  fileExists: boolean
  values: Record<string, string | undefined>
}

/**
 * Reads the env file for `name` (`local` also layers `.env` underneath) and
 * merges it under the current process environment, so values already set
 * (e.g. CI secrets) win. A missing file is not an error by itself:
 * requireEnv() reports exactly which variables are missing and where.
 */
export function loadEnv(
  name: EnvName,
  options: { root?: string; applyToProcess?: boolean } = {},
): LoadedEnv {
  const root = options.root ?? ROOT_DIR
  const file = envFilePath(name, root)
  const layers = name === 'local' ? [resolve(root, '.env'), file] : [file]
  const fileValues: Record<string, string> = {}

  for (const layer of layers) {
    if (existsSync(layer)) {
      Object.assign(fileValues, parse(readFileSync(layer)))
    }
  }

  const values: Record<string, string | undefined> = {
    ...fileValues,
    ...Object.fromEntries(
      Object.entries(process.env).filter(([, value]) => value !== undefined),
    ),
  }

  if (options.applyToProcess !== false) {
    for (const [key, value] of Object.entries(fileValues)) {
      if (process.env[key] === undefined) process.env[key] = value
    }
  }

  return { name, file: ENV_FILES[name], fileExists: existsSync(file), values }
}

export function requireEnv<K extends string>(
  env: LoadedEnv,
  keys: readonly K[],
): Record<K, string> {
  const missing = keys.filter((key) => !env.values[key])
  if (missing.length > 0) {
    throw new UsageError(
      `Missing environment variable(s): ${missing.join(', ')}.`,
      env.fileExists
        ? `Add them to ${env.file}.`
        : `${env.file} does not exist. Create it from .env.example or export the variables.`,
    )
  }
  return Object.fromEntries(
    keys.map((key) => [key, env.values[key] as string]),
  ) as Record<K, string>
}
