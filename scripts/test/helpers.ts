import { Writable } from 'node:stream'
import { vi } from 'vitest'
import type { OpsContext, OpsFlags } from '../lib/context'
import type { TargetClassification } from '../lib/project'
import { Prompter, type PromptAdapter } from '../lib/prompts'
import type { AdminClient } from '../lib/supabase'
import { Ui } from '../lib/ui'

/** A writable stream that records everything written to it. */
export function captureStream() {
  const chunks: string[] = []
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk))
      callback()
    },
  }) as unknown as NodeJS.WriteStream
  return { stream, text: () => chunks.join('') }
}

export function fakePromptAdapter(
  answers: Partial<Record<keyof PromptAdapter, unknown[]>> = {},
): PromptAdapter & { calls: string[] } {
  const calls: string[] = []
  const next = (kind: keyof PromptAdapter) => {
    calls.push(kind)
    const queue = answers[kind]
    if (!queue || queue.length === 0)
      throw new Error(`Unexpected ${kind} prompt`)
    return Promise.resolve(queue.shift())
  }
  return {
    calls,
    input: () => next('input') as Promise<string>,
    password: () => next('password') as Promise<string>,
    confirm: () => next('confirm') as Promise<boolean>,
    select: () => next('select') as Promise<never>,
  }
}

export interface TestContextOptions {
  flags?: Partial<OpsFlags>
  target?: Partial<TargetClassification>
  adapter?: PromptAdapter
  db?: unknown
}

export function makeTestContext(options: TestContextOptions = {}) {
  const stdout = captureStream()
  const stderr = captureStream()
  const flags: OpsFlags = {
    json: false,
    dryRun: false,
    yes: false,
    verbose: false,
    interactive: false,
    ...options.flags,
  }
  const ui = new Ui({
    json: flags.json,
    stdout: stdout.stream,
    stderr: stderr.stream,
  })
  const ctx: OpsContext = {
    envName: 'local',
    env: { name: 'local', file: '.env.local', fileExists: true, values: {} },
    target: {
      projectRef: 'devref',
      isProduction: false,
      reason: 'allowlisted dev project',
      ...options.target,
    },
    operator: 'support@example.com',
    flags,
    ui,
    prompt: new Prompter(
      flags.interactive,
      options.adapter ?? fakePromptAdapter(),
    ),
    session: {},
    credentials: () => ({
      url: 'http://127.0.0.1:54321',
      serviceRoleKey: 'service',
    }),
    db: vi.fn(() => options.db as AdminClient),
    anon: vi.fn(() => options.db as AdminClient),
  }
  return { ctx, stdout, stderr }
}
