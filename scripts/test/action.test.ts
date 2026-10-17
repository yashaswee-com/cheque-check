// @vitest-environment node
import { Command } from 'commander'
import { describe, expect, it, vi } from 'vitest'
import {
  defineAction,
  registerGroups,
  reportError,
  type GroupDef,
} from '../lib/action'
import type { GlobalOptions } from '../lib/context'
import {
  AbortedError,
  DryRunComplete,
  EXIT_CODES,
  GuardRefusedError,
  NotFoundError,
  UsageError,
} from '../lib/errors'
import { confirmMutation, type MutationPlan } from '../lib/guards'
import { Prompter } from '../lib/prompts'
import { Ui } from '../lib/ui'
import { captureStream, fakePromptAdapter, makeTestContext } from './helpers'

const plan: MutationPlan = {
  title: 'Grant Lifetime Premium',
  changes: [{ field: 'Premium', before: 'none', after: 'lifetime' }],
}

describe('confirmMutation', () => {
  it('stops after the preview on --dry-run', async () => {
    const { ctx, stderr } = makeTestContext({
      flags: { dryRun: true, yes: true },
    })
    await expect(confirmMutation(ctx, plan)).rejects.toBeInstanceOf(
      DryRunComplete,
    )
    expect(stderr.text()).toContain('Grant Lifetime Premium')
  })

  it('applies with --yes on non-production targets', async () => {
    const { ctx } = makeTestContext({ flags: { yes: true } })
    await expect(confirmMutation(ctx, plan)).resolves.toBeUndefined()
  })

  it('requires --yes when not interactive', async () => {
    const { ctx } = makeTestContext()
    await expect(confirmMutation(ctx, plan)).rejects.toBeInstanceOf(UsageError)
  })

  it('asks interactively and aborts on "no"', async () => {
    const adapter = fakePromptAdapter({ confirm: [false] })
    const { ctx } = makeTestContext({ flags: { interactive: true }, adapter })
    await expect(confirmMutation(ctx, plan)).rejects.toBeInstanceOf(
      AbortedError,
    )
  })

  describe('production', () => {
    const target = {
      isProduction: true,
      projectRef: 'prodref',
      reason: '--env prod',
    }

    it('never lets --yes bypass the project-ref check', async () => {
      const { ctx } = makeTestContext({ target, flags: { yes: true } })
      await expect(confirmMutation(ctx, plan)).rejects.toBeInstanceOf(
        GuardRefusedError,
      )
    })

    it('accepts a matching --confirm-ref and rejects a wrong one', async () => {
      const ok = makeTestContext({ target, flags: { confirmRef: 'prodref' } })
      await expect(confirmMutation(ok.ctx, plan)).resolves.toBeUndefined()
      const wrong = makeTestContext({ target, flags: { confirmRef: 'devref' } })
      await expect(confirmMutation(wrong.ctx, plan)).rejects.toThrow(
        'does not match',
      )
    })

    it('requires the typed ref interactively', async () => {
      const typedOk = makeTestContext({
        target,
        flags: { interactive: true },
        adapter: fakePromptAdapter({ input: ['prodref'] }),
      })
      await expect(confirmMutation(typedOk.ctx, plan)).resolves.toBeUndefined()

      const typedWrong = makeTestContext({
        target,
        flags: { interactive: true },
        adapter: fakePromptAdapter({ input: ['oops'] }),
      })
      await expect(
        confirmMutation(typedWrong.ctx, plan),
      ).rejects.toBeInstanceOf(GuardRefusedError)
    })

    it('refuses when the project ref is unknown', async () => {
      const { ctx } = makeTestContext({
        target: { ...target, projectRef: null },
        flags: { confirmRef: 'x' },
      })
      await expect(confirmMutation(ctx, plan)).rejects.toThrow(
        'could not be determined',
      )
    })
  })
})

describe('Prompter', () => {
  it('fails fast with the flag name when not interactive', async () => {
    const prompter = new Prompter(false, fakePromptAdapter())
    await expect(
      prompter.text({ message: 'User', flag: '--user' }),
    ).rejects.toThrow('Missing --user.')
  })

  it('maps Ctrl+C to AbortedError and trims input', async () => {
    const adapter = fakePromptAdapter({ input: ['  hi  '] })
    const prompter = new Prompter(true, adapter)
    await expect(prompter.text({ message: 'x' })).resolves.toBe('hi')

    adapter.confirm = () =>
      Promise.reject(
        Object.assign(new Error('closed'), { name: 'ExitPromptError' }),
      )
    await expect(prompter.confirm('Sure?')).rejects.toBeInstanceOf(AbortedError)
  })
})

