import { execFileSync, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { OpsError } from './errors'
import { ROOT_DIR } from './paths'

// CLI entry points are run via `node <entry>` rather than the npx/.bin .cmd
// shims: on Windows, spawning a .cmd routes args through cmd.exe, which fails
// with EINVAL on characters a DB password may contain (e.g. `&`).
const require = createRequire(import.meta.url)

export function resolveCliEntry(specifier: string): string {
  return require.resolve(specifier)
}

/** Runs the Supabase CLI. `capture` returns stdout; otherwise output streams to the terminal. */
export function runSupabase(
  args: string[],
  options: { capture?: boolean; secretArgs?: boolean } = {},
): string {
  const entry = resolveCliEntry('supabase/dist/supabase.js')
  try {
    const output = execFileSync(process.execPath, [entry, ...args], {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: options.capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    })
    return (output ?? '').trim()
  } catch (error) {
    const shown = options.secretArgs ? args[0] : args.join(' ')
    throw new OpsError(`supabase ${shown} failed.`, {
      hint: 'See the Supabase CLI output above. Never share database passwords or URLs when asking for help.',
      cause: error,
    })
  }
}

/** Runs a node CLI and returns its exit status (output inherits the terminal). */
export function runNodeCli(
  specifier: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): number {
  const result = spawnSync(
    process.execPath,
    [resolveCliEntry(specifier), ...args],
    { cwd: ROOT_DIR, stdio: 'inherit', env },
  )
  if (result.error) {
    throw new OpsError(`Could not start ${specifier}.`, { cause: result.error })
  }
  return result.status ?? 1
}
