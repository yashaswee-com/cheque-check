import * as inquirer from '@inquirer/prompts'
import { AbortedError, UsageError } from './errors'

export interface Choice<T extends string> {
  value: T
  name: string
  description?: string
}

/** The subset of @inquirer/prompts the CLI uses; swappable in tests. */
export interface PromptAdapter {
  input(options: {
    message: string
    default?: string
    validate?: (value: string) => boolean | string
  }): Promise<string>
  password(options: {
    message: string
    validate?: (value: string) => boolean | string
  }): Promise<string>
  confirm(options: { message: string; default?: boolean }): Promise<boolean>
  select<T extends string>(options: {
    message: string
    choices: Choice<T>[]
    default?: T
    pageSize?: number
  }): Promise<T>
}

export const inquirerAdapter: PromptAdapter = {
  input: (options) => inquirer.input(options),
  password: (options) => inquirer.password({ ...options, mask: '*' }),
  confirm: (options) => inquirer.confirm(options),
  select: (options) => inquirer.select(options),
}

async function guard<T>(task: () => Promise<T>): Promise<T> {
  try {
    return await task()
  } catch (error) {
    if (error instanceof Error && error.name === 'ExitPromptError') {
      throw new AbortedError()
    }
    throw error
  }
}

/**
 * Prompts only when attached to a terminal. In non-interactive runs (CI,
 * --json, piped stdin) a missing value is a usage error naming the flag to
 * pass instead, so scripts never hang waiting for input.
 */
export class Prompter {
  constructor(
    readonly interactive: boolean,
    private readonly adapter: PromptAdapter = inquirerAdapter,
  ) {}

  private requireInteractive(flag: string | undefined, message: string) {
    if (!this.interactive) {
      throw new UsageError(
        flag ? `Missing ${flag}.` : `Input required: ${message}`,
        'Pass the value as a flag, or run in an interactive terminal.',
      )
    }
  }

  async text(options: {
    message: string
    flag?: string
    default?: string
    validate?: (value: string) => true | string
  }): Promise<string> {
    this.requireInteractive(options.flag, options.message)
    const value = await guard(() =>
      this.adapter.input({
        message: options.message,
        default: options.default,
        validate: options.validate,
      }),
    )
    return value.trim()
  }

  async secret(options: { message: string; flag?: string }): Promise<string> {
    this.requireInteractive(options.flag, options.message)
    return guard(() => this.adapter.password({ message: options.message }))
  }

  async select<T extends string>(options: {
    message: string
    flag?: string
    choices: Choice<T>[]
    default?: T
  }): Promise<T> {
    this.requireInteractive(options.flag, options.message)
    return guard(() =>
      this.adapter.select({
        message: options.message,
        choices: options.choices,
        default: options.default,
        pageSize: 15,
      }),
    )
  }

  async confirm(message: string, defaultValue = false): Promise<boolean> {
    this.requireInteractive(undefined, message)
    return guard(() => this.adapter.confirm({ message, default: defaultValue }))
  }
}