describe('reportError', () => {
  it('returns the exit code and emits a JSON error document', () => {
    const stdout = captureStream()
    const stderr = captureStream()
    const ui = new Ui({
      json: true,
      stdout: stdout.stream,
      stderr: stderr.stream,
    })
    expect(reportError(ui, new NotFoundError('No user', 'Try email'))).toBe(
      EXIT_CODES.NOT_FOUND,
    )
    expect(JSON.parse(stdout.text())).toEqual({
      ok: false,
      error: {
        type: 'NotFoundError',
        message: 'No user',
        hint: 'Try email',
        exitCode: 4,
      },
    })
  })

  it('treats a completed dry run as success', () => {
    const stderr = captureStream()
    const ui = new Ui({
      json: false,
      stdout: captureStream().stream,
      stderr: stderr.stream,
    })
    expect(reportError(ui, new DryRunComplete())).toBe(EXIT_CODES.OK)
    expect(stderr.text()).toContain('Dry run complete')
  })
})

describe('registerGroups', () => {
  function setup() {
    const run = vi.fn(async () => ({ done: true }))
    const render = vi.fn()
    const passRun = vi.fn(async () => null)
    const group: GroupDef = {
      name: 'demo',
      title: 'Demo',
      description: 'Demo group',
      actions: [
        defineAction({
          name: 'act',
          title: 'Act',
          description: 'Does a thing',
          mutates: true,
          options: [
            {
              flags: '--kind <kind>',
              description: 'Kind',
              choices: ['a', 'b'],
            },
          ],
          run,
          render,
        }),
        defineAction({
          name: 'pass',
          title: 'Pass',
          description: 'Forwards args',
          mutates: false,
          defaultEnv: 'qa',
          options: [{ flags: '--skip-reset', description: 'Skip' }],
          passThrough: { name: 'rest', description: 'Forwarded' },
          run: passRun,
        }),
      ],
    }
    const contexts: GlobalOptions[] = []
    const stdout = captureStream()
    const program = new Command('ops')
      .option('--env <name>')
      .option('--json')
      .exitOverride()
      .configureOutput({ writeOut: () => {}, writeErr: () => {} })
    registerGroups(program, [group], (options) => {
      contexts.push(options)
      const { ctx } = makeTestContext({
        flags: { json: Boolean(options.json) },
      })
      Object.assign(ctx, {
        ui: new Ui({
          json: Boolean(options.json),
          stdout: stdout.stream,
          stderr: captureStream().stream,
        }),
      })
      return ctx
    })
    return { program, run, render, passRun, contexts, stdout }
  }

  it('passes options (including globals after the subcommand) to the action', async () => {
    const { program, run, render, contexts } = setup()
    await program.parseAsync([
      'node',
      'ops',
      'demo',
      'act',
      '--kind',
      'a',
      '--env',
      'qa',
    ])
    expect(contexts[0].env).toBe('qa')
    expect(run).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: 'a' }),
    )
    expect(render).toHaveBeenCalledWith(expect.anything(), { done: true })
  })

  it('wraps results in a JSON envelope with --json', async () => {
    const { program, render, stdout } = setup()
    await program.parseAsync(['node', 'ops', '--json', 'demo', 'act'])
    expect(render).not.toHaveBeenCalled()
    expect(JSON.parse(stdout.text())).toEqual({
      ok: true,
      action: 'demo.act',
      data: { done: true },
    })
  })

  it('rejects invalid choices as commander usage errors', async () => {
    const { program } = setup()
    await expect(
      program.parseAsync(['node', 'ops', 'demo', 'act', '--kind', 'z']),
    ).rejects.toMatchObject({
      code: 'commander.invalidArgument',
    })
  })

  it('uses defaultEnv and forwards pass-through arguments verbatim', async () => {
    const { program, passRun, contexts } = setup()
    await program.parseAsync([
      'node',
      'ops',
      'demo',
      'pass',
      '--skip-reset',
      '--',
      '--project=chromium',
      'e2e/auth.spec.ts',
    ])
    expect(contexts[0].env).toBe('qa')
    expect(passRun).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        skipReset: true,
        rest: ['--project=chromium', 'e2e/auth.spec.ts'],
      }),
    )
  })
})
