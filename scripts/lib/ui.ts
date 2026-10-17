import Table from 'cli-table3'
import ora from 'ora'
import pc from 'picocolors'

export type Cell = string | number | boolean | null | undefined

export interface UiOptions {
  json: boolean
  verbose?: boolean
  stdout?: NodeJS.WriteStream
  stderr?: NodeJS.WriteStream
}

/**
 * Human-facing output goes to stderr (status, warnings, previews) or stdout
 * (result tables). In --json mode stdout carries only the final JSON document,
 * so it can be piped into jq or another script safely.
 */
export class Ui {
  readonly json: boolean
  readonly verbose: boolean
  private readonly stdout: NodeJS.WriteStream
  private readonly stderr: NodeJS.WriteStream

  constructor(options: UiOptions) {
    this.json = options.json
    this.verbose = options.verbose ?? false
    this.stdout = options.stdout ?? process.stdout
    this.stderr = options.stderr ?? process.stderr
  }

  private err(line = '') {
    this.stderr.write(`${line}\n`)
  }

  print(line = '') {
    if (!this.json) this.stdout.write(`${line}\n`)
  }

  info(message: string) {
    this.err(`${pc.cyan('ℹ')} ${message}`)
  }

  success(message: string) {
    this.err(`${pc.green('✔')} ${message}`)
  }

  warn(message: string) {
    this.err(`${pc.yellow('⚠')} ${pc.yellow(message)}`)
  }

  error(message: string, hint?: string) {
    this.err(`${pc.red('✖')} ${pc.red(message)}`)
    if (hint) this.err(`  ${pc.dim('→')} ${hint}`)
  }

  debug(message: string) {
    if (this.verbose) this.err(pc.dim(`· ${message}`))
  }

  section(title: string) {
    this.print()
    this.print(pc.bold(pc.underline(title)))
  }

  /** Key/value block. */
  kv(record: Record<string, Cell>) {
    const entries = Object.entries(record)
    const width = Math.max(0, ...entries.map(([key]) => key.length))
    for (const [key, value] of entries) {
      this.print(`  ${pc.dim(key.padEnd(width))}  ${formatCell(value)}`)
    }
  }

  table(rows: Record<string, Cell>[], emptyMessage = 'Nothing to show.') {
    if (rows.length === 0) {
      this.print(pc.dim(`  ${emptyMessage}`))
      return
    }
    const head = Object.keys(rows[0])
    const table = new Table({
      head: head.map((h) => pc.bold(h)),
      style: { head: [], border: [] },
      wordWrap: true,
    })
    for (const row of rows) table.push(head.map((key) => formatCell(row[key])))
    this.print(table.toString())
  }

  /** Before/after preview of a pending change (always shown, also in --json mode, on stderr). */
  preview(
    title: string,
    changes: { field: string; before: Cell; after: Cell }[],
    notes: string[] = [],
  ) {
    this.err()
    this.err(pc.bold(`Preview: ${title}`))
    const table = new Table({
      head: ['Field', 'Before', 'After'].map((h) => pc.bold(h)),
      style: { head: [], border: [] },
      wordWrap: true,
    })
    for (const change of changes) {
      const changed = formatCell(change.before) !== formatCell(change.after)
      table.push([
        change.field,
        formatCell(change.before),
        changed ? pc.green(formatCell(change.after)) : formatCell(change.after),
      ])
    }
    this.err(table.toString())
    for (const note of notes) this.err(`  ${pc.yellow('•')} ${note}`)
  }

  banner(lines: string[], tone: 'danger' | 'normal') {
    const width = Math.max(...lines.map((line) => line.length)) + 4
    const paint = tone === 'danger' ? pc.bgRed : pc.bgBlue
    this.err()
    this.err(paint(pc.white(' '.repeat(width))))
    for (const line of lines) {
      this.err(paint(pc.white(pc.bold(`  ${line.padEnd(width - 4)}  `))))
    }
    this.err(paint(pc.white(' '.repeat(width))))
    this.err()
  }

  emitJson(data: unknown) {
    this.stdout.write(`${JSON.stringify(data, null, 2)}\n`)
  }

  /** Runs `task` with a spinner on interactive terminals; plain log lines otherwise. */
  async spin<T>(text: string, task: () => Promise<T>): Promise<T> {
    if (!this.stderr.isTTY) {
      this.debug(text)
      return task()
    }
    const spinner = ora({ text, stream: this.stderr }).start()
    try {
      const result = await task()
      spinner.stop()
      return result
    } catch (error) {
      spinner.stop()
      throw error
    }
  }
}

export function formatCell(value: Cell): string {
  if (value === null || value === undefined || value === '') return pc.dim('—')
  if (typeof value === 'boolean') return value ? pc.green('yes') : pc.dim('no')
  return String(value)
}

export const colors = pc
