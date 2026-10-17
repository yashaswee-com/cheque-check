import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { EnvName } from './env'
import { ROOT_DIR } from './paths'

export const TRACKED_ALLOWLIST = 'supabase/.dev-projects.json'
export const LOCAL_ALLOWLIST = 'supabase/.dev-projects.local.json'

/**
 * Pulls the Supabase project ref out of a project URL or a Postgres
 * connection string (direct `db.<ref>.supabase.co` or pooler `postgres.<ref>@...`).
 */
export function projectRefFromUrl(value: string | undefined): string | null {
  if (!value) return null
  return (
    value.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ??
    value.match(/db\.([a-z0-9]+)\.supabase\.co/i)?.[1] ??
    value.match(/postgres\.([a-z0-9]+)[:@]/i)?.[1] ??
    null
  )
}

export function isLocalSupabaseUrl(value: string | undefined): boolean {
  if (!value) return false
  try {
    const { hostname } = new URL(value)
    return [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      'host.docker.internal',
    ].includes(hostname)
  } catch {
    return false
  }
}

export function readAllowlist(path: string): string[] {
  if (!existsSync(path)) return []
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as {
      projectRefs?: unknown
    }
    return Array.isArray(value.projectRefs)
      ? value.projectRefs.filter(
          (ref): ref is string => typeof ref === 'string',
        )
      : []
  } catch {
    return []
  }
}

export function allowlistedRefs(root = ROOT_DIR): Set<string> {
  return new Set([
    ...readAllowlist(resolve(root, TRACKED_ALLOWLIST)),
    ...readAllowlist(resolve(root, LOCAL_ALLOWLIST)),
  ])
}

export function addLocalAllowlistRef(projectRef: string, root = ROOT_DIR) {
  const path = resolve(root, LOCAL_ALLOWLIST)
  const refs = new Set(readAllowlist(path))
  refs.add(projectRef)
  writeFileSync(
    path,
    `${JSON.stringify({ projectRefs: [...refs] }, null, 2)}\n`,
  )
}

export interface TargetClassification {
  projectRef: string | null
  isProduction: boolean
  reason: string
}

/**
 * Fails safe: anything that is not a local Supabase instance or an explicitly
 * allowlisted dev project is treated as production.
 */
export function classifyTarget(
  envName: EnvName,
  supabaseUrl: string | undefined,
  allowlist: Set<string> = allowlistedRefs(),
): TargetClassification {
  const projectRef = projectRefFromUrl(supabaseUrl)

  if (envName === 'prod') {
    return { projectRef, isProduction: true, reason: '--env prod' }
  }
  if (isLocalSupabaseUrl(supabaseUrl)) {
    return {
      projectRef: projectRef ?? 'local',
      isProduction: false,
      reason: 'local Supabase instance',
    }
  }
  if (projectRef && allowlist.has(projectRef)) {
    return {
      projectRef,
      isProduction: false,
      reason: 'allowlisted dev project',
    }
  }
  return {
    projectRef,
    isProduction: true,
    reason: projectRef
      ? `${projectRef} is not in ${TRACKED_ALLOWLIST} or ${LOCAL_ALLOWLIST}`
      : 'project ref could not be determined',
  }
}
