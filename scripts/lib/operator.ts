import { execFileSync } from 'node:child_process'
import { userInfo } from 'node:os'

/** Operator identity recorded in the audit log: --operator, then git email, then OS user. */
export function resolveOperator(explicit?: string): string {
  if (explicit?.trim()) return explicit.trim()

  try {
    const email = execFileSync('git', ['config', 'user.email'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (email) return email
  } catch {
    // git missing or not configured; fall through.
  }

  try {
    return `os:${userInfo().username}`
  } catch {
    return 'unknown'
  }
}
